// Rutas del panel de administración.
const express = require("express");
const { body, param, query } = require("express-validator");
const { asyncHandler } = require("../../utils/asyncHandler");
const { validar } = require("../../middlewares/validacion");
const { requierePermiso, requiereRol } = require("../../middlewares/autorizacion");
const controlador = require("./admin.controller");

const router = express.Router();
const permisos = (clave) => requierePermiso(clave);
const validarPagina = () => query("pagina").optional().isInt({ min: 1, max: 10000 });

router.get(
  "/guia-estilo",
  requiereRol("administrador"),
  asyncHandler(controlador.guiaEstilo),
);
router.get(
  "/admin",
  permisos("usuarios.gestionar"),
  asyncHandler(controlador.panel),
);

router.get(
  "/admin/solicitudes",
  permisos("solicitudes.revisar"),
  asyncHandler(controlador.solicitudes),
);
router.post(
  "/admin/solicitudes/:id/aprobar",
  permisos("solicitudes.revisar"),
  validar([
    param("id").isInt({ min: 1 }),
    body("observacion").optional({ values: "falsy" }).trim().isLength({ max: 500 }),
  ]),
  asyncHandler(controlador.aprobar),
);
router.post(
  "/admin/solicitudes/:id/rechazar",
  permisos("solicitudes.revisar"),
  validar([
    param("id").isInt({ min: 1 }),
    body("observacion").trim().isLength({ min: 5, max: 500 }),
  ]),
  asyncHandler(controlador.rechazar),
);

router.get(
  "/admin/usuarios",
  permisos("usuarios.gestionar"),
  validar([
    validarPagina(),
    query("q").optional({ values: "falsy" }).trim().isLength({ max: 120 }),
    query("rol").optional({ values: "falsy" }).matches(/^[a-z][a-z0-9_]{1,39}$/),
    query("activo").optional({ values: "falsy" }).isIn(["0", "1"]),
    query("orden").optional().isIn(["creado_en", "email", "nombre", "activo"]),
    query("direccion").optional().isIn(["asc", "desc"]),
  ]),
  asyncHandler(controlador.usuarios),
);
router.post(
  "/admin/usuarios/:id/rol",
  permisos("usuarios.gestionar"),
  validar([
    param("id").isInt({ min: 1 }),
    body("rol").matches(/^[a-z][a-z0-9_]{1,39}$/),
  ]),
  asyncHandler(controlador.asignarRol),
);
router.post(
  "/admin/usuarios/:id/roles/:rol/quitar",
  permisos("usuarios.gestionar"),
  validar([
    param("id").isInt({ min: 1 }),
    param("rol").matches(/^[a-z][a-z0-9_]{1,39}$/),
  ]),
  asyncHandler(controlador.quitarRol),
);
router.post(
  "/admin/usuarios/:id/estado",
  permisos("usuarios.gestionar"),
  validar([
    param("id").isInt({ min: 1 }),
    body("activo").isIn(["0", "1"]),
  ]),
  asyncHandler(controlador.cambiarEstado),
);

router.post(
  "/admin/usuarios/:id/reenviar-verificacion",
  permisos("usuarios.verificar"),
  validar([param("id").isInt({ min: 1 })]),
  asyncHandler(controlador.reenviarVerificacion),
);

router.post(
  "/admin/usuarios/:id/verificar-correo",
  permisos("usuarios.verificar"),
  validar([param("id").isInt({ min: 1 })]),
  asyncHandler(controlador.marcarCorreoVerificado),
);

router.get(
  "/admin/permisos",
  permisos("roles.gestionar"),
  asyncHandler(controlador.permisos),
);
router.post(
  "/admin/roles",
  permisos("roles.gestionar"),
  validar([
    body("clave").trim().matches(/^[a-z][a-z0-9_]{1,39}$/),
    body("nombre").trim().isLength({ min: 2, max: 80 }),
    body("descripcion").optional({ values: "falsy" }).trim().isLength({ max: 500 }),
    body("permisos").optional(),
  ]),
  asyncHandler(controlador.crearRol),
);
router.post(
  "/admin/permisos/:rol",
  permisos("roles.gestionar"),
  validar([
    param("rol").matches(/^[a-z][a-z0-9_]{1,39}$/),
    body("permisos").optional(),
  ]),
  asyncHandler(controlador.guardarPermisos),
);

