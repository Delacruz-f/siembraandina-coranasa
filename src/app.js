// Aplicación Express (sin escuchar el puerto).
// Se separa de server.js para poder probarla con Supertest sin abrir sockets.
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const compression = require("compression");
const pinoHttp = require("pino-http");

const env = require("./config/env");
const logger = require("./config/logger");
const rutas = require("./modules");
const { crearSesion } = require("./middlewares/sesion");
const { sincronizarSesion } = require("./middlewares/autorizacion");
const {
  leerCookies,
  exponerTokenCsrf,
  doubleCsrfProtection,
} = require("./middlewares/csrf");
const { variablesDeVista } = require("./middlewares/vistas");
const { idioma } = require("./middlewares/idioma");
const { noEncontrado, manejadorErrores } = require("./middlewares/errores");
const { ErrorHttp } = require("./utils/errores");
const { rutaSegura } = require("./utils/rutaSegura");

const RAIZ = path.join(__dirname, "..");
const DIRECTORIO_PUBLICO = path.resolve(RAIZ, "public");
const DIRECTORIO_SUBIDAS = path.resolve(RAIZ, env.subidas.directorio);
// Las subidas nunca se sirven como estáticos: pasan por /media/* con permisos.
const SUBIDAS_PUBLICAS = path.relative(
  DIRECTORIO_PUBLICO,
  DIRECTORIO_SUBIDAS,
);
if (SUBIDAS_PUBLICAS === "") {
  throw new Error("UPLOADS_DIR no puede ser el directorio público completo.");
}

function crearApp() {
  const app = express();

  // Detrás de Nginx/Apache: permite leer la IP real y el protocolo (HTTPS).
  if (env.confiarEnProxy) app.set("trust proxy", 1);
  app.disable("x-powered-by");

  // ---------- Vistas ----------
  app.set("view engine", "ejs");
  app.set("views", path.join(RAIZ, "views"));

  // ---------- Seguridad y rendimiento ----------
  // CSP estricta (OWASP): nada de scripts o estilos en línea, sin eval, sin
  // objetos embebidos y sin poder incrustar el sitio en otro origen. Todo
  // recurso propio se sirve desde el mismo origen; los mapas vienen de una
  // lista blanca explícita de proveedores de teselas usados por Leaflet.
  const directivasCsp = {
    "default-src": ["'self'"],
    // Todos los scripts son archivos locales: ni inline ni eval.
    "script-src": ["'self'"],
    // Los estilos son archivos locales; Leaflet solo necesita un poco de
    // estilo inline en sus capas de teselas y tooltips, así que se admite
    // 'unsafe-inline' SOLO para estilos (no para scripts).
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": [
      "'self'",
      "data:",
      "blob:",
      "https://*.tile.openstreetmap.org",
      "https://*.tile.openstreetmap.fr",
      "https://server.arcgisonline.com",
    ],
    "font-src": ["'self'"],
    "connect-src": ["'self'"],
    "media-src": ["'none'"],
    "object-src": ["'none'"],
    "frame-src": ["'none'"],
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "frame-ancestors": ["'none'"],
    "form-action": ["'self'"],
    "base-uri": ["'none'"],
    "upgrade-insecure-requests": env.esProduccion ? [] : null,
  };
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: directivasCsp,
      },
      // Las imágenes subidas por usuarios no deben ejecutar scripts.
      crossOriginResourcePolicy: { policy: "same-origin" },
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      // No se permite Flash/PDF objetos embebidos.
      crossOriginEmbedderPolicy: false,
      // Las cookies solo viajan por HTTPS en producción.
      hsts: env.esProduccion
        ? { maxAge: 63072000, includeSubDomains: true, preload: true }
        : false,
      // Permissions-Policy: se desactivan capacidades que el sitio no usa.
      xFrameOptions: { action: "deny" },
      xPoweredBy: false,
      dnsPrefetchControl: { allow: false },
    }),
  );
  // Capas adicionales que helmet no controla por sí solo.
  app.use((req, res, next) => {
    res.set(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(self), payment=(), usb=()",
    );
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Cross-Origin-Opener-Policy", "same-origin");
    next();
  });
  app.use(compression());

  // ---------- Logs de peticiones ----------
  app.use(
    pinoHttp({
      logger,
      customProps: (req) => ({ ruta: rutaSegura(req.url) }),
      // En pruebas no se registra cada petición.
      autoLogging: env.entorno !== "test",
      customLogLevel: (req, res, err) => {
        if (err || res.statusCode >= 500) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
      },
    }),
  );

  // ---------- Archivos estáticos con caché ----------
  // En producción los assets se cachean 7 días; en desarrollo, sin caché.
  if (
    !SUBIDAS_PUBLICAS.startsWith("..") &&
    !path.isAbsolute(SUBIDAS_PUBLICAS)
  ) {
    const prefijoSubidas = `/${SUBIDAS_PUBLICAS
      .split(path.sep)
      .join("/")}/`;
    app.use((req, res, next) => {
      if (
        req.path === prefijoSubidas.slice(0, -1) ||
        req.path.startsWith(prefijoSubidas)
      ) {
        return next(
          new ErrorHttp(404, "El archivo no existe o no tienes acceso."),
        );
      }
      return next();
    });
  }
  const opcionesEstaticos = {
    maxAge: env.esProduccion ? "7d" : 0,
    etag: true,
    lastModified: true,
    index: false,
  };
  app.use(express.static(path.join(RAIZ, "public"), opcionesEstaticos));
  app.use(
    "/vendor/leaflet",
    express.static(
      path.join(RAIZ, "node_modules", "leaflet", "dist"),
      opcionesEstaticos,
    ),
  );
  app.use(
    "/vendor/chartjs",
    express.static(
      path.join(RAIZ, "node_modules", "chart.js", "dist"),
      opcionesEstaticos,
    ),
  );

  // ---------- Cuerpo de las peticiones ----------
  app.use(express.urlencoded({ extended: false, limit: "100kb" }));
  app.use(express.json({ limit: "100kb" }));

  // ---------- Sesión, CSRF y variables de vista ----------
  app.use(crearSesion());
  app.use(sincronizarSesion);
  app.use(leerCookies);
  // Idioma de la interfaz (es/quechua): cookie, ?idioma= o Accept-Language.
  app.use(idioma);
  app.use(exponerTokenCsrf);
  // Los formularios multipart (con archivos) se procesan con multer en su
  // ruta, después de esta comprobación: el token viaja en la cabecera
  // x-csrf-token, que sí está disponible antes de leer el cuerpo.
  app.use(doubleCsrfProtection);
  app.use(variablesDeVista);

  // ---------- Rutas ----------
  app.use(rutas);

  // ---------- Errores ----------
  app.use(noEncontrado);
  app.use(manejadorErrores);

  return app;
}

module.exports = { crearApp };
