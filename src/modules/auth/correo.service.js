const nodemailer = require("nodemailer");
const env = require("../../config/env");
const logger = require("../../config/logger");
const { ErrorHttp } = require("../../utils/errores");

let transportador;

function esConsola() {
  return env.correo.modo === "consola";
}

function traducirErrorCorreo(error) {
  const code = String(error && (error.code || error.errno || "")).toUpperCase();
  const responseCode = Number(error && error.responseCode);
  if (code === "EAUTH" || responseCode === 535) {
    return "Las credenciales SMTP no son válidas. Revisa SMTP_USER y SMTP_PASSWORD.";
  }
  if (
    ["ECONNECTION", "ETIMEDOUT", "ESOCKET", "ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH", "ENOTFOUND"].includes(code) ||
    /timeout/i.test(String(error && error.message))
  ) {
    return "No se pudo conectar con el servidor de correo o la conexión tardó demasiado. Revisa SMTP_HOST, SMTP_PORT y tu red.";
  }
  if ([550, 553, 501].includes(responseCode) || /sender|mail from|from address/i.test(String(error && (error.response || error.message)))) {
    return "El servidor rechazó el remitente configurado. Revisa SMTP_FROM.";
  }
  return "No se pudo enviar el correo. Inténtalo de nuevo en unos minutos.";
}

function registrarFalloEnvio(error, contexto = {}) {
  logger.error(
    {
      evento: "correo.fallo_envio",
      code: error && error.code,
      responseCode: error && error.responseCode,
      mensaje: error && error.message,
      ...contexto,
    },
    "Falló el envío de correo",
  );
}

function crearErrorCorreo(error, contexto = {}) {
  registrarFalloEnvio(error, contexto);
  return new ErrorHttp(503, traducirErrorCorreo(error), {
    codigo: "correo_no_enviado",
    causa: error,
  });
}

function obtenerTransportador() {
  if (esConsola()) return null;
  const smtp = env.correo.smtp;
  if (!smtp.host || !smtp.remitente) {
    throw new ErrorHttp(
      503,
      "El correo no está configurado. Define SMTP_HOST y SMTP_FROM en .env.",
      { codigo: "correo_no_configurado" },
    );
  }
  if (!transportador) {
    transportador = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.puerto,
      secure: smtp.seguro,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
      ...(smtp.usuario
        ? { auth: { user: smtp.usuario, pass: smtp.password } }
        : {}),
    });
  }
  return transportador;
}

async function enviar({ para, asunto, texto, html, tipo }) {
  if (esConsola()) {
    if (env.entorno !== "development") {
      throw new ErrorHttp(500, "El modo de correo en consola solo está disponible en desarrollo.");
    }
    const salida = [
      "",
      "┌─ Correo (MAIL_MODE=consola, no enviado) ─────────────────",
      `│ Para:   ${para}`,
      `│ Asunto: ${asunto}`,
      tipo ? `│ Tipo:   ${tipo}` : null,
      "│",
      "│ Contenido:",
      ...String(texto || "").split(/\r?\n/).map((l) => `│ ${l}`),
      "└──────────────────────────────────────────────────────────",
      "",
    ].filter((l) => l !== null).join("\n");
    // eslint-disable-next-line no-console
    console.log(salida);
    return { messageId: "consola", aceptado: true };
  }
  try {
    return await obtenerTransportador().sendMail({
      from: env.correo.smtp.remitente,
      to: para,
      subject: asunto,
      text: texto,
      html,
    });
  } catch (error) {
    throw crearErrorCorreo(error, { tipo, asunto });
  }
}

function validarConfiguracion() {
  if (esConsola()) return;
  obtenerTransportador();
}

async function verificarTransporte() {
  if (esConsola()) {
    return { ok: true, modo: "consola" };
  }
  const t = obtenerTransportador();
  await t.verify();
  return { ok: true, modo: "smtp" };
}

module.exports = {
  enviar,
  validarConfiguracion,
  verificarTransporte,
  traducirErrorCorreo,
  registrarFalloEnvio,
};
