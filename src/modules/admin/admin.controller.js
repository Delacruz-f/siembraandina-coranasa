// Controlador del panel de administración.
const servicio = require("./admin.service");
const rolesRepositorio = require("../usuarios/roles.repository");
const { agregarMensaje } = require("../../middlewares/vistas");

function filtrosAuditoria(req) {
  const hasta = String(req.query.hasta || "");
  let hastaExclusivo = hasta;
  if (/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
    const [anio, mes, dia] = hasta.split("-").map(Number);
    hastaExclusivo = new Date(Date.UTC(anio, mes - 1, dia + 1))
      .toISOString()
      .slice(0, 10);
  }
  return {
    busqueda: String(req.query.q || "").trim(),
    accion: String(req.query.accion || "").trim(),
    entidad: String(req.query.entidad || "").trim(),
    desde: String(req.query.desde || ""),
    hasta: hastaExclusivo,
    hastaOriginal: hasta,
    orden: String(req.query.orden || "fecha"),
    direccion: String(req.query.direccion || "desc"),
  };
}

function guiaEstilo(req, res) {
  res.render("admin/guia-estilo", { titulo: "Guía de estilo" });
}

async function panel(req, res) {
  const datos = await servicio.resumen();
  res.render("admin/panel", { titulo: "Administración", ...datos });
}

async function solicitudes(req, res) {
  const estado = ["pendiente", "aprobada", "rechazada"].includes(
    req.query.estado,
  )
    ? req.query.estado
    : "pendiente";
  const lista = await servicio.listarSolicitudes(estado);
  res.render("admin/solicitudes", {
    titulo: "Solicitudes de rol",
    solicitudes: lista,
    estado,
  });
}

async function aprobar(req, res) {
  await servicio.aprobarSolicitud(
    req.params.id,
    req.session.usuario.id,
    req.body,
    { ip: req.ip },
  );
  agregarMensaje(
    req,
    "exito",
    "Solicitud aprobada. El usuario ya tiene el rol de técnico.",
  );
  res.redirect("/admin/solicitudes");
}

async function rechazar(req, res) {
  await servicio.rechazarSolicitud(
    req.params.id,
    req.session.usuario.id,
    req.body,
    { ip: req.ip },
  );
  agregarMensaje(req, "exito", "Solicitud rechazada.");
  res.redirect("/admin/solicitudes");
}

async function usuarios(req, res) {
  const filtros = {
    busqueda: String(req.query.q || "").trim(),
    rol: String(req.query.rol || ""),
    activo: String(req.query.activo || ""),
    orden: String(req.query.orden || "creado_en"),
    direccion: String(req.query.direccion || "desc"),
    pagina: Number(req.query.pagina || 1),
  };
  const [resultado, roles] = await Promise.all([
    servicio.listarUsuarios(filtros),
    rolesRepositorio.listarRoles(),
  ]);
  res.render("admin/usuarios", {
    titulo: "Usuarios",
    ...resultado,
    roles,
    filtros,
  });
}

async function asignarRol(req, res) {
  await servicio.asignarRol(
    req.params.id,
    req.body.rol,
    req.session.usuario.id,
    { ip: req.ip },
  );
  agregarMensaje(req, "exito", "Rol asignado.");
  res.redirect(`/admin/usuarios?q=${encodeURIComponent(req.query.q || "")}`);
}

async function quitarRol(req, res) {
  await servicio.quitarRol(
    req.params.id,
    req.body.rol,
    req.session.usuario.id,
    { ip: req.ip },
  );
  agregarMensaje(req, "exito", "Rol retirado.");
  return res.redirect("/admin/usuarios");
}

async function cambiarEstado(req, res) {
  await servicio.cambiarEstado(
    req.params.id,
    req.body.activo === "1",
    req.session.usuario.id,
    { ip: req.ip },
  );
  agregarMensaje(req, "exito", "Estado de la cuenta actualizado.");
  res.redirect("/admin/usuarios");
}

async function reenviarVerificacion(req, res) {
  try {
    await servicio.reenviarVerificacionUsuario(
      req.params.id,
      req.session.usuario.id,
      { ip: req.ip },
    );
    agregarMensaje(req, "exito", "Se envió un nuevo correo de verificación.");
  } catch (error) {
    if (error && (error.estado === 400 || error.estado === 404)) {
      agregarMensaje(req, "aviso", error.message);
    } else {
      agregarMensaje(req, "error", error && error.message ? error.message : "No se pudo enviar el correo de verificación.");
    }
  }
  return res.redirect("/admin/usuarios");
}

async function marcarCorreoVerificado(req, res) {
  try {
    await servicio.marcarCorreoVerificadoUsuario(
      req.params.id,
      req.session.usuario.id,
      { ip: req.ip },
    );
    agregarMensaje(req, "exito", "El correo fue marcado como verificado.");
  } catch (error) {
    if (error && (error.estado === 400 || error.estado === 404)) {
      agregarMensaje(req, "aviso", error.message);
    } else {
      throw error;
    }
  }
  return res.redirect("/admin/usuarios");
}

async function permisos(req, res) {
  const datos = await servicio.matrizPermisos();
  res.render("admin/permisos", { titulo: "Permisos por rol", ...datos });
}

