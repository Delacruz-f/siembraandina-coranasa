const { crearTabla } = require("../src/utils/migraciones");

function agregarTiempos(tabla, knex) {
  tabla.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
  tabla.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
}

exports.up = async function up(knex) {
  await crearTabla(knex, "tipos_aviso_zona", (tabla) => {
    tabla.increments("id").primary();
    tabla.string("clave", 30).notNullable().unique();
    tabla.string("nombre", 80).notNullable();
    agregarTiempos(tabla, knex);
  });

  await crearTabla(knex, "avisos_zona", (tabla) => {
    tabla.increments("id").primary();
    tabla
      .integer("tecnico_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("usuarios")
      .onDelete("RESTRICT");
    tabla
      .integer("distrito_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("distritos")
      .onDelete("RESTRICT");
    tabla
      .integer("tipo_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("tipos_aviso_zona")
      .onDelete("RESTRICT");
    tabla.string("titulo", 160).notNullable();
    tabla.text("mensaje").notNullable();
    tabla.timestamp("vigente_desde").notNullable().defaultTo(knex.fn.now());
    tabla.timestamp("vigente_hasta").nullable();
    agregarTiempos(tabla, knex);
    tabla.index(["distrito_id", "vigente_desde"], "idx_avisos_distrito_fecha");
    tabla.index(["tecnico_id"], "idx_avisos_tecnico");
  });

  await knex.schema.alterTable("notificaciones", (tabla) => {
    tabla
      .integer("aviso_zona_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("avisos_zona")
      .onDelete("SET NULL");
    tabla.index(["aviso_zona_id"], "idx_notificaciones_aviso_zona");
  });

  await knex.schema.alterTable("mensajes_contacto", (tabla) => {
    tabla.boolean("leido").notNullable().defaultTo(false);
    tabla
      .integer("atendido_por")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("usuarios")
      .onDelete("SET NULL");
    tabla.index(["leido", "created_at"], "idx_mensajes_contacto_leido_fecha");
    tabla.index(["atendido_por"], "idx_mensajes_contacto_atendido_por");
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable("mensajes_contacto", (tabla) => {
    tabla.dropForeign(["atendido_por"]);
    tabla.dropIndex(["leido", "created_at"], "idx_mensajes_contacto_leido_fecha");
    tabla.dropIndex(["atendido_por"], "idx_mensajes_contacto_atendido_por");
    tabla.dropColumn("atendido_por");
    tabla.dropColumn("leido");
  });
  await knex.schema.alterTable("notificaciones", (tabla) => {
    tabla.dropForeign(["aviso_zona_id"]);
    tabla.dropIndex(["aviso_zona_id"], "idx_notificaciones_aviso_zona");
    tabla.dropColumn("aviso_zona_id");
  });
  await knex.schema.dropTableIfExists("avisos_zona");
  await knex.schema.dropTableIfExists("tipos_aviso_zona");
};
