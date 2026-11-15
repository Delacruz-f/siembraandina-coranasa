const env = require("../../config/env");
const logger = require("../../config/logger");
const servicio = require("./publico.service");
const repositorio = require("./publico.repository");
const monitorServicio = require("./monitor.service");
const siembrasPublicasServicio = require("./siembras.service");
const geocodificacion = require("../../services/fuentesDatos/geocodificacion");
const { metadatos } = require("./seo");

/** Página que muestra la PWA cuando no hay señal. */
function sinConexion(req, res) {
  return ver(req, res, "publico/sin-conexion", {
    titulo: "Sin conexión",
    descripcion: "Contenido guardado para consultar sin señal.",
  });
}

function ver(req, res, vista, metadatosPagina, datos = {}) {
  return res.render(vista, {
    ...datos,
    ...metadatos(req, metadatosPagina),
  });
}

async function mostrarCalendario(req, res) {
  const datos = await servicio.datosCalendario({
    cultivo: req.query.cultivo,
    otroCultivo: req.query.otro,
    departamento: req.query.departamento,
    provincia: req.query.provincia,
    distrito: req.query.distrito,
    // Punto elegido: ?lat=&lon= (se valida dentro del Perú en el servicio).
    lat: req.query.lat,
    lon: req.query.lon,
    idioma: res.locals.idioma,
  });
  const parametrosCompartir = new URLSearchParams();
  if (datos.cultivo && datos.cultivo.slug) {
    parametrosCompartir.set("cultivo", datos.cultivo.slug);
  } else if (datos.otroCultivo) {
    parametrosCompartir.set("otro", datos.otroCultivo);
  }
  if (datos.punto) {
    parametrosCompartir.set("lat", Number(datos.punto.latitud).toFixed(2));
    parametrosCompartir.set("lon", Number(datos.punto.longitud).toFixed(2));
  }
  if (datos.departamento) {
    parametrosCompartir.set("departamento", String(datos.departamento.id));
  }
  if (datos.provincia) {
    parametrosCompartir.set("provincia", String(datos.provincia.id));
  }
  if (datos.distrito) {
    parametrosCompartir.set("distrito", String(datos.distrito.id));
  }
  datos.urlCompartir = `${env.correo.urlBase}/calendario?${parametrosCompartir.toString()}`;
  // Resumen para el modo sin conexión de la PWA (public/js/pwa.js lo guarda).
  datos.resumenOffline = {
    cultivo: datos.cultivo ? datos.cultivo.nombre : null,
    lugar: datos.distrito
      ? `${datos.distrito.nombre}, ${datos.provincia ? datos.provincia.nombre : ""}`.replace(
          /,\s*$/,
          "",
        )
      : datos.punto
        ? `${datos.punto.latitud}, ${datos.punto.longitud}`
        : null,
    recomendaciones: (datos.recomendaciones || []).map((fila) => ({
      zona: fila.zona,
      titulo: fila.resultado ? fila.resultado.titulo : "",
    })),
  };
  const titulo = datos.cultivo
    ? `${res.locals.t("calendario.titulo")}: ${datos.cultivo.nombre}`
    : res.locals.t("calendario.metaTitulo");
  return ver(
    req,
    res,
    "publico/calendario",
    {
      titulo,
      descripcion: res.locals.t("calendario.metaDescripcion"),
    },
    { ...datos, usarCalendarioMapa: true },
  );
}

/**
 * GET /api/publico/geocodificar?q=Coracora
 * Autocompletado de lugares con Open-Meteo, limitado al Perú. La respuesta se
 * cachea 24 h y el texto de entrada se valida antes de llamar a la fuente.
 */
async function geocodificar(req, res) {
  const consulta = String(req.query.q || "").trim();
  if (!geocodificacion.normalizarConsulta(consulta)) {
    return res.status(400).json({
      ok: false,
      error: {
        codigo: "solicitud_invalida",
        mensaje: res.locals.t("calendario.punto.busquedaInvalida"),
      },
    });
  }
  let resultados = [];
  try {
    resultados = await geocodificacion.buscar(consulta);
  } catch (error) {
    logger.warn(
      { err: error },
      "No se pudo consultar la geocodificación de Open-Meteo",
    );
    return res.status(503).json({
      ok: false,
      error: {
        codigo: "fuente_no_disponible",
        mensaje: res.locals.t("calendario.punto.busquedaError"),
      },
    });
  }
  return res.json({
    ok: true,
    resultados: resultados.map((fila) => ({
      nombre: fila.nombre,
      etiqueta: fila.etiqueta,
      latitud: fila.latitud,
      longitud: fila.longitud,
      enPeru: fila.enPeru,
    })),
  });
}

async function listarCultivos(req, res) {
  const cultivos = await servicio.datosCatalogoCultivos();
  return ver(
    req,
    res,
    "publico/cultivos",
    {
      titulo: "Cultivos andinos",
      descripcion:
        "Catálogo de papa, maíz y quinua, con variedades, requerimientos y ventanas tradicionales.",
    },
    { cultivos },
  );
}

async function mostrarCultivo(req, res) {
  const datos = await servicio.detalleCultivo(
    req.params.slug,
    req.session && req.session.usuario ? req.session.usuario.id : null,
  );
  const nombre = datos.cultivo.nombre;
  return ver(
    req,
    res,
    "publico/cultivo",
    {
      titulo: `${nombre}: variedades y calendario`,
      descripcion:
        datos.cultivo.descripcion ||
        `Variedades, rangos referenciales y calendarios locales de ${nombre}.`,
    },
    datos,
  );
}

