// Repositorio de solicitudes de rol (agricultor → técnico).
const { db } = require("../../config/db");
const { insertarYDevolverId } = require("../../utils/baseDatos");

function estadoPorClave(clave) {
  return db("estados_solicitud").where({ clave }).first();
}

/** Solicitud pendiente del usuario (si existe). */
function pendienteDe(usuarioId) {
  return db("solicitudes_rol as s")
    .join("estados_solicitud as e", "e.id", "s.estado_id")
    .select("s.*", "e.clave as estado")
    .where("s.usuario_id", usuarioId)
    .andWhere("e.clave", "pendiente")
    .first();
}

/** Última solicitud del usuario, sea cual sea su estado. */
function ultimaDe(usuarioId) {
  return db("solicitudes_rol as s")
    .join("estados_solicitud as e", "e.id", "s.estado_id")
    .leftJoin("roles as r", "r.id", "s.rol_id")
    .select("s.*", "e.clave as estado", "r.nombre as rol_nombre")
    .where("s.usuario_id", usuarioId)
    .orderBy("s.id", "desc")
    .first();
}

async function crear(datos) {
  return db.transaction(async (trx) => {
    const id = await insertarYDevolverId("solicitudes_rol", datos, trx);
    const tipo = await trx("tipos_notificacion")
      .where({ clave: "solicitud" })
      .first();
    if (!tipo) {
      throw new Error(
        "Falta el tipo de notificación de solicitud. Ejecuta npm run seed.",
      );
    }

    const administradores = await trx("usuarios as u")
      .join("usuario_roles as ur", "ur.usuario_id", "u.id")
      .join("rol_permisos as rp", "rp.rol_id", "ur.rol_id")
      .join("permisos as p", "p.id", "rp.permiso_id")
      .where("p.clave", "solicitudes.revisar")
      .where("u.activo", true)
      .whereNull("u.deleted_at")
      .distinct("u.id as usuario_id");

    if (administradores.length) {
      await trx("notificaciones").insert(
        administradores.map(({ usuario_id }) => ({
          usuario_id,
          tipo_id: tipo.id,
          leida: false,
          mensaje: `Nueva solicitud de rol de técnico (#${id}) pendiente de revisión.`,
        })),
      );
    }

    return id;
  });
}

/** Lista solicitudes con datos del solicitante y del revisor. */
function listar({ estado } = {}) {
  const consulta = db("solicitudes_rol as s")
    .join("usuarios as u", "u.id", "s.usuario_id")
    .join("perfiles as up", "up.usuario_id", "u.id")
    .join("estados_solicitud as e", "e.id", "s.estado_id")
    .leftJoin("roles as r", "r.id", "s.rol_id")
    .leftJoin("usuarios as rev", "rev.id", "s.revisado_por")
    .leftJoin("perfiles as rp", "rp.usuario_id", "rev.id")
    .leftJoin("archivos as a", "a.id", "s.archivo_id")
    .select(
      "s.*",
      "e.clave as estado",
      "up.nombre as solicitante",
      "u.email as solicitante_email",
      "up.comunidad as solicitante_comunidad",
      "r.nombre as rol_nombre",
      "rp.nombre as revisor",
      "a.id as archivo_id",
      "a.nombre_original as archivo_nombre",
      "a.ruta as archivo_ruta",
    )
    .orderBy("s.id", "desc");
  if (estado) consulta.where("e.clave", estado);
  return consulta;
}

function buscarPorId(id) {
  return db("solicitudes_rol as s")
    .join("estados_solicitud as e", "e.id", "s.estado_id")
    .select("s.*", "e.clave as estado")
    .where("s.id", id)
    .first();
}

function actualizar(id, datos) {
  return db("solicitudes_rol")
    .where({ id })
    .update({ ...datos, updated_at: db.fn.now() });
}

module.exports = {
  estadoPorClave,
  pendienteDe,
  ultimaDe,
  crear,
  listar,
  buscarPorId,
  actualizar,
};
