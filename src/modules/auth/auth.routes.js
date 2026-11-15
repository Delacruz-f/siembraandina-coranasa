// Rutas de autenticación. El límite de peticiones frena la fuerza bruta.
const express = require("express");
const { param } = require("express-validator");
const { asyncHandler } = require("../../utils/asyncHandler");
const { validar } = require("../../middlewares/validacion");
const { crearLimitador } = require("../../middlewares/limitePeticiones");
const controlador = require("./auth.controller");

const router = express.Router();
const limitadorRegistro = crearLimitador({
  maximo: 5,
  mensaje: "Demasiados registros desde esta dirección. Espera 15 minutos.",
});
const limitadorIngreso = crearLimitador({
  maximo: 10,
  mensaje: "Demasiados intentos de ingreso. Espera 15 minutos.",
});
const limitadorRecuperacion = crearLimitador({
  maximo: 5,
  mensaje: "Demasiadas solicitudes. Espera 15 minutos.",
});

router.get("/registro", controlador.mostrarRegistro);
router.post(
  "/registro",
  limitadorRegistro,
  validar(controlador.reglasRegistro),
  asyncHandler(controlador.registrar),
);

router.get("/ingresar", controlador.mostrarIngreso);
router.post(
  "/ingresar",
  limitadorIngreso,
  validar(controlador.reglasIngreso),
  asyncHandler(controlador.ingresar),
);

router.post("/salir", asyncHandler(controlador.salir));

router.get("/recuperar", controlador.mostrarRecuperacion);
router.post(
  "/recuperar",
  limitadorRecuperacion,
  validar(controlador.reglasCorreo),
  asyncHandler(controlador.solicitarRecuperacion),
);
router.get(
  "/restablecer/:token",
  asyncHandler(controlador.mostrarRestablecer),
);
router.post(
  "/restablecer/:token",
  validar(controlador.reglasNuevaPassword),
  asyncHandler(controlador.restablecer),
);
router.get(
  "/verificar-correo/:token",
  asyncHandler(controlador.mostrarVerificacion),
);
router.post(
  "/verificar-correo/:token",
  limitadorRecuperacion,
  validar([param("token").isHexadecimal().isLength({ min: 64, max: 64 })]),
  asyncHandler(controlador.verificarCorreo),
);
router.get(
  "/verificacion/reenvio",
  controlador.mostrarReenvioVerificacion,
);
router.post(
  "/verificacion/reenvio",
  limitadorRecuperacion,
  validar(controlador.reglasCorreo),
  asyncHandler(controlador.reenviarVerificacion),
);

module.exports = router;