router.get(
  "/admin/catalogos",
  permisos("catalogos.gestionar"),
  validar([
    validarPagina(),
    query("tipo").optional().isIn([
      "cultivo",
      "variedad",
      "zona",
      "requerimiento",
      "calendario",
      "departamento",
      "provincia",
      "distrito",
      "comunidad",
    ]),
    query("q").optional({ values: "falsy" }).trim().isLength({ max: 120 }),
    query("orden").optional().isIn(["id", "nombre"]),
    query("direccion").optional().isIn(["asc", "desc"]),
  ]),
  asyncHandler(controlador.catalogos),
);
router.post(
  "/admin/catalogos/vinculos-variedad",
  permisos("catalogos.gestionar"),
  validar([
    body("cultivo_id").isInt({ min: 1 }),
    body("variedad_id").isInt({ min: 1 }),
  ]),
  asyncHandler(controlador.vincularVariedad),
);
router.post(
  "/admin/catalogos/:tipo",
  permisos("catalogos.gestionar"),
  validar([param("tipo").matches(/^[a-z_]+$/)]),
  asyncHandler(controlador.guardarCatalogo),
);
router.post(
  "/admin/catalogos/:tipo/:id",
  permisos("catalogos.gestionar"),
  validar([
    param("tipo").matches(/^[a-z_]+$/),
    param("id").isInt({ min: 1 }),
  ]),
  asyncHandler(controlador.guardarCatalogo),
);

router.get(
  "/admin/auditoria/exportar.csv",
  permisos("auditoria.ver"),
  validar([
    query("q").optional({ values: "falsy" }).trim().isLength({ max: 120 }),
    query("accion").optional({ values: "falsy" }).trim().isLength({ max: 80 }),
    query("entidad").optional({ values: "falsy" }).trim().isLength({ max: 80 }),
    query("desde").optional({ values: "falsy" }).isISO8601(),
    query("hasta").optional({ values: "falsy" }).isISO8601(),
    query("orden").optional().isIn(["fecha", "usuario", "accion", "entidad"]),
    query("direccion").optional().isIn(["asc", "desc"]),
  ]),
  asyncHandler(controlador.exportarAuditoria),
);
router.get(
  "/admin/auditoria",
  permisos("auditoria.ver"),
  validar([
    validarPagina(),
    query("q").optional({ values: "falsy" }).trim().isLength({ max: 120 }),
    query("orden").optional().isIn(["fecha", "usuario", "accion", "entidad"]),
    query("direccion").optional().isIn(["asc", "desc"]),
    query("accion").optional({ values: "falsy" }).trim().isLength({ max: 80 }),
    query("entidad").optional({ values: "falsy" }).trim().isLength({ max: 80 }),
    query("desde").optional({ values: "falsy" }).isISO8601(),
    query("hasta").optional({ values: "falsy" }).isISO8601(),
  ]),
  asyncHandler(controlador.auditoria),
);

router.get(
  "/admin/configuraciones",
  permisos("configuraciones.gestionar"),
  asyncHandler(controlador.configuraciones),
);
router.get(
  "/admin/trabajos",
  permisos("trabajos.gestionar"),
  asyncHandler(controlador.trabajos),
);
router.post(
  "/admin/trabajos/:clave/ejecutar",
  permisos("trabajos.gestionar"),
  validar([
    param("clave").isIn([
      "sincronizacion_datos",
      "evaluacion_alertas",
      "limpieza_tokens",
      "publicaciones_programadas",
      "limpieza_imagenes",
      "limpieza_cuentas_sin_verificar",
    ]),
  ]),
  asyncHandler(controlador.ejecutarTrabajo),
);
router.post(
  "/admin/configuraciones/:clave",
  permisos("configuraciones.gestionar"),
  validar([
    param("clave").matches(/^[a-z]+\.[a-z]+$/),
    body("valor").trim().isLength({ min: 1, max: 1000 }),
  ]),
  asyncHandler(controlador.guardarConfiguracion),
);

router.get(
  "/admin/contacto",
  permisos("contacto.gestionar"),
  validar([
    validarPagina(),
    query("q").optional({ values: "falsy" }).trim().isLength({ max: 120 }),
    query("leido").optional({ values: "falsy" }).isIn(["0", "1"]),
    query("orden").optional().isIn(["fecha", "nombre", "asunto", "estado"]),
    query("direccion").optional().isIn(["asc", "desc"]),
  ]),
  asyncHandler(controlador.mensajesContacto),
);
router.post(
  "/admin/contacto/:id/estado",
  permisos("contacto.gestionar"),
  validar([
    param("id").isInt({ min: 1 }),
    body("leido").isIn(["0", "1"]),
  ]),
  asyncHandler(controlador.marcarMensaje),
);

module.exports = router;
