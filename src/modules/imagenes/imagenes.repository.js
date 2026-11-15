// Repositorio de imágenes: metadatos de `archivos`, variantes y asociaciones.
// Solo esta capa toca la base de datos.
const { db } = require("../../config/db");
const { insertarYDevolverId } = require("../../utils/baseDatos");

const COLUMNAS_ARCHIVO = [
  "a.id",
  "a.autor_id",
  "a.nombre_original",
  "a.ruta",
  "a.mime",
  "a.tamano",
  "a.ancho",
  "a.alto",
  "a.texto_alternativo",
  "a.licencia",
  "a.licencia_url",
  "a.autor_imagen",
  "a.autor_url",
  "a.es_publica",
  "a.eliminado_en",
  "a.created_at",
];

function normalizar(archivo) {
  if (!archivo) return archivo;
  return {
    ...archivo,
    es_publica: Boolean(archivo.es_publica),
    ancho: archivo.ancho === null ? null : Number(archivo.ancho),
    alto: archivo.alto === null ? null : Number(archivo.alto),
    tamano: archivo.tamano === null || archivo.tamano === undefined
      ? null
      : Number(archivo.tamano),
  };
}

/** Crea el registro de la imagen y sus variantes en una transacción. */
function crear({ archivo, variantes }) {
  return db.transaction(async (trx) => {
    const id = await insertarYDevolverId("archivos", archivo, trx);
    await trx("imagen_variantes").insert(
      variantes.map((variante) => ({ ...variante, archivo_id: id })),
    );
    return id;
  });
}

function buscarPorId(id) {
  return db("archivos as a")
    .select(COLUMNAS_ARCHIVO)
    .where("a.id", id)
    .first()
    .then(normalizar);
}

function listarVariantes(archivoIds) {
  const ids = [].concat(archivoIds).map(Number).filter(Boolean);
  if (!ids.length) return Promise.resolve([]);
  return db("imagen_variantes")
    .whereIn("archivo_id", ids)
    .select(
      "archivo_id",
      "ancho",
      "ancho_px",
      "alto_px",
      "ruta_webp",
      "ruta_jpg",
      "tamano_webp",
      "tamano_jpg",
    )
    .orderBy("ancho", "asc");
}

/** Imágenes de un artículo publicado (para las páginas públicas). */
function listarPublicasDePublicacion(publicacionId) {
  return db("publicacion_archivos as pa")
    .join("archivos as a", "a.id", "pa.archivo_id")
    .leftJoin("imagen_variantes as v", "v.archivo_id", "a.id")
    .select(...COLUMNAS_ARCHIVO, "v.ancho as variante_ancho")
    .where("pa.publicacion_id", publicacionId)
    .andWhereNull("a.eliminado_en")
    .orderBy("pa.id")
    .orderBy("v.ancho");
}

function listarPublicasDeCultivo(cultivoId) {
  return db("cultivo_imagenes as ci")
    .join("archivos as a", "a.id", "ci.archivo_id")
    .leftJoin("imagen_variantes as v", "v.archivo_id", "a.id")
    .select(...COLUMNAS_ARCHIVO, "v.ancho as variante_ancho", "ci.orden")
    .where("ci.cultivo_id", cultivoId)
    .andWhereNull("a.eliminado_en")
    .orderBy("ci.orden")
    .orderBy("ci.id")
    .orderBy("v.ancho");
}

function asociarCultivo(cultivoId, archivoId, orden = 0) {
  return db("cultivo_imagenes").insert({
    cultivo_id: cultivoId,
    archivo_id: archivoId,
    orden,
  });
}

function quitarDeCultivo(cultivoId, archivoId) {
  return db("cultivo_imagenes")
    .where({ cultivo_id: cultivoId, archivo_id: archivoId })
    .del();
}

