// Fase 2 — Cultivos, requerimientos por zona y calendario tradicional.
// - cultivos: catálogo (papa, maíz, quinua...).
// - zonas: valle, quechua alta, puna.
// - cultivo_requerimientos: rangos de humedad (%) y temperatura (°C) por cultivo y zona.
//   Incluye validado / fuente / validado_por para que un técnico los confirme.
// - calendario_tradicional: ventana de siembra (mes 1..12) por cultivo y zona,
//   con los mismos campos de validación.
exports.up = async function up(knex) {
  await knex.schema.createTable("cultivos", (t) => {
    t.increments("id").primary();
    t.string("nombre", 60).notNullable();
    t.string("slug", 60).notNullable().unique();
    t.string("descripcion", 255).nullable();
    t.boolean("activo").notNullable().defaultTo(true);
    t.timestamp("creado_en").notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("zonas", (t) => {
    t.increments("id").primary();
    t.string("clave", 20).notNullable().unique();
    t.string("nombre", 80).notNullable();
    t.integer("altitud_min_m").nullable();
    t.integer("altitud_max_m").nullable();
    t.integer("orden").notNullable().defaultTo(0);
  });

  await knex.schema.createTable("cultivo_requerimientos", (t) => {
    t.increments("id").primary();
    t.integer("cultivo_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("cultivos")
      .onDelete("CASCADE");
    t.integer("zona_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("zonas")
      .onDelete("CASCADE");
    // Humedad del suelo en % volumétrico aproximado.
    t.decimal("humedad_min", 5, 1).notNullable();
    t.decimal("humedad_max", 5, 1).notNullable();
    // Temperatura del suelo en °C.
    t.decimal("temperatura_min", 4, 1).notNullable();
    t.decimal("temperatura_max", 4, 1).notNullable();
    t.boolean("validado").notNullable().defaultTo(false);
    t.text("fuente").nullable();
    t.integer("validado_por")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("usuarios")
      .onDelete("SET NULL");
    t.timestamp("validado_en").nullable();
    t.timestamp("actualizado_en").notNullable().defaultTo(knex.fn.now());
    t.unique(["cultivo_id", "zona_id"]);
  });

  await knex.schema.createTable("calendario_tradicional", (t) => {
    t.increments("id").primary();
    t.integer("cultivo_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("cultivos")
      .onDelete("CASCADE");
    t.integer("zona_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("zonas")
      .onDelete("CASCADE");
    // Meses del 1 (enero) al 12 (diciembre).
    t.integer("mes_inicio").notNullable();
    t.integer("mes_fin").notNullable();
    t.boolean("validado").notNullable().defaultTo(false);
    t.text("fuente").nullable();
    t.integer("validado_por")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("usuarios")
      .onDelete("SET NULL");
    t.timestamp("validado_en").nullable();
    t.timestamp("actualizado_en").notNullable().defaultTo(knex.fn.now());
    t.unique(["cultivo_id", "zona_id"]);
  });
};

exports.down = async function down(knex) {
  for (const tabla of [
    "calendario_tradicional",
    "cultivo_requerimientos",
    "zonas",
    "cultivos",
  ]) {
    await knex.schema.dropTableIfExists(tabla);
  }
};
