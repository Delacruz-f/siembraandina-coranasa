const { crearTabla } = require("../src/utils/migraciones");

exports.up = async function up(knex) {
  await knex.schema.alterTable("usuarios", (t) => {
    t.timestamp("email_verificado_en").nullable();
    t.integer("fallos_ingreso").notNullable().defaultTo(0);
    t.timestamp("bloqueado_hasta").nullable();
  });
  await knex("usuarios").update({ email_verificado_en: knex.fn.now() });

  await crearTabla(knex, "tokens_verificacion", (t) => {
    t.increments("id").primary();
    t.integer("usuario_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("usuarios")
      .onDelete("CASCADE");
    t.string("token_hash", 64).notNullable().unique();
    t.timestamp("expira_en").notNullable();
    t.timestamp("usado_en").nullable();
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
    t.index(["usuario_id", "expira_en"], "idx_tokens_verificacion_usuario");
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("tokens_verificacion");
  await knex.schema.alterTable("usuarios", (t) => {
    t.dropColumn("email_verificado_en");
    t.dropColumn("fallos_ingreso");
    t.dropColumn("bloqueado_hasta");
  });
};
