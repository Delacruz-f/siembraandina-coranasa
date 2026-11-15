// Manejo centralizado de errores.
// - 404: ninguna ruta coincidió.
// - 403: CSRF inválido o permiso denegado.
// - 500: cualquier error inesperado (se registra con pino, nunca se filtra al usuario).
// Si la petición espera JSON (API), se responde JSON; si no, se renderiza la página EJS.
const { ErrorHttp } = require("../utils/errores");
const logger = require("../config/logger");
const env = require("../config/env");
const { rutaSegura } = require("../utils/rutaSegura");
const { contextoLayout } = require("./vistas");

/** ¿La petición espera una respuesta JSON? */
function esperaJson(req) {
  return (
    req.path.startsWith("/api") ||
    req.xhr ||
    (req.get("accept") || "").includes("application/json")
  );
}

/** Ruta no encontrada (se coloca después de todas las rutas). */
function noEncontrado(req, res, next) {
  next(
    new ErrorHttp(404, "La página que buscas no existe o fue movida.", {
      codigo: "ruta_no_encontrada",
    }),
  );
}

/** Traduce errores conocidos a un estado HTTP y un mensaje en español. */
function normalizar(error) {
  if (error instanceof ErrorHttp) return error;

  // Errores de express-validator lanzados manualmente o de body-parser.
  if (error.type === "entity.parse.failed") {
    return new ErrorHttp(
      400,
      "El contenido enviado no tiene un formato válido.",
      { causa: error },
    );
  }
  if (error.type === "entity.too.large") {
    return new ErrorHttp(413, "El contenido enviado es demasiado grande.", {
      causa: error,
    });
  }
  // Errores de multer (subida de archivos).
  if (error.name === "MulterError") {
    return new ErrorHttp(
      400,
      "No se pudo subir el archivo. Revisa el tamaño y el formato.",
      { causa: error },
    );
  }
  // Errores de la base de datos: no se muestran detalles internos al usuario.
  if (
    error.code &&
    /^[0-9A-Z]{5}$/.test(String(error.code)) &&
    error.sqlMessage
  ) {
    return new ErrorHttp(
      500,
      "Hubo un problema con la base de datos. Inténtalo más tarde.",
      { causa: error },
    );
  }
  return new ErrorHttp(
    error.status || 500,
    "Ocurrió un error inesperado en el servidor.",
    { causa: error },
  );
}

function manejadorErrores(error, req, res, next) {
  const normalizado = normalizar(error);
  const estado = normalizado.estado;

  const contexto = {
    err: normalizado.causa || error,
    estado,
    metodo: req.method,
    ruta: rutaSegura(req.originalUrl),
    usuarioId:
      req.session && req.session.usuario ? req.session.usuario.id : null,
  };

  if (estado >= 500) logger.error(contexto, normalizado.message);
  else logger.warn(contexto, normalizado.message);

  // Si la respuesta ya empezó a enviarse, solo se delega a Express.
  if (res.headersSent) return next(error);

  if (esperaJson(req)) {
    return res.status(estado).json({
      ok: false,
      error: {
        codigo: normalizado.codigo || "error",
        mensaje: normalizado.message,
        ...(normalizado.detalles ? { detalles: normalizado.detalles } : {}),
      },
    });
  }

  const plantilla =
    estado === 404
      ? "errores/404"
      : estado === 410
        ? "errores/410"
        : estado === 403 && normalizado.codigo === "correo_verificacion_requerida"
          ? "errores/correo_requerido"
          : estado === 403
            ? "errores/403"
            : estado === 429
              ? "errores/429"
              : "errores/500";
  const usuario =
    res.locals.usuario || (req.session && req.session.usuario) || null;
  const correoNoVerificado = estado === 403 && normalizado.codigo === "correo_no_verificado";
  const correoVerificacion =
    res.locals.correoVerificacion ||
    (normalizado.detalles && normalizado.detalles.email) ||
    "";
  return res.status(estado).render(plantilla, {
    // Se repiten las variables del layout: si el error ocurrió antes del
    // middleware de vistas (p. ej. CSRF), res.locals aún no las tiene.
    usuario,
    mensajes: res.locals.mensajes || [],
    rutaActual: res.locals.rutaActual || req.path,
    ...contextoLayout(res.locals.rutaActual || req.path, usuario),
    csrfToken: res.locals.csrfToken || "",
    anio: res.locals.anio || new Date().getFullYear(),
    titulo:
      estado === 404
        ? "Página no encontrada"
        : estado === 410
          ? "Enlace vencido"
          : correoNoVerificado || normalizado.codigo === "correo_verificacion_requerida"
            ? "Verifica tu correo"
            : estado === 403
              ? "Acceso denegado"
              : estado === 429
                ? "Demasiados intentos"
                : estado >= 500
                  ? "Error del servidor"
                  : "No se pudo completar la solicitud",
    codigoError: normalizado.codigo,
    estadoError: estado,
    mensaje: normalizado.message,
    detallesFormulario: Array.isArray(normalizado.detalles)
      ? normalizado.detalles
      : [],
    correoVerificacion,
    // Solo en desarrollo se muestra el detalle técnico.
    detalle:
      !env.esProduccion && estado >= 500
        ? (normalizado.causa || error).stack
        : null,
  });
}

module.exports = { noEncontrado, manejadorErrores };
