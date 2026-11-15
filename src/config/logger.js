// Logger centralizado con pino.
// En desarrollo se imprime de forma legible; en producción, JSON para que
// cualquier colector de logs (Docker, systemd, PM2) lo pueda leer.
const pino = require("pino");
const env = require("./env");

const logger = pino({
  level: env.logs.nivel,
  base: { servicio: "siembra-andina", entorno: env.entorno },
  // Nunca registrar datos sensibles que puedan viajar en la petición.
  redact: {
    paths: [
      "req.headers.cookie",
      "req.headers.authorization",
      "req.url",
      'res.headers["set-cookie"]',
      "password",
      "*.password",
      "*.password_hash",
    ],
    censor: "[oculto]",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: env.esProduccion
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss",
          ignore: "pid,hostname,servicio,entorno",
        },
      },
});

module.exports = logger;
