// Registro central de rutas de la aplicación.
// Cada módulo de src/modules expone su propio router; aquí solo se monta.
const express = require("express");
const inicioRoutes = require("./inicio/inicio.routes");
const publicoRoutes = require("./publico/publico.routes");
const contactoRoutes = require("./contacto/contacto.routes");
const saludRoutes = require("./salud/salud.routes");
const authRoutes = require("./auth/auth.routes");
const panelRoutes = require("./panel/panel.routes");
const usuariosRoutes = require("./usuarios/usuarios.routes");
const parcelasRoutes = require("./parcelas/parcelas.routes");
const lecturasRoutes = require("./lecturas/lecturas.routes");
const campaniasRoutes = require("./campanias/campanias.routes");
const interaccionesRoutes = require("./comunidad/interacciones.routes");
const consultasRoutes = require("./comunidad/consultas.routes");
const notificacionesRoutes = require("./notificaciones/notificaciones.routes");
const tecnicoRoutes = require("./tecnico/tecnico.routes");
const adminRoutes = require("./admin/admin.routes");
const editorRoutes = require("./editor/editor.routes");
const imagenesRoutes = require("./imagenes/imagenes.routes");
const cultivosImagenesRoutes = require("./imagenes/cultivos.routes");
const apiRoutes = require("./api/api.routes");
const apiDocsRoutes = require("./api/docs.routes");
const consultaPublicaRoutes = require("./consultaPublica/consultaPublica.routes");

const router = express.Router();

router.use("/salud", saludRoutes);
router.use(authRoutes);
router.use(panelRoutes);
router.use(usuariosRoutes);
router.use(parcelasRoutes);
router.use(lecturasRoutes);
router.use(campaniasRoutes);
router.use(interaccionesRoutes);
router.use(consultasRoutes);
router.use(notificacionesRoutes);
router.use(tecnicoRoutes);
router.use(adminRoutes);
router.use(imagenesRoutes);
router.use(cultivosImagenesRoutes);
router.use(editorRoutes);
router.use(apiDocsRoutes);
router.use(apiRoutes);
router.use(consultaPublicaRoutes);
router.use(publicoRoutes);
router.use(contactoRoutes);
router.use("/", inicioRoutes);

module.exports = router;
