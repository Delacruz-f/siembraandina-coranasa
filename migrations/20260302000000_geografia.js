const { crearTabla } = require("../src/utils/migraciones");

function agregarTiempos(tabla, knex) {
  tabla
    .timestamp("created_at")
    .notNullable()
    .defaultTo(knex.fn.now());
  tabla
    .timestamp("updated_at")
    .notNullable()
    .defaultTo(knex.fn.now());
}

exports.up = async function up(knex) {
  await crearTabla(knex, "departamentos", (t) => {
    t.increments("id").primary();
    t.string("codigo", 2).notNullable().unique();
    t.string("nombre", 80).notNullable().unique();
    agregarTiempos(t, knex);
  });

  await crearTabla(knex, "provincias", (t) => {
    t.increments("id").primary();
    t.integer("departamento_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("departamentos")
      .onDelete("RESTRICT");
    t.string("nombre", 100).notNullable();
    agregarTiempos(t, knex);
    t.unique(["departamento_id", "nombre"]);
    t.index(["departamento_id"], "idx_provincias_departamento");
  });

  await crearTabla(knex, "distritos", (t) => {
    t.increments("id").primary();
    t.integer("provincia_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("provincias")
      .onDelete("RESTRICT");
    t.string("nombre", 100).notNullable();
    agregarTiempos(t, knex);
    t.unique(["provincia_id", "nombre"]);
    t.index(["provincia_id"], "idx_distritos_provincia");
  });

  await crearTabla(knex, "comunidades", (t) => {
    t.increments("id").primary();
    t.integer("distrito_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("distritos")
      .onDelete("RESTRICT");
    t.string("nombre", 120).notNullable();
    t.decimal("latitud", 9, 6).nullable();
    t.decimal("longitud", 9, 6).nullable();
    agregarTiempos(t, knex);
    t.unique(["distrito_id", "nombre"]);
    t.index(["distrito_id"], "idx_comunidades_distrito");
  });
};

exports.down = async function down(knex) {
  for (const tabla of [
    "comunidades",
    "distritos",
    "provincias",
    "departamentos",
  ]) {
    await knex.schema.dropTableIfExists(tabla);
  }
};
