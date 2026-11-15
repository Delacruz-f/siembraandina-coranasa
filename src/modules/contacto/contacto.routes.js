const express = require("express");
const { body } = require("express-validator");
const env = require("../../config/env");
const { asyncHandler } = require("../../utils/asyncHandler");
const { validar } = require("../../middlewares/validacion");
const { crearLimitador } = require("../../middlewares/limitePeticiones");
const controlador = require("./contacto.controller");

const router = express.Router();
const limitarEnvios = crearLimitador({
  ventanaMs: env.limitePeticiones.contacto.ventanaMs,
  maximo: env.limitePeticiones.contacto.maximo,
  mensaje: "Alcanzaste el límite de mensajes. Espera antes de volver a escribir.",
});

router.get("/contacto", controlador.mostrarFormulario);
router.post(
  "/contacto",
  limitarEnvios,
  validar([
    body("nombre")
      .trim()
      .isLength({ min: 2, max: 120 })
      .withMessage("Escribe tu nombre (máximo 120 caracteres)."),
    body("email")
      .trim()
      .isEmail()
      .isLength({ max: 254 })
      .withMessage("Escribe un correo electrónico válido."),
    body("asunto")
      .trim()
      .isLength({ min: 3, max: 160 })
      .withMessage("El asunto debe tener entre 3 y 160 caracteres."),
    body("mensaje")
      .trim()
      .isLength({ min: 20, max: 5000 })
      .withMessage("El mensaje debe tener entre 20 y 5000 caracteres."),
  ]),
  asyncHandler(controlador.enviar),
);

module.exports = router;
