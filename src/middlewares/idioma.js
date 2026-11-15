// Detección y fijación del idioma (Fase 12).
// Prioridad: parámetro ?idioma= en la URL -> cookie -> cabecera Accept-Language
// -> IDIOMA_POR_DEFECTO. El cambio de idioma se persiste en una cookie de un año.
const env = require("../config/env");
const {
  paraIdioma,
  idiomasDisponibles,
  esIdiomaValido,
  nombreIdioma,
} = require("../i18n");

const NOMBRE_COOKIE = "siembra.idioma";
const DURACION_COOKIE_MS = 365 * 24 * 60 * 60 * 1000;

function desdeAcceptLanguage(cabecera) {
  if (!cabecera) return null;
  const disponibles = idiomasDisponibles();
  for (const parte of String(cabecera).split(",")) {
    const codigo = parte.split(";")[0].trim().toLowerCase().slice(0, 2);
    if (disponibles.includes(codigo)) return codigo;
  }
  return null;
}

function idioma(req, res, next) {
  const pedido = String(req.query.idioma || "").toLowerCase();
  let elegido = null;

  if (esIdiomaValido(pedido)) {
    elegido = pedido;
    res.cookie(NOMBRE_COOKIE, pedido, {
      maxAge: DURACION_COOKIE_MS,
      sameSite: "lax",
      httpOnly: false,
      secure: env.sesion.cookieSegura,
      path: "/",
    });
  }

  if (!elegido && req.cookies && esIdiomaValido(req.cookies[NOMBRE_COOKIE])) {
    elegido = req.cookies[NOMBRE_COOKIE];
  }

  if (!elegido) elegido = desdeAcceptLanguage(req.get("accept-language"));
  if (!elegido) elegido = env.idiomas.porDefecto;

  req.idioma = elegido;
  res.locals.idioma = elegido;
  res.locals.idiomas = idiomasDisponibles().map((codigo) => ({
    codigo,
    nombre: nombreIdioma(codigo),
    activo: codigo === elegido,
  }));
  const urlActual = new URL(req.originalUrl, "http://localhost");
  urlActual.searchParams.delete("idioma");
  res.locals.urlIdioma = `${urlActual.pathname}${urlActual.search}`;
  res.locals.t = paraIdioma(elegido);
  res.set("Content-Language", elegido);
  next();
}

module.exports = { idioma, NOMBRE_COOKIE };
