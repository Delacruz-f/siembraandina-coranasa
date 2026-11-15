// Rutas del perfil y de la solicitud de rol técnico.
const express = require("express");
const { body, param } = require("express-validator");
const { asyncHandler } = require("../../utils/asyncHandler");
const { validar } = require("../../middlewares/validacion");
const {
  requiereSesion,
  requierePermiso,
} = require("../../middlewares/autorizacion");
const { requiereCorreoVerificado } = require("../../middlewares/requiereCorreoVerificado");
const { subida, subidaImagenes } = require("../../middlewares/subida");
const { validarCsrf } = require("../../middlewares/csrf");
const controlador = require("./usuarios.controller");
const archivosControlador = require("./archivos.controller");

const router = express.Router();

router.get(
  "/archivos/:id",
  requiereSesion,
  validar([param("id").isInt({ min: 1 })]),
  asyncHandler(archivosControlador.descargar),
);
router.get(
  "/archivos/:id/vista",
  requiereSesion,
  validar([param("id").isInt({ min: 1 })]),
  asyncHandler(archivosControlador.ver),
);

const reglasPerfil = [
  body("nombre")
    .trim()
    .isLength({ min: 3, max: 120 })
    .withMessage("El nombre debe tener entre 3 y 120 caracteres."),
  body("email")
    .optional({ values: "falsy" })
    .trim()
    .isEmail()
    .withMessage("Escribe un correo válido.")
    .normalizeEmail(),
  body("password_actual")
    .optional({ values: "falsy" })
    .isLength({ min: 1, max: 72 })
    .withMessage("La contraseña actual no es válida."),
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

const reglasPassword = [
  body("actual").notEmpty().withMessage("Escribe tu contraseña actual."),
  body("nueva")
    .isLength({ min: 8, max: 72 })
    .withMessage("La nueva contraseña debe tener al menos 8 caracteres."),
  body("confirmar")
    .custom((valor, { req }) => valor === req.body.nueva)
    .withMessage("Las contraseñas no coinciden."),
];

const reglasSolicitud = [
  body("institucion")
    .trim()
    .isLength({ min: 3, max: 160 })
    .withMessage("Indica la institución o comunidad."),
  body("numero_colegiatura")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ max: 60 })
    .withMessage("El número de colegiatura es demasiado largo."),
];

router.get("/perfil", requiereSesion, asyncHandler(controlador.mostrarPerfil));
router.post(
  "/perfil",
  requiereSesion,
  validar(reglasPerfil),
  asyncHandler(controlador.actualizarPerfil),
);
router.post(
  "/perfil/foto",
  requiereSesion,
  validarCsrf,
  subidaImagenes.single("foto"),
  validarCsrf,
  asyncHandler(controlador.actualizarFoto),
);
router.post(
  "/perfil/preferencias",
  requiereSesion,
  validar([
    body("correo_alertas")
      .optional()
      .isIn(["on", "true", "1"])
      .withMessage("El valor de avisos por correo no es válido."),
    body("avisos_panel")
      .optional()
      .isIn(["on", "true", "1"])
      .withMessage("El valor de avisos del panel no es válido."),
    body("resumen_semanal")
      .optional()
      .isIn(["on", "true", "1"])
      .withMessage("El valor del resumen semanal no es válido."),
  ]),
  asyncHandler(controlador.actualizarPreferencias),
);
router.post(
  "/perfil/password",
  requiereSesion,
  validar(reglasPassword),
  asyncHandler(controlador.cambiarPassword),
);

router.post(
  "/perfil/verificacion/enviar",
  requiereSesion,
  asyncHandler(controlador.enviarVerificacionPerfil),
);

router.post(
  "/perfil/verificacion/ocultar-aviso",
  requiereSesion,
  asyncHandler(controlador.ocultarAvisoVerificacion),
);

// Tokens personales de la API v1 (Fase 12).
router.post(
  "/perfil/tokens",
  requiereSesion,
  requiereCorreoVerificado,
  validar([
    body("nombre")
      .trim()
      .isLength({ min: 3, max: 80 })
      .withMessage("Ponle un nombre de 3 a 80 caracteres al token."),
    body("dias").optional({ values: "falsy" }).isInt({ min: 1, max: 730 }),
  ]),
  asyncHandler(controlador.crearTokenApi),
);
router.post(
  "/perfil/tokens/:id/revocar",
  requiereSesion,
  validar([param("id").isInt({ min: 1 })]),
  asyncHandler(controlador.revocarTokenApi),
);

router.get(
  "/perfil/solicitud-tecnico",
  requierePermiso("solicitudes.crear"),
  requiereCorreoVerificado,
  asyncHandler(controlador.mostrarSolicitud),
);
router.post(
  "/perfil/solicitud-tecnico",
  requierePermiso("solicitudes.crear"),
  requiereCorreoVerificado,
  // Formulario multipart: el token CSRF llega en la cabecera x-csrf-token
  // (el campo _csrf va después del archivo y no se puede leer antes).
  validarCsrf,
  subida.single("documento"),
  // Segunda comprobación, ya con el cuerpo parseado: permite enviar el token
  // también en el campo oculto _csrf del formulario.
  validarCsrf,
  validar(reglasSolicitud),
  asyncHandler(controlador.enviarSolicitud),
);

module.exports = router;
