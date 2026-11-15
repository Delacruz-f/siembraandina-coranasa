const { crearTabla } = require("../src/utils/migraciones");

exports.up = async function up(knex) {
  await knex.schema.alterTable("cultivos", (tabla) => {
    tabla.integer("dias_ciclo").unsigned().nullable();
    tabla.boolean("ciclo_referencial").notNullable().defaultTo(false);
    tabla.text("ciclo_fuente").nullable();
  });

  await crearTabla(knex, "consulta_publica", (tabla) => {
    tabla.increments("id").primary();
    tabla
      .integer("distrito_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("distritos")
      .onDelete("SET NULL");
    tabla
      .integer("cultivo_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("cultivos")
      .onDelete("SET NULL");
    tabla.json("ventanas_sugeridas").notNullable();
    tabla.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    tabla.index(
      ["distrito_id", "created_at"],
      "idx_consulta_publica_distrito_fecha",
    );
    tabla.index(
      ["cultivo_id", "created_at"],
      "idx_consulta_publica_cultivo_fecha",
    );
  });

  await knex.schema.alterTable("consultas", (tabla) => {
    tabla
      .integer("consulta_publica_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("consulta_publica")
      .onDelete("SET NULL");
    tabla.unique(["consulta_publica_id"], "uq_consultas_consulta_publica");
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable("consultas", (tabla) => {
    tabla.dropUnique(
      ["consulta_publica_id"],
      "uq_consultas_consulta_publica",
    );
    tabla.dropForeign(["consulta_publica_id"]);
    tabla.dropColumn("consulta_publica_id");
  });
  await knex.schema.dropTableIfExists("consulta_publica");
  await knex.schema.alterTable("cultivos", (tabla) => {
    tabla.dropColumn("ciclo_fuente");
    tabla.dropColumn("ciclo_referencial");
    tabla.dropColumn("dias_ciclo");
  });
};
