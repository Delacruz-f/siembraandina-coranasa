// Fase 2 — Archivos, solicitudes de rol y auditoría.
// - archivos: metadatos de documentos e imágenes (el binario vive en disco).
// - estados_solicitud: catálogo (pendiente, aprobada, rechazada).
// - solicitudes_rol: un agricultor pide ser técnico; el administrador decide.
// - auditoria: registro de acciones sensibles (quién, qué, cuándo).
exports.up = async function up(knex) {
  await knex.schema.createTable("archivos", (t) => {
    t.increments("id").primary();
    t.integer("subido_por")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("usuarios")
      .onDelete("SET NULL");
    t.string("nombre_original", 255).notNullable();
    t.string("ruta", 255).notNullable();
    t.string("tipo_mime", 100).notNullable();
    t.integer("tamano_bytes").unsigned().notNullable();
    t.timestamp("creado_en").notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("estados_solicitud", (t) => {
    t.increments("id").primary();
    t.string("clave", 20).notNullable().unique();
    t.string("nombre", 40).notNullable();
  });

  await knex.schema.createTable("solicitudes_rol", (t) => {
    t.increments("id").primary();
    t.integer("usuario_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("usuarios")
      .onDelete("CASCADE");
    t.integer("rol_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("roles")
      .onDelete("RESTRICT");
    t.string("institucion", 160).notNullable();
    t.string("numero_colegiatura", 60).nullable();
    t.integer("archivo_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("archivos")
      .onDelete("SET NULL");
    t.integer("estado_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("estados_solicitud")
      .onDelete("RESTRICT");
    t.integer("revisado_por")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("usuarios")
      .onDelete("SET NULL");
    t.text("observacion").nullable();
    t.timestamp("fecha_solicitud").notNullable().defaultTo(knex.fn.now());
    t.timestamp("fecha_revision").nullable();
    t.index(["usuario_id", "estado_id"], "idx_solicitudes_usuario_estado");
  });

  await knex.schema.createTable("auditoria", (t) => {
    t.increments("id").primary();
    t.integer("usuario_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("usuarios")
      .onDelete("SET NULL");
    t.string("accion", 60).notNullable();
    t.string("entidad", 60).notNullable();
    t.integer("entidad_id").unsigned().nullable();
    t.text("detalle").nullable();
    t.string("ip", 45).nullable();
    t.timestamp("creado_en").notNullable().defaultTo(knex.fn.now());
    t.index(["entidad", "entidad_id"], "idx_auditoria_entidad");
  });
};

exports.down = async function down(knex) {
  for (const tabla of [
    "auditoria",
    "solicitudes_rol",
    "estados_solicitud",
    "archivos",
  ]) {
    await knex.schema.dropTableIfExists(tabla);
  }
};
