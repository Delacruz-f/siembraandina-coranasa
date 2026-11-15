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
  await crearTabla(knex, "estados_campania", (t) => {
    t.increments("id").primary();
    t.string("clave", 30).notNullable().unique();
    t.string("nombre", 80).notNullable();
    agregarTiempos(t, knex);
  });
  await knex("estados_campania").insert({
    clave: "activa",
    nombre: "Activa",
  });

  await crearTabla(knex, "unidades_medida", (t) => {
    t.increments("id").primary();
    t.string("clave", 20).notNullable().unique();
    t.string("nombre", 60).notNullable();
    agregarTiempos(t, knex);
  });

  await crearTabla(knex, "cultivo_variedades", (t) => {
    t.increments("id").primary();
    t.integer("cultivo_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("cultivos")
      .onDelete("CASCADE");
    t.integer("variedad_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("variedades")
      .onDelete("CASCADE");
    agregarTiempos(t, knex);
    t.unique(["cultivo_id", "variedad_id"]);
    t.index(["variedad_id"], "idx_cultivo_variedades_variedad");
  });

  await crearTabla(knex, "campanias", (t) => {
    t.increments("id").primary();
    t.integer("parcela_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("parcelas")
      .onDelete("CASCADE");
    t.integer("cultivo_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("cultivos")
      .onDelete("RESTRICT");
    t.integer("variedad_id").unsigned().nullable();
    t.integer("estado_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("estados_campania")
      .onDelete("RESTRICT");
    t.date("fecha_inicio").nullable();
    t.date("fecha_fin").nullable();
    agregarTiempos(t, knex);
    t.index(["parcela_id", "estado_id"], "idx_campanias_parcela_estado");
    t.index(["cultivo_id"], "idx_campanias_cultivo");
    t.index(["variedad_id"], "idx_campanias_variedad");
    t.index(["estado_id"], "idx_campanias_estado");
    t.foreign(["cultivo_id", "variedad_id"])
      .references(["cultivo_id", "variedad_id"])
      .inTable("cultivo_variedades")
      .onDelete("RESTRICT");
  });

  const estadoActiva = await knex("estados_campania")
    .where({ clave: "activa" })
    .first();
  const parcelasExistentes = await knex("parcelas").select(
    "id",
    "cultivo_id",
  );
  for (const parcela of parcelasExistentes) {
    await knex("campanias").insert({
      parcela_id: parcela.id,
      cultivo_id: parcela.cultivo_id,
      estado_id: estadoActiva.id,
    });
  }

  await knex.schema.alterTable("parcelas", (t) => {
    t.dropForeign(["cultivo_id"]);
    t.dropColumn("cultivo_id");
    t.integer("comunidad_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("comunidades")
      .onDelete("SET NULL");
    t.timestamp("deleted_at").nullable();
    t.index(["zona_id"], "idx_parcelas_zona");
    t.index(["comunidad_id"], "idx_parcelas_comunidad");
    t.index(["deleted_at"], "idx_parcelas_deleted_at");
  });
  await renombrarTimestamp(knex, "parcelas", "creado_en", "created_at");
  await renombrarTimestamp(
    knex,
    "parcelas",
    "actualizado_en",
    "updated_at",
  );

  await knex.schema.renameTable("fuentes_lectura", "fuentes_datos");
  await knex("fuentes_datos")
    .where({ clave: "nasa" })
    .update({ clave: "nasa_power", nombre: "NASA POWER" });
  await knex("fuentes_datos")
    .where({ clave: "sensor" })
    .update({ clave: "smap", nombre: "SMAP" });
  await knex.schema.alterTable("fuentes_datos", (t) =>
    agregarTiempos(t, knex),
  );

  await knex.schema.alterTable("lecturas", (t) => {
    t.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
    t.index(["fuente_id"], "idx_lecturas_fuente");
    t.index(["registrado_por"], "idx_lecturas_registrado_por");
  });
  await renombrarTimestamp(knex, "lecturas", "creado_en", "created_at");
  await knex.schema.alterTable("accesos_parcela", (t) => {
    agregarTiempos(t, knex);
    t.index(["tecnico_id"], "idx_accesos_tecnico");
    t.index(["otorgado_por"], "idx_accesos_otorgado_por");
  });
  await knex("accesos_parcela").update({
    created_at: knex.ref("otorgado_en"),
  });

  await crearTabla(knex, "siembras", (t) => {
    t.increments("id").primary();
    t.integer("campania_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("campanias")
      .onDelete("CASCADE");
    t.date("fecha").notNullable();
    t.string("metodo", 100).nullable();
    t.text("observaciones").nullable();
    agregarTiempos(t, knex);
    t.index(["campania_id", "fecha"], "idx_siembras_campania_fecha");
  });

  await crearTabla(knex, "cosechas", (t) => {
    t.increments("id").primary();
    t.integer("campania_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("campanias")
      .onDelete("CASCADE");
    t.integer("unidad_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("unidades_medida")
      .onDelete("RESTRICT");
    t.date("fecha").notNullable();
    t.decimal("cantidad", 12, 3).notNullable();
    t.text("observaciones").nullable();
    agregarTiempos(t, knex);
    t.index(["campania_id", "fecha"], "idx_cosechas_campania_fecha");
    t.index(["unidad_id"], "idx_cosechas_unidad");
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("cosechas");
  await knex.schema.dropTableIfExists("siembras");

  await knex.schema.alterTable("parcelas", (t) => {
    t.integer("cultivo_id").unsigned().nullable();
  });
  const parcelas = await knex("parcelas").select("id");
  for (const parcela of parcelas) {
    const campania = await knex("campanias")
      .where({ parcela_id: parcela.id })
      .orderBy("id", "asc")
      .first();
    if (campania) {
      await knex("parcelas")
        .where({ id: parcela.id })
        .update({ cultivo_id: campania.cultivo_id });
    }
  }
  await knex.schema.alterTable("parcelas", (t) => {
    t.integer("cultivo_id").unsigned().notNullable().alter();
    t.foreign("cultivo_id")
      .references("id")
      .inTable("cultivos")
      .onDelete("RESTRICT");
  });
  await knex.schema.alterTable("parcelas", (t) => {
    t.dropForeign(["zona_id"]);
    t.dropForeign(["comunidad_id"]);
  });
  await knex.schema.alterTable("parcelas", (t) => {
    t.dropIndex(["zona_id"], "idx_parcelas_zona");
    t.dropIndex(["comunidad_id"], "idx_parcelas_comunidad");
    t.dropIndex(["deleted_at"], "idx_parcelas_deleted_at");
    t.dropColumn("comunidad_id");
    t.dropColumn("deleted_at");
  });
  await knex.schema.alterTable("parcelas", (t) => {
    t.foreign("zona_id")
      .references("id")
      .inTable("zonas_altitudinales")
      .onDelete("RESTRICT");
  });
  await renombrarTimestamp(knex, "parcelas", "created_at", "creado_en");
  await renombrarTimestamp(
    knex,
    "parcelas",
    "updated_at",
    "actualizado_en",
  );

  await knex.schema.dropTableIfExists("campanias");
  await knex.schema.dropTableIfExists("cultivo_variedades");
  await knex.schema.dropTableIfExists("unidades_medida");
  await knex.schema.dropTableIfExists("estados_campania");

  await knex.schema.alterTable("accesos_parcela", (t) => {
    t.dropForeign(["tecnico_id"]);
    t.dropForeign(["otorgado_por"]);
  });
  await knex.schema.alterTable("accesos_parcela", (t) => {
    t.dropIndex(["tecnico_id"], "idx_accesos_tecnico");
    t.dropIndex(["otorgado_por"], "idx_accesos_otorgado_por");
    t.dropColumn("created_at");
    t.dropColumn("updated_at");
  });
  await knex.schema.alterTable("accesos_parcela", (t) => {
    t.foreign("tecnico_id")
      .references("id")
      .inTable("usuarios")
      .onDelete("CASCADE");
    t.foreign("otorgado_por")
      .references("id")
      .inTable("usuarios")
      .onDelete("SET NULL");
  });
  await knex.schema.alterTable("lecturas", (t) => {
    t.dropForeign(["fuente_id"]);
    t.dropForeign(["registrado_por"]);
  });
  await knex.schema.alterTable("lecturas", (t) => {
    t.dropIndex(["fuente_id"], "idx_lecturas_fuente");
    t.dropIndex(["registrado_por"], "idx_lecturas_registrado_por");
    t.dropColumn("updated_at");
  });
  await knex.schema.alterTable("lecturas", (t) => {
    t.foreign("fuente_id")
      .references("id")
      .inTable("fuentes_datos")
      .onDelete("RESTRICT");
    t.foreign("registrado_por")
      .references("id")
      .inTable("usuarios")
      .onDelete("SET NULL");
  });
  await renombrarTimestamp(knex, "lecturas", "created_at", "creado_en");
  await knex.schema.alterTable("fuentes_datos", (t) => {
    t.dropColumn("created_at");
    t.dropColumn("updated_at");
  });
  await knex.schema.renameTable("fuentes_datos", "fuentes_lectura");
  await knex("fuentes_lectura")
    .where({ clave: "nasa_power" })
    .update({ clave: "nasa", nombre: "NASA POWER" });
  await knex("fuentes_lectura")
    .where({ clave: "smap" })
    .update({ clave: "sensor", nombre: "Sensor en campo" });
};
