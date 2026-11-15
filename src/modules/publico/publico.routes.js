const express = require("express");
const { param, query } = require("express-validator");
const { asyncHandler } = require("../../utils/asyncHandler");
const { validar } = require("../../middlewares/validacion");
const { crearLimitador } = require("../../middlewares/limitePeticiones");
const env = require("../../config/env");
const { t } = require("../../i18n");
const controlador = require("./publico.controller");

const router = express.Router();

// Límites por IP de los endpoints nuevos. En pruebas se desactivan (ver
// middlewares/limitePeticiones.js). La IP solo se usa para contar; no se guarda.
const limitarGeocodificacion = crearLimitador({
  ventanaMs: env.calendario.geocodificacion.limite.ventanaMs,
  maximo: env.calendario.geocodificacion.limite.maximo,
  mensaje: t("calendario.punto.limiteBusqueda"),
});
const limitarCalendario = crearLimitador({
  ventanaMs: env.calendario.resultado.ventanaMs,
  maximo: env.calendario.resultado.maximo,
  mensaje: t("calendario.punto.limiteCalendario"),
});

router.get(
  "/api/publico/provincias",
  validar([
    query("departamento_id")
      .isInt({ min: 1 })
      .withMessage("Selecciona un departamento válido."),
  ]),
  asyncHandler(controlador.provincias),
);
router.get(
  "/api/publico/distritos",
  validar([
    query("provincia_id")
      .isInt({ min: 1 })
      .withMessage("Selecciona una provincia válida."),
  ]),
  asyncHandler(controlador.distritos),
);
router.get(
  "/api/publico/monitor/:comunidadId/lecturas",
  validar([
    param("comunidadId")
      .isInt({ min: 1 })
      .withMessage("La comunidad no es válida."),
    query("meses")
      .optional({ checkFalsy: true })
      .isInt({ min: 1, max: 12 })
      .withMessage("El historial debe estar entre 1 y 12 meses."),
  ]),
  asyncHandler(controlador.historialMonitor),
);
router.get(
  "/api/publico/siembras",
  validar([
    query("cultivo")
      .optional({ checkFalsy: true })
      .isSlug()
      .withMessage("El cultivo seleccionado no es válido."),
    query("departamento")
      .optional({ checkFalsy: true })
      .isInt({ min: 1 })
      .withMessage("Selecciona un departamento válido."),
    query("mes")
      .optional({ checkFalsy: true })
      .isInt({ min: 1, max: 12 })
      .withMessage("Selecciona un mes válido."),
  ]),
  asyncHandler(controlador.datosSiembras),
);
router.get("/monitor", controlador.mostrarMonitor);
router.get("/siembras", asyncHandler(controlador.mostrarSiembras));

router.get(
  "/api/publico/geocodificar",
  limitarGeocodificacion,
  validar([
    query("q")
      .trim()
      .isLength({ min: 2, max: 80 })
      .withMessage(t("calendario.punto.busquedaCorta"))
      .matches(/^[\p{L}\p{N}][\p{L}\p{N}\s.'(),-]*$/u)
      .withMessage(t("calendario.punto.busquedaInvalida")),
  ]),
  asyncHandler(controlador.geocodificar),
);

router.get(
  "/calendario",
  limitarCalendario,
  validar([
    query("cultivo")
      .optional({ checkFalsy: true })
      .isSlug()
      .withMessage("El cultivo seleccionado no es válido."),
    query("otro")
      .optional({ checkFalsy: true })
      .trim()
      .isLength({ max: 60 })
      .withMessage(t("calendario.otroCultivoError"))
      .matches(/^[\p{L}\p{N}][\p{L}\p{N}\s.'()-]*$/u)
      .withMessage(t("calendario.otroCultivoError")),
    // Punto elegido: la validación estricta (dentro del Perú) está en el
    // servicio, para poder devolver un mensaje traducido t('clave').
    query("lat").optional({ checkFalsy: true }).isFloat(),
    query("lon").optional({ checkFalsy: true }).isFloat(),
    query("departamento")
      .optional({ checkFalsy: true })
      .isInt({ min: 1 })
      .withMessage("Selecciona un departamento válido."),
    query("provincia")
      .optional({ checkFalsy: true })
      .isInt({ min: 1 })
      .withMessage("Selecciona una provincia válida."),
    query("distrito")
      .optional({ checkFalsy: true })
      .isInt({ min: 1 })
      .withMessage("Selecciona un distrito válido."),
  ]),
  asyncHandler(controlador.mostrarCalendario),
);
router.get("/cultivos", asyncHandler(controlador.listarCultivos));
router.get(
  "/media/publicaciones/:id",
  validar([param("id").isInt({ min: 1 })]),
  asyncHandler(controlador.mostrarImagenPublicacion),
);
router.get(
  "/cultivos/:slug",
  validar([
    param("slug").isSlug().withMessage("El cultivo solicitado no es válido."),
  ]),
  asyncHandler(controlador.mostrarCultivo),
);
router.get(
  "/saberes",
  validar([
    query("categoria")
      .optional({ checkFalsy: true })
      .isSlug()
      .withMessage("La categoría seleccionada no es válida."),
    query("etiqueta")
      .optional({ checkFalsy: true })
      .isSlug()
      .withMessage("La etiqueta seleccionada no es válida."),
    query("q")
      .optional({ checkFalsy: true })
      .trim()
      .isLength({ max: 120 })
      .withMessage("La búsqueda no puede superar 120 caracteres."),
    query("pagina")
      .optional({ checkFalsy: true })
      .isInt({ min: 1, max: 10000 })
      .withMessage("La página solicitada no es válida."),
  ]),
  asyncHandler(controlador.listarSaberes),
);
router.get(
  "/saberes/:slug",
  validar([
    param("slug").isSlug().withMessage("El artículo solicitado no es válido."),
  ]),
  asyncHandler(controlador.mostrarSaber),
);
router.get("/comunidades", asyncHandler(controlador.mostrarComunidades));
router.get("/sobre", controlador.mostrarSobre);
router.get("/sitemap.xml", asyncHandler(controlador.mostrarSitemap));
router.get("/robots.txt", controlador.mostrarRobots);
// Página de la PWA cuando no hay señal (la precarga el service worker).
router.get("/sin-conexion", controlador.sinConexion);

module.exports = router;
