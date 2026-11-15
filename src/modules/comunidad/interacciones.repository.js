const { db } = require("../../config/db");
const { insertarYDevolverId } = require("../../utils/baseDatos");

function buscarComentario(id, conexion = db) {
  return conexion("comentarios")
    .select(
      "id",
      "publicacion_id",
      "usuario_id",
      "comentario_padre_id",
      "contenido",
      "created_at",
      "deleted_at",
    )
    .where({ id })
    .first();
}

function buscarTipoReaccion(clave) {
  return db("tipos_reaccion").where({ clave }).first();
}

function buscarEstadoReporte(clave) {
  return db("estados_reporte").where({ clave }).first();
}

function buscarReaccion(tabla, claveRelacion, relacionId, usuarioId, conexion = db) {
  return conexion(tabla)
    .where({ [claveRelacion]: relacionId, usuario_id: usuarioId })
    .first();
}

async function cambiarReaccion(
  tabla,
  claveRelacion,
  relacionId,
  usuarioId,
  tipoId,
) {
  return db.transaction(async (trx) => {
    const actual = await buscarReaccion(
      tabla,
      claveRelacion,
      relacionId,
      usuarioId,
      trx,
    );
    if (actual && Number(actual.tipo_id) === Number(tipoId)) {
      await trx(tabla).where({ id: actual.id }).del();
      return null;
    }
    if (actual) {
      await trx(tabla)
        .where({ id: actual.id })
        .update({ tipo_id: tipoId, updated_at: trx.fn.now() });
      return tipoId;
    }
    await trx(tabla)
      .insert({
        [claveRelacion]: relacionId,
        usuario_id: usuarioId,
        tipo_id: tipoId,
      })
      .onConflict([claveRelacion, "usuario_id"])
      .ignore();
    return tipoId;
  });
}

async function alternarFavorito(tabla, claveRelacion, relacionId, usuarioId) {
  return db.transaction(async (trx) => {
    const actual = await trx(tabla)
      .where({ [claveRelacion]: relacionId, usuario_id: usuarioId })
      .first();
    if (actual) {
      await trx(tabla).where({ id: actual.id }).del();
      return false;
    }
    await trx(tabla)
      .insert({
        [claveRelacion]: relacionId,
        usuario_id: usuarioId,
      })
      .onConflict([claveRelacion, "usuario_id"])
      .ignore();
    return true;
  });
}

async function resumenInteracciones(tabla, claveRelacion, relacionId, usuarioId) {
  const [reacciones, favoritos, propia] = await Promise.all([
    db(`${tabla} as r`)
      .join("tipos_reaccion as tr", "tr.id", "r.tipo_id")
      .where(`r.${claveRelacion}`, relacionId)
      .groupBy("tr.clave")
      .select("tr.clave")
      .count({ total: "r.id" }),
    db(tabla === "reacciones" ? "favoritos" : "favoritos_cultivos")
      .where({ [claveRelacion]: relacionId })
      .count({ total: "id" })
      .first(),
    usuarioId
      ? db(`${tabla} as r`)
          .join("tipos_reaccion as tr", "tr.id", "r.tipo_id")
          .select("tr.clave")
          .where(`r.${claveRelacion}`, relacionId)
          .andWhere("r.usuario_id", usuarioId)
          .first()
      : Promise.resolve(null),
  ]);
  const favorita = usuarioId
    ? await db(tabla === "reacciones" ? "favoritos" : "favoritos_cultivos")
        .where({ [claveRelacion]: relacionId, usuario_id: usuarioId })
        .first()
    : null;
  return {
    utiles: Number(reacciones.find((fila) => fila.clave === "util")?.total || 0),
    probados: Number(
      reacciones.find((fila) => fila.clave === "lo_probe")?.total || 0,
    ),
    favoritos: Number(favoritos ? favoritos.total : 0),
    miReaccion: propia ? propia.clave : null,
    esFavorito: Boolean(favorita),
  };
}

function crearComentario(datos, conexion = db) {
  return insertarYDevolverId("comentarios", datos, conexion);
}

function actualizarComentarioPropio(id, usuarioId, limiteEdicion, contenido) {
  return db("comentarios")
    .where({ id, usuario_id: usuarioId })
    .whereNull("deleted_at")
    .andWhere("created_at", ">=", limiteEdicion)
    .update({ contenido, updated_at: db.fn.now() });
}

function eliminarComentario(id, conexion = db) {
  return conexion("comentarios")
    .where({ id })
    .update({ deleted_at: conexion.fn.now(), updated_at: conexion.fn.now() });
}

function buscarReporte(comentarioId, usuarioId) {
  return db("reportes_comentarios")
    .where({ comentario_id: comentarioId, usuario_id: usuarioId })
    .first();
}

function crearReporte(datos) {
  return db("reportes_comentarios")
    .insert(datos)
    .onConflict(["comentario_id", "usuario_id"])
    .ignore();
}

function listarReportesPendientes() {
  return db("reportes_comentarios as r")
    .join("comentarios as co", "co.id", "r.comentario_id")
    .join("publicaciones as p", "p.id", "co.publicacion_id")
    .join("estados_reporte as er", "er.id", "r.estado_id")
    .leftJoin("perfiles as reportante", "reportante.usuario_id", "r.usuario_id")
    .leftJoin("perfiles as autor", "autor.usuario_id", "co.usuario_id")
    .select(
      "r.id",
      "r.motivo",
      "r.detalle",
      "r.created_at",
      "er.clave as estado",
      "co.id as comentario_id",
      "co.contenido",
      "co.deleted_at",
      "co.usuario_id as autor_id",
      "autor.nombre as autor",
      "reportante.nombre as reportante",
      "p.titulo as articulo",
      "p.slug as articulo_slug",
    )
    .where("er.clave", "pendiente")
    .orderBy("r.created_at")
    .limit(100);
}

async function resolverReporte(id, estadoClave, usuarioId, ocultar) {
  return db.transaction(async (trx) => {
    const reporte = await trx("reportes_comentarios as r")
      .join("estados_reporte as er", "er.id", "r.estado_id")
      .select("r.id", "r.comentario_id", "er.clave as estado")
      .where("r.id", id)
      .forUpdate()
      .first();
    if (!reporte || reporte.estado !== "pendiente") return false;

    const estado = await trx("estados_reporte")
      .where({ clave: estadoClave })
      .first();
    await trx("reportes_comentarios").where({ id }).update({
      estado_id: estado.id,
      gestionado_por: usuarioId,
      gestionado_en: trx.fn.now(),
      updated_at: trx.fn.now(),
    });
    if (ocultar) {
      await eliminarComentario(reporte.comentario_id, trx);
    }
    return true;
  });
}

function obtenerPublicacionPorId(id) {
  return db("publicaciones as p")
    .join("estados_publicacion as ep", "ep.id", "p.estado_id")
    .select("p.id", "p.slug")
    .where("p.id", id)
    .andWhere("ep.clave", "publicada")
    .whereNull("p.deleted_at")
    .first();
}

function obtenerCultivoPorSlug(slug) {
  return db("cultivos")
    .select("id", "slug", "nombre")
    .where({ slug, activo: true })
    .first();
}

module.exports = {
  buscarComentario,
  buscarTipoReaccion,
  buscarEstadoReporte,
  buscarReaccion,
  cambiarReaccion,
  alternarFavorito,
  resumenInteracciones,
  crearComentario,
  actualizarComentarioPropio,
  eliminarComentario,
  buscarReporte,
  crearReporte,
  listarReportesPendientes,
  resolverReporte,
  obtenerPublicacionPorId,
  obtenerCultivoPorSlug,
};
