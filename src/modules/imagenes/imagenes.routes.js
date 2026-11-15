// Rutas controladas de imágenes (Fase 10).
// Públicas: /media/imagenes/:id/:ancho  (artículos publicados y cultivos)
// Privadas: /media/privadas/:id/:ancho  (requiere sesión y permisos)
const express = require("express");
const { param, query } = require("express-validator");
const { asyncHandler } = require("../../utils/asyncHandler");
const { validar } = require("../../middlewares/validacion");
const { requiereSesion } = require("../../middlewares/autorizacion");
const controlador = require("./imagenes.controller");

const router = express.Router();

const reglasVariante = [
  param("id")
    .isInt({ min: 1 })
    .withMessage("La imagen solicitada no es válida."),
  param("ancho")
    .optional()
    .isIn(["400", "800", "1600"])
    .withMessage("El tamaño solicitado no es válido."),
  query("formato")
    .optional({ values: "falsy" })
    .isIn(["webp", "jpg"])
    .withMessage("El formato solicitado no es válido."),
];

router.get(
  "/media/imagenes/:id",
  validar([param("id").isInt({ min: 1 })]),
  controlador.redirigir,
);
router.get(
  "/media/imagenes/:id/:ancho",
  validar(reglasVariante),
  asyncHandler(controlador.publica),
);

router.get(
  "/media/privadas/:id",
  requiereSesion,
  validar([param("id").isInt({ min: 1 })]),
  controlador.redirigirPrivada,
);
router.get(
  "/media/privadas/:id/:ancho",
  requiereSesion,
  validar(reglasVariante),
  asyncHandler(controlador.privada),
);

module.exports = router;
