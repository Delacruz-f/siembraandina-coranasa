const {
  crearTabla,
  renombrarTimestamp,
} = require("../src/utils/migraciones");

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
  await knex.schema.renameTable("zonas", "zonas_altitudinales");
  await knex.schema.alterTable("zonas_altitudinales", (t) => {
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
  });
  await knex.schema.alterTable("cultivos", (t) => {
    t.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
  });
  await renombrarTimestamp(knex, "cultivos", "creado_en", "created_at");
  await knex.schema.alterTable("cultivo_requerimientos", (t) => {
    t.renameColumn("humedad_min", "hum_min");
    t.renameColumn("humedad_max", "hum_max");
    t.renameColumn("temperatura_min", "temp_min");
    t.renameColumn("temperatura_max", "temp_max");
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    t.index(["zona_id"], "idx_requerimientos_zona");
    t.index(["validado_por"], "idx_requerimientos_validador");
  });
  await renombrarTimestamp(
    knex,
    "cultivo_requerimientos",
    "actualizado_en",
    "updated_at",
  );
  await knex.schema.alterTable("calendario_tradicional", (t) => {
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    t.index(["zona_id"], "idx_calendario_zona");
    t.index(["validado_por"], "idx_calendario_validador");
  });
  await renombrarTimestamp(
    knex,
    "calendario_tradicional",
    "actualizado_en",
    "updated_at",
  );

  await crearTabla(knex, "variedades", (t) => {
    t.increments("id").primary();
    t.string("nombre", 100).notNullable();
    t.string("slug", 100).notNullable().unique();
    t.text("descripcion").nullable();
    t.boolean("activa").notNullable().defaultTo(true);
    agregarTiempos(t, knex);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("variedades");
  await knex.schema.alterTable("calendario_tradicional", (t) =>
    t.dropForeign(["zona_id"]),
  );
  await knex.schema.alterTable("calendario_tradicional", (t) =>
    t.dropForeign(["validado_por"]),
  );
  await knex.schema.alterTable("cultivo_requerimientos", (t) =>
    t.dropForeign(["zona_id"]),
  );
  await knex.schema.alterTable("cultivo_requerimientos", (t) =>
    t.dropForeign(["validado_por"]),
  );
  await knex.schema.alterTable("calendario_tradicional", (t) => {
    t.dropIndex(["zona_id"], "idx_calendario_zona");
    t.dropIndex(["validado_por"], "idx_calendario_validador");
    t.dropColumn("created_at");
  });
  await renombrarTimestamp(
    knex,
    "calendario_tradicional",
    "updated_at",
    "actualizado_en",
  );
  await knex.schema.alterTable("cultivo_requerimientos", (t) => {
    t.dropIndex(["zona_id"], "idx_requerimientos_zona");
    t.dropIndex(["validado_por"], "idx_requerimientos_validador");
    t.dropColumn("created_at");
    t.renameColumn("hum_min", "humedad_min");
    t.renameColumn("hum_max", "humedad_max");
    t.renameColumn("temp_min", "temperatura_min");
    t.renameColumn("temp_max", "temperatura_max");
  });
  await renombrarTimestamp(
    knex,
    "cultivo_requerimientos",
    "updated_at",
    "actualizado_en",
  );
  await knex.schema.alterTable("calendario_tradicional", (t) => {
    t.foreign("zona_id")
      .references("id")
      .inTable("zonas_altitudinales")
      .onDelete("CASCADE");
  });
  await knex.schema.alterTable("cultivo_requerimientos", (t) => {
    t.foreign("zona_id")
      .references("id")
      .inTable("zonas_altitudinales")
      .onDelete("CASCADE");
    t.foreign("validado_por")
      .references("id")
      .inTable("usuarios")
      .onDelete("SET NULL");
  });
  await knex.schema.alterTable("calendario_tradicional", (t) => {
    t.foreign("validado_por")
      .references("id")
      .inTable("usuarios")
      .onDelete("SET NULL");
  });
  await knex.schema.alterTable("cultivos", (t) => {
    t.dropColumn("updated_at");
  });
  await renombrarTimestamp(knex, "cultivos", "created_at", "creado_en");
  await knex.schema.alterTable("zonas_altitudinales", (t) => {
    t.dropColumn("created_at");
    t.dropColumn("updated_at");
  });
  await knex.schema.renameTable("zonas_altitudinales", "zonas");
};
