// Carga y validación de variables de entorno.
// Regla del proyecto: la configuración vive SOLO en variables de entorno.
// Si falta algo obligatorio o tiene un valor inválido, el proceso se detiene
// con un mensaje claro en español (nunca con un error críptico más adelante).
const path = require("path");
const dotenv = require("dotenv");

// Se carga el .env de la raíz del proyecto una sola vez.
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

const CLIENTES_VALIDOS = ["mysql2", "pg"];
const ENTORNOS_VALIDOS = ["development", "test", "production"];

// Valores por defecto de la conexión según el motor elegido.
const PUERTOS_POR_DEFECTO = { mysql2: 3306, pg: 5432 };
const USUARIOS_POR_DEFECTO = { mysql2: "root", pg: "postgres" };

const errores = [];

/** Lee una variable de entorno como texto recortado. */
function texto(nombre, porDefecto) {
  const valor = process.env[nombre];
  if (valor === undefined || valor.trim() === "") return porDefecto;
  return valor.trim();
}

/** Lee una variable numérica entera y valida su rango. */
function entero(
  nombre,
  porDefecto,
  { min = 0, max = Number.MAX_SAFE_INTEGER } = {},
) {
  const crudo = texto(nombre);
  if (crudo === undefined) return porDefecto;
  const numero = Number(crudo);
  if (!Number.isInteger(numero) || numero < min || numero > max) {
    errores.push(
      `${nombre} debe ser un número entero entre ${min} y ${max} (valor recibido: "${crudo}").`,
    );
    return porDefecto;
  }
  return numero;
}

/** Lee una variable booleana ("true"/"false"). */
function booleano(nombre, porDefecto) {
  const crudo = texto(nombre);
  if (crudo === undefined) return porDefecto;
  if (["true", "1", "si", "sí"].includes(crudo.toLowerCase())) return true;
  if (["false", "0", "no"].includes(crudo.toLowerCase())) return false;
  errores.push(
    `${nombre} debe ser "true" o "false" (valor recibido: "${crudo}").`,
  );
  return porDefecto;
}

const entorno = texto("NODE_ENV", "development");
if (!ENTORNOS_VALIDOS.includes(entorno)) {
  errores.push(
    `NODE_ENV debe ser uno de: ${ENTORNOS_VALIDOS.join(", ")} (valor recibido: "${entorno}").`,
  );
}

const dbClient = texto("DB_CLIENT", "mysql2");
if (!CLIENTES_VALIDOS.includes(dbClient)) {
  errores.push(
    `DB_CLIENT debe ser "mysql2" (MySQL/MariaDB) o "pg" (PostgreSQL). Valor recibido: "${dbClient}".`,
  );
}

const dbHost = texto("DB_HOST", "127.0.0.1");
const dbPort = entero("DB_PORT", PUERTOS_POR_DEFECTO[dbClient] || 3306, {
  min: 1,
  max: 65535,
});
const dbUser = texto("DB_USER", USUARIOS_POR_DEFECTO[dbClient] || "root");
// La contraseña puede ser vacía (XAMPP por defecto), por eso no se exige.
const dbPassword =
  process.env.DB_PASSWORD === undefined ? "" : process.env.DB_PASSWORD;
const dbName = texto("DB_NAME", "siembra_andina");
const puerto = entero("PORT", 3000, { min: 1, max: 65535 });
const smtpPuerto = entero("SMTP_PORT", 587, { min: 1, max: 65535 });
const appBaseUrlConfigurada = texto("APP_BASE_URL");
const urlBaseApp = (
  appBaseUrlConfigurada || `http://localhost:${puerto}`
).replace(/\/+$/, "");
try {
  const url = new URL(urlBaseApp);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    (entorno === "production" && url.protocol !== "https:") ||
    url.pathname !== "/" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error();
} catch {
  errores.push(
    "APP_BASE_URL debe ser una URL http(s) absoluta sin credenciales, consulta ni fragmento; en producción debe usar HTTPS.",
  );
}
if (entorno === "production" && !appBaseUrlConfigurada) {
  errores.push(
    "En producción configura APP_BASE_URL con el dominio público de la aplicación.",
  );
}

