// Controlador del perfil del usuario y de la solicitud de rol técnico.
const usuariosServicio = require("../usuarios/usuarios.service");
const solicitudesServicio = require("../usuarios/solicitudes.service");
const solicitudesRepositorio = require("../usuarios/solicitudes.repository");
const archivosServicio = require("../usuarios/archivos.service");
const tokensService = require("../api/tokens.service");
const { agregarMensaje } = require("../../middlewares/vistas");

async function mostrarPerfil(req, res) {
  const usuario = req.session.usuario;
  const [solicitud, preferencias] = await Promise.all([
    solicitudesRepositorio.ultimaDe(usuario.id),
    usuariosServicio.obtenerPreferencias(usuario.id),
  ]);
  const foto = usuario.foto_archivo_id
    ? await archivosServicio.presentarImagenes([usuario.foto_archivo_id])
    : [];
  const tokensApi = await tokensService.listar(usuario.id);
  res.render("panel/perfil", {
    titulo: "Mi perfil",
    solicitud,
    preferencias,
    foto: foto[0] || null,
    tokensApi,
    tokenNuevo: null,
  });
}

async function actualizarPerfil(req, res) {
  const anterior = req.session.usuario.email;
  req.session.usuario = await usuariosServicio.actualizarPerfil(
    req.session.usuario.id,
    req.body,
  );
  if (req.body.email && String(req.body.email).trim().toLowerCase() !== anterior) {
    agregarMensaje(
      req,
      "exito",
      "Perfil actualizado. Te enviamos un enlace para verificar tu nuevo correo (si no llega, puedes reenviarlo desde esta página).",
    );
  } else {
    agregarMensaje(req, "exito", "Perfil actualizado.");
  }
  res.redirect("/perfil");
}

async function cambiarPassword(req, res) {
  await usuariosServicio.cambiarPassword(req.session.usuario.id, req.body);
  agregarMensaje(req, "exito", "Contraseña actualizada.");
  res.redirect("/perfil");
}

async function actualizarFoto(req, res) {
  const imagen = await usuariosServicio.actualizarFoto(
    req.session.usuario.id,
    req.file,
  );
  req.session.usuario = imagen;
  agregarMensaje(req, "exito", "Foto de perfil actualizada.");
  res.redirect("/perfil");
}

async function actualizarPreferencias(req, res) {
  await usuariosServicio.actualizarPreferencias(
    req.session.usuario.id,
    req.body,
  );
  agregarMensaje(req, "exito", "Preferencias de notificación actualizadas.");
  res.redirect("/perfil");
}

async function mostrarSolicitud(req, res) {
  const solicitud = await solicitudesRepositorio.ultimaDe(
    req.session.usuario.id,
  );
  res.render("panel/solicitud_tecnico", {
    titulo: "Solicitar rol de técnico",
    solicitud,
  });
}

async function enviarSolicitud(req, res) {
  const archivoId = await archivosServicio.guardar(
    req.file,
    req.session.usuario.id,
  );
  await solicitudesServicio.solicitarTecnico(
    req.session.usuario.id,
    { ...req.body, archivoId },
    { ip: req.ip },
  );
  agregarMensaje(
    req,
    "exito",
    "Solicitud enviada. El administrador la revisará pronto.",
  );
  res.redirect("/perfil");
}

async function enviarVerificacionPerfil(req, res) {
  try {
    await usuariosServicio.enviarVerificacionPerfil(req.session.usuario.id, {
      ip: req.ip,
    });
    agregarMensaje(
      req,
      "exito",
      "Te enviamos un enlace de verificación. Revisa tu correo.",
    );
  } catch (error) {
    agregarMensaje(
      req,
      "error",
      error && error.message ? error.message : "No se pudo enviar el correo. Inténtalo más tarde.",
    );
  }
  return res.redirect("/perfil");
}

async function ocultarAvisoVerificacion(req, res) {
  req.session.ocultarAvisoVerificacion = true;
  return res.redirect(req.get("Referrer") || "/panel");
}

module.exports = {
  mostrarPerfil,
  actualizarPerfil,
  cambiarPassword,
  actualizarFoto,
  actualizarPreferencias,
  mostrarSolicitud,
  enviarSolicitud,
  crearTokenApi,
  revocarTokenApi,
  enviarVerificacionPerfil,
  ocultarAvisoVerificacion,
};

/** Crea un token personal y lo muestra una sola vez. */
async function crearTokenApi(req, res) {
  const creado = await tokensService.crear(
    req.session.usuario.id,
    { nombre: req.body.nombre, dias: req.body.dias },
    { ip: req.ip },
  );
  const [solicitud, preferencias, tokensApi] = await Promise.all([
    solicitudesRepositorio.ultimaDe(req.session.usuario.id),
    usuariosServicio.obtenerPreferencias(req.session.usuario.id),
    tokensService.listar(req.session.usuario.id),
  ]);
  agregarMensaje(req, "exito", "Token creado. Guárdalo ahora.");
  return res.status(201).render("panel/perfil", {
    titulo: "Mi perfil",
    solicitud,
    preferencias,
    foto: null,
    tokensApi,
    tokenNuevo: creado.token,
  });
}

async function revocarTokenApi(req, res) {
  await tokensService.revocar(
    req.params.id,
    req.session.usuario.id,
    { ip: req.ip },
  );
  agregarMensaje(req, "exito", "Token revocado.");
  return res.redirect("/perfil");
}
