// Protección CSRF con el patrón "double submit cookie" (csrf-csrf).
// El token se guarda en una cookie httpOnly y se envía en el formulario
// mediante el campo oculto _csrf; las vistas lo obtienen de res.locals.csrfToken.
const { doubleCsrf } = require("csrf-csrf");
const env = require("../config/env");
const { ErrorHttp } = require("../utils/errores");

const NOMBRE_COOKIE = env.esProduccion ? "__Host-siembra.csrf" : "siembra.csrf";

// csrf-csrf lee las cookies de req.cookies, que normalmente llena cookie-parser.
// Para no añadir otra dependencia, se parsea aquí la cabecera Cookie.
function leerCookies(req, res, next) {
  const cabecera = req.headers.cookie;
  const cookies = {};
  if (cabecera) {
    for (const parte of cabecera.split(";")) {
      const indice = parte.indexOf("=");
      if (indice < 0) continue;
      const nombre = parte.slice(0, indice).trim();
      const valor = parte.slice(indice + 1).trim();
      if (!nombre) continue;
      try {
        cookies[nombre] = decodeURIComponent(valor);
      } catch {
        cookies[nombre] = valor;
      }
    }
  }
  req.cookies = cookies;
  next();
}

const { generateCsrfToken, doubleCsrfProtection, invalidCsrfTokenError } =
  doubleCsrf({
    getSecret: () => env.sesion.secreto,
    // El token se ata a la sesión: un token robado no sirve en otra sesión.
    // Se usa el id de la cookie de sesión (no req.session.id) porque la sesión
    // aún no existe cuando se genera el token en la primera visita.
    getSessionIdentifier: (req) => {
      const cookies = req.cookies || {};
      return cookies[env.sesion.nombreCookie] || '';
    },
    cookieName: NOMBRE_COOKIE,
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: env.sesion.cookieSegura,
      path: "/",
    },
    size: 64,
    ignoredMethods: ["GET", "HEAD", "OPTIONS"],
    // El token puede llegar en el campo _csrf (formularios normales) o en la
    // cabecera x-csrf-token (formularios multipart, donde el campo va después
    // del archivo y no se puede leer antes de procesarlo).
    getCsrfTokenFromRequest: (req) => {
      const cabecera = req.headers["x-csrf-token"];
      if (cabecera) return cabecera;
      return req.body && req.body._csrf;
    },
    errorConfig: {
      statusCode: 403,
      message:
        "Tu sesión de formulario expiró o la petición no es válida. Recarga la página e inténtalo de nuevo.",
      code: "csrf_invalido",
    },
  });

/** Deja el token disponible en todas las vistas como `csrfToken`. */
function exponerTokenCsrf(req, res, next) {
  res.locals.csrfToken = generateCsrfToken(req, res);
  next();
}

/**
 * Comprobación CSRF para formularios multipart.
 * El middleware global ya validó la petición, pero en multipart el campo
 * _csrf llega después del archivo y no se puede leer antes de multer.
 * Aquí se valida de nuevo, ya con el cuerpo parseado, para que el token
 * también pueda viajar en el campo oculto del formulario.
 */
function validarCsrf(req, res, next) {
  if (!req.body || !req.body._csrf) return next();
  // Se valida solo el token del campo: la cookie ya se comprobó antes.
  const token = req.body._csrf;
  const cookie = (req.cookies || {})[NOMBRE_COOKIE];
  if (!cookie || !token) {
    return next(
      new ErrorHttp(403, "Tu sesión de formulario expiró o la petición no es válida. Recarga la página e inténtalo de nuevo.", {
        codigo: "csrf_invalido",
      }),
    );
  }
  // Se reutiliza la comprobación de csrf-csrf con el token del cuerpo.
  req.headers["x-csrf-token"] = token;
  return doubleCsrfProtection(req, res, next);
}

module.exports = {
  leerCookies,
  exponerTokenCsrf,
  validarCsrf,
  doubleCsrfProtection,
  invalidCsrfTokenError,
};
