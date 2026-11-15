const { crearTabla } = require("../src/utils/migraciones");

function agregarTiempos(tabla, knex) {
  tabla.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
  tabla.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
}

exports.up = async function up(knex) {
  const duplicadas = await knex("lecturas")
    .select("parcela_id", "fuente_id", "fecha")
    .count({ total: "id" })
    .groupBy("parcela_id", "fuente_id", "fecha")
    .havingRaw("count(*) > 1")
    .limit(1);
  if (duplicadas.length) {
    throw new Error(
      "No se puede aplicar la migración de Fase 9: existen lecturas duplicadas por parcela, fuente y fecha. Corrige esos duplicados y vuelve a migrar.",
    );
  }
  await knex.schema.alterTable("lecturas", (tabla) => {
    tabla.unique(
      ["parcela_id", "fuente_id", "fecha"],
      "uq_lecturas_parcela_fuente_fecha",
    );
  });

  await crearTabla(knex, "estados_jobs", (tabla) => {
    tabla.increments("id").primary();
    tabla.string("clave", 20).notNullable().unique();
    tabla.string("nombre", 50).notNullable();
    agregarTiempos(tabla, knex);
  });

  await crearTabla(knex, "ejecuciones_jobs", (tabla) => {
    tabla.increments("id").primary();
    tabla.string("trabajo", 60).notNullable();
    tabla
      .integer("estado_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("estados_jobs")
      .onDelete("RESTRICT");
    tabla
      .integer("ejecutado_por")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("usuarios")
      .onDelete("SET NULL");
    tabla.string("origen", 20).notNullable();
    tabla.timestamp("iniciado_en").notNullable();
    tabla.timestamp("finalizado_en").nullable();
    tabla.text("resultado").nullable();
    tabla.text("error").nullable();
    agregarTiempos(tabla, knex);
    tabla.index(["trabajo", "iniciado_en"], "idx_ejecuciones_jobs_trabajo_fecha");
    tabla.index(["estado_id"], "idx_ejecuciones_jobs_estado");
    tabla.index(["ejecutado_por"], "idx_ejecuciones_jobs_usuario");
  });

  await crearTabla(knex, "sincronizaciones_parcela", (tabla) => {
    tabla.increments("id").primary();
    tabla
      .integer("parcela_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("parcelas")
      .onDelete("CASCADE");
    tabla
      .integer("fuente_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("fuentes_datos")
      .onDelete("RESTRICT");
    tabla.boolean("exitosa").notNullable().defaultTo(false);
    tabla.timestamp("consultado_en").notNullable();
    tabla.date("fecha_ultimo_dato").nullable();
    tabla.string("error_resumido", 500).nullable();
    agregarTiempos(tabla, knex);
    tabla.unique(["parcela_id", "fuente_id"], "uq_sincronizaciones_parcela_fuente");
    tabla.index(["fuente_id", "consultado_en"], "idx_sincronizaciones_fuente_fecha");
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("sincronizaciones_parcela");
  await knex.schema.dropTableIfExists("ejecuciones_jobs");
  await knex.schema.dropTableIfExists("estados_jobs");
  await knex.schema.alterTable("lecturas", (tabla) => {
    tabla.dropUnique(
      ["parcela_id", "fuente_id", "fecha"],
      "uq_lecturas_parcela_fuente_fecha",
    );
  });
};
