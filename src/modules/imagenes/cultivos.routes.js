// Rutas de imágenes del catálogo de cultivos (públicas).
const express = require("express");
const { body, param } = require("express-validator");
const { asyncHandler } = require("../../utils/asyncHandler");
const { validar } = require("../../middlewares/validacion");
const { requierePermiso } = require("../../middlewares/autorizacion");
const { subidaImagenes } = require("../../middlewares/subida");
const { validarCsrf } = require("../../middlewares/csrf");
const controlador = require("./cultivos.controller");

const router = express.Router();
const permiso = requierePermiso("catalogos.gestionar");

const reglasImagen = [
  body("textos_alternativos")
    .customSanitizer((valor) =>
      [].concat(valor || []).flatMap((texto) =>
        String(texto || "")
          .split(";")
          .map((parte) => parte.trim())
          .filter(Boolean),
      ),
    )
    .custom((valor) => {
      const lista = [].concat(valor || []);
      return (
        lista.length > 0 &&
        lista.every(
          (texto) =>
            typeof texto === "string" &&
            texto.trim().length >= 1 &&
            texto.trim().length <= 255,
        )
      );
    })
    .withMessage(
      "Escribe un texto alternativo de 1 a 255 caracteres por imagen.",
    ),
  body("autor_imagen")
    .trim()
    .isLength({ min: 2, max: 160 })
    .withMessage("Indica el autor de las imágenes (obligatorio)."),
  body("autor_url")
    .optional({ values: "falsy" })
    .trim()
    .isURL({ protocols: ["http", "https"], require_protocol: true })
    .withMessage("El enlace del autor debe ser una URL http(s)."),
  body("licencia")
    .trim()
    .isLength({ min: 2, max: 160 })
    .withMessage("Indica la licencia de las imágenes (obligatorio)."),
  body("licencia_url")
    .optional({ values: "falsy" })
    .trim()
    .isURL({ protocols: ["http", "https"], require_protocol: true })
    .withMessage("El enlace de la licencia debe ser una URL http(s)."),
];

router.get(
  "/admin/cultivos/:id/imagenes",
  permiso,
  validar([param("id").isInt({ min: 1 })]),
  asyncHandler(controlador.listar),
);
router.post(
  "/admin/cultivos/:id/imagenes",
  permiso,
  validar([param("id").isInt({ min: 1 })]),
  validarCsrf,
  subidaImagenes.array("imagenes", 5),
  validarCsrf,
  validar(reglasImagen),
  asyncHandler(controlador.subir),
);
router.post(
  "/admin/cultivos/:id/imagenes/:archivoId/eliminar",
  permiso,
  validar([
    param("id").isInt({ min: 1 }),
    param("archivoId").isInt({ min: 1 }),
  ]),
  asyncHandler(controlador.eliminar),
);

module.exports = router;
