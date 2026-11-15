const express = require("express");
const { body, param, query } = require("express-validator");
const { asyncHandler } = require("../../utils/asyncHandler");
const { validar } = require("../../middlewares/validacion");
const { validarCsrf } = require("../../middlewares/csrf");
const { requierePermiso } = require("../../middlewares/autorizacion");
const { subidaImagenes } = require("../../middlewares/subida");
const controlador = require("./editor.controller");

const router = express.Router();
const permisoPanel = requierePermiso("publicaciones.publicar");
const permisoGestion = requierePermiso("publicaciones.gestionar");
const reglasArticulo = [
  body("titulo").trim().isLength({ min: 5, max: 180 }),
  body("categoria_id").isInt({ min: 1 }),
  body("estado").isIn(["borrador", "publicada", "programada", "archivada"]),
  body("publicada_en")
    .if(body("estado").equals("programada"))
    .isISO8601()
    .withMessage("Indica fecha y hora válidas para programar."),
  body("etiquetas").optional({ values: "falsy" }).trim().isLength({ max: 700 }),
  body("archivo_ids").optional({ values: "falsy" }),
  body("contenido").trim().isLength({ min: 1, max: 100000 }),
];

router.get("/editor", permisoPanel, asyncHandler(controlador.panel));
router.get(
  "/editor/articulos/nuevo",
  permisoGestion,
  asyncHandler(controlador.nuevo),
);
router.get(
  "/editor/articulos/:id/editar",
  permisoGestion,
  validar([
    param("id").isInt({ min: 1 }),
    query("aviso").optional().isString(),
  ]),
  asyncHandler(controlador.editar),
);
router.post(
  "/editor/articulos",
  permisoGestion,
  validar(reglasArticulo),
  asyncHandler(controlador.guardar),
);
router.post(
  "/editor/articulos/:id",
  permisoGestion,
  validar([param("id").isInt({ min: 1 }), ...reglasArticulo]),
  asyncHandler(controlador.guardar),
);
router.post(
  "/editor/articulos/:id/eliminar",
  permisoGestion,
  validar([param("id").isInt({ min: 1 })]),
  asyncHandler(controlador.eliminar),
);
router.get(
  "/editor/biblioteca",
  permisoGestion,
  asyncHandler(controlador.biblioteca),
);
router.post(
  "/editor/biblioteca",
  permisoGestion,
  validarCsrf,
  subidaImagenes.single("imagen"),
  validarCsrf,
  validar([
    body("texto_alternativo")
      .trim()
      .isLength({ min: 1, max: 255 })
      .withMessage("Describe la imagen con un texto alternativo."),
    body("autor_imagen")
      .trim()
      .isLength({ min: 2, max: 160 })
      .withMessage("Indica el autor de la imagen (obligatorio)."),
    body("autor_url")
      .optional({ values: "falsy" })
      .trim()
      .isURL({ protocols: ["http", "https"], require_protocol: true })
      .withMessage("El enlace del autor debe ser una URL http(s)."),
    body("licencia")
      .trim()
      .isLength({ min: 2, max: 160 })
      .withMessage("Indica la licencia de la imagen (obligatorio)."),
    body("licencia_url")
      .optional({ values: "falsy" })
      .trim()
      .isURL({ protocols: ["http", "https"], require_protocol: true })
      .withMessage("El enlace de la licencia debe ser una URL http(s)."),
    body("articulo_id").optional({ values: "falsy" }).isInt({ min: 1 }),
    body("formato_recorte")
      .optional()
      .isIn(["original", "cuadrado", "horizontal", "vertical"]),
    body("recorte_x").optional().isFloat({ min: 0, max: 100 }),
    body("recorte_y").optional().isFloat({ min: 0, max: 100 }),
  ]),
  asyncHandler(controlador.subirImagen),
);

module.exports = router;
