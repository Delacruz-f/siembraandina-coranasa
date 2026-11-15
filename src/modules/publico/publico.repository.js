// Consultas públicas: todas filtran publicaciones por estado y borrado lógico.
const { db } = require("../../config/db");

function textoPlano(html) {
  if (!html) return "";
  return String(html)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function listarDepartamentos() {
  return db("departamentos").select("id", "nombre").orderBy("nombre");
}

function listarProvincias(departamentoId) {
  return db("provincias")
    .select("id", "departamento_id", "nombre")
    .where({ departamento_id: departamentoId })
    .orderBy("nombre");
}

function listarProvinciasTodas() {
  return db("provincias as p")
    .join("departamentos as d", "d.id", "p.departamento_id")
    .select("p.id", "p.departamento_id", "p.nombre", "d.nombre as departamento")
    .orderBy("d.nombre")
    .orderBy("p.nombre");
}

function listarDistritos(provinciaId) {
  return db("distritos")
    .select("id", "provincia_id", "nombre")
    .where({ provincia_id: provinciaId })
    .orderBy("nombre");
}

function buscarProvincia(id) {
  return db("provincias as p")
    .join("departamentos as d", "d.id", "p.departamento_id")
    .select("p.id", "p.nombre", "d.id as departamento_id")
    .where("p.id", id)
    .first();
}

function buscarDistrito(id) {
  return db("distritos as di")
    .join("provincias as pr", "pr.id", "di.provincia_id")
    .join("departamentos as de", "de.id", "pr.departamento_id")
    .select(
      "di.id",
      "di.nombre",
      "pr.id as provincia_id",
      "pr.nombre as provincia",
      "de.id as departamento_id",
      "de.nombre as departamento",
    )
    .where("di.id", id)
    .first();
}

function comunidadConCoordenadas(distritoId) {
  return db("comunidades")
    .select("id", "nombre", "latitud", "longitud")
    .where({ distrito_id: distritoId })
    .whereNotNull("latitud")
    .whereNotNull("longitud")
    .orderBy("nombre")
    .first();
}

function buscarComunidadConCoordenadas(comunidadId) {
  return db("comunidades")
    .select("id", "latitud", "longitud")
    .where({ id: comunidadId })
    .whereNotNull("latitud")
    .whereNotNull("longitud")
    .first();
}

function listarComunidadesConCoordenadas() {
  return db("comunidades as co")
    .join("distritos as di", "di.id", "co.distrito_id")
    .join("provincias as pr", "pr.id", "di.provincia_id")
    .join("departamentos as de", "de.id", "pr.departamento_id")
    .select(
      "co.id",
      "co.nombre",
      "co.latitud",
      "co.longitud",
      "di.id as distrito_id",
      "di.nombre as distrito",
      "pr.id as provincia_id",
      "pr.nombre as provincia",
      "de.id as departamento_id",
      "de.nombre as departamento",
    )
    .whereNotNull("co.latitud")
    .whereNotNull("co.longitud")
    .orderBy("de.nombre")
    .orderBy("pr.nombre")
    .orderBy("di.nombre")
    .orderBy("co.nombre");
}

function agregarAtribucion(imagen) {
  return {
    ...imagen,
    id: Number(imagen.id),
    ancho:
      imagen.ancho === null || imagen.ancho === undefined
        ? null
        : Number(imagen.ancho),
    alto:
      imagen.alto === null || imagen.alto === undefined
        ? null
        : Number(imagen.alto),
    alt: imagen.texto_alternativo || "",
    autor: imagen.autor_imagen || null,
    autorUrl: imagen.autor_url || null,
    licencia: imagen.licencia || null,
    licenciaUrl: imagen.licencia_url || null,
  };
}

/** Agrupa filas (una por variante) en imágenes con su lista de variantes. */
function agruparVariantes(filas) {
  const porArchivo = new Map();
  for (const fila of filas) {
    const id = Number(fila.id);
    if (!porArchivo.has(id)) {
      porArchivo.set(id, { ...agregarAtribucion(fila), variantes: [] });
    }
    if (fila.variante_ancho === null || fila.variante_ancho === undefined)
      continue;
    porArchivo.get(id).variantes.push({
      ancho: Number(fila.variante_ancho),
      anchoPx: Number(fila.ancho_px),
      altoPx: Number(fila.alto_px),
      ruta_webp: fila.ruta_webp,
      ruta_jpg: fila.ruta_jpg,
    });
  }
  return [...porArchivo.values()].map((imagen) => ({
    ...imagen,
    bajaResolucion:
      imagen.variantes.length > 0 && imagen.variantes[0].anchoPx < 800,
    proporcion:
      imagen.ancho && imagen.alto
        ? `${imagen.ancho} / ${imagen.alto}`
        : "3 / 2",
  }));
}

function listarCultivos() {
  return db("cultivos")
    .select(
      "id",
      "nombre",
      "slug",
      "descripcion",
      "dias_ciclo",
      "ciclo_referencial",
    )
    .where({ activo: true })
    .orderBy("nombre");
}

function buscarCultivo(slug) {
  return db("cultivos")
    .select(
      "id",
      "nombre",
      "slug",
      "descripcion",
      "dias_ciclo",
      "ciclo_referencial",
    )
    .where({ slug, activo: true })
    .first();
}

function buscarCultivoPorId(id) {
  return db("cultivos")
    .select("id", "nombre", "slug", "descripcion", "activo")
    .where({ id })
    .first();
}

async function listarImagenesDeCultivo(cultivoId) {
  const filas = await db("cultivo_imagenes as ci")
    .join("archivos as a", "a.id", "ci.archivo_id")
    .leftJoin("imagen_variantes as v", "v.archivo_id", "a.id")
    .select(
      "a.id",
      "a.texto_alternativo",
      "a.ancho",
      "a.alto",
      "a.autor_imagen",
      "a.autor_url",
      "a.licencia",
      "a.licencia_url",
      "v.ancho as variante_ancho",
      "v.ancho_px",
      "v.alto_px",
      "v.ruta_webp",
      "v.ruta_jpg",
    )
    .where("ci.cultivo_id", cultivoId)
    .whereNull("a.eliminado_en")
    .orderBy("ci.orden")
    .orderBy("ci.id")
    .orderBy("v.ancho");
  return agruparVariantes(filas);
}

async function listarImagenesDePublicacion(publicacionId) {
  const filas = await db("publicacion_archivos as pa")
    .join("archivos as a", "a.id", "pa.archivo_id")
    .leftJoin("imagen_variantes as v", "v.archivo_id", "a.id")
    .select(
      "a.id",
      "a.texto_alternativo",
      "a.ancho",
      "a.alto",
      "a.autor_imagen",
      "a.autor_url",
      "a.licencia",
      "a.licencia_url",
      "v.ancho as variante_ancho",
      "v.ancho_px",
      "v.alto_px",
      "v.ruta_webp",
      "v.ruta_jpg",
    )
    .where("pa.publicacion_id", publicacionId)
    .whereNull("a.eliminado_en")
    .orderBy("pa.id")
    .orderBy("v.ancho");
  return agruparVariantes(await filas);
}

function listarVariedades(cultivoId) {
  return db("cultivo_variedades as cv")
    .join("variedades as v", "v.id", "cv.variedad_id")
    .select("v.id", "v.nombre", "v.slug", "v.descripcion")
    .where("cv.cultivo_id", cultivoId)
    .andWhere("v.activa", true)
    .orderBy("v.nombre");
}

function listarRequerimientos(cultivoId) {
  return db("cultivo_requerimientos as cr")
    .join("zonas_altitudinales as z", "z.id", "cr.zona_id")
    .select(
      "cr.id",
      "cr.zona_id",
      "z.clave as zona_clave",
      "z.nombre as zona_nombre",
      "z.orden as zona_orden",
      "cr.hum_min",
      "cr.hum_max",
      "cr.temp_min",
      "cr.temp_max",
      "cr.fuente",
      "cr.validado",
    )
    .where("cr.cultivo_id", cultivoId)
    .orderBy("z.orden");
}

function listarCalendario(cultivoId) {
  return db("calendario_tradicional as ct")
    .join("zonas_altitudinales as z", "z.id", "ct.zona_id")
    .select(
      "ct.id",
      "ct.zona_id",
      "z.clave as zona_clave",
      "z.nombre as zona_nombre",
      "z.orden as zona_orden",
      "ct.mes_inicio",
      "ct.mes_fin",
      "ct.fuente",
      "ct.validado",
    )
    .where("ct.cultivo_id", cultivoId)
    .orderBy("z.orden");
}

function listarCategorias() {
  return db("categorias").select("id", "nombre", "slug").orderBy("nombre");
}

function listarEtiquetas() {
  return db("etiquetas").select("id", "nombre", "slug").orderBy("nombre");
}

function consultaPublicaciones({
  categoria,
  etiqueta,
  busqueda,
  exceptoId,
} = {}) {
  const consulta = db("publicaciones as p")
    .join("categorias as c", "c.id", "p.categoria_id")
    .join("estados_publicacion as ep", "ep.id", "p.estado_id")
    .where("ep.clave", "publicada")
    .whereNull("p.deleted_at");

  if (categoria) consulta.andWhere("c.slug", categoria);
  if (etiqueta) {
    consulta.whereExists(
      db("publicacion_etiquetas as pe")
        .join("etiquetas as e", "e.id", "pe.etiqueta_id")
        .select("pe.publicacion_id")
        .whereColumn("pe.publicacion_id", "p.id")
        .andWhere("e.slug", etiqueta),
    );
  }
  if (busqueda) {
    const termino = `%${busqueda}%`;
    consulta.andWhere((subconsulta) =>
      subconsulta
        .where("p.titulo", "like", termino)
        .orWhere("p.contenido", "like", termino)
        .orWhere("c.nombre", "like", termino),
    );
  }
  if (exceptoId) consulta.andWhereNot("p.id", exceptoId);
  return consulta;
}

async function agregarEtiquetas(filas) {
  if (!filas.length) return filas;
  const ids = filas.map((fila) => fila.id);
  const relaciones = await db("publicacion_etiquetas as pe")
    .join("etiquetas as e", "e.id", "pe.etiqueta_id")
    .select("pe.publicacion_id", "e.nombre", "e.slug")
    .whereIn("pe.publicacion_id", ids)
    .orderBy("e.nombre");
  const etiquetasPorPublicacion = new Map();
  for (const etiqueta of relaciones) {
    if (!etiquetasPorPublicacion.has(etiqueta.publicacion_id)) {
      etiquetasPorPublicacion.set(etiqueta.publicacion_id, []);
    }
    etiquetasPorPublicacion.get(etiqueta.publicacion_id).push({
      nombre: etiqueta.nombre,
      slug: etiqueta.slug,
    });
  }
  return filas.map((fila) => ({
    ...fila,
    etiquetas: etiquetasPorPublicacion.get(fila.id) || [],
    resumen: textoPlano(fila.contenido || "").slice(0, 220),
  }));
}

async function listarPublicaciones({
  pagina = 1,
  limite = 9,
  categoria,
  etiqueta,
  busqueda,
  exceptoId,
} = {}) {
  const consulta = consultaPublicaciones({
    categoria,
    etiqueta,
    busqueda,
    exceptoId,
  });
  const cuenta = await consulta.clone().count({ total: "p.id" }).first();
  const filas = await consulta
    .clone()
    .select(
      "p.id",
      "p.titulo",
      "p.slug",
      "p.contenido",
      "p.publicada_en",
      "c.nombre as categoria_nombre",
      "c.slug as categoria_slug",
    )
    .orderBy("p.publicada_en", "desc")
    .orderBy("p.id", "desc")
    .limit(limite)
    .offset((pagina - 1) * limite);
  return {
    articulos: await agregarEtiquetas(filas),
    total: Number(cuenta ? cuenta.total : 0),
  };
}

async function buscarPublicacion(slug) {
  const fila = await db("publicaciones as p")
    .join("categorias as c", "c.id", "p.categoria_id")
    .join("estados_publicacion as ep", "ep.id", "p.estado_id")
    .select(
      "p.id",
      "p.titulo",
      "p.slug",
      "p.contenido",
      "p.publicada_en",
      "p.updated_at",
      "c.id as categoria_id",
      "c.nombre as categoria_nombre",
      "c.slug as categoria_slug",
    )
    .where("p.slug", slug)
    .andWhere("ep.clave", "publicada")
    .whereNull("p.deleted_at")
    .first();
  if (!fila) return null;
  const [publicacion] = await agregarEtiquetas([fila]);
  return publicacion;
}

function listarComentarios(publicacionId) {
  return db("comentarios as co")
    .leftJoin("perfiles as pe", "pe.usuario_id", "co.usuario_id")
    .select(
      "co.id",
      "co.contenido",
      "co.created_at",
      "co.updated_at",
      "co.deleted_at",
      "co.usuario_id as autor_id",
      "co.comentario_padre_id",
      "pe.nombre as autor_nombre",
    )
    .where("co.publicacion_id", publicacionId)
    .orderBy("co.id")
    .limit(100);
}

function crearComentario(datos) {
  return db("comentarios").insert(datos);
}

function listarComunidades() {
  return db("comunidades as co")
    .join("distritos as di", "di.id", "co.distrito_id")
    .join("provincias as pr", "pr.id", "di.provincia_id")
    .join("departamentos as de", "de.id", "pr.departamento_id")
    .select(
      "co.id",
      "co.nombre",
      "co.latitud",
      "co.longitud",
      "di.nombre as distrito",
      "pr.nombre as provincia",
      "de.nombre as departamento",
    )
    .orderBy("de.nombre")
    .orderBy("pr.nombre")
    .orderBy("co.nombre");
}

function listarPublicacionesSitemap() {
  return db("publicaciones as p")
    .join("estados_publicacion as ep", "ep.id", "p.estado_id")
    .select("p.slug", "p.updated_at")
    .where("ep.clave", "publicada")
    .whereNull("p.deleted_at")
    .orderBy("p.slug");
}

module.exports = {
  listarDepartamentos,
  listarProvincias,
  listarProvinciasTodas,
  listarDistritos,
  buscarProvincia,
  buscarDistrito,
  comunidadConCoordenadas,
  buscarComunidadConCoordenadas,
  listarComunidadesConCoordenadas,
  listarCultivos,
  buscarCultivo,
  buscarCultivoPorId,
  listarVariedades,
  listarRequerimientos,
  listarCalendario,
  listarCategorias,
  listarEtiquetas,
  listarPublicaciones,
  buscarPublicacion,
  listarComentarios,
  crearComentario,
  listarComunidades,
  listarPublicacionesSitemap,
  listarImagenesDeCultivo,
  listarImagenesDePublicacion,
};
