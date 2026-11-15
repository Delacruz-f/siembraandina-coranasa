// Punto de entrada del servidor: valida la configuración, comprueba la base
// de datos, arranca HTTP y apaga de forma ordenada (SIGINT/SIGTERM).
const env = require("./config/env");
const logger = require("./config/logger");
const { comprobarConexion, cerrarConexion } = require("./config/db");
const { crearApp } = require("./app");
const { iniciarTrabajos } = require("./jobs");

async function iniciar() {
  const app = crearApp();

  const hayBase = await comprobarConexion();
  if (!hayBase) {
    logger.warn(
      `No se pudo conectar a la base de datos (${env.db.client} en ${env.db.connection.host}:${env.db.connection.port}/${env.db.connection.database}). ` +
        "El servidor arranca igualmente; /salud responderá 503 hasta que la base esté disponible.",
    );
  }

  const servidor = app.listen(env.puerto, () => {
    logger.info(
      `Siembra Andina escuchando en http://localhost:${env.puerto} (entorno: ${env.entorno}, motor: ${env.db.client})`,
    );
  });
  const detenerTrabajos = iniciarTrabajos();

  servidor.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      logger.error(
        `El puerto ${env.puerto} ya está en uso. Cambia PORT en el archivo .env o cierra el otro programa.`,
      );
    } else {
      logger.error({ err: error }, "No se pudo iniciar el servidor");
    }
    process.exit(1);
  });

  // Apagado ordenado: deja de aceptar peticiones y cierra el pool de la base.
  let apagando = false;
  async function apagar(senal) {
    if (apagando) return;
    apagando = true;
    detenerTrabajos();
    logger.info(`Recibida señal ${senal}. Cerrando el servidor...`);
    servidor.close(async () => {
      try {
        await cerrarConexion();
      } catch (error) {
        logger.error(
          { err: error },
          "Error al cerrar la conexión a la base de datos",
        );
      }
      logger.info("Servidor cerrado.");
      process.exit(0);
    });
    // Si algo se cuelga, se fuerza la salida a los 10 segundos.
    setTimeout(() => process.exit(1), 10000).unref();
  }

  process.on("SIGINT", () => apagar("SIGINT"));
  process.on("SIGTERM", () => apagar("SIGTERM"));

  return servidor;
}

iniciar().catch((error) => {
  if (error.esErrorDeConfiguracion) {
    // Mensaje claro y sin traza: es un problema del .env, no del código.
    console.error(error.message);
  } else {
    logger.fatal({ err: error }, "No se pudo iniciar Siembra Andina");
  }
  process.exit(1);
});
