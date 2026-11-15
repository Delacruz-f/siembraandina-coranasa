// Rutas del panel técnico.
const express = require("express");
const { body, param } = require("express-validator");
const { asyncHandler } = require("../../utils/asyncHandler");
const { validar } = require("../../middlewares/validacion");
const {
  requierePermiso,
  requiereRol,
} = require("../../middlewares/autorizacion");
const controlador = require("./tecnico.controller");

const router = express.Router();

const reglasRequerimiento = [
  body("humedad_min")
    .isFloat({ min: 0, max: 100 })
    .withMessage("Humedad mínima inválida."),
  body("humedad_max")
    .isFloat({ min: 0, max: 100 })
    .withMessage("Humedad máxima inválida."),
  body("temperatura_min")
    .isFloat({ min: -30, max: 60 })
    .withMessage("Temperatura mínima inválida."),
  body("temperatura_max")
    .isFloat({ min: -30, max: 60 })
    .withMessage("Temperatura máxima inválida."),
  body("fuente")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ max: 500 })
    .withMessage("La fuente es demasiado larga."),
];

const reglasCalendario = [
  body("mes_inicio")
    .isInt({ min: 1, max: 12 })
    .withMessage("Mes de inicio inválido."),
  body("mes_fin")
    .isInt({ min: 1, max: 12 })
    .withMessage("Mes de fin inválido."),
  body("fuente")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ max: 500 })
    .withMessage("La fuente es demasiado larga."),
];

const reglasAviso = [
  body("distrito_id").isInt({ min: 1 }).withMessage("Selecciona un distrito válido."),
  body("tipo").isIn(["helada", "sequia", "otro"]).withMessage("Selecciona un tipo de aviso."),
  body("titulo").trim().isLength({ min: 5, max: 160 }).withMessage("El título debe tener entre 5 y 160 caracteres."),
  body("mensaje").trim().isLength({ min: 10, max: 2000 }).withMessage("Describe el aviso con entre 10 y 2 000 caracteres."),
  body("vigente_hasta")
    .optional({ values: "falsy" })
    .isISO8601()
    .withMessage("Indica una fecha final válida."),
];

router.get(
  "/tecnico/avisos",
  requiereRol("tecnico", "administrador"),
  requierePermiso("avisos.crear"),
  asyncHandler(controlador.avisos),
);
router.post(
  "/tecnico/avisos",
  requiereRol("tecnico", "administrador"),
  requierePermiso("avisos.crear"),
  validar(reglasAviso),
  asyncHandler(controlador.publicarAviso),
);

router.get(
  "/tecnico",
  requiereRol("tecnico", "administrador"),
  requierePermiso("cultivos.validar"),
  asyncHandler(controlador.panel),
);
router.get(
  "/tecnico/parcelas/:id",
  requiereRol("tecnico", "administrador"),
  requierePermiso("lecturas.ver"),
  validar([param("id").isInt()]),
  asyncHandler(controlador.parcela),
);

router.post(
  "/tecnico/requerimientos/:id",
  requiereRol("tecnico", "administrador"),
  requierePermiso("cultivos.validar"),
  validar([param("id").isInt(), ...reglasRequerimiento]),
  asyncHandler(controlador.actualizarRequerimiento),
);
router.post(
  "/tecnico/calendario/:id",
  requiereRol("tecnico", "administrador"),
  requierePermiso("cultivos.validar"),
  validar([param("id").isInt(), ...reglasCalendario]),
  asyncHandler(controlador.actualizarCalendario),
);

module.exports = router;
