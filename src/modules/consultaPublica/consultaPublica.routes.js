const express = require("express");
const rateLimit = require("express-rate-limit");
const { body } = require("express-validator");
const { asyncHandler } = require("../../utils/asyncHandler");
const { validar } = require("../../middlewares/validacion");
const controlador = require("./consultaPublica.controller");

const router = express.Router();
const limitarConsultas = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
  handler: (req, res) =>
    res.status(429).json({
      ok: false,
      error: { codigo: "limite_consultas", mensaje: "Demasiadas consultas." },
    }),
});

router.get("/consulta", asyncHandler(controlador.pagina));
router.post(
  "/api/publico/consulta",
  limitarConsultas,
  validar([
    body("cultivo")
      .isString()
      .trim()
      .matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .withMessage("Elige un cultivo válido."),
    body("distrito_id")
      .optional({ values: "falsy" })
      .isInt({ min: 1 })
      .withMessage("El distrito no es válido."),
    body("provincia_id")
      .optional({ values: "falsy" })
      .isInt({ min: 1 })
      .withMessage("La provincia no es válida."),
    body("latitud")
      .optional({ values: "falsy" })
      .isFloat({ min: -90, max: 90 })
      .withMessage("La latitud no es válida."),
    body("longitud")
      .optional({ values: "falsy" })
      .isFloat({ min: -180, max: 180 })
      .withMessage("La longitud no es válida."),
    body("cultivo").custom((valor, { req }) => {
      const datos = req.body;
      const tieneLatitud = datos.latitud !== undefined && datos.latitud !== "";
      const tieneLongitud =
        datos.longitud !== undefined && datos.longitud !== "";
      if (tieneLatitud !== tieneLongitud) {
        throw new Error("Envía ambas coordenadas o ninguna.");
      }
      if (!tieneLatitud && !datos.distrito_id) {
        throw new Error("Elige un distrito o un punto del mapa.");
      }
      return true;
    }),
  ]),
  asyncHandler(controlador.consultar),
);

module.exports = router;
