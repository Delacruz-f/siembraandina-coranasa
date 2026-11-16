// Configuración de Knex para la CLI (npm run migrate / rollback / seed).
// Toda la configuración viene de src/config/env.js, que valida el .env.
const path = require("path");
const env = require("./src/config/env");

const configuracion = {
  client: env.db.client,
  connection: env.db.connection,
  pool: { min: 0, max: env.db.poolMax },
  migrations: {
    directory: path.join(__dirname, "migrations"),
    tableName: "migraciones",
    // Nombres de migración con fecha y descripción: 20260101000000_crear_usuarios.js
    loadExtensions: [".js"],
  },
  seeds: {
    directory: path.join(__dirname, "seeds"),
    loadExtensions: [".js"],
  },
};

module.exports = {
  development: configuracion,
  test: configuracion,
  production: configuracion,
};
