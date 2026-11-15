// Repositorio de archivos (metadatos; el binario vive en disco).
const { db } = require("../../config/db");
const { insertarYDevolverId } = require("../../utils/baseDatos");

async function crear(datos) {
  return insertarYDevolverId("archivos", datos);
}

function buscarPorId(id) {
  return db("archivos").where({ id }).first();
}

function eliminar(id) {
  return db("archivos").where({ id }).del();
}

async function puedeVerDesdeParcela(archivoId, usuarioId) {
  const propia = await db("parcela_archivos as pa")
    .join("parcelas as p", "p.id", "pa.parcela_id")
    .where("pa.archivo_id", archivoId)
    .andWhere("p.usuario_id", usuarioId)
    .whereNull("p.deleted_at")
    .first();
  if (propia) return true;

  const asignada = await db("parcela_archivos as pa")
    .join("accesos_parcela as ap", "ap.parcela_id", "pa.parcela_id")
    .join("parcelas as p", "p.id", "pa.parcela_id")
    .where("pa.archivo_id", archivoId)
    .andWhere("ap.tecnico_id", usuarioId)
    .whereNull("ap.revocado_en")
    .whereNull("p.deleted_at")
    .first();
  return Boolean(asignada);
}

function puedeVerDesdeConsulta(archivoId, usuarioId) {
  return db("consulta_archivos as ca")
    .join("consultas as c", "c.id", "ca.consulta_id")
    .join("tecnico_distritos as td", "td.distrito_id", "c.distrito_id")
    .where("ca.archivo_id", archivoId)
    .andWhere("td.tecnico_id", usuarioId)
    .first();
}

function puedeVerDesdePublicacionPublicada(archivoId) {
  return db("publicacion_archivos as pa")
    .join("publicaciones as p", "p.id", "pa.publicacion_id")
    .join("estados_publicacion as ep", "ep.id", "p.estado_id")
    .where("pa.archivo_id", archivoId)
    .andWhere("ep.clave", "publicada")
    .whereNull("p.deleted_at")
    .where("p.publicada_en", "<=", db.fn.now())
    .first();
}

module.exports = {
  crear,
  buscarPorId,
  eliminar,
  puedeVerDesdeParcela,
  puedeVerDesdeConsulta,
  puedeVerDesdePublicacionPublicada,
};
