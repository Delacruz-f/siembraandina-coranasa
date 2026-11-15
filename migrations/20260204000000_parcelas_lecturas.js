// Fase 2 — Parcelas, lecturas y accesos de técnicos.
// - parcelas: chacras del agricultor (cultivo + zona + ubicación).
// - fuentes_lectura: manual, nasa, open_meteo, sensor.
// - lecturas: humedad y temperatura del suelo; registrado_por es nulo cuando
//   la lectura llega por sincronización automática.
// - accesos_parcela: el agricultor concede (y revoca) acceso a un técnico.
//   Con puede_escribir = true el técnico puede registrar lecturas.
exports.up = async function up(knex) {
  await knex.schema.createTable("parcelas", (t) => {
    t.increments("id").primary();
    t.integer("usuario_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("usuarios")
      .onDelete("CASCADE");
    t.integer("cultivo_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("cultivos")
      .onDelete("RESTRICT");
    t.integer("zona_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("zonas")
      .onDelete("RESTRICT");
    t.string("nombre", 120).notNullable();
    t.decimal("latitud", 9, 6).notNullable();
    t.decimal("longitud", 9, 6).notNullable();
    t.decimal("altitud_m", 6, 0).nullable();
    t.decimal("area_hectareas", 8, 2).nullable();
    t.text("notas").nullable();
    t.boolean("activa").notNullable().defaultTo(true);
    t.timestamp("creado_en").notNullable().defaultTo(knex.fn.now());
    t.timestamp("actualizado_en").notNullable().defaultTo(knex.fn.now());
    t.index(["usuario_id"], "idx_parcelas_usuario");
  });

  await knex.schema.createTable("fuentes_lectura", (t) => {
    t.increments("id").primary();
    t.string("clave", 20).notNullable().unique();
    t.string("nombre", 60).notNullable();
    t.boolean("es_automatica").notNullable().defaultTo(false);
  });

  await knex.schema.createTable("lecturas", (t) => {
    t.increments("id").primary();
    t.integer("parcela_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("parcelas")
      .onDelete("CASCADE");
    t.integer("fuente_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("fuentes_lectura")
      .onDelete("RESTRICT");
    // Nulo cuando la lectura es automática (NASA POWER, Open-Meteo, sensor).
    t.integer("registrado_por")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("usuarios")
      .onDelete("SET NULL");
    t.date("fecha").notNullable();
    t.decimal("humedad", 5, 1).notNullable();
    t.decimal("temperatura", 4, 1).notNullable();
    t.text("observacion").nullable();
    t.timestamp("creado_en").notNullable().defaultTo(knex.fn.now());
    t.index(["parcela_id", "fecha"], "idx_lecturas_parcela_fecha");
  });

  await knex.schema.createTable("accesos_parcela", (t) => {
    t.increments("id").primary();
    t.integer("parcela_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("parcelas")
      .onDelete("CASCADE");
    t.integer("tecnico_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("usuarios")
      .onDelete("CASCADE");
    t.boolean("puede_escribir").notNullable().defaultTo(false);
    t.integer("otorgado_por")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("usuarios")
      .onDelete("SET NULL");
    t.timestamp("otorgado_en").notNullable().defaultTo(knex.fn.now());
    t.timestamp("revocado_en").nullable();
    t.index(["parcela_id", "tecnico_id"], "idx_accesos_parcela_tecnico");
  });
};

exports.down = async function down(knex) {
  for (const tabla of [
    "accesos_parcela",
    "lecturas",
    "fuentes_lectura",
    "parcelas",
  ]) {
    await knex.schema.dropTableIfExists(tabla);
  }
};
