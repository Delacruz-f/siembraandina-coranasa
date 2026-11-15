// Rutas de lecturas. El permiso se comprueba en el servicio según el rol:
// el agricultor escribe en sus parcelas y el técnico solo donde tiene escritura.
const express = require("express");
const { body, param } = require("express-validator");
const { asyncHandler } = require("../../utils/asyncHandler");
const { validar } = require("../../middlewares/validacion");
const {
  requiereSesion,
  requierePermiso,
} = require("../../middlewares/autorizacion");
const { subidaCsv } = require("../../middlewares/subida");
const controlador = require("./lecturas.controller");

const router = express.Router();
const permisoCrearLecturas = requierePermiso("lecturas.crear");

const reglasLectura = [
  body("fecha").isISO8601().withMessage("Escribe una fecha válida."),
  body("humedad")
    .isFloat({ min: 0, max: 100 })
    .withMessage("La humedad debe estar entre 0 y 100 %."),
  body("temperatura")
    .isFloat({ min: -30, max: 60 })
    .withMessage("La temperatura debe estar entre -30 y 60 °C."),
  body("observacion")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ max: 500 })
    .withMessage("La observación es demasiado larga."),
];

router.post(
  "/parcelas/:id/lecturas",
  requiereSesion,
  validar([param("id").isInt(), ...reglasLectura]),
  asyncHandler(controlador.registrar),
);

router.post(
  "/parcelas/:id/lecturas/:lecturaId/eliminar",
  requiereSesion,
  validar([param("id").isInt(), param("lecturaId").isInt()]),
  asyncHandler(controlador.eliminar),
);

router.get(
  "/panel/parcelas/:id/lecturas/importar",
  permisoCrearLecturas,
  validar([param("id").isInt({ min: 1 })]),
  asyncHandler(controlador.mostrarImportar),
);
router.post(
  "/panel/parcelas/:id/lecturas/importar/previsualizar",
  permisoCrearLecturas,
  validar([param("id").isInt({ min: 1 })]),
  asyncHandler(controlador.verificarPropiedad),
  subidaCsv.single("archivo"),
  asyncHandler(controlador.previsualizarCsv),
);
router.post(
  "/panel/parcelas/:id/lecturas/importar/confirmar",
  permisoCrearLecturas,
  validar([
    param("id").isInt({ min: 1 }),
    body("token").isHexadecimal().isLength({ min: 48, max: 48 }),
  ]),
  asyncHandler(controlador.confirmarImportacion),
);

module.exports = router;
