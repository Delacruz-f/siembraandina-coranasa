// Reglas y composición de datos del sitio público.
const repositorio = require("./publico.repository");
const interaccionesServicio = require("../comunidad/interacciones.service");
const editorServicio = require("../editor/editor.service");
const nasa = require("../../nasa");
const env = require("../../config/env");
const logger = require("../../config/logger");
const calculo = require("./calendario.calculo");
const iaCalendario = require("./calendario.ia");
const {
  PERU,
  redondear,
} = require("../../services/fuentesDatos/geocodificacion");
const { traducir } = require("../../i18n");
const { noEncontrado, solicitudInvalida } = require("../../utils/errores");

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];
const ARTICULOS_POR_PAGINA = 9;
// Historial de NASA POWER que se pide para el punto elegido (3 años).
const DIAS_HISTORIAL_NASA = 365 * 3;
// Caché en memoria (6 h por coordenada redondeada). No se guarda nada en la
// base: ni el punto, ni la IP, ni la respuesta.
const cacheCalendario = new Map();

function t(clave, variables = {}, idioma) {
  return traducir(clave, variables, idioma);
}

/** ¿Está el punto dentro de los límites aproximados del Perú? */
function puntoEnPeru(latitud, longitud) {
  const lat = Number(latitud);
  const lon = Number(longitud);
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= PERU.latMin &&
    lat <= PERU.latMax &&
    lon >= PERU.lonMin &&
    lon <= PERU.lonMax
  );
}

/**
 * Punto pedido por la URL (?lat=&lon=). Devuelve null si no se envió ninguno;
 * lanza 400 si está incompleto o fuera del Perú. No se ignora en silencio.
 */
function puntoDeUrl(latitud, longitud, idioma) {
  const lat = String(latitud ?? "").trim();
  const lon = String(longitud ?? "").trim();
  if (!lat && !lon) return null;
  if (
    !lat ||
    !lon ||
    !Number.isFinite(Number(lat)) ||
    !Number.isFinite(Number(lon))
  ) {
    throw solicitudInvalida(
      t("calendario.punto.coordenadasInvalidas", {}, idioma),
    );
  }
  if (!puntoEnPeru(lat, lon)) {
    throw solicitudInvalida(t("calendario.punto.fueraDePeru", {}, idioma));
  }
  return { latitud: redondear(lat), longitud: redondear(lon) };
}

/**
 * Resuelve el punto con este orden:
 *  a) ?lat=&lon= válidos dentro del Perú;
 *  b) comunidad con coordenadas registradas en el distrito;
 *  c) sin punto (la vista muestra la tarjeta "Elige tu punto").
 */
async function resolverPunto({ lat, lon, distrito, idioma }) {
  const puntoUrl = puntoDeUrl(lat, lon, idioma);
  if (puntoUrl) {
    return { origen: "url", ...puntoUrl, comunidad: null };
  }
  if (distrito) {
    const comunidad = await repositorio.comunidadConCoordenadas(distrito.id);
    if (comunidad && puntoEnPeru(comunidad.latitud, comunidad.longitud)) {
      return {
        origen: "comunidad",
        latitud: redondear(comunidad.latitud),
        longitud: redondear(comunidad.longitud),
        comunidad,
      };
    }
  }
  return { origen: null, latitud: null, longitud: null, comunidad: null };
}

/** Rangos de la base: la humedad del primer requerimiento y el extremo térmico. */
function rangosDesdeRequerimientos(requerimientos) {
  const filas = requerimientos.filter((fila) =>
    [fila.hum_min, fila.hum_max, fila.temp_min, fila.temp_max].every((valor) =>
      Number.isFinite(Number(valor)),
    ),
  );
  if (!filas.length) return null;
  return {
    humedadMin: Number(filas[0].hum_min),
    humedadMax: Number(filas[0].hum_max),
    tempMin: Math.min(...filas.map((fila) => Number(fila.temp_min))),
    tempMax: Math.max(...filas.map((fila) => Number(fila.temp_max))),
    origen: "base",
  };
}

function claveCache(latitud, longitud, cultivo) {
  return [
    Number(latitud).toFixed(2),
    Number(longitud).toFixed(2),
    cultivo.slug || `otro:${cultivo.nombre.toLowerCase()}`,
  ].join("|");
}

function leerCache(clave) {
  const guardado = cacheCalendario.get(clave);
  if (!guardado) return null;
  if (guardado.expiraEn <= Date.now()) {
    cacheCalendario.delete(clave);
    return null;
  }
  return guardado.valor;
}