async function listarSaberes(req, res) {
  const datos = await servicio.datosSaberes({
    categoria: req.query.categoria,
    etiqueta: req.query.etiqueta,
    busqueda: req.query.q,
    pagina: Number(req.query.pagina || 1),
  });
  return ver(
    req,
    res,
    "publico/saberes",
    {
      titulo: "Saberes agrícolas",
      descripcion:
        "Artículos sobre calendarios tradicionales, cultivos y observación del suelo.",
    },
    datos,
  );
}

async function mostrarSaber(req, res) {
  const datos = await servicio.detalleSaber(
    req.params.slug,
    req.session && req.session.usuario ? req.session.usuario.id : null,
  );
  return ver(
    req,
    res,
    "publico/saber",
    {
      titulo: datos.articulo.titulo,
      descripcion: servicio.fragmento(datos.articulo.contenido),
      tipo: "article",
    },
    datos,
  );
}

async function mostrarImagenPublicacion(req, res) {
  // Compatibilidad: las URLs antiguas /media/publicaciones/:id redirigen a la
  // ruta controlada nueva, que comprueba que el artículo siga publicado.
  return res.redirect(301, `/media/imagenes/${req.params.id}/800`);
}

async function provincias(req, res) {
  const filas = await repositorio.listarProvincias(
    Number(req.query.departamento_id),
  );
  return res.json({ provincias: filas });
}

async function distritos(req, res) {
  const filas = await repositorio.listarDistritos(
    Number(req.query.provincia_id),
  );
  return res.json({ distritos: filas });
}

async function mostrarComunidades(req, res) {
  const datos = await servicio.datosComunidades();
  return ver(
    req,
    res,
    "publico/comunidades",
    {
      titulo: "Comunidades agrícolas",
      descripcion:
        "Explora las comunidades registradas en Siembra Andina y su ubicación.",
    },
    { ...datos, usarMapa: true },
  );
}

function mostrarMonitor(req, res) {
  return ver(
    req,
    res,
    "publico/monitor",
    {
      titulo: res.locals.t("monitor.titulo"),
      descripcion: res.locals.t("monitor.metaDescripcion"),
    },
    { usarMonitor: true },
  );
}

async function historialMonitor(req, res) {
  const datos = await monitorServicio.historialPublicoComunidad(
    Number(req.params.comunidadId),
    Number(req.query.meses || 1),
  );
  return res.json({ ok: true, datos });
}

async function mostrarSiembras(req, res) {
  const [cultivos, departamentos] = await Promise.all([
    servicio.datosCatalogoCultivos(),
    repositorio.listarDepartamentos(),
  ]);
  return ver(
    req,
    res,
    "publico/siembras",
    {
      titulo: res.locals.t("siembrasPublicas.titulo"),
      descripcion: res.locals.t("siembrasPublicas.metaDescripcion"),
    },
    { cultivos, departamentos, usarSiembras: true },
  );
}

async function datosSiembras(req, res) {
  const datos = await siembrasPublicasServicio.datosPublicos({
    cultivo: req.query.cultivo || undefined,
    departamento: req.query.departamento || undefined,
    mes: req.query.mes || undefined,
  });
  return res.json({ ok: true, datos });
}

function mostrarSobre(req, res) {
  return ver(req, res, "publico/sobre", {
    titulo: res.locals.t("sobre.metaTitulo"),
    descripcion: res.locals.t("sobre.metaDescripcion"),
  });
}

async function mostrarSitemap(req, res) {
  const rutas = await servicio.datosSitemap();
  const base = env.correo.urlBase;
  const escaparXml = (valor) =>
    String(valor).replace(/[<>&"']/g, (caracter) => {
      const entidades = {
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      };
      return entidades[caracter];
    });
  const contenido = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...rutas.map(
      (ruta) =>
        `  <url><loc>${escaparXml(new URL(ruta, base).href)}</loc></url>`,
    ),
    "</urlset>",
  ].join("\n");
  return res
    .status(200)
    .set("Content-Type", "application/xml; charset=utf-8")
    .send(contenido);
}

function mostrarRobots(req, res) {
  const base = env.correo.urlBase;
  const contenido = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /panel",
    "Disallow: /admin",
    "Disallow: /editor",
    "Disallow: /tecnico",
    "Disallow: /perfil",
    "Disallow: /parcelas",
    "Disallow: /lecturas",
    "Disallow: /archivos",
    "Disallow: /salud",
    "Disallow: /ingresar",
    "Disallow: /registro",
    "Disallow: /recuperar",
    `Sitemap: ${base}/sitemap.xml`,
    "",
  ].join("\n");
  return res.type("text/plain").send(contenido);
}

module.exports = {
  sinConexion,
  mostrarCalendario,
  geocodificar,
  listarCultivos,
  mostrarCultivo,
  listarSaberes,
  mostrarSaber,
  mostrarImagenPublicacion,
  mostrarMonitor,
  historialMonitor,
  mostrarSiembras,
  datosSiembras,
  provincias,
  distritos,
  mostrarComunidades,
  mostrarSobre,
  mostrarSitemap,
  mostrarRobots,
};