async function guardarPermisos(req, res) {
  const claves = [].concat(req.body.permisos || []);
  await servicio.guardarPermisos(
    req.params.rol,
    claves,
    req.session.usuario.id,
    { ip: req.ip },
  );
  agregarMensaje(req, "exito", "Permisos actualizados.");
  res.redirect("/admin/permisos");
}

async function crearRol(req, res) {
  await servicio.crearRol(req.body, req.session.usuario.id, { ip: req.ip });
  agregarMensaje(req, "exito", "Rol creado con sus permisos.");
  return res.redirect("/admin/permisos");
}

async function auditoria(req, res) {
  const filtros = {
    ...filtrosAuditoria(req),
    pagina: Number(req.query.pagina || 1),
  };
  const datos = await servicio.listarAuditoria(filtros);
  return res.render("admin/auditoria", {
    titulo: "Auditoría",
    ...datos,
    filtros,
  });
}

async function exportarAuditoria(req, res) {
  const contenido = await servicio.exportarAuditoria(filtrosAuditoria(req));
  return res
    .status(200)
    .type("text/csv")
    .set("Content-Disposition", 'attachment; filename="auditoria.csv"')
    .send(contenido);
}

async function catalogos(req, res) {
  const datos = await servicio.catalogos({
    tipo: String(req.query.tipo || "cultivo"),
    busqueda: String(req.query.q || "").trim(),
    pagina: Number(req.query.pagina || 1),
    orden: String(req.query.orden || "nombre"),
    direccion: String(req.query.direccion || "asc"),
  });
  return res.render("admin/catalogos", { titulo: "Catálogos", ...datos });
}

async function guardarCatalogo(req, res) {
  await servicio.guardarCatalogo(
    req.params.tipo,
    req.params.id || null,
    req.body,
    req.session.usuario.id,
    { ip: req.ip },
  );
  agregarMensaje(req, "exito", "Registro de catálogo guardado.");
  return res.redirect("/admin/catalogos");
}

async function vincularVariedad(req, res) {
  await servicio.vincularVariedad(
    req.body.cultivo_id,
    req.body.variedad_id,
    req.session.usuario.id,
    { ip: req.ip },
  );
  agregarMensaje(req, "exito", "Variedad vinculada al cultivo.");
  return res.redirect("/admin/catalogos");
}

async function mensajesContacto(req, res) {
  const datos = await servicio.listarMensajes({
    busqueda: String(req.query.q || "").trim(),
    leido: String(req.query.leido || ""),
    pagina: Number(req.query.pagina || 1),
    orden: String(req.query.orden || "fecha"),
    direccion: String(req.query.direccion || "desc"),
  });
  return res.render("admin/contacto", {
    titulo: "Mensajes de contacto",
    ...datos,
    filtros: {
      busqueda: String(req.query.q || ""),
      leido: String(req.query.leido || ""),
      orden: String(req.query.orden || "fecha"),
      direccion: String(req.query.direccion || "desc"),
    },
  });
}

async function marcarMensaje(req, res) {
  await servicio.marcarMensaje(
    req.params.id,
    req.session.usuario.id,
    req.body.leido === "1",
    { ip: req.ip },
  );
  agregarMensaje(req, "exito", "Estado del mensaje actualizado.");
  return res.redirect("/admin/contacto");
}

async function configuraciones(req, res) {
  const configuracionesLista = await servicio.listarConfiguraciones();
  return res.render("admin/configuraciones", {
    titulo: "Configuración general",
    configuraciones: configuracionesLista,
  });
}

async function guardarConfiguracion(req, res) {
  await servicio.guardarConfiguracion(
    req.params.clave,
    req.body.valor,
    req.session.usuario.id,
    { ip: req.ip },
  );
  agregarMensaje(req, "exito", "Configuración actualizada.");
  return res.redirect("/admin/configuraciones");
}

async function trabajos(req, res) {
  const trabajos = await servicio.listarTrabajos();
  return res.render("admin/trabajos", {
    titulo: "Trabajos programados",
    trabajos,
  });
}

async function ejecutarTrabajo(req, res) {
  const resultado = await servicio.ejecutarTrabajo(
    req.params.clave,
    req.session.usuario.id,
    { ip: req.ip },
  );
  if (resultado.estado === "fallido") {
    agregarMensaje(req, "error", `El trabajo falló: ${resultado.error}`);
  } else if (resultado.estado === "parcial") {
    agregarMensaje(req, "aviso", "El trabajo terminó con errores parciales. Revisa su detalle.");
  } else if (resultado.omitida) {
    agregarMensaje(req, "aviso", "Ese trabajo ya está en ejecución.");
  } else {
    agregarMensaje(req, "exito", "El trabajo terminó correctamente.");
  }
  return res.redirect("/admin/trabajos");
}

module.exports = {
  guiaEstilo,
  panel,
  solicitudes,
  aprobar,
  rechazar,
  usuarios,
  asignarRol,
  quitarRol,
  cambiarEstado,
  reenviarVerificacion,
  marcarCorreoVerificado,
  permisos,
  guardarPermisos,
  crearRol,
  auditoria,
  exportarAuditoria,
  catalogos,
  guardarCatalogo,
  vincularVariedad,
  mensajesContacto,
  marcarMensaje,
  configuraciones,
  guardarConfiguracion,
  trabajos,
  ejecutarTrabajo,
};
