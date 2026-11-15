const { crearTabla } = require("../src/utils/migraciones");

exports.up = async function up(knex) {
  await crearTabla(knex, "mensajes_contacto", (tabla) => {
    tabla.increments("id").primary();
    tabla.string("nombre", 120).notNullable();
    tabla.string("email", 254).notNullable();
    tabla.string("asunto", 160).notNullable();
    tabla.text("mensaje").notNullable();
    tabla
      .timestamp("created_at")
      .notNullable()
      .defaultTo(knex.fn.now());
    tabla
      .timestamp("updated_at")
      .notNullable()
      .defaultTo(knex.fn.now());
    tabla.index(["created_at"], "idx_mensajes_contacto_created_at");
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("mensajes_contacto");
};
