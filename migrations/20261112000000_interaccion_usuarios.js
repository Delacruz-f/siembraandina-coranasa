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
  await crearTabla(knex, "tipos_umbral", (t) => {
    t.increments("id").primary();
    t.string("clave", 40).notNullable().unique();
    t.string("nombre", 80).notNullable();
    agregarTiempos(t, knex);
  });

  await crearTabla(knex, "estados_reporte", (t) => {
    t.increments("id").primary();
    t.string("clave", 30).notNullable().unique();
    t.string("nombre", 80).notNullable();
    agregarTiempos(t, knex);
  });

  await knex.schema.alterTable("comentarios", (t) => {
    t.timestamp("deleted_at").nullable();
    t.index(["deleted_at"], "idx_comentarios_deleted_at");
  });

  await knex.schema.alterTable("consultas", (t) => {
    t.integer("distrito_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("distritos")
      .onDelete("RESTRICT");
    t.integer("cultivo_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("cultivos")
      .onDelete("SET NULL");
    t.index(["distrito_id", "estado_id"], "idx_consultas_distrito_estado");
    t.index(["cultivo_id"], "idx_consultas_cultivo");
  });

  await knex.schema.alterTable("notificaciones", (t) => {
    t.integer("consulta_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("consultas")
      .onDelete("SET NULL");
    t.index(["consulta_id"], "idx_notificaciones_consulta");
  });

  await knex.schema.alterTable("alerta_reglas", (t) => {
    t.string("clave", 100).nullable();
    t.integer("umbral_tipo_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("tipos_umbral")
      .onDelete("RESTRICT");
    t.integer("persistencia_dias").unsigned().notNullable().defaultTo(1);
    t.integer("horizonte_horas").unsigned().nullable();
    t.boolean("critica").notNullable().defaultTo(false);
    t.unique(["clave"], "uq_alerta_reglas_clave");
    t.index(["umbral_tipo_id"], "idx_alerta_reglas_umbral_tipo");
  });

  await crearTabla(knex, "reportes_comentarios", (t) => {
    t.increments("id").primary();
    t.integer("comentario_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("comentarios")
      .onDelete("CASCADE");
    t.integer("usuario_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("usuarios")
      .onDelete("CASCADE");
    t.integer("estado_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("estados_reporte")
      .onDelete("RESTRICT");
    t.integer("gestionado_por")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("usuarios")
      .onDelete("SET NULL");
    t.string("motivo", 80).notNullable();
    t.text("detalle").nullable();
    t.timestamp("gestionado_en").nullable();
    agregarTiempos(t, knex);
    t.unique(["comentario_id", "usuario_id"]);
    t.index(["estado_id", "created_at"], "idx_reportes_estado_fecha");
    t.index(["gestionado_por"], "idx_reportes_gestionado_por");
  });

  await crearTabla(knex, "reacciones_cultivos", (t) => {
    t.increments("id").primary();
    t.integer("cultivo_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("cultivos")
      .onDelete("CASCADE");
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
      .inTable("tipos_reaccion")
      .onDelete("RESTRICT");
    agregarTiempos(t, knex);
    t.unique(["cultivo_id", "usuario_id"]);
    t.index(["usuario_id"], "idx_reacciones_cultivos_usuario");
    t.index(["tipo_id"], "idx_reacciones_cultivos_tipo");
  });

  await crearTabla(knex, "favoritos_cultivos", (t) => {
    t.increments("id").primary();
    t.integer("cultivo_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("cultivos")
      .onDelete("CASCADE");
    t.integer("usuario_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("usuarios")
      .onDelete("CASCADE");
    agregarTiempos(t, knex);
    t.unique(["cultivo_id", "usuario_id"]);
    t.index(["usuario_id"], "idx_favoritos_cultivos_usuario");
  });

  await crearTabla(knex, "tecnico_distritos", (t) => {
    t.increments("id").primary();
    t.integer("tecnico_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("usuarios")
      .onDelete("CASCADE");
    t.integer("distrito_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("distritos")
      .onDelete("CASCADE");
    agregarTiempos(t, knex);
    t.unique(["tecnico_id", "distrito_id"]);
    t.index(["distrito_id"], "idx_tecnico_distritos_distrito");
  });

  await crearTabla(knex, "consulta_archivos", (t) => {
    t.increments("id").primary();
    t.integer("consulta_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("consultas")
      .onDelete("CASCADE");
    t.integer("archivo_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("archivos")
      .onDelete("CASCADE");
    agregarTiempos(t, knex);
    t.unique(["consulta_id", "archivo_id"]);
    t.index(["archivo_id"], "idx_consulta_archivos_archivo");
  });

  await crearTabla(knex, "calificaciones_respuestas", (t) => {
    t.increments("id").primary();
    t.integer("respuesta_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("respuestas")
      .onDelete("CASCADE");
    t.integer("usuario_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("usuarios")
      .onDelete("CASCADE");
    t.integer("puntuacion").unsigned().notNullable();
    t.string("comentario", 500).nullable();
    agregarTiempos(t, knex);
    t.unique(["respuesta_id", "usuario_id"]);
    t.index(["usuario_id"], "idx_calificaciones_respuestas_usuario");
  });
};

exports.down = async function down(knex) {
  for (const tabla of [
    "calificaciones_respuestas",
    "consulta_archivos",
    "tecnico_distritos",
    "favoritos_cultivos",
    "reacciones_cultivos",
    "reportes_comentarios",
  ]) {
    await knex.schema.dropTableIfExists(tabla);
  }

  await knex.schema.alterTable("alerta_reglas", (t) => {
    t.dropForeign(["umbral_tipo_id"]);
    t.dropUnique(["clave"], "uq_alerta_reglas_clave");
    t.dropIndex(["umbral_tipo_id"], "idx_alerta_reglas_umbral_tipo");
    t.dropColumn("clave");
    t.dropColumn("umbral_tipo_id");
    t.dropColumn("persistencia_dias");
    t.dropColumn("horizonte_horas");
    t.dropColumn("critica");
  });
  await knex.schema.alterTable("notificaciones", (t) => {
    t.dropForeign(["consulta_id"]);
    t.dropIndex(["consulta_id"], "idx_notificaciones_consulta");
    t.dropColumn("consulta_id");
  });
  await knex.schema.alterTable("consultas", (t) => {
    t.dropForeign(["distrito_id"]);
    t.dropForeign(["cultivo_id"]);
    t.dropIndex(["distrito_id", "estado_id"], "idx_consultas_distrito_estado");
    t.dropIndex(["cultivo_id"], "idx_consultas_cultivo");
    t.dropColumn("distrito_id");
    t.dropColumn("cultivo_id");
  });
  await knex.schema.alterTable("comentarios", (t) => {
    t.dropIndex(["deleted_at"], "idx_comentarios_deleted_at");
    t.dropColumn("deleted_at");
  });
  await knex.schema.dropTableIfExists("estados_reporte");
  await knex.schema.dropTableIfExists("tipos_umbral");
};