const smtpHost = texto("SMTP_HOST");
const smtpRemitente = texto("SMTP_FROM");
const minutosBloqueo = entero("AUTH_LOCK_MINUTES", 15, { min: 1, max: 1440 });
const horasVerificacion = entero("EMAIL_VERIFICATION_HOURS", 24, {
  min: 1,
  max: 168,
});
const mailMode = texto("MAIL_MODE", "smtp").toLowerCase();
if (!["smtp", "consola"].includes(mailMode)) {
  errores.push('MAIL_MODE debe ser "smtp" o "consola".');
}
const proveedorIA = texto("IA_PROVEEDOR", "").toLowerCase();
if (proveedorIA && !["anthropic", "gemini"].includes(proveedorIA)) {
  errores.push('IA_PROVEEDOR debe ser "anthropic" o "gemini", o quedar vacío.');
}
const claveIA = process.env.IA_API_KEY || "";
if (claveIA && !proveedorIA) {
  errores.push("Configura IA_PROVEEDOR cuando IA_API_KEY tenga un valor.");
}
if (mailMode === "consola" && entorno === "production") {
  errores.push("MAIL_MODE=consola no está permitido en producción.");
}
if (
  entorno === "production" &&
  mailMode === "smtp" &&
  (!smtpHost || !smtpRemitente)
) {
  errores.push(
    "En producción configura SMTP_HOST y SMTP_FROM para enviar correos.",
  );
}
if (Boolean(texto("SMTP_USER")) !== Boolean(process.env.SMTP_PASSWORD)) {
  errores.push("Configura SMTP_USER y SMTP_PASSWORD juntos, o déjalos vacíos.");
}

if (!dbName)
  errores.push("DB_NAME es obligatorio (nombre de la base de datos).");

const sessionSecret = texto("SESSION_SECRET");
if (!sessionSecret) {
  errores.push(
    "SESSION_SECRET es obligatorio. Genera uno con: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"",
  );
} else if (sessionSecret.length < 32) {
  errores.push(
    "SESSION_SECRET debe tener al menos 32 caracteres para ser seguro.",
  );
}

const esProduccion = entorno === "production";

const ADAPTADORES_ALMACENAMIENTO = ["local", "s3", "cloudinary"];
const almacenamientoAdaptador = texto("STORAGE_DRIVER", "local");
if (!ADAPTADORES_ALMACENAMIENTO.includes(almacenamientoAdaptador)) {
  errores.push(
    `STORAGE_DRIVER debe ser uno de: ${ADAPTADORES_ALMACENAMIENTO.join(", ")} (valor recibido: "${almacenamientoAdaptador}").`,
  );
}
if (almacenamientoAdaptador === "s3" && !texto("S3_BUCKET")) {
  errores.push(
    "Con STORAGE_DRIVER=s3 configura S3_BUCKET (y sus credenciales).",
  );
}

// ---------- Internacionalización (Fase 12) ----------
const IDIOMAS_SOPORTADOS = ["es", "qu", "en"];
const idiomaPorDefecto = texto("IDIOMA_POR_DEFECTO", "es");
const idiomasDisponibles = texto("IDIOMAS_DISPONIBLES", "es,qu,en")
  .split(",")
  .map((valor) => valor.trim().toLowerCase())
  .filter(Boolean);
if (!IDIOMAS_SOPORTADOS.includes(idiomaPorDefecto)) {
  errores.push(
    `IDIOMA_POR_DEFECTO debe ser uno de: ${IDIOMAS_SOPORTADOS.join(", ")} (valor recibido: "${idiomaPorDefecto}").`,
  );
}
const idiomasInvalidos = idiomasDisponibles.filter(
  (valor) => !IDIOMAS_SOPORTADOS.includes(valor),
);
if (!idiomasDisponibles.length || idiomasInvalidos.length) {
  errores.push(
    `IDIOMAS_DISPONIBLES debe ser una lista de ${IDIOMAS_SOPORTADOS.join(", ")} separada por comas (valor recibido: "${idiomasDisponibles.join(",")}").`,
  );
}

