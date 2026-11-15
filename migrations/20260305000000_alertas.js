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
  await crearTabla(knex, "tipos_alerta", (t) => {
    t.increments("id").primary();
    t.string("clave", 40).notNullable().unique();
    t.string("nombre", 80).notNullable();
    agregarTiempos(t, knex);
  });
  await crearTabla(knex, "estados_alerta", (t) => {
    t.increments("id").primary();
    t.string("clave", 30).notNullable().unique();
    t.string("nombre", 80).notNullable();
    agregarTiempos(t, knex);
  });
  await crearTabla(knex, "metricas_alerta", (t) => {
    t.increments("id").primary();
    t.string("clave", 40).notNullable().unique();
    t.string("nombre", 80).notNullable();
    agregarTiempos(t, knex);
  });
  await crearTabla(knex, "operadores_alerta", (t) => {
    t.increments("id").primary();
    t.string("clave", 10).notNullable().unique();
    t.string("nombre", 40).notNullable();
    agregarTiempos(t, knex);
  });
  await crearTabla(knex, "alerta_reglas", (t) => {
    t.increments("id").primary();
    t.integer("tipo_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("tipos_alerta")
      .onDelete("RESTRICT");
    t.integer("metrica_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("metricas_alerta")
      .onDelete("RESTRICT");
    t.integer("operador_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("operadores_alerta")
      .onDelete("RESTRICT");
    t.integer("cultivo_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("cultivos")
      .onDelete("SET NULL");
    t.integer("zona_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("zonas_altitudinales")
      .onDelete("SET NULL");
    t.string("nombre", 120).notNullable();
    t.text("descripcion").nullable();
    t.decimal("umbral", 8, 2).notNullable();
    t.boolean("activa").notNullable().defaultTo(true);
    agregarTiempos(t, knex);
    t.index(["tipo_id"], "idx_alerta_reglas_tipo");
    t.index(["metrica_id"], "idx_alerta_reglas_metrica");
    t.index(["operador_id"], "idx_alerta_reglas_operador");
    t.index(["cultivo_id"], "idx_alerta_reglas_cultivo");
    t.index(["zona_id"], "idx_alerta_reglas_zona");
  });
  await crearTabla(knex, "alertas", (t) => {
    t.increments("id").primary();
    t.integer("regla_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("alerta_reglas")
      .onDelete("RESTRICT");
    t.integer("parcela_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("parcelas")
      .onDelete("CASCADE");
    t.integer("lectura_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("lecturas")
      .onDelete("SET NULL");
    t.integer("estado_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("estados_alerta")
      .onDelete("RESTRICT");
    t.string("mensaje", 500).notNullable();
    t.timestamp("fecha").notNullable();
    t.timestamp("resuelta_en").nullable();
    agregarTiempos(t, knex);
    t.index(["parcela_id", "estado_id", "fecha"], "idx_alertas_parcela_estado");
    t.index(["regla_id"], "idx_alertas_regla");
    t.index(["lectura_id"], "idx_alertas_lectura");
    t.index(["estado_id"], "idx_alertas_estado");
  });
  await crearTabla(knex, "tipos_notificacion", (t) => {
    t.increments("id").primary();
    t.string("clave", 40).notNullable().unique();
    t.string("nombre", 80).notNullable();
    agregarTiempos(t, knex);
  });
  await crearTabla(knex, "notificaciones", (t) => {
    t.increments("id").primary();
    t.integer("usuario_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("usuarios")
      .onDelete("CASCADE");
    t.integer("tipo_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("tipos_notificacion")
      .onDelete("RESTRICT");
    t.integer("alerta_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("alertas")
      .onDelete("SET NULL");
    t.boolean("leida").notNullable().defaultTo(false);
    t.text("mensaje").notNullable();
    agregarTiempos(t, knex);
    t.index(["usuario_id", "leida", "created_at"], "idx_notif_usuario_leida");
    t.index(["tipo_id"], "idx_notificaciones_tipo");
    t.index(["alerta_id"], "idx_notificaciones_alerta");
  });
};

exports.down = async function down(knex) {
  for (const tabla of [
    "notificaciones",
    "tipos_notificacion",
    "alertas",
    "alerta_reglas",
    "operadores_alerta",
    "metricas_alerta",
    "estados_alerta",
    "tipos_alerta",
  ]) {
    await knex.schema.dropTableIfExists(tabla);
  }
};
