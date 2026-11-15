// Servicio de solicitudes de rol: un agricultor pide ser técnico y el
// administrador aprueba o rechaza. Al aprobar se asigna el rol y se audita.
const repositorio = require("./solicitudes.repository");
const usuariosRepositorio = require("./usuarios.repository");
const rolesRepositorio = require("./roles.repository");
const auditoria = require("../admin/auditoria.repository");
const {
  ErrorHttp,
  solicitudInvalida,
  noEncontrado,
} = require("../../utils/errores");

/** Crea una solicitud para el rol de técnico. */
async function solicitarTecnico(
  usuarioId,
  { institucion, numero_colegiatura, archivoId },
  { ip } = {},
) {
  if (!institucion || !institucion.trim())
    throw solicitudInvalida(
      "Indica la institución o comunidad a la que representas.",
    );

  const pendiente = await repositorio.pendienteDe(usuarioId);
  if (pendiente)
    throw new ErrorHttp(409, "Ya tienes una solicitud pendiente de revisión.", {
      codigo: "solicitud_pendiente",
    });

  const roles = await usuariosRepositorio.rolesDeUsuario(usuarioId);
  if (roles.includes("tecnico"))
    throw new ErrorHttp(409, "Ya tienes el rol de técnico.", {
      codigo: "rol_existente",
    });

  const rol = await rolesRepositorio.buscarRolPorClave("tecnico");
  const estado = await repositorio.estadoPorClave("pendiente");
  if (!rol || !estado)
    throw new ErrorHttp(500, "Faltan catálogos base. Ejecuta npm run seed.");

  const id = await repositorio.crear({
    usuario_id: usuarioId,
    rol_id: rol.id,
    institucion: institucion.trim(),
    numero_colegiatura: numero_colegiatura ? numero_colegiatura.trim() : null,
    archivo_id: archivoId || null,
    estado_id: estado.id,
  });
  await auditoria.registrar({
    usuarioId,
    accion: "solicitud.creada",
    entidad: "solicitudes_rol",
    entidadId: id,
    detalle: { institucion },
    ip,
  });
  return id;
}

/** Aprueba una solicitud: asigna el rol y registra la revisión. */
async function aprobar(
  solicitudId,
  revisorId,
  { observacion } = {},
  { ip } = {},
) {
  const solicitud = await repositorio.buscarPorId(solicitudId);
  if (!solicitud) throw noEncontrado("No encontramos esa solicitud.");
  if (solicitud.estado !== "pendiente")
    throw new ErrorHttp(409, "Esta solicitud ya fue revisada.", {
      codigo: "solicitud_revisada",
    });

  const estado = await repositorio.estadoPorClave("aprobada");
  await repositorio.actualizar(solicitudId, {
    estado_id: estado.id,
    revisado_por: revisorId,
    observacion: observacion || null,
    fecha_revision: new Date(),
  });
  await usuariosRepositorio.cambiarRolPrincipal(
    solicitud.usuario_id,
    solicitud.rol_id,
    revisorId,
  );
  await auditoria.registrar({
    usuarioId: revisorId,
    accion: "rol.asignado",
    entidad: "usuarios",
    entidadId: solicitud.usuario_id,
    detalle: { rol_id: solicitud.rol_id, solicitud_id: solicitudId },
    ip,
  });
  await auditoria.registrar({
    usuarioId: revisorId,
    accion: "solicitud.aprobada",
    entidad: "solicitudes_rol",
    entidadId: solicitudId,
    detalle: { usuario_id: solicitud.usuario_id, rol_id: solicitud.rol_id },
    ip,
  });
}

/** Rechaza una solicitud con una observación obligatoria. */
async function rechazar(
  solicitudId,
  revisorId,
  { observacion } = {},
  { ip } = {},
) {
  if (!observacion || !observacion.trim())
    throw solicitudInvalida("Escribe el motivo del rechazo.");
  const solicitud = await repositorio.buscarPorId(solicitudId);
  if (!solicitud) throw noEncontrado("No encontramos esa solicitud.");
  if (solicitud.estado !== "pendiente")
    throw new ErrorHttp(409, "Esta solicitud ya fue revisada.", {
      codigo: "solicitud_revisada",
    });

  const estado = await repositorio.estadoPorClave("rechazada");
  await repositorio.actualizar(solicitudId, {
    estado_id: estado.id,
    revisado_por: revisorId,
    observacion: observacion.trim(),
    fecha_revision: new Date(),
  });
  await auditoria.registrar({
    usuarioId: revisorId,
    accion: "solicitud.rechazada",
    entidad: "solicitudes_rol",
    entidadId: solicitudId,
    detalle: { usuario_id: solicitud.usuario_id, observacion },
    ip,
  });
}

module.exports = { solicitarTecnico, aprobar, rechazar };