/** ¿El archivo está en un artículo publicado y vigente? */
function estaEnPublicacionPublicada(archivoId) {
  return db("publicacion_archivos as pa")
    .join("publicaciones as p", "p.id", "pa.publicacion_id")
    .join("estados_publicacion as ep", "ep.id", "p.estado_id")
    .where("pa.archivo_id", archivoId)
    .andWhere("ep.clave", "publicada")
    .whereNull("p.deleted_at")
    .andWhere("p.publicada_en", "<=", db.fn.now())
    .first();
}

/** ¿El archivo pertenece a un cultivo activo del catálogo? */
function estaEnCultivoPublico(archivoId) {
  return db("cultivo_imagenes as ci")
    .join("cultivos as c", "c.id", "ci.cultivo_id")
    .where("ci.archivo_id", archivoId)
    .andWhere("c.activo", true)
    .first();
}

/** Imágenes que la biblioteca editorial del usuario puede reutilizar. */
function listarBibliotecaDeAutor(autorId) {
  return db("archivos as a")
    .leftJoin("publicacion_archivos as pa", "pa.archivo_id", "a.id")
    .select(...COLUMNAS_ARCHIVO, "pa.publicacion_id")
    .where("a.autor_id", autorId)
    .andWhere("a.mime", "like", "image/%")
    .whereNull("a.eliminado_en")
    .orderBy("a.created_at", "desc")
    .limit(100)
    .then((filas) => filas.map(normalizar));
}

/** ¿El archivo sigue asociado a alguna imagen en uso? */
async function estaEnUso(archivoId) {
  const [perfil, parcela, consulta, publicacion, cultivo, solicitud] =
    await Promise.all([
      db("perfiles").where({ foto_archivo_id: archivoId }).first(),
      db("parcela_archivos").where({ archivo_id: archivoId }).first(),
      db("consulta_archivos").where({ archivo_id: archivoId }).first(),
      db("publicacion_archivos").where({ archivo_id: archivoId }).first(),
      db("cultivo_imagenes").where({ archivo_id: archivoId }).first(),
      db("solicitudes_rol").where({ archivo_id: archivoId }).first(),
    ]);
  return Boolean(
    perfil || parcela || consulta || publicacion || cultivo || solicitud,
  );
}

/** Registros antiguos sin fila en `imagen_variantes` (anteriores a la fase 10). */
function listarSinVariantes(limite = 200) {
  return db("archivos as a")
    .leftJoin("imagen_variantes as v", "v.archivo_id", "a.id")
    .select("a.id", "a.ruta", "a.mime", "a.created_at")
    .where("a.mime", "like", "image/%")
    .whereNull("v.id")
    .whereNull("a.eliminado_en")
    .orderBy("a.id")
    .limit(limite);
}

function listarCreadosAntesDe(fechaLimite) {
  return db("archivos")
    .select("id", "ruta", "created_at")
    .where("created_at", "<", fechaLimite)
    .orderBy("id");
}

/** Imágenes con borrado lógico pendiente de limpieza. */
function listarMarcadasEliminadas(limite = 500) {
  return db("archivos")
    .select("id", "ruta")
    .whereNotNull("eliminado_en")
    .orderBy("id")
    .limit(limite);
}

function marcarEliminado(id) {
  return db("archivos").where({ id }).update({ eliminado_en: db.fn.now() });
}

function eliminarFisico(id) {
  return db("archivos").where({ id }).del();
}

function listarClavesVariantes(archivoIds) {
  const ids = [].concat(archivoIds).map(Number).filter(Boolean);
  if (!ids.length) return Promise.resolve([]);
  return db("imagen_variantes")
    .select("ruta_webp", "ruta_jpg")
    .whereIn("archivo_id", ids);
}

module.exports = {
  crear,
  buscarPorId,
  listarVariantes,
  listarPublicasDePublicacion,
  listarPublicasDeCultivo,
  asociarCultivo,
  quitarDeCultivo,
  estaEnPublicacionPublicada,
  estaEnCultivoPublico,
  listarBibliotecaDeAutor,
  estaEnUso,
  listarSinVariantes,
  listarCreadosAntesDe,
  listarMarcadasEliminadas,
  marcarEliminado,
  eliminarFisico,
  listarClavesVariantes,
};
