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
  await knex.schema.alterTable("archivos", (t) =>
    t.dropForeign(["subido_por"]),
  );
  await knex.schema.alterTable("archivos", (t) => {
    t.dropIndex(["subido_por"], "idx_archivos_subido_por");
    t.renameColumn("subido_por", "autor_id");
    t.renameColumn("tipo_mime", "mime");
    t.renameColumn("tamano_bytes", "tamano");
    t.integer("ancho").unsigned().nullable();
    t.integer("alto").unsigned().nullable();
    t.string("licencia", 160).nullable();
    t.string("texto_alternativo", 255).nullable();
  });
  await knex.schema.alterTable("archivos", (t) => {
    t.index(["autor_id"], "idx_archivos_autor");
  });
  await knex.schema.alterTable("archivos", (t) => {
    t.foreign("autor_id")
      .references("id")
      .inTable("usuarios")
      .onDelete("SET NULL");
  });

  await crearTabla(knex, "categorias", (t) => {
    t.increments("id").primary();
    t.string("nombre", 80).notNullable().unique();
    t.string("slug", 90).notNullable().unique();
    t.text("descripcion").nullable();
    agregarTiempos(t, knex);
  });
  await crearTabla(knex, "etiquetas", (t) => {
    t.increments("id").primary();
    t.string("nombre", 60).notNullable().unique();
    t.string("slug", 70).notNullable().unique();
    agregarTiempos(t, knex);
  });
  await crearTabla(knex, "estados_publicacion", (t) => {
    t.increments("id").primary();
    t.string("clave", 30).notNullable().unique();
    t.string("nombre", 60).notNullable();
    agregarTiempos(t, knex);
  });
  await crearTabla(knex, "publicaciones", (t) => {
    t.increments("id").primary();
    t.integer("usuario_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("usuarios")
      .onDelete("SET NULL");
    t.integer("categoria_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("categorias")
      .onDelete("RESTRICT");
    t.integer("estado_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("estados_publicacion")
      .onDelete("RESTRICT");
    t.string("titulo", 180).notNullable();
    t.string("slug", 200).notNullable().unique();
    t.text("contenido").notNullable();
    t.timestamp("publicada_en").nullable();
    t.timestamp("deleted_at").nullable();
    agregarTiempos(t, knex);
    t.index(["usuario_id"], "idx_publicaciones_usuario");
    t.index(["categoria_id", "estado_id"], "idx_publicaciones_categoria_estado");
    t.index(["estado_id"], "idx_publicaciones_estado");
    t.index(["publicada_en"], "idx_publicaciones_publicada");
    t.index(["deleted_at"], "idx_publicaciones_deleted_at");
  });
  await crearTabla(knex, "publicacion_etiquetas", (t) => {
    t.increments("id").primary();
    t.integer("publicacion_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("publicaciones")
      .onDelete("CASCADE");
    t.integer("etiqueta_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("etiquetas")
      .onDelete("CASCADE");
    agregarTiempos(t, knex);
    t.unique(["publicacion_id", "etiqueta_id"]);
    t.index(["etiqueta_id"], "idx_publicacion_etiquetas_etiqueta");
  });
  await crearTabla(knex, "comentarios", (t) => {
    t.increments("id").primary();
    t.integer("publicacion_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("publicaciones")
      .onDelete("CASCADE");
    t.integer("usuario_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("usuarios")
      .onDelete("SET NULL");
    t.integer("comentario_padre_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("comentarios")
      .onDelete("SET NULL");
    t.text("contenido").notNullable();
    agregarTiempos(t, knex);
    t.index(["publicacion_id", "created_at"], "idx_comentarios_publicacion");
    t.index(["usuario_id"], "idx_comentarios_usuario");
    t.index(["comentario_padre_id"], "idx_comentarios_padre");
  });
  await crearTabla(knex, "tipos_reaccion", (t) => {
    t.increments("id").primary();
    t.string("clave", 30).notNullable().unique();
    t.string("nombre", 50).notNullable();
    agregarTiempos(t, knex);
  });
  await crearTabla(knex, "reacciones", (t) => {
    t.increments("id").primary();
    t.integer("publicacion_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("publicaciones")
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
    t.unique(["publicacion_id", "usuario_id"]);
    t.index(["usuario_id"], "idx_reacciones_usuario");
    t.index(["tipo_id"], "idx_reacciones_tipo");
  });
  await crearTabla(knex, "favoritos", (t) => {
    t.increments("id").primary();
    t.integer("usuario_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("usuarios")
      .onDelete("CASCADE");
    t.integer("publicacion_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("publicaciones")
      .onDelete("CASCADE");
    agregarTiempos(t, knex);
    t.unique(["usuario_id", "publicacion_id"]);
    t.index(["publicacion_id"], "idx_favoritos_publicacion");
  });
  await crearTabla(knex, "estados_consulta", (t) => {
    t.increments("id").primary();
    t.string("clave", 30).notNullable().unique();
    t.string("nombre", 60).notNullable();
    agregarTiempos(t, knex);
  });
  await crearTabla(knex, "consultas", (t) => {
    t.increments("id").primary();
    t.integer("usuario_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("usuarios")
      .onDelete("SET NULL");
    t.integer("estado_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("estados_consulta")
      .onDelete("RESTRICT");
    t.string("titulo", 180).notNullable();
    t.text("contenido").notNullable();
    agregarTiempos(t, knex);
    t.index(["usuario_id"], "idx_consultas_usuario");
    t.index(["estado_id", "created_at"], "idx_consultas_estado");
  });
  await crearTabla(knex, "respuestas", (t) => {
    t.increments("id").primary();
    t.integer("consulta_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("consultas")
      .onDelete("CASCADE");
    t.integer("usuario_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("usuarios")
      .onDelete("SET NULL");
    t.text("contenido").notNullable();
    agregarTiempos(t, knex);
    t.index(["consulta_id", "created_at"], "idx_respuestas_consulta");
    t.index(["usuario_id"], "idx_respuestas_usuario");
  });
  await crearTabla(knex, "parcela_archivos", (t) => {
    t.increments("id").primary();
    t.integer("parcela_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("parcelas")
      .onDelete("CASCADE");
    t.integer("archivo_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("archivos")
      .onDelete("CASCADE");
    agregarTiempos(t, knex);
    t.unique(["parcela_id", "archivo_id"]);
    t.index(["archivo_id"], "idx_parcela_archivos_archivo");
  });
  await crearTabla(knex, "publicacion_archivos", (t) => {
    t.increments("id").primary();
    t.integer("publicacion_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("publicaciones")
      .onDelete("CASCADE");
    t.integer("archivo_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("archivos")
      .onDelete("CASCADE");
    agregarTiempos(t, knex);
    t.unique(["publicacion_id", "archivo_id"]);
    t.index(["archivo_id"], "idx_publicacion_archivos_archivo");
  });
  await crearTabla(knex, "configuraciones", (t) => {
    t.increments("id").primary();
    t.string("clave", 120).notNullable().unique();
    t.text("valor").notNullable();
    agregarTiempos(t, knex);
  });
};

exports.down = async function down(knex) {
  for (const tabla of [
    "configuraciones",
    "publicacion_archivos",
    "parcela_archivos",
    "respuestas",
    "consultas",
    "estados_consulta",
    "favoritos",
    "reacciones",
    "tipos_reaccion",
    "comentarios",
    "publicacion_etiquetas",
    "publicaciones",
    "estados_publicacion",
    "etiquetas",
    "categorias",
  ]) {
    await knex.schema.dropTableIfExists(tabla);
  }
  await knex.schema.alterTable("archivos", (t) => {
    t.dropForeign(["autor_id"]);
  });
  await knex.schema.alterTable("archivos", (t) => {
    t.dropIndex(["autor_id"], "idx_archivos_autor");
    t.dropColumn("ancho");
    t.dropColumn("alto");
    t.dropColumn("licencia");
    t.dropColumn("texto_alternativo");
    t.renameColumn("autor_id", "subido_por");
    t.renameColumn("mime", "tipo_mime");
    t.renameColumn("tamano", "tamano_bytes");
  });
  await knex.schema.alterTable("archivos", (t) => {
    t.index(["subido_por"], "idx_archivos_subido_por");
  });
  await knex.schema.alterTable("archivos", (t) => {
    t.foreign("subido_por")
      .references("id")
      .inTable("usuarios")
      .onDelete("SET NULL");
  });
};
