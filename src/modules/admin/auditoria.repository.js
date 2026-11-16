// Repositorio de auditoría: registra acciones sensibles.
const { db } = require("../../config/db");
const { operadorBusqueda } = require("../../utils/baseDatos");

function registrar({
  usuarioId,
  accion,
  entidad,
  entidadId,
  detalle,
  ip,
  trx = db,
}) {
  return trx("auditoria").insert({
    usuario_id: usuarioId || null,
    accion,
    entidad,
    entidad_id: entidadId || null,
    detalle: detalle ? JSON.stringify(detalle) : null,
    ip: ip || null,
    fecha: db.fn.now(),
  });
}

function consulta({ busqueda, accion, entidad, desde, hasta } = {}) {
  const query = db("auditoria as a")
    .leftJoin("usuarios as u", "u.id", "a.usuario_id")
    .leftJoin("perfiles as p", "p.usuario_id", "u.id")
    .select("a.*", "a.created_at as creado_en", "p.nombre as usuario_nombre");
  if (accion) query.where("a.accion", accion);
  if (entidad) query.where("a.entidad", entidad);
  if (desde) query.where("a.fecha", ">=", desde);
  if (hasta) query.where("a.fecha", "<", hasta);
  if (busqueda) {
    query.andWhere((subconsulta) =>
      subconsulta
        .where("a.accion", operadorBusqueda(), `%${busqueda}%`)
        .orWhere("a.entidad", operadorBusqueda(), `%${busqueda}%`)
        .orWhere("a.detalle", operadorBusqueda(), `%${busqueda}%`)
        .orWhere("p.nombre", operadorBusqueda(), `%${busqueda}%`)
        .orWhere("u.email", operadorBusqueda(), `%${busqueda}%`),
    );
  }
  return query;
}

function ordenarAuditoria(query, orden, direccion) {
  const columnas = {
    fecha: "a.fecha",
    usuario: "p.nombre",
    accion: "a.accion",
    entidad: "a.entidad",
  };
  query.orderBy(columnas[orden] || "a.id", direccion === "asc" ? "asc" : "desc");
  return query.orderBy("a.id", "desc");
}

async function listar({
  limite = 100,
  pagina = 1,
  orden = "fecha",
  direccion = "desc",
  ...filtros
} = {}) {
  const query = consulta(filtros);
  const cuenta = await query.clone().count({ total: "a.id" }).first();
  return {
    registros: await ordenarAuditoria(query.clone(), orden, direccion)
      .limit(limite)
      .offset((pagina - 1) * limite),
    total: Number(cuenta ? cuenta.total : 0),
  };
}

function exportar({ orden = "fecha", direccion = "desc", ...filtros } = {}) {
  return ordenarAuditoria(consulta(filtros), orden, direccion).limit(5000);
}

module.exports = { registrar, listar, exportar };
