// Variables disponibles en todas las vistas EJS.
// Aquí se expone el usuario de la sesión, los mensajes flash y utilidades
// de formato. Las vistas siempre escapan con <%= %>; nunca se usa <%- %> con datos del usuario.
const env = require("../config/env");

const MESES = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];
const MESES_LARGOS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function contextoLayout(ruta, usuario) {
  const roles = usuario && Array.isArray(usuario.roles) ? usuario.roles : [];
  const permisos =
    usuario && Array.isArray(usuario.permisos) ? usuario.permisos : [];
  const esAuth =
    ["/ingresar", "/registro", "/recuperar"].includes(ruta) ||
    ruta.startsWith("/restablecer/") ||
    ruta.startsWith("/verificar-correo/") ||
    ruta.startsWith("/verificacion/");
  const esPanel =
    Boolean(usuario) &&
    ["/panel", "/tecnico", "/editor", "/admin", "/perfil", "/parcelas", "/guia-estilo", "/notificaciones"].some(
      (prefijo) => ruta === prefijo || ruta.startsWith(`${prefijo}/`),
    );
  const enlacesPanel = [];

  if (roles.includes("agricultor") || permisos.includes("parcelas.ver")) {
    enlacesPanel.push({ href: "/panel", nombre: "Parcelas", clave: "panel.nav.parcelas", icono: "mapa" });
  }
  if (roles.includes("tecnico")) {
    enlacesPanel.push({ href: "/tecnico", nombre: "Técnico", clave: "panel.nav.technician", icono: "gota" });
  }
  if (
    (roles.includes("tecnico") || roles.includes("administrador")) &&
    permisos.includes("consultas.responder")
  ) {
    enlacesPanel.push({
      href: "/tecnico/consultas",
      nombre: "Consultas de mi zona",
      clave: "panel.nav.zoneQuestions",
      icono: "libro",
    });
    enlacesPanel.push({
      href: "/tecnico/zonas",
      nombre: "Mis zonas de atención",
      clave: "panel.nav.serviceZones",
      icono: "mapa",
    });
    if (permisos.includes("avisos.crear")) {
      enlacesPanel.push({
        href: "/tecnico/avisos",
        nombre: "Avisos por zona",
        clave: "panel.nav.zoneAlerts",
        icono: "alerta",
      });
    }
  }
  if (permisos.includes("consultas.crear")) {
    enlacesPanel.push({
      href: "/panel/consultas",
      nombre: "Mis consultas",
      clave: "panel.nav.myQuestions",
      icono: "libro",
    });
  }
  if (roles.includes("editor") || permisos.includes("publicaciones.publicar")) {
    enlacesPanel.push({ href: "/editor", nombre: "Editor", clave: "panel.nav.editor", icono: "libro" });
  }
  if (permisos.includes("publicaciones.moderar")) {
    enlacesPanel.push({
      href: "/editor/moderacion/comentarios",
      nombre: "Moderación",
      clave: "panel.nav.moderation",
      icono: "escudo",
    });
  }
  if (roles.includes("administrador") || permisos.includes("usuarios.gestionar")) {
    enlacesPanel.push({
      href: "/admin",
      nombre: "Administración",
      clave: "panel.nav.administration",
      icono: "escudo",
    });
  }
  if (permisos.includes("usuarios.gestionar")) {
    enlacesPanel.push({
      href: "/admin/usuarios",
      nombre: "Usuarios",
      clave: "panel.nav.users",
      icono: "usuario",
    });
  }
  if (permisos.includes("roles.gestionar")) {
    enlacesPanel.push({
      href: "/admin/permisos",
      nombre: "Roles y permisos",
      clave: "panel.nav.rolesPermissions",
      icono: "escudo",
    });
  }
  if (permisos.includes("catalogos.gestionar")) {
    enlacesPanel.push({
      href: "/admin/catalogos",
      nombre: "Catálogos",
      clave: "panel.nav.catalogs",
      icono: "cuadricula",
    });
  }
  if (permisos.includes("auditoria.ver")) {
    enlacesPanel.push({
      href: "/admin/auditoria",
      nombre: "Auditoría",
      clave: "panel.nav.audit",
      icono: "libro",
    });
  }
  if (permisos.includes("contacto.gestionar")) {
    enlacesPanel.push({
      href: "/admin/contacto",
      nombre: "Contacto",
      clave: "panel.nav.contact",
      icono: "libro",
    });
  }
  if (permisos.includes("configuraciones.gestionar")) {
    enlacesPanel.push({
      href: "/admin/configuraciones",
      nombre: "Configuración",
      clave: "panel.nav.settings",
      icono: "cuadricula",
    });
  }
  if (permisos.includes("trabajos.gestionar")) {
    enlacesPanel.push({
      href: "/admin/trabajos",
      nombre: "Trabajos programados",
      clave: "panel.nav.scheduledJobs",
      icono: "alerta",
    });
  }
  if (roles.includes("administrador")) {
    enlacesPanel.push({
      href: "/guia-estilo",
      nombre: "Guía de estilo",
      clave: "panel.nav.styleGuide",
      icono: "cuadricula",
    });
  }
  if (usuario) {
    enlacesPanel.push({
      href: "/perfil",
      nombre: "Mi perfil",
      clave: "panel.nav.profile",
      icono: "usuario",
    });
    enlacesPanel.push({
      href: "/notificaciones",
      nombre: "Notificaciones",
      clave: "panel.nav.notifications",
      icono: "alerta",
    });
  }

  return {
    tipoLayout: esAuth ? "auth" : esPanel ? "panel" : "publico",
    rutaLayout: ruta,
    enlacesPanel,
  };
}

/** Formatea una fecha (Date o texto ISO) como dd/mm/aaaa. */
function fecha(valor) {
  if (!valor) return "—";
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/** Formatea fecha y hora como dd/mm/aaaa hh:mm. */
function fechaHora(valor) {
  if (!valor) return "—";
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return "—";
  return `${fecha(d)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fechaISO(valor) {
  if (!valor) return "";
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

function variablesDeVista(req, res, next) {
  res.locals.usuario = (req.session && req.session.usuario) || null;
  res.locals.mensajes = (req.session && req.session.mensajes) || [];
  res.locals.ocultarAvisoVerificacion = Boolean(
    req.session && req.session.ocultarAvisoVerificacion,
  );
  res.locals.rutaActual = req.path;
  Object.assign(
    res.locals,
    contextoLayout(req.path, res.locals.usuario),
  );
  res.locals.ogUrl = new URL(req.path, env.correo.urlBase).href;
  res.locals.ogImagen = new URL(
    "/img/andenes-sucsumarka.webp",
    env.correo.urlBase,
  ).href;
  res.locals.ogTipo = "website";
  res.locals.entorno = env.entorno;
  res.locals.anio = new Date().getFullYear();
  res.locals.MESES = MESES;
  res.locals.MESES_LARGOS = MESES_LARGOS;
  res.locals.fecha = fecha;
  res.locals.fechaHora = fechaHora;
  res.locals.fechaISO = fechaISO;
  // Los mensajes flash se muestran una sola vez.
  if (req.session) delete req.session.mensajes;
  next();
}

/** Guarda un mensaje flash para la siguiente petición. */
function agregarMensaje(req, tipo, texto) {
  if (!req.session) return;
  req.session.mensajes = req.session.mensajes || [];
  req.session.mensajes.push({ tipo, texto });
}

module.exports = {
  variablesDeVista,
  agregarMensaje,
  contextoLayout,
  fechaISO,
};
