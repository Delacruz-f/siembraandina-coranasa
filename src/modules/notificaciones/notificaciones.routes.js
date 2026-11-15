const express = require("express");
const rateLimit = require("express-rate-limit");
const { param, query } = require("express-validator");
const { asyncHandler } = require("../../utils/asyncHandler");
const { validar } = require("../../middlewares/validacion");
const { requierePermiso } = require("../../middlewares/autorizacion");
const controlador = require("./notificaciones.controller");

const router = express.Router();
const permiso = requierePermiso("notificaciones.ver");
const limitarSse = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
});

router.get(
  "/notificaciones",
  permiso,
  validar([
    query("pagina")
      .optional({ checkFalsy: true })
      .isInt({ min: 1, max: 10000 })
      .withMessage("El número de página no es válido."),
  ]),
  asyncHandler(controlador.mostrar),
);
router.get(
  "/notificaciones/avisos/:id",
  permiso,
  validar([param("id").isInt({ min: 1 })]),
  asyncHandler(controlador.mostrarAviso),
);
router.get("/api/notificaciones/no-leidas", permiso, asyncHandler(controlador.resumen));
router.get(
  "/notificaciones/eventos",
  permiso,
  limitarSse,
  asyncHandler(controlador.eventos),
);
router.post(
  "/notificaciones/:id/leida",
  permiso,
  validar([param("id").isInt({ min: 1 })]),
  asyncHandler(controlador.marcarLeida),
);

module.exports = router;
