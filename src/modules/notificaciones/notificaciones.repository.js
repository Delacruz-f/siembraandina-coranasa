const { db } = require("../../config/db");

function consultaNotificaciones() {
  return db("notificaciones as n")
    .leftJoin("tipos_notificacion as tn", "tn.id", "n.tipo_id")
    .leftJoin("alertas as a", "a.id", "n.alerta_id")
    .leftJoin("consultas as c", "c.id", "n.consulta_id")
    .leftJoin("avisos_zona as az", "az.id", "n.aviso_zona_id")
    .select(
      "n.id",
      "n.usuario_id",
      "tn.clave as tipo",
      "n.mensaje",
      "n.leida",
      "n.created_at",
      "n.alerta_id",
      "n.consulta_id",
      "n.aviso_zona_id",
      "a.parcela_id as alerta_parcela_id",
    );
}

async function listar(usuarioId, pagina = 1, limite = 20) {
  const consulta = consultaNotificaciones().where("n.usuario_id", usuarioId);
  const cuenta = await consulta.clone().count({ total: "n.id" }).first();
  const filas = await consulta
    .clone()
    .orderBy("n.id", "desc")
    .limit(limite)
    .offset((pagina - 1) * limite);
  return { filas, total: Number(cuenta ? cuenta.total : 0) };
}

async function nuevasDesde(usuarioId, id) {
  return consultaNotificaciones()
    .where("n.usuario_id", usuarioId)
    .andWhere("n.id", ">", id)
    .orderBy("n.id")
    .limit(50);
}

function ultimoId(usuarioId) {
  return db("notificaciones")
    .where({ usuario_id: usuarioId })
    .max({ id: "id" })
    .first()
    .then((fila) => Number(fila && fila.id ? fila.id : 0));
}

function contarNoLeidas(usuarioId) {
  return db("notificaciones")
    .where({ usuario_id: usuarioId, leida: false })
    .count({ total: "id" })
    .first()
    .then((fila) => Number(fila ? fila.total : 0));
}

async function marcarLeida(id, usuarioId) {
  const actual = await db("notificaciones")
    .where({ id, usuario_id: usuarioId })
    .first();
  if (!actual) return false;
  if (!actual.leida) {
    await db("notificaciones")
      .where({ id, usuario_id: usuarioId })
      .update({ leida: true, updated_at: db.fn.now() });
  }
  return true;
}

module.exports = {
  listar,
  nuevasDesde,
  ultimoId,
  contarNoLeidas,
  marcarLeida,
};