const config = {
  entorno,
  esProduccion,
  puerto,
  // En producción se confía en el proxy inverso (Nginx, Apache) para IP y HTTPS.
  confiarEnProxy: booleano("TRUST_PROXY", esProduccion),
  sesion: {
    secreto: sessionSecret,
    nombreCookie: texto("SESSION_COOKIE_NAME", "siembra.sid"),
    // 7 días en milisegundos.
    duracionMs: entero("SESSION_MAX_AGE_MS", 7 * 24 * 60 * 60 * 1000, {
      min: 60 * 1000,
    }),
    // Las cookies "secure" solo viajan por HTTPS; se activa en producción.
    cookieSegura: esProduccion || booleano("SESSION_COOKIE_SECURE", false),
  },
  correo: {
    modo: mailMode,
    urlBase: urlBaseApp,
    duracionVerificacionMs: horasVerificacion * 60 * 60 * 1000,
    smtp: {
      host: smtpHost,
      puerto: smtpPuerto,
      seguro: booleano("SMTP_SECURE", smtpPuerto === 465),
      usuario: texto("SMTP_USER"),
      password: process.env.SMTP_PASSWORD || "",
      remitente: smtpRemitente,
    },
  },
  autenticacion: {
    duracionBloqueoMs: minutosBloqueo * 60 * 1000,
  },
  idiomas: {
    porDefecto: idiomaPorDefecto,
    disponibles: idiomasDisponibles.length ? idiomasDisponibles : ["es"],
  },
  api: {
    // /api/v1 con tokens personales; /api/docs con la especificación OpenAPI.
    v1Activa: booleano("API_V1_ACTIVA", true),
  },
  siembras: {
    demoPublico: booleano("SIEMBRAS_DEMO_PUBLICAS", true),
  },
  db: {
    client: dbClient,
    connection: {
      host: dbHost,
      port: dbPort,
      user: dbUser,
      password: dbPassword,
      database: dbName,
    },
    // Tiempo máximo de espera al abrir una conexión (ms).
    tiempoConexionMs: entero("DB_CONNECT_TIMEOUT_MS", 5000, {
      min: 500,
      max: 60000,
    }),
  },
  nasa: {
    tiempoLimiteMs: entero("NASA_TIMEOUT_MS", 8000, { min: 500, max: 60000 }),
  },
  openMeteo: {
    tiempoLimiteMs: entero("OPEN_METEO_TIMEOUT_MS", 8000, {
      min: 500,
      max: 60000,
    }),
  },
  ia: {
    // IA_PROVEEDOR, IA_API_KEY y IA_MODELO. La clave solo se usa en el servidor.
    proveedor: proveedorIA,
    clave: claveIA,
    // Tiempo máximo para redactar; si se supera se usa la plantilla fija.
    tiempoLimiteMs: entero("IA_TIMEOUT_MS", 8000, { min: 500, max: 60000 }),
    modelo: texto(
      "IA_MODELO",
      proveedorIA === "anthropic"
        ? "claude-3-5-haiku-latest"
        : "gemini-2.0-flash",
    ),
  },
  // Calendario público con punto elegido: caché en memoria y límites por IP.
  // No se persiste nada: ni el punto, ni la IP, ni la respuesta.
  calendario: {
    cacheTtlMs: entero("CALENDARIO_CACHE_TTL_MS", 6 * 60 * 60 * 1000, {
      min: 1000,
      max: 24 * 60 * 60 * 1000,
    }),
    cacheMaximo: entero("CALENDARIO_CACHE_MAX", 500, { min: 10, max: 10000 }),
    // Proveedor de geocodificación (Open-Meteo: sin clave).
    geocodificacionUrl: texto(
      "GEOCODIFICACION_URL",
      "https://geocoding-api.open-meteo.com/v1/search",
    ),
    geocodificacion: {
      cacheTtlMs: entero("GEOCODIFICACION_CACHE_TTL_MS", 24 * 60 * 60 * 1000, {
        min: 1000,
        max: 7 * 24 * 60 * 60 * 1000,
      }),
      limite: {
        ventanaMs: entero("GEOCODIFICAR_RATE_LIMIT_WINDOW_MS", 60 * 1000, {
          min: 1000,
        }),
        maximo: entero("GEOCODIFICAR_RATE_LIMIT_MAX", 20, { min: 1 }),
      },
    },
    resultado: {
      ventanaMs: entero("CALENDARIO_RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000, {
        min: 1000,
      }),
      maximo: entero("CALENDARIO_RATE_LIMIT_MAX", 30, { min: 1 }),
    },
  },
  fuentesDatos: {
    reintentos: entero("EXTERNAL_API_RETRIES", 2, { min: 0, max: 5 }),
    cacheTtlMs: entero("WEATHER_CACHE_TTL_MS", 6 * 60 * 60 * 1000, {
      min: 1000,
      max: 7 * 24 * 60 * 60 * 1000,
    }),
    earthdata: {
      usuario: texto("EARTHDATA_USER"),
      token: texto("EARTHDATA_TOKEN"),
    },
  },
  logs: {
    nivel: texto("LOG_LEVEL", esProduccion ? "info" : "debug"),
  },
  // Límite de peticiones por IP para las rutas sensibles (login, registro).
  limitePeticiones: {
    ventanaMs: entero("RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000, { min: 1000 }),
    maximo: entero("RATE_LIMIT_MAX", 100, { min: 1 }),
    contacto: {
      ventanaMs: entero("CONTACT_RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000, {
        min: 1000,
      }),
      maximo: entero("CONTACT_RATE_LIMIT_MAX", 5, { min: 1 }),
    },
  },
  // Carpeta donde se guardan los binarios subidos (relativa a la raíz).
  // Nunca debe estar dentro de public/: se sirve solo por rutas controladas.
  subidas: {
    directorio: texto("UPLOADS_DIR", "storage/uploads"),
    tamanoMaximoBytes: entero("UPLOADS_MAX_BYTES", 10 * 1024 * 1024, {
      min: 1024,
    }),
  },
  // Almacenamiento de imágenes: interfaz con adaptadores intercambiables.
  almacenamiento: {
    adaptador: almacenamientoAdaptador,
    // true cuando el adaptador deja los archivos en una carpeta pública
    // (solo el adaptador local lo hace), lo que permite caché agresiva.
    sirveEstatico: almacenamientoAdaptador === "local",
    s3: {
      bucket: texto("S3_BUCKET"),
      region: texto("S3_REGION"),
      endpoint: texto("S3_ENDPOINT"),
      accessKeyId: texto("S3_ACCESS_KEY_ID"),
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
      // Dominio o URL base con la que se sirven los objetos.
      urlBase: texto("S3_PUBLIC_URL"),
      fuerzaRuta: booleano("S3_FORCE_PATH_STYLE", false),
    },
    cloudinary: {
      nube: texto("CLOUDINARY_CLOUD_NAME"),
      urlBase: texto("CLOUDINARY_URL_BASE"),
    },
  },
  imagenes: {
    // Anchos de las variantes generadas con sharp (px).
    anchos: [400, 800, 1600],
    calidadWebp: entero("IMAGE_WEBP_QUALITY", 78, { min: 40, max: 100 }),
    calidadJpg: entero("IMAGE_JPG_QUALITY", 80, { min: 40, max: 100 }),
    // Horas que debe esperar una imagen sin asociar antes de considerarla huérfana.
    horasHuerfano: entero("IMAGE_ORPHAN_HOURS", 24, { min: 1, max: 720 }),
  },
};

if (errores.length > 0) {
  const mensaje = [
    "",
    "✖ Configuración inválida. Revisa tu archivo .env (puedes copiar .env.example):",
    ...errores.map((e) => `   - ${e}`),
    "",
  ].join("\n");
  // Se lanza un error explícito: server.js lo captura y lo muestra sin traza.
  const error = new Error(mensaje);
  error.esErrorDeConfiguracion = true;
  throw error;
}

module.exports = config;