function guardarCache(clave, valor) {
  // Evita crecimiento sin límite: se descarta la entrada más antigua.
  if (cacheCalendario.size >= env.calendario.cacheMaximo) {
    const primera = cacheCalendario.keys().next().value;
    if (primera !== undefined) cacheCalendario.delete(primera);
  }
  cacheCalendario.set(clave, {
    valor,
    expiraEn: Date.now() + env.calendario.cacheTtlMs,
  });
}

function limpiarCacheCalendario() {
  cacheCalendario.clear();
}

function fragmento(texto, limite = 160) {
  const normalizado = String(texto || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalizado.length > limite
    ? `${normalizado.slice(0, limite - 1).trimEnd()}…`
    : normalizado;
}

function distritosDisponiblesParaNasa(comunidades, cultivoSlug) {
  const distritos = new Map();
  for (const comunidad of comunidades) {
    const latitud = Number(comunidad.latitud);
    const longitud = Number(comunidad.longitud);
    const distritoId = Number(comunidad.distrito_id);
    if (
      !Number.isFinite(latitud) ||
      latitud < -90 ||
      latitud > 90 ||
      !Number.isFinite(longitud) ||
      longitud < -180 ||
      longitud > 180 ||
      distritos.has(distritoId)
    ) {
      continue;
    }

    const parametros = new URLSearchParams({
      departamento: String(comunidad.departamento_id),
      provincia: String(comunidad.provincia_id),
      distrito: String(comunidad.distrito_id),
    });
    if (cultivoSlug) parametros.set("cultivo", cultivoSlug);

    distritos.set(distritoId, {
      ...comunidad,
      latitud,
      longitud,
      url: `/calendario?${parametros.toString()}`,
    });
  }
  return [...distritos.values()];
}

function ventanaMeses(inicio, fin) {
  const mesInicio = Number(inicio);
  const mesFin = Number(fin);
  return {
    texto:
      mesInicio <= mesFin
        ? `${MESES[mesInicio - 1]} a ${MESES[mesFin - 1]}`
        : `${MESES[mesInicio - 1]} a ${MESES[mesFin - 1]} del año siguiente`,
    incluyeMesActual:
      mesInicio <= mesFin
        ? new Date().getMonth() + 1 >= mesInicio &&
          new Date().getMonth() + 1 <= mesFin
        : new Date().getMonth() + 1 >= mesInicio ||
          new Date().getMonth() + 1 <= mesFin,
  };
}

async function datosInicio() {
  const [departamentos, provincias, cultivos, articulos] = await Promise.all([
    repositorio.listarDepartamentos(),
    repositorio.listarProvinciasTodas(),
    repositorio.listarCultivos(),
    repositorio.listarPublicaciones({ pagina: 1, limite: 3 }),
  ]);
  return {
    departamentos,
    provincias,
    cultivos,
    articulos: articulos.articulos,
  };
}

async function datosCatalogoCultivos() {
  const cultivos = await repositorio.listarCultivos();
  return cultivos.map((cultivo) => ({
    ...cultivo,
    resumen: fragmento(
      cultivo.descripcion || "Cultivo andino de interés local.",
    ),
  }));
}

async function detalleCultivo(slug, usuarioId) {
  const cultivo = await repositorio.buscarCultivo(slug);
  if (!cultivo) throw noEncontrado("No encontramos ese cultivo.");
  const [
    variedades,
    requerimientos,
    calendario,
    articulos,
    interacciones,
    imagenes,
  ] = await Promise.all([
    repositorio.listarVariedades(cultivo.id),
    repositorio.listarRequerimientos(cultivo.id),
    repositorio.listarCalendario(cultivo.id),
    repositorio.listarPublicaciones({
      pagina: 1,
      limite: 3,
      etiqueta: cultivo.slug,
    }),
    interaccionesServicio.resumenCultivo(cultivo.id, usuarioId),
    repositorio.listarImagenesDeCultivo(cultivo.id),
  ]);
  return {
    cultivo,
    interacciones,
    variedades,
    requerimientos,
    imagenes,
    calendario: calendario.map((fila) => ({
      ...fila,
      ventana: ventanaMeses(fila.mes_inicio, fila.mes_fin),
    })),
    articulos: articulos.articulos,
  };
}

async function datosSaberes({
  categoria,
  etiqueta,
  busqueda,
  pagina = 1,
} = {}) {
  const [categorias, etiquetas] = await Promise.all([
    repositorio.listarCategorias(),
    repositorio.listarEtiquetas(),
  ]);
  const resultados = await repositorio.listarPublicaciones({
    pagina,
    limite: ARTICULOS_POR_PAGINA,
    categoria,
    etiqueta,
    busqueda,
  });
  return {
    ...resultados,
    categorias,
    etiquetas,
    filtros: { categoria, etiqueta, busqueda, pagina },
    paginas: Math.max(1, Math.ceil(resultados.total / ARTICULOS_POR_PAGINA)),
  };
}

async function detalleSaber(slug, usuarioId) {
  const articulo = await repositorio.buscarPublicacion(slug);
  if (!articulo) throw noEncontrado("No encontramos ese artículo.");
  const [filasComentarios, relacionados, interacciones, imagenes] =
    await Promise.all([
      repositorio.listarComentarios(articulo.id),
      repositorio.listarPublicaciones({
        pagina: 1,
        limite: 4,
        categoria: articulo.categoria_slug,
        exceptoId: articulo.id,
      }),
      interaccionesServicio.resumenArticulo(articulo.id, usuarioId),
      repositorio.listarImagenesDePublicacion(articulo.id),
    ]);
  const raices = new Map();
  const contenidoSanitizado = editorServicio.sanitizar(articulo.contenido);
  const contenidoHtml = /<[^>]+>/.test(contenidoSanitizado)
    ? contenidoSanitizado
    : contenidoSanitizado
        .split(/\n{2,}/)
        .filter(Boolean)
        .map((parrafo) => `<p>${parrafo}</p>`)
        .join("");
  for (const fila of filasComentarios) {
    const comentario = {
      ...fila,
      contenido: fila.deleted_at
        ? "Este comentario fue eliminado."
        : fila.contenido,
      puedeEditar:
        Boolean(usuarioId) &&
        Number(fila.autor_id) === Number(usuarioId) &&
        Date.now() - new Date(fila.created_at).getTime() <= 15 * 60 * 1000 &&
        !fila.deleted_at,
      respuestas: [],
    };
    if (fila.comentario_padre_id) {
      const padre = raices.get(Number(fila.comentario_padre_id));
      if (padre) padre.respuestas.push(comentario);
    } else {
      raices.set(Number(fila.id), comentario);
    }
  }
  return {
    articulo: {
      ...articulo,
      contenidoHtml,
      imagenes,
    },
    comentarios: [...raices.values()],
    interacciones,
    relacionados: relacionados.articulos.slice(0, 3),
  };
}

/**
 * Historial de NASA POWER (GWETROOT y TS) de los últimos 3 años. Los últimos
 * diez días también forman parte del historial, así que sirven como lectura.
 */
async function historialNasa(latitud, longitud) {
  const hoy = new Date();
  const inicio = new Date(hoy.getTime() - DIAS_HISTORIAL_NASA * 86400000);
  return nasa.historial(latitud, longitud, inicio, hoy);
}

/** Lectura más reciente de NASA POWER (10 días) y validación de su fecha. */
function lecturaReciente(historico) {
  const hoy = Date.now();
  for (let indice = historico.length - 1; indice >= 0; indice -= 1) {
    const fila = historico[indice];
    if (!fila || !/^\d{4}-\d{2}-\d{2}$/.test(String(fila.fecha))) continue;
    const instante = Date.parse(`${fila.fecha}T00:00:00Z`);
    if (!Number.isFinite(instante)) continue;
    const dias = (hoy - instante) / 86400000;
    if (dias >= -1 && dias <= 10) {
      return {
        fecha: fila.fecha,
        humedad: Number(fila.humedad),
        temperatura: Number(fila.temperatura),
      };
    }
  }
  return null;
}

/**
 * Rangos del cultivo: los de la base o, si el cultivo no está en la base, los
 * estimados por IA (marcados como no validados). null = no hay datos suficientes.
 */
async function resolverRangos(cultivo, requerimientos) {
  if (cultivo.origen === "base") {
    // Un cultivo de la base sin requerimientos registrados no tiene rangos.
    const rangos = rangosDesdeRequerimientos(requerimientos);
    return { rangos, diasCiclo: null, sinEstimacion: !rangos };
  }
  const estimado = await iaCalendario.estimarRangosCultivo(cultivo.nombre);
  if (!estimado) return { rangos: null, diasCiclo: null, sinEstimacion: true };
  return {
    rangos: {
      humedadMin: estimado.humedadMin,
      humedadMax: estimado.humedadMax,
      tempMin: estimado.tempMin,
      tempMax: estimado.tempMax,
      origen: "ia",
      etiqueta: estimado.etiqueta,
    },
    diasCiclo: estimado.diasCiclo,
    estimado: true,
  };
}

/** JSON que recibe la IA para redactar: solo datos ya calculados. */
function resumenParaIA(resultado) {
  return {
    cultivo: { nombre: resultado.cultivo.nombre },
    confianza: resultado.confianza,
    fuente: "NASA POWER",
    fechaDatos: resultado.fechaDatos,
    ventanas: resultado.ventanas.map((ventana) => ({
      inicio: ventana.inicio,
      fin: ventana.fin,
      puntaje: ventana.puntaje,
      humedad: ventana.humedad,
      temperatura: ventana.temperatura,
      cosecha: ventana.cosecha,
      riesgos: ventana.riesgos,
    })),
    rangos: {
      humedadMin: resultado.rangos.humedadMin,
      humedadMax: resultado.rangos.humedadMax,
      tempMin: resultado.rangos.tempMin,
      tempMax: resultado.rangos.tempMax,
    },
    diasCiclo: resultado.diasCiclo,
  };
}

function textosPlantilla(idioma) {
  return {
    intro: t("calendario.resultado.plantillaIntro", {}, idioma),
    cosecha: t("calendario.resultado.plantillaCosecha", {}, idioma),
    otras: t("calendario.resultado.plantillaOtras", {}, idioma),
    estimadoIA: t("calendario.resultado.estimadoIA", {}, idioma),
    fuente: t("calendario.resultado.plantillaFuente", {}, idioma),
    cierre: t("calendario.resultado.plantillaCierre", {}, idioma),
    sinVentanas: t("calendario.resultado.sinVentanas", {}, idioma),
  };
}

/** La IA solo redacta; si falla o tarda, se usa la plantilla fija. */
async function redactarResultado(resultado, idioma) {
  const json = resumenParaIA(resultado);
  let texto = null;
  try {
    texto = await iaCalendario.redactarExplicacion(json);
  } catch (error) {
    logger.warn(
      { err: error },
      "La IA no pudo redactar el calendario público; se usa la plantilla",
    );
  }
  // Defensa en profundidad: toda fecha del texto debe existir en el JSON.
  if (texto && iaCalendario.validarRedaccion(texto, json)) {
    return { texto, generadoConIA: true };
  }
  return {
    texto: iaCalendario.plantillaExplicacion(
      { ...json, fuente: resultado.fuente },
      textosPlantilla(idioma),
    ),
    generadoConIA: false,
  };
}

/** Cálculo determinista: rangos + historial NASA POWER → ventanas, riesgos. */
function calcularResultado({ cultivo, rangos, diasCiclo, historico, idioma }) {
  const resultado = calculo.calcularVentanas({
    cultivo: {
      nombre: cultivo.nombre,
      origen: rangos.origen === "ia" ? "ia" : "base",
    },
    rangos: { ...rangos, diasCiclo },
    historico,
    fechaInicio: new Date().toISOString().slice(0, 10),
    diasHorizonte: 365,
    limite: 3,
  });
  if (!resultado.ventanas.length) return null;
  const ultima = historico[historico.length - 1];
  return {
    cultivo: {
      nombre: cultivo.nombre,
      slug: cultivo.slug,
      // "base", "otro" (texto libre) o "ia" (rangos estimados por IA).
      origen: rangos.origen === "ia" ? "ia" : cultivo.origen || "base",
    },
    confianza: resultado.confianza,
    fuente: t("calendario.resultado.fuenteDetalle", {}, idioma),
    fechaDatos:
      ultima && /^\d{4}-\d{2}-\d{2}$/.test(String(ultima.fecha))
        ? ultima.fecha
        : null,
    diasHistoricos: resultado.diasHistoricos,
    rangos,
    diasCiclo: diasCiclo || null,
    ventanas: resultado.ventanas,
  };
}

/** Parámetros de la URL compartible del calendario. */
function parametrosPunto({
  cultivoSlug,
  otroCultivo,
  latitud,
  longitud,
  departamento,
  provincia,
  distrito,
} = {}) {
  const parametros = new URLSearchParams();
  if (cultivoSlug) parametros.set("cultivo", cultivoSlug);
  const otro = String(otroCultivo || "").trim();
  if (!cultivoSlug && otro) parametros.set("otro", otro);
  if (Number.isFinite(Number(latitud)) && Number.isFinite(Number(longitud))) {
    parametros.set("lat", Number(latitud).toFixed(2));
    parametros.set("lon", Number(longitud).toFixed(2));
  }
  if (distrito) {
    parametros.set("distrito", String(distrito.id));
  } else if (provincia) {
    parametros.set("provincia", String(provincia.id));
    if (departamento) parametros.set("departamento", String(departamento.id));
  } else if (departamento) {
    parametros.set("departamento", String(departamento.id));
  }
  return parametros.toString();
}

async function datosCalendario({
  cultivo: cultivoSlug,
  otroCultivo,
  departamento: departamentoId,
  provincia: provinciaId,
  distrito: distritoId,
  lat,
  lon,
  idioma,
} = {}) {
  const departamentos = await repositorio.listarDepartamentos();
  let departamento = null;
  let provincia = null;
  let distrito = null;

  if (provinciaId) {
    provincia = await repositorio.buscarProvincia(provinciaId);
    if (!provincia) throw noEncontrado("No encontramos esa provincia.");
    if (
      departamentoId &&
      Number(departamentoId) !== provincia.departamento_id
    ) {
      throw solicitudInvalida(
        "La provincia no corresponde al departamento seleccionado.",
      );
    }
    departamento = departamentos.find(
      (fila) => fila.id === provincia.departamento_id,
    );
  } else if (departamentoId) {
    departamento = departamentos.find(
      (fila) => fila.id === Number(departamentoId),
    );
    if (!departamento) throw noEncontrado("No encontramos ese departamento.");
  }

  if (!departamento && departamentoId) {
    throw noEncontrado("No encontramos ese departamento.");
  }

  if (distritoId) {
    distrito = await repositorio.buscarDistrito(distritoId);
    if (!distrito) throw noEncontrado("No encontramos ese distrito.");
    if (provincia && Number(distrito.provincia_id) !== provincia.id) {
      throw solicitudInvalida(
        "El distrito no corresponde a la provincia seleccionada.",
      );
    }
    if (departamento && Number(distrito.departamento_id) !== departamento.id) {
      throw solicitudInvalida(
        "El distrito no corresponde al departamento seleccionado.",
      );
    }
    provincia = {
      id: distrito.provincia_id,
      nombre: distrito.provincia,
      departamento_id: distrito.departamento_id,
    };
    departamento = {
      id: distrito.departamento_id,
      nombre: distrito.departamento,
    };
  }

  const [provincias, distritos, cultivos] = await Promise.all([
    departamento
      ? repositorio.listarProvincias(departamento.id)
      : Promise.resolve([]),
    provincia ? repositorio.listarDistritos(provincia.id) : Promise.resolve([]),
    repositorio.listarCultivos(),
  ]);
  // "Otro cultivo": el texto libre manda sobre el select (si se envió).
  const cultivoOtro = String(otroCultivo || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  let cultivoBase = cultivoSlug
    ? await repositorio.buscarCultivo(cultivoSlug)
    : null;
  // Solo es un cultivo de la base si el texto libre no pide otro distinto: así
  // "Otro cultivo" (p. ej. haba) nunca usa los rangos de la papa seleccionada.
  const otroDistinto =
    Boolean(cultivoOtro) &&
    (!cultivoBase ||
      cultivoOtro.toLocaleLowerCase("es") !==
        String(cultivoBase.nombre).toLocaleLowerCase("es"));
  if (otroDistinto) cultivoBase = null;
  // Un slug desconocido se trata como "otro cultivo" (la IA estima sus rangos);
  // solo es un 404 cuando tampoco hay texto libre que usar.
  if (cultivoSlug && !cultivoBase && !cultivoOtro)
    throw noEncontrado("No encontramos ese cultivo.");
  const cultivo = cultivoBase
    ? {
        ...cultivoBase,
        diasCiclo: cultivoBase.dias_ciclo,
        origen: "base",
      }
    : cultivoOtro
      ? {
          id: null,
          nombre: cultivoOtro,
          slug: null,
          descripcion: null,
          dias_ciclo: null,
          diasCiclo: null,
          origen: "otro",
        }
      : null;

  const [calendario, requerimientos] = cultivoBase
    ? await Promise.all([
        repositorio.listarCalendario(cultivoBase.id),
        repositorio.listarRequerimientos(cultivoBase.id),
      ])
    : [[], []];
  const requerimientoPorZona = new Map(
    requerimientos.map((fila) => [fila.zona_id, fila]),
  );
  const calendarioConVentanas = calendario.map((fila) => ({
    ...fila,
    ventana: ventanaMeses(fila.mes_inicio, fila.mes_fin),
    requerimiento: requerimientoPorZona.get(fila.zona_id) || null,
  }));

  // 1) Punto: ?lat=&lon= de la URL, luego la comunidad del distrito.
  const punto = await resolverPunto({ lat, lon, distrito, idioma });

  let estadoDatos = punto.latitud === null ? "sin_punto" : "consultando";
  let ultimaLectura = null;
  let recomendaciones = [];
  let distritosConCoordenadas = [];
  let resultado = null;
  let redaccion = null;
  let redaccionGeneradaConIA = false;
  let ventanaTradicional = null;
  let sinEstimacion = false;

  if (cultivo && punto.latitud !== null) {
    const clave = claveCache(punto.latitud, punto.longitud, cultivo);
    const cacheado = leerCache(clave);
    if (cacheado) {
      ({
        estadoDatos,
        ultimaLectura,
        resultado,
        recomendaciones,
        redaccion,
        redaccionGeneradaConIA,
        ventanaTradicional,
        sinEstimacion,
      } = cacheado);
    } else {
      let historico = null;
      try {
        historico = await historialNasa(punto.latitud, punto.longitud);
      } catch (error) {
        estadoDatos = "no_disponibles";
        logger.warn(
          { err: error, clave },
          "No se pudo consultar NASA POWER para el calendario público",
        );
      }

      if (historico) {
        const filas = Array.isArray(historico) ? historico : [];
        ultimaLectura = lecturaReciente(filas);
        const {
          rangos,
          diasCiclo,
          sinEstimacion: falloIA,
        } = await resolverRangos(cultivo, requerimientos);
        sinEstimacion = Boolean(falloIA);
        resultado =
          rangos &&
          calcularResultado({
            cultivo,
            rangos,
            diasCiclo: diasCiclo || requerimientoCiclo(cultivo),
            historico: filas,
            idioma,
          });
        // Hay historial: el resultado se calcula con el historial completo, no se
        // exige una lectura reciente (salvo que no haya ninguna).
        estadoDatos = resultado
          ? "disponible"
          : sinEstimacion
            ? "sin_datos_cultivo"
            : "sin_datos";
      }

      if (estadoDatos === "disponible" && resultado) {
        // La IA solo redacta el JSON ya calculado.
        const redaccionFinal = await redactarResultado(resultado, idioma);
        redaccion = redaccionFinal.texto;
        redaccionGeneradaConIA = redaccionFinal.generadoConIA;
        resultado.redaccion = redaccion;
        resultado.redaccionGeneradaConIA = redaccionGeneradaConIA;
        ventanaTradicional = ventanaTradicionalBase(
          calendarioConVentanas,
          resultado.ventanas,
        );
        recomendaciones = resultado.ventanas.map((ventana) => ({
          zona: cultivo.nombre,
          resultado: {
            cls:
              ventana.puntaje >= 70
                ? "ok"
                : ventana.puntaje >= 40
                  ? "mid"
                  : "bad",
            titulo: `${ventana.inicio} a ${ventana.fin}`,
            motivos: [
              t(
                "calendario.resultado.puntajeVentana",
                { puntaje: ventana.puntaje },
                idioma,
              ),
            ],
          },
        }));
      }

      guardarCache(clave, {
        estadoDatos,
        ultimaLectura,
        recomendaciones,
        resultado,
        redaccion,
        redaccionGeneradaConIA,
        ventanaTradicional,
        sinEstimacion,
      });
    }
    // Si hay datos pero no una lectura reciente, no se afirma una recomendación.
    if (estadoDatos === "disponible" && !ultimaLectura) {
      estadoDatos = "desactualizados";
    }
  } else if (punto.latitud === null) {
    distritosConCoordenadas = distritosDisponiblesParaNasa(
      await repositorio.listarComunidadesConCoordenadas(),
      cultivoSlug,
    );
  }

  if (estadoDatos === "desactualizados") resultado = null;

  if (resultado && redaccion === null) {
    redaccion = resultado.redaccion || null;
    redaccionGeneradaConIA = Boolean(resultado.redaccionGeneradaConIA);
  }

  return {
    departamentos,
    provincias,
    distritos,
    cultivos,
    otroCultivo: cultivoOtro,
    departamento,
    provincia,
    distrito,
    cultivo,
    calendario: calendarioConVentanas,
    punto:
      punto.latitud === null
        ? null
        : {
            latitud: punto.latitud,
            longitud: punto.longitud,
          },
    origenPunto: punto.origen,
    lugarPunto: punto.comunidad ? punto.comunidad.nombre : null,
    urlCompartirPunto:
      punto.latitud !== null
        ? `/calendario?${parametrosPunto({
            cultivoSlug: cultivoSlug || null,
            otroCultivo:
              cultivo && cultivo.origen === "otro" ? cultivo.nombre : "",
            latitud: punto.latitud,
            longitud: punto.longitud,
            departamento,
            provincia,
            distrito,
          })}`
        : null,
    estadoDatos,
    comunidadDatos: punto.comunidad,
    distritosConCoordenadas,
    ultimaLectura,
    recomendaciones,
    resultado,
    ventanaTradicional,
    sinEstimacion,
    redaccion,
    redaccionGeneradaConIA,
  };
}

/** Días de ciclo registrados en la base (puede ser null: sin cosecha). */
function requerimientoCiclo(cultivo) {
  const ciclo = Number(cultivo && cultivo.diasCiclo);
  return Number.isInteger(ciclo) && ciclo >= 30 && ciclo <= 400 ? ciclo : null;
}

/** Meses del calendario tradicional que coinciden con las ventanas calculadas. */
function ventanaTradicionalBase(calendario, ventanas) {
  if (!calendario.length || !ventanas.length) return null;
  const meses = new Set(
    ventanas.map((ventana) => Number(ventana.inicio.slice(5, 7))),
  );
  const coincidencias = calendario.filter((fila) => {
    const inicio = Number(fila.mes_inicio);
    const fin = Number(fila.mes_fin);
    return [...meses].some((mes) =>
      inicio <= fin ? mes >= inicio && mes <= fin : mes >= inicio || mes <= fin,
    );
  });
  const fila = coincidencias[0] || calendario[0];
  return {
    texto: fila.ventana ? fila.ventana.texto : null,
    validado: Boolean(fila.validado),
    fuente: fila.fuente || null,
  };
}

async function datosComunidades() {
  const comunidades = await repositorio.listarComunidades();
  const marcadores = comunidades
    .filter(
      (comunidad) => comunidad.latitud !== null && comunidad.longitud !== null,
    )
    .map((comunidad) => ({
      id: comunidad.id,
      nombre: comunidad.nombre,
      latitud: Number(comunidad.latitud),
      longitud: Number(comunidad.longitud),
      ubicacion: `${comunidad.distrito}, ${comunidad.provincia}, ${comunidad.departamento}`,
    }))
    .filter(
      (comunidad) =>
        Number.isFinite(comunidad.latitud) &&
        Number.isFinite(comunidad.longitud) &&
        comunidad.latitud >= -90 &&
        comunidad.latitud <= 90 &&
        comunidad.longitud >= -180 &&
        comunidad.longitud <= 180,
    );
  return { comunidades, marcadores };
}

function rutasSitemap(articulos, cultivos) {
  const paginas = [
    "/",
    "/calendario",
    "/cultivos",
    "/monitor",
    "/siembras",
    "/saberes",
    "/comunidades",
    "/sobre",
    "/contacto",
    ...cultivos.map((cultivo) => `/cultivos/${cultivo.slug}`),
    ...articulos.map((articulo) => `/saberes/${articulo.slug}`),
  ];
  return paginas;
}

async function datosSitemap() {
  const [articulos, cultivos] = await Promise.all([
    repositorio.listarPublicacionesSitemap(),
    repositorio.listarCultivos(),
  ]);
  return rutasSitemap(articulos, cultivos);
}

module.exports = {
  datosInicio,
  datosCatalogoCultivos,
  detalleCultivo,
  datosSaberes,
  detalleSaber,
  datosCalendario,
  datosComunidades,
  datosSitemap,
  fragmento,
  // Utilidades expuestas para las pruebas y el controlador.
  puntoEnPeru,
  puntoDeUrl,
  limpiarCacheCalendario,
};
