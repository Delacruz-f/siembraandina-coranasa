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
  await knex.schema.alterTable("parcelas", (t) => {
    t.integer("distrito_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("distritos")
      .onDelete("SET NULL");
    t.index(["distrito_id"], "idx_parcelas_distrito");
  });

  await knex.schema.alterTable("perfiles", (t) => {
    t.integer("foto_archivo_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("archivos")
      .onDelete("SET NULL");
    t.index(["foto_archivo_id"], "idx_perfiles_foto");
  });

  await crearTabla(knex, "preferencias_notificacion", (t) => {
    t.increments("id").primary();
    t.integer("usuario_id")
      .unsigned()
      .notNullable()
      .unique()
      .references("id")
      .inTable("usuarios")
      .onDelete("CASCADE");
    t.boolean("correo_alertas").notNullable().defaultTo(true);
    t.boolean("avisos_panel").notNullable().defaultTo(true);
    t.boolean("resumen_semanal").notNullable().defaultTo(false);
    agregarTiempos(t, knex);
  });
  const usuarios = await knex("usuarios").select("id");
  for (const usuario of usuarios) {
    await knex("preferencias_notificacion")
      .insert({ usuario_id: usuario.id })
      .onConflict("usuario_id")
      .ignore();
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("preferencias_notificacion");
  await knex.schema.alterTable("perfiles", (t) => {
    t.dropForeign(["foto_archivo_id"]);
    t.dropIndex(["foto_archivo_id"], "idx_perfiles_foto");
    t.dropColumn("foto_archivo_id");
  });
  await knex.schema.alterTable("parcelas", (t) => {
    t.dropForeign(["distrito_id"]);
    t.dropIndex(["distrito_id"], "idx_parcelas_distrito");
    t.dropColumn("distrito_id");
  });
};
