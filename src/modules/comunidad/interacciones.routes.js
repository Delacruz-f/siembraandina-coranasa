const express = require("express");
const rateLimit = require("express-rate-limit");
const { body, param } = require("express-validator");
const { asyncHandler } = require("../../utils/asyncHandler");
const { validar } = require("../../middlewares/validacion");
const {
  requiereSesion,
  requierePermiso,
} = require("../../middlewares/autorizacion");
const { crearLimitador } = require("../../middlewares/limitePeticiones");
const controlador = require("./interacciones.controller");

const router = express.Router();
const limitarComentarios = crearLimitador({
  ventanaMs: 15 * 60 * 1000,
  maximo: 8,
  mensaje: "Publicaste varios comentarios. Espera unos minutos antes de escribir otro.",
});
const limitarReportes = crearLimitador({
  ventanaMs: 60 * 60 * 1000,
  maximo: 10,
  mensaje: "Enviaste varios reportes. Inténtalo más tarde.",
});
const limitarReacciones = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
});

const reglaSlug = (nombre = "slug") =>
  param(nombre).isSlug().withMessage("El elemento solicitado no es válido.");
const permisoModeracion = requierePermiso("publicaciones.moderar");

router.post(
  "/saberes/:slug/comentarios",
  requiereSesion,
  limitarComentarios,
  validar([
    reglaSlug(),
    body("contenido")
      .trim()
      .isLength({ min: 2, max: 3000 })
      .withMessage("El comentario debe tener entre 2 y 3000 caracteres."),
    body("comentario_padre_id")
      .optional({ values: "falsy" })
      .isInt({ min: 1 })
      .withMessage("La respuesta seleccionada no es válida."),
  ]),
  asyncHandler(controlador.crearComentario),
);
router.post(
  "/saberes/:slug/reacciones",
  requiereSesion,
  limitarReacciones,
  validar([
    reglaSlug(),
    body("tipo").isIn(["util", "lo_probe"]).withMessage("Elige una reacción válida."),
  ]),
  asyncHandler(controlador.reaccionArticulo),
);
router.post(
  "/cultivos/:slug/reacciones",
  requiereSesion,
  limitarReacciones,
  validar([
    reglaSlug(),
    body("tipo").isIn(["util", "lo_probe"]).withMessage("Elige una reacción válida."),
  ]),
  asyncHandler(controlador.reaccionCultivo),
);
router.post(
  "/saberes/:slug/favoritos",
  requiereSesion,
  limitarReacciones,
  validar([reglaSlug()]),
  asyncHandler(controlador.favoritoArticulo),
);
router.post(
  "/cultivos/:slug/favoritos",
  requiereSesion,
  limitarReacciones,
  validar([reglaSlug()]),
  asyncHandler(controlador.favoritoCultivo),
);

router.post(
  "/comentarios/:id/editar",
  requiereSesion,
  limitarComentarios,
  validar([
    param("id").isInt({ min: 1 }),
    body("contenido")
      .trim()
      .isLength({ min: 2, max: 3000 })
      .withMessage("El comentario debe tener entre 2 y 3000 caracteres."),
  ]),
  asyncHandler(controlador.editarComentario),
);
router.post(
  "/comentarios/:id/eliminar",
  requiereSesion,
  validar([param("id").isInt({ min: 1 })]),
  asyncHandler(controlador.borrarComentario),
);
router.post(
  "/comentarios/:id/reportar",
  requiereSesion,
  limitarReportes,
  validar([
    param("id").isInt({ min: 1 }),
    body("motivo")
      .isIn(["spam", "ofensivo", "informacion_falsa", "otro"])
      .withMessage("Selecciona un motivo para el reporte."),
    body("detalle")
      .optional({ values: "falsy" })
      .trim()
      .isLength({ max: 500 })
      .withMessage("El detalle admite hasta 500 caracteres."),
  ]),
  asyncHandler(controlador.reportarComentario),
);

router.get(
  "/editor/moderacion/comentarios",
  permisoModeracion,
  asyncHandler(controlador.mostrarModeracion),
);
router.post(
  "/editor/moderacion/reportes/:id",
  permisoModeracion,
  validar([
    param("id").isInt({ min: 1 }),
    body("accion")
      .isIn(["ocultar", "descartar"])
      .withMessage("Elige una acción de moderación válida."),
  ]),
  asyncHandler(controlador.moderarReporte),
);

module.exports = router;
