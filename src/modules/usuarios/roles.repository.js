// Repositorio de roles y permisos.
const { db } = require("../../config/db");
const { insertarYDevolverId } = require("../../utils/baseDatos");

function buscarRolPorClave(clave) {
  return db("roles").where({ clave }).first();
}

function listarRoles() {
  return db("roles")
    .select("id", "clave", "nombre", "descripcion", "es_sistema")
    .orderBy("id");
}

function listarPermisos() {
  return db("permisos").select("id", "clave", "descripcion").orderBy("clave");
}

/** Matriz rol → permisos para la pantalla de administración. */
async function permisosPorRol() {
  const filas = await db("rol_permisos as rp")
    .join("roles as r", "r.id", "rp.rol_id")
    .join("permisos as p", "p.id", "rp.permiso_id")
    .select("r.clave as rol", "p.clave as permiso");
  const mapa = {};
  for (const fila of filas) {
    mapa[fila.rol] = mapa[fila.rol] || [];
    mapa[fila.rol].push(fila.permiso);
  }
  return mapa;
}

/** Reemplaza los permisos de un rol dentro de una transacción. */
async function reemplazarPermisos(rolId, clavesPermisos) {
  await db.transaction(async (trx) => {
    await trx("rol_permisos").where({ rol_id: rolId }).del();
    if (!clavesPermisos.length) return;
    const permisos = await trx("permisos")
      .whereIn("clave", clavesPermisos)
      .select("id");
    if (permisos.length) {
      await trx("rol_permisos").insert(
        permisos.map((p) => ({ rol_id: rolId, permiso_id: p.id })),
      );
    }
  });
}

/** Crea un rol nuevo (no de sistema). */
async function crearRol({ clave, nombre, descripcion }) {
  return insertarYDevolverId("roles", {
    clave,
    nombre,
    descripcion,
    es_sistema: false,
  });
}

async function crearRolConPermisos({ clave, nombre, descripcion, clavesPermisos }) {
  return db.transaction(async (trx) => {
    const rolId = await insertarYDevolverId(
      "roles",
      { clave, nombre, descripcion, es_sistema: false },
      trx,
    );
    if (clavesPermisos.length) {
      const permisos = await trx("permisos")
        .whereIn("clave", clavesPermisos)
        .select("id");
      await trx("rol_permisos").insert(
        permisos.map((permiso) => ({
          rol_id: rolId,
          permiso_id: permiso.id,
        })),
      );
    }
    return rolId;
  });
}

module.exports = {
  buscarRolPorClave,
  listarRoles,
  listarPermisos,
  permisosPorRol,
  reemplazarPermisos,
  crearRol,
  crearRolConPermisos,
};
