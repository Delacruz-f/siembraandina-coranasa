// Controlador de autenticación: registro, ingreso y salida.
const { body } = require("express-validator");
const servicio = require("../usuarios/usuarios.service");
const { agregarMensaje } = require("../../middlewares/vistas");
const env = require("../../config/env");

const reglasRegistro = [
  body("nombre")
    .trim()
    .isLength({ min: 3, max: 120 })
    .withMessage("El nombre debe tener entre 3 y 120 caracteres."),
  body("email")
    .trim()
    .isEmail()
    .withMessage("Escribe un correo válido.")
    .normalizeEmail(),
  body("password")
    .isLength({ min: 8, max: 72 })
    .withMessage("La contraseña debe tener al menos 8 caracteres."),
  body("telefono")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ max: 30 })
    .withMessage("El teléfono es demasiado largo."),
  body("comunidad")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ max: 120 })
    .withMessage("La comunidad es demasiado larga."),
];

const reglasIngreso = [
  body("email").trim().isEmail().withMessage("Escribe un correo válido."),
  body("password").notEmpty().withMessage("Escribe tu contraseña."),
];

function mostrarRegistro(req, res) {
  if (req.session.usuario) return res.redirect("/panel");
  return res.render("publico/registro", {
    titulo: "Crear cuenta",
    valores: {},
  });
}

async function registrar(req, res) {
  const resultado = await servicio.registrar(req.body, { ip: req.ip });
  const usuario = await servicio.cargarSesion(resultado.id);
  const consultaPublicaPendienteId = req.session.consultaPublicaPendienteId;
  const destino = consultaPublicaPendienteId
    ? "/panel/consultas/nueva"
    : req.session.destino;
  await new Promise((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
  req.session.usuario = usuario;
  if (consultaPublicaPendienteId) {
    req.session.consultaPublicaPendienteId = consultaPublicaPendienteId;
  }
  agregarMensaje(
    req,
    "exito",
    "Tu cuenta está lista. Verifica tu correo desde tu perfil cuando quieras",
  );
  await new Promise((resolve, reject) => {
    req.session.save((error) => (error ? reject(error) : resolve()));
  });
  const destinoSeguro =
    typeof destino === "string" &&
    destino.startsWith("/") &&
    !destino.startsWith("//") &&
    !destino.includes("\\");
  return res.redirect(destinoSeguro ? destino : "/panel");
}

function mostrarIngreso(req, res) {
  if (req.session.usuario) return res.redirect("/panel");
  return res.render("publico/ingreso", { titulo: "Ingresar", valores: {} });
}

async function ingresar(req, res) {
  const usuario = await servicio.autenticar(req.body, { ip: req.ip });
  const consultaPublicaPendienteId = req.session.consultaPublicaPendienteId;
  const destino = consultaPublicaPendienteId
    ? "/panel/consultas/nueva"
    : req.session.destino;
  await new Promise((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
  req.session.usuario = usuario;
  if (consultaPublicaPendienteId) {
    req.session.consultaPublicaPendienteId = consultaPublicaPendienteId;
  }
  agregarMensaje(req, "exito", `Hola de nuevo, ${usuario.nombre}.`);
  await new Promise((resolve, reject) => {
    req.session.save((error) => (error ? reject(error) : resolve()));
  });
  const destinoSeguro =
    typeof destino === "string" &&
    destino.startsWith("/") &&
    !destino.startsWith("//") &&
    !destino.includes("\\");
  return res.redirect(destinoSeguro ? destino : "/panel");
}

function salir(req, res, next) {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie(env.sesion.nombreCookie, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.sesion.cookieSegura,
    });
    res.redirect("/");
  });
}

function mostrarRecuperacion(req, res) {
  return res.render("publico/recuperar", {
    titulo: "Recuperar contraseña",
    valores: {},
  });
}

async function solicitarRecuperacion(req, res) {
  await servicio.solicitarRecuperacion(req.body.email);
  agregarMensaje(
    req,
    "exito",
    "Si el correo corresponde a una cuenta verificada, recibirás instrucciones para recuperar el acceso.",
  );
  return res.redirect("/recuperar");
}

async function mostrarRestablecer(req, res) {
  const valido = await servicio.tokenRecuperacionValido(req.params.token);
  if (!valido) {
    agregarMensaje(req, "error", "El enlace venció o ya se usó. Solicita otro.");
    return res.redirect("/recuperar");
  }
  return res.render("publico/restablecer", {
    titulo: "Elegir nueva contraseña",
    token: req.params.token,
  });
}

async function restablecer(req, res) {
  await servicio.restablecerPassword(req.params.token, req.body.password);
  agregarMensaje(req, "exito", "Contraseña actualizada. Ya puedes ingresar.");
  return res.redirect("/ingresar");
}

async function mostrarVerificacion(req, res) {
  const valido = await servicio.tokenVerificacionValido(req.params.token);
  if (!valido) {
    agregarMensaje(req, "error", "El enlace venció o ya se usó. Solicita otro.");
    return res.redirect("/verificacion/reenvio");
  }
  return res.render("publico/verificar", {
    titulo: "Verificar correo",
    token: req.params.token,
  });
}

async function verificarCorreo(req, res) {
  await servicio.verificarCorreo(req.params.token);
  if (req.session && req.session.usuario) {
    req.session.usuario = await servicio.cargarSesion(req.session.usuario.id);
    agregarMensaje(req, "exito", "Tu correo fue verificado correctamente.");
    return res.redirect("/perfil");
  }
  agregarMensaje(
    req,
    "exito",
    "Correo verificado. Ya puedes ingresar a tu cuenta.",
  );
  return res.redirect("/ingresar");
}

function mostrarReenvioVerificacion(req, res) {
  return res.render("publico/verificacion", {
    titulo: "Reenviar verificación",
    valores: { email: String(req.query.email || "") },
  });
}

async function reenviarVerificacion(req, res) {
  await servicio.reenviarVerificacion(req.body.email);
  agregarMensaje(
    req,
    "exito",
    "Si la cuenta necesita verificación, recibirás un nuevo enlace.",
  );
  return res.redirect("/verificacion/reenvio");
}

const reglasCorreo = [
  body("email")
    .trim()
    .isEmail()
    .withMessage("Escribe un correo válido.")
    .normalizeEmail(),
];

const reglasNuevaPassword = [
  body("password")
    .isLength({ min: 8, max: 72 })
    .withMessage("La contraseña debe tener entre 8 y 72 caracteres."),
  body("confirmar")
    .custom((valor, { req }) => valor === req.body.password)
    .withMessage("Las contraseñas no coinciden."),
];

module.exports = {
  reglasRegistro,
  reglasIngreso,
  reglasCorreo,
  reglasNuevaPassword,
  mostrarRegistro,
  registrar,
  mostrarIngreso,
  ingresar,
  salir,
  mostrarRecuperacion,
  solicitarRecuperacion,
  mostrarRestablecer,
  restablecer,
  mostrarVerificacion,
  verificarCorreo,
  mostrarReenvioVerificacion,
  reenviarVerificacion,
};
