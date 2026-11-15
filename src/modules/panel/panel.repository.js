// Consultas del resumen del panel, siempre acotadas al usuario propietario.
const { db } = require("../../config/db");

function listarAlertasProximas(usuarioId, limite = 8) {
  return db("alertas as a")
    .join("parcelas as p", "p.id", "a.parcela_id")
    .join("estados_alerta as ea", "ea.id", "a.estado_id")
    .where("p.usuario_id", usuarioId)
    .whereNull("p.deleted_at")
    .andWhere("ea.clave", "activa")
    .andWhere("a.fecha", ">=", db.fn.now())
    .select("a.id", "a.parcela_id", "a.mensaje", "a.fecha", "p.nombre as parcela")
    .orderBy("a.fecha", "asc")
    .limit(limite);
}

module.exports = { listarAlertasProximas };
