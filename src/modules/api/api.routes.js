// API REST v1 (Fase 12).
// - Público: catálogos, calendario, artículos y comunidades.
// - Con token personal (Bearer): recomendación por parcela del usuario.
// - Documentación: /api/docs (OpenAPI 3) y /api/v1/openapi.json.
// Las respuestas son siempre JSON y los errores siguen el mismo formato que el
// resto de la aplicación ({ ok: false, error: { codigo, mensaje } }).
const express = require("express");
const rateLimit = require("express-rate-limit");
const { param, query } = require("express-validator");
const { asyncHandler } = require("../../utils/asyncHandler");
const { validar } = require("../../middlewares/validacion");
const { requiereTokenApi } = require("../../middlewares/autenticacionApi");
const controlador = require("./api.controller");
const { especificacion } = require("./openapi");

const router = express.Router();

const salidaJson = (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
};
// El límite se salta en pruebas para que las suites no se bloqueen.
const limitarApi = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
});

router.get("/api/v1", salidaJson, controlador.version);
router.get("/api/v1/openapi.json", (req, res) => res.json(especificacion(req)));

router.use("/api/v1", limitarApi);
router.use("/api/v1", salidaJson);

router.get("/api/v1/cultivos", asyncHandler(controlador.cultivos));
router.get(
  "/api/v1/cultivos/:slug",
  validar([param("slug").isSlug().withMessage("El cultivo no es válido.")]),
  asyncHandler(controlador.cultivo),
);

router.get(
  "/api/v1/calendario",
  validar([
    query("cultivo").optional({ values: "falsy" }).isSlug(),
    query("departamento").optional({ values: "falsy" }).isInt({ min: 1 }),
    query("provincia").optional({ values: "falsy" }).isInt({ min: 1 }),
    query("distrito").optional({ values: "falsy" }).isInt({ min: 1 }),
  ]),
  asyncHandler(controlador.calendario),
);

router.get(
  "/api/v1/articulos",
  validar([
    query("pagina").optional().isInt({ min: 1, max: 10000 }),
    query("categoria").optional({ values: "falsy" }).isSlug(),
    query("etiqueta").optional({ values: "falsy" }).isSlug(),
    query("q").optional({ values: "falsy" }).trim().isLength({ max: 120 }),
  ]),
  asyncHandler(controlador.articulos),
);
router.get(
  "/api/v1/articulos/:slug",
  validar([param("slug").isSlug().withMessage("El artículo no es válido.")]),
  asyncHandler(controlador.articulo),
);

router.get("/api/v1/comunidades", asyncHandler(controlador.comunidades));

router.get(
  "/api/v1/parcelas/:id/recomendacion",
  requiereTokenApi,
  validar([
    param("id").isInt({ min: 1 }).withMessage("La parcela no es válida."),
    query("fecha").optional({ values: "falsy" }).isISO8601(),
  ]),
  asyncHandler(controlador.recomendacion),
);

module.exports = router;
