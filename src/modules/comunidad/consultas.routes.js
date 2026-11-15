const express = require("express");
const { body, param } = require("express-validator");
const { asyncHandler } = require("../../utils/asyncHandler");
const { validar } = require("../../middlewares/validacion");
const {
  requierePermiso,
  requiereRol,
} = require("../../middlewares/autorizacion");
const { crearLimitador } = require("../../middlewares/limitePeticiones");
const { subidaImagenes } = require("../../middlewares/subida");
const { validarCsrf } = require("../../middlewares/csrf");
const controlador = require("./consultas.controller");

const router = express.Router();
const permisoCrear = requierePermiso("consultas.crear");
const permisoResponder = requierePermiso("consultas.responder");
const zonaTecnica = requiereRol("tecnico", "administrador");
const limitarConsultas = crearLimitador({
  ventanaMs: 60 * 60 * 1000,
  maximo: 5,
  mensaje: "Enviaste varias consultas. Espera un momento antes de crear otra.",
});

const reglasConsulta = [
  body("titulo")
    .trim()
    .isLength({ min: 5, max: 180 })
    .withMessage("El título debe tener entre 5 y 180 caracteres."),
  body("contenido")
    .trim()
    .isLength({ min: 10, max: 5000 })
    .withMessage("Describe tu consulta con entre 10 y 5 000 caracteres."),
  body("distrito_id")
    .isInt({ min: 1 })
    .withMessage("Selecciona el distrito donde está tu cultivo."),
  body("cultivo_id")
    .optional({ values: "falsy" })
    .isInt({ min: 1 })
    .withMessage("Selecciona un cultivo válido."),
];

router.get(
  "/panel/consultas",
  permisoCrear,
  asyncHandler(controlador.listarAgricultor),
);
router.get(
  "/panel/consultas/nueva",
  permisoCrear,
  asyncHandler(controlador.nueva),
);
router.post(
  "/panel/consultas",
  permisoCrear,
  limitarConsultas,
  validarCsrf,
  subidaImagenes.array("fotos", 3),
  validarCsrf,
  validar(reglasConsulta),
  asyncHandler(controlador.crear),
);
router.get(
  "/panel/consultas/:id",
  permisoCrear,
  validar([param("id").isInt({ min: 1 })]),
  asyncHandler(controlador.detalleAgricultor),
);
router.post(
  "/panel/consultas/:id/cerrar",
  permisoCrear,
  validar([param("id").isInt({ min: 1 })]),
  asyncHandler(controlador.cerrar),
);
router.post(
  "/panel/consultas/:consultaId/respuestas/:respuestaId/calificar",
  requierePermiso("consultas.calificar"),
  validar([
    param("consultaId").isInt({ min: 1 }),
    param("respuestaId").isInt({ min: 1 }),
    body("puntuacion")
      .isInt({ min: 1, max: 5 })
      .withMessage("La calificación debe ser de 1 a 5."),
    body("comentario")
      .optional({ values: "falsy" })
      .trim()
      .isLength({ max: 500 })
      .withMessage("El comentario admite hasta 500 caracteres."),
  ]),
  asyncHandler(controlador.calificar),
);

router.get(
  "/tecnico/consultas",
  zonaTecnica,
  permisoResponder,
  asyncHandler(controlador.listarTecnico),
);
router.get(
  "/tecnico/consultas/:id",
  zonaTecnica,
  permisoResponder,
  validar([param("id").isInt({ min: 1 })]),
  asyncHandler(controlador.detalleTecnico),
);
router.post(
  "/tecnico/consultas/:id/responder",
  zonaTecnica,
  permisoResponder,
  limitarConsultas,
  validar([
    param("id").isInt({ min: 1 }),
    body("contenido")
      .trim()
      .isLength({ min: 10, max: 5000 })
      .withMessage("La respuesta debe tener entre 10 y 5 000 caracteres."),
  ]),
  asyncHandler(controlador.responder),
);
router.get(
  "/tecnico/zonas",
  zonaTecnica,
  permisoResponder,
  asyncHandler(controlador.zonas),
);
router.post(
  "/tecnico/zonas",
  zonaTecnica,
  permisoResponder,
  validar([
    body("distrito_id")
      .isInt({ min: 1 })
      .withMessage("Selecciona un distrito válido."),
  ]),
  asyncHandler(controlador.agregarZona),
);
router.post(
  "/tecnico/zonas/:distritoId/eliminar",
  zonaTecnica,
  permisoResponder,
  validar([param("distritoId").isInt({ min: 1 })]),
  asyncHandler(controlador.quitarZona),
);

module.exports = router;
