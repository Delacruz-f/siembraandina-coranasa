// Rutas de parcelas del agricultor.
const express = require("express");
const { body, param, query } = require("express-validator");
const { asyncHandler } = require("../../utils/asyncHandler");
const { validar } = require("../../middlewares/validacion");
const { requierePermiso } = require("../../middlewares/autorizacion");
const { subidaImagenes } = require("../../middlewares/subida");
const { validarCsrf } = require("../../middlewares/csrf");
const controlador = require("./parcelas.controller");

const router = express.Router();

const reglasParcela = [
  body("nombre")
    .trim()
    .isLength({ min: 3, max: 120 })
    .withMessage("El nombre debe tener entre 3 y 120 caracteres."),
  body("cultivo_id").isInt({ min: 1 }).withMessage("Elige un cultivo."),
  body("distrito_id").isInt({ min: 1 }).withMessage("Elige un distrito."),
  body("zona_id").isInt({ min: 1 }).withMessage("Elige una zona."),
  body("latitud")
    .isFloat({ min: -90, max: 90 })
    .withMessage("La latitud debe estar entre -90 y 90."),
  body("longitud")
    .isFloat({ min: -180, max: 180 })
    .withMessage("La longitud debe estar entre -180 y 180."),
  body("altitud_m")
    .optional({ values: "falsy" })
    .isFloat({ min: 0, max: 6000 })
    .withMessage("La altitud debe estar entre 0 y 6000 m."),
  body("area_hectareas")
    .optional({ values: "falsy" })
    .isFloat({ min: 0, max: 10000 })
    .withMessage("El área debe ser un número positivo."),
  body("notas")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ max: 1000 })
    .withMessage("Las notas son demasiado largas."),
];

const reglasAcceso = [
  body("tecnico_id").isInt({ min: 1 }).withMessage("Elige un técnico."),
  body("puede_escribir")
    .optional()
    .isIn(["on", "true", "false", "1", "0"])
    .withMessage("Valor de escritura inválido."),
];

router.get(
  "/api/parcelas/altitud",
  requierePermiso("parcelas.ver"),
  validar([
    query("latitud").isFloat({ min: -90, max: 90 }),
    query("longitud").isFloat({ min: -180, max: 180 }),
  ]),
  asyncHandler(controlador.estimarAltitud),
);
router.get(
  "/panel/parcelas",
  requierePermiso("parcelas.ver"),
  asyncHandler(controlador.listar),
);
router.get(
  "/panel/parcelas/nueva",
  requierePermiso("parcelas.crear"),
  asyncHandler(controlador.mostrarNueva),
);
router.post(
  "/panel/parcelas",
  requierePermiso("parcelas.crear"),
  validar(reglasParcela),
  asyncHandler(controlador.crear),
);

router.get(
  "/panel/parcelas/:id",
  requierePermiso("parcelas.ver"),
  validar([
    param("id").isInt(),
    query("pagina")
      .optional({ checkFalsy: true })
      .isInt({ min: 1 })
      .withMessage("El número de página no es válido."),
  ]),
  asyncHandler(controlador.mostrarDetalle),
);
router.get(
  "/panel/parcelas/:id/editar",
  requierePermiso("parcelas.editar"),
  validar([param("id").isInt()]),
  asyncHandler(controlador.mostrarEditar),
);
router.post(
  "/panel/parcelas/:id",
  requierePermiso("parcelas.editar"),
  validar([param("id").isInt(), ...reglasParcela]),
  asyncHandler(controlador.actualizar),
);
router.post(
  "/panel/parcelas/:id/imagenes",
  requierePermiso("parcelas.editar"),
  validar([param("id").isInt({ min: 1 })]),
  asyncHandler(controlador.verificarPropiedad),
  // Formulario multipart: el token CSRF llega en la cabecera x-csrf-token
  // (el campo _csrf va después del archivo y no se puede leer antes).
  validarCsrf,
  subidaImagenes.array("imagenes", 5),
  // Segunda comprobación ya con el cuerpo parseado (permite _csrf oculto).
  validarCsrf,
  asyncHandler(controlador.subirImagenes),
);
router.post(
  "/panel/parcelas/:id/imagenes/:archivoId/eliminar",
  requierePermiso("parcelas.editar"),
  validar([
    param("id").isInt({ min: 1 }),
    param("archivoId").isInt({ min: 1 }),
  ]),
  asyncHandler(controlador.eliminarImagen),
);
router.post(
  "/panel/parcelas/:id/eliminar",
  requierePermiso("parcelas.eliminar"),
  validar([param("id").isInt()]),
  asyncHandler(controlador.eliminar),
);

router.get(
  "/tecnicos/buscar",
  requierePermiso("accesos.gestionar"),
  asyncHandler(controlador.buscarTecnicos),
);
router.post(
  "/panel/parcelas/:id/accesos",
  requierePermiso("accesos.gestionar"),
  validar([param("id").isInt(), ...reglasAcceso]),
  asyncHandler(controlador.concederAcceso),
);
router.post(
  "/panel/parcelas/:id/accesos/:accesoId/revocar",
  requierePermiso("accesos.gestionar"),
  validar([param("id").isInt(), param("accesoId").isInt()]),
  asyncHandler(controlador.revocarAcceso),
);

module.exports = router;
