// Migración inicial: solo la tabla de sesiones.
// El resto del esquema se crea en las migraciones de la Fase 2, que definen
// roles, permisos, usuarios, cultivos, parcelas y lecturas.
// Compatible con MySQL 8 (mysql2) y PostgreSQL 15 (pg): solo se usa el
// constructor de esquemas de Knex, sin SQL específico de un motor.
const { crearTabla } = require("../src/utils/migraciones");

exports.up = async function up(knex) {
  // Tabla de sesiones que usa connect-session-knex (createTable: false).
  await crearTabla(knex, "sesiones", (t) => {
    t.string("sid", 255).notNullable().primary();
    t.text("sess").notNullable();
    t.timestamp("expired").notNullable();
    t.index(["expired"], "idx_sesiones_expired");
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("sesiones");
};
