const express = require("express");
const { body, param } = require("express-validator");
const { asyncHandler } = require("../../utils/asyncHandler");
const { validar } = require("../../middlewares/validacion");
const { requierePermiso } = require("../../middlewares/autorizacion");
const controlador = require("./campanias.controller");

const router = express.Router();
const permiso = requierePermiso("campanias.gestionar");
const reglasCampania = [
  body("cultivo_id").isInt({ min: 1 }).withMessage("Elige un cultivo."),
  body("variedad_id")
    .optional({ values: "falsy" })
    .isInt({ min: 1 })
    .withMessage("Elige una variedad válida."),
  body("estado_id").isInt({ min: 1 }).withMessage("Elige el estado."),
  body("fecha_inicio")
    .optional({ values: "falsy" })
    .isISO8601()
    .withMessage("Escribe una fecha inicial válida."),
  body("fecha_fin")
    .optional({ values: "falsy" })
    .isISO8601()
    .withMessage("Escribe una fecha final válida."),
];
const reglasSiembra = [
  body("fecha").isISO8601().withMessage("Escribe una fecha de siembra válida."),
  body("metodo")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ max: 100 })
    .withMessage("El método admite hasta 100 caracteres."),
  body("observaciones")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ max: 2000 })
    .withMessage("Las observaciones admiten hasta 2 000 caracteres."),
];
const reglasCosecha = [
  body("fecha").isISO8601().withMessage("Escribe una fecha de cosecha válida."),
  body("cantidad")
    .isFloat({ gt: 0, max: 100000000 })
    .withMessage("La cantidad debe ser mayor que cero."),
  body("unidad_id").isInt({ min: 1 }).withMessage("Elige una unidad."),
  body("observaciones")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ max: 2000 })
    .withMessage("Las observaciones admiten hasta 2 000 caracteres."),
];

router.get(
  "/panel/cultivos/:cultivoId/variedades",
  permiso,
  validar([param("cultivoId").isInt({ min: 1 })]),
  asyncHandler(controlador.listarVariedades),
);
router.get(
  "/panel/parcelas/:parcelaId/campanias/nueva",
  permiso,
  validar([param("parcelaId").isInt({ min: 1 })]),
  asyncHandler(controlador.nueva),
);
router.post(
  "/panel/parcelas/:parcelaId/campanias",
  permiso,
  validar([
    param("parcelaId").isInt({ min: 1 }),
    ...reglasCampania,
  ]),
  asyncHandler(controlador.crear),
);
router.get(
  "/panel/campanias/:id",
  permiso,
  validar([param("id").isInt({ min: 1 })]),
  asyncHandler(controlador.detalle),
);
router.get(
  "/panel/campanias/:id/editar",
  permiso,
  validar([param("id").isInt({ min: 1 })]),
  asyncHandler(controlador.editar),
);
router.post(
  "/panel/campanias/:id",
  permiso,
  validar([param("id").isInt({ min: 1 }), ...reglasCampania]),
  asyncHandler(controlador.actualizar),
);
router.post(
  "/panel/campanias/:id/siembras",
  permiso,
  validar([param("id").isInt({ min: 1 }), ...reglasSiembra]),
  asyncHandler(controlador.registrarSiembra),
);
router.post(
  "/panel/campanias/:id/cosechas",
  permiso,
  validar([param("id").isInt({ min: 1 }), ...reglasCosecha]),
  asyncHandler(controlador.registrarCosecha),
);

module.exports = router;
