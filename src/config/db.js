// Conexión única a la base de datos (Knex).
// Solo los repositories deben importar este módulo; el resto de capas
// (controllers, services, routes) nunca toca la base de datos directamente.
const knex = require("knex");
const env = require("./env");
const logger = require("./logger");

const db = knex({
  client: env.db.client,
  connection: env.db.connection,
  pool: {
    min: 0,
    max: 10,
  },
  // En desarrollo ayuda a depurar; en producción no se registra SQL.
  debug: false,
  asyncStackTraces: !env.esProduccion,
  // Si la base no está disponible, la petición falla rápido en lugar de
  // esperar indefinidamente (el pool de pg reintenta por su cuenta).
  acquireConnectionTimeout: env.db.tiempoConexionMs,
});

// Un error del pool no debe tumbar el proceso: se registra y se sigue.
db.on("query-error", (error, obj) => {
  logger.error(
    { err: error, sql: obj && obj.sql },
    "Error al ejecutar una consulta",
  );
});

/** Comprueba que la base de datos responde. Devuelve true/false. */
async function comprobarConexion() {
  try {
    await db.raw("select 1 as ok");
    return true;
  } catch (error) {
    logger.error({ err: error }, "No se pudo conectar a la base de datos");
    return false;
  }
}

/** Cierra el pool (se usa al apagar el servidor y en las pruebas). */
async function cerrarConexion() {
  await db.destroy();
}

module.exports = { db, comprobarConexion, cerrarConexion };
