// Normaliza datos personales y roles sin perder las cuentas existentes.
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
  await crearTabla(knex, "perfiles", (t) => {
    t.increments("id").primary();
    t.integer("usuario_id")
      .unsigned()
      .notNullable()
      .unique()
      .references("id")
      .inTable("usuarios")
      .onDelete("CASCADE");
    t.string("nombre", 120).notNullable();
    t.string("telefono", 30).nullable();
    t.string("comunidad", 120).nullable();
    agregarTiempos(t, knex);
  });

  await knex.schema.alterTable("usuario_roles", (t) => {
    t.boolean("es_principal").notNullable().defaultTo(false);
  });

  const usuarios = await knex("usuarios").select(
    "id",
    "nombre",
    "telefono",
    "comunidad",
    "rol_id",
  );
  for (const usuario of usuarios) {
    await knex("perfiles").insert({
      usuario_id: usuario.id,
      nombre: usuario.nombre,
      telefono: usuario.telefono,
      comunidad: usuario.comunidad,
    });

    const asignacion = await knex("usuario_roles")
      .where({ usuario_id: usuario.id, rol_id: usuario.rol_id })
      .first();
    if (asignacion) {
      await knex("usuario_roles")
        .where({ id: asignacion.id })
        .update({ es_principal: true });
    } else {
      await knex("usuario_roles").insert({
        usuario_id: usuario.id,
        rol_id: usuario.rol_id,
        es_principal: true,
      });
    }
  }

  await knex.schema.alterTable("usuarios", (t) => {
    t.dropForeign(["rol_id"]);
    t.dropIndex(["rol_id"], "idx_usuarios_rol");
    t.dropColumn("nombre");
    t.dropColumn("telefono");
    t.dropColumn("comunidad");
    t.dropColumn("rol_id");
    t.timestamp("deleted_at").nullable();
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
    t.index(["deleted_at"], "idx_usuarios_deleted_at");
  });
  await knex("usuarios").update({
    created_at: knex.ref("creado_en"),
    updated_at: knex.ref("actualizado_en"),
  });
  await knex.schema.alterTable("usuarios", (t) => {
    t.dropColumn("creado_en");
    t.dropColumn("actualizado_en");
  });

  await knex.schema.alterTable("usuario_roles", (t) => {
    agregarTiempos(t, knex);
    t.index(["rol_id"], "idx_usuario_roles_rol");
    t.index(["otorgado_por"], "idx_usuario_roles_otorgado_por");
  });
  await knex("usuario_roles").update({
    created_at: knex.ref("otorgado_en"),
  });

  await knex.schema.alterTable("roles", (t) => {
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
  });
  await knex("roles").update({ created_at: knex.ref("creado_en") });
  await knex.schema.alterTable("roles", (t) => t.dropColumn("creado_en"));
  await knex.schema.alterTable("permisos", (t) => agregarTiempos(t, knex));
  await knex.schema.alterTable("rol_permisos", (t) => {
    agregarTiempos(t, knex);
    t.index(["permiso_id"], "idx_rol_permisos_permiso");
  });

  await crearTabla(knex, "tokens_recuperacion", (t) => {
    t.increments("id").primary();
    t.integer("usuario_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("usuarios")
      .onDelete("CASCADE");
    t.string("token_hash", 255).notNullable().unique();
    t.timestamp("expira_en").notNullable();
    t.timestamp("usado_en").nullable();
    agregarTiempos(t, knex);
    t.index(["usuario_id", "expira_en"], "idx_tokens_usuario_expira");
  });

  await knex.schema.alterTable("archivos", (t) => {
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
    t.index(["subido_por"], "idx_archivos_subido_por");
  });
  await knex("archivos").update({ created_at: knex.ref("creado_en") });
  await knex.schema.alterTable("archivos", (t) => t.dropColumn("creado_en"));
  await knex.schema.alterTable("estados_solicitud", (t) =>
    agregarTiempos(t, knex),
  );
  await knex.schema.alterTable("solicitudes_rol", (t) => {
    agregarTiempos(t, knex);
    t.index(["rol_id"], "idx_solicitudes_rol");
    t.index(["estado_id"], "idx_solicitudes_estado");
    t.index(["revisado_por"], "idx_solicitudes_revisor");
    t.index(["archivo_id"], "idx_solicitudes_archivo");
  });
  await knex("solicitudes_rol").update({
    created_at: knex.ref("fecha_solicitud"),
  });
  await knex.schema.alterTable("auditoria", (t) => {
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
    t.timestamp("fecha").notNullable().defaultTo(knex.fn.now());
    t.index(["usuario_id"], "idx_auditoria_usuario");
    t.index(["fecha"], "idx_auditoria_fecha");
  });
  await knex("auditoria").update({
    created_at: knex.ref("creado_en"),
    fecha: knex.ref("creado_en"),
  });
  await knex.schema.alterTable("auditoria", (t) => t.dropColumn("creado_en"));
  await knex.schema.alterTable("sesiones", (t) => t.dropPrimary());
  await knex.schema.alterTable("sesiones", (t) => {
    t.increments("id").primary();
    t.unique(["sid"]);
    agregarTiempos(t, knex);
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable("usuarios", (t) => {
    t.integer("rol_id").unsigned().nullable();
  });
  const usuarios = await knex("usuarios").select("id");
  for (const usuario of usuarios) {
    const asignacion =
      (await knex("usuario_roles")
        .where({ usuario_id: usuario.id, es_principal: true })
        .first()) ||
      (await knex("usuario_roles").where({ usuario_id: usuario.id }).first());
    await knex("usuarios")
      .where({ id: usuario.id })
      .update({ rol_id: asignacion ? asignacion.rol_id : null });
  }

  await knex.schema.alterTable("usuarios", (t) => {
    t.string("nombre", 120).notNullable().defaultTo("");
    t.string("telefono", 30).nullable();
    t.string("comunidad", 120).nullable();
  });
  const perfiles = await knex("perfiles").select(
    "usuario_id",
    "nombre",
    "telefono",
    "comunidad",
  );
  for (const perfil of perfiles) {
    await knex("usuarios")
      .where({ id: perfil.usuario_id })
      .update({
        nombre: perfil.nombre,
        telefono: perfil.telefono,
        comunidad: perfil.comunidad,
      });
  }
  await knex.schema.alterTable("usuarios", (t) => {
    t.foreign("rol_id")
      .references("id")
      .inTable("roles")
      .onDelete("RESTRICT");
    t.index(["rol_id"], "idx_usuarios_rol");
    t.dropIndex(["deleted_at"], "idx_usuarios_deleted_at");
    t.dropColumn("deleted_at");
    t.timestamp("creado_en").notNullable().defaultTo(knex.fn.now());
    t.timestamp("actualizado_en").notNullable().defaultTo(knex.fn.now());
  });
  await knex("usuarios").update({
    creado_en: knex.ref("created_at"),
    actualizado_en: knex.ref("updated_at"),
  });
  await knex.schema.alterTable("usuarios", (t) => {
    t.dropColumn("created_at");
    t.dropColumn("updated_at");
  });

  await knex.schema.dropTableIfExists("tokens_recuperacion");
  await knex.schema.dropTableIfExists("perfiles");
  await knex.schema.alterTable("usuario_roles", (t) => {
    t.dropForeign(["rol_id"]);
    t.dropForeign(["otorgado_por"]);
  });
  await knex.schema.alterTable("usuario_roles", (t) => {
    t.dropIndex(["rol_id"], "idx_usuario_roles_rol");
    t.dropIndex(["otorgado_por"], "idx_usuario_roles_otorgado_por");
    t.dropColumn("es_principal");
    t.dropColumn("created_at");
    t.dropColumn("updated_at");
  });
  await knex.schema.alterTable("usuario_roles", (t) => {
    t.foreign("rol_id")
      .references("id")
      .inTable("roles")
      .onDelete("CASCADE");
    t.foreign("otorgado_por")
      .references("id")
      .inTable("usuarios")
      .onDelete("SET NULL");
  });
  await knex.schema.alterTable("roles", (t) => {
    t.timestamp("creado_en").notNullable().defaultTo(knex.fn.now());
  });
  await knex("roles").update({ creado_en: knex.ref("created_at") });
  await knex.schema.alterTable("roles", (t) => {
    t.dropColumn("created_at");
    t.dropColumn("updated_at");
  });
  await knex.schema.alterTable("permisos", (t) => {
    t.dropColumn("created_at");
    t.dropColumn("updated_at");
  });
  await knex.schema.alterTable("rol_permisos", (t) =>
    t.dropForeign(["permiso_id"]),
  );
  await knex.schema.alterTable("rol_permisos", (t) => {
    t.dropIndex(["permiso_id"], "idx_rol_permisos_permiso");
    t.dropColumn("created_at");
    t.dropColumn("updated_at");
  });
  await knex.schema.alterTable("rol_permisos", (t) => {
    t.foreign("permiso_id")
      .references("id")
      .inTable("permisos")
      .onDelete("CASCADE");
  });
  await knex.schema.alterTable("archivos", (t) =>
    t.dropForeign(["subido_por"]),
  );
  await knex.schema.alterTable("archivos", (t) => {
    t.dropIndex(["subido_por"], "idx_archivos_subido_por");
    t.timestamp("creado_en").notNullable().defaultTo(knex.fn.now());
  });
  await knex("archivos").update({ creado_en: knex.ref("created_at") });
  await knex.schema.alterTable("archivos", (t) => {
    t.dropColumn("created_at");
    t.dropColumn("updated_at");
  });
  await knex.schema.alterTable("archivos", (t) => {
    t.foreign("subido_por")
      .references("id")
      .inTable("usuarios")
      .onDelete("SET NULL");
  });
  for (const tabla of ["estados_solicitud", "solicitudes_rol"]) {
    await knex.schema.alterTable(tabla, (t) => {
      t.dropColumn("created_at");
      t.dropColumn("updated_at");
    });
  }
  await knex.schema.alterTable("solicitudes_rol", (t) => {
    t.dropForeign(["rol_id"]);
    t.dropForeign(["estado_id"]);
    t.dropForeign(["revisado_por"]);
    t.dropForeign(["archivo_id"]);
  });
  await knex.schema.alterTable("solicitudes_rol", (t) => {
    t.dropIndex(["rol_id"], "idx_solicitudes_rol");
    t.dropIndex(["estado_id"], "idx_solicitudes_estado");
    t.dropIndex(["revisado_por"], "idx_solicitudes_revisor");
    t.dropIndex(["archivo_id"], "idx_solicitudes_archivo");
  });
  await knex.schema.alterTable("solicitudes_rol", (t) => {
    t.foreign("rol_id")
      .references("id")
      .inTable("roles")
      .onDelete("RESTRICT");
    t.foreign("estado_id")
      .references("id")
      .inTable("estados_solicitud")
      .onDelete("RESTRICT");
    t.foreign("revisado_por")
      .references("id")
      .inTable("usuarios")
      .onDelete("SET NULL");
    t.foreign("archivo_id")
      .references("id")
      .inTable("archivos")
      .onDelete("SET NULL");
  });
  await knex.schema.alterTable("auditoria", (t) =>
    t.dropForeign(["usuario_id"]),
  );
  await knex.schema.alterTable("auditoria", (t) => {
    t.dropIndex(["usuario_id"], "idx_auditoria_usuario");
    t.dropIndex(["fecha"], "idx_auditoria_fecha");
    t.timestamp("creado_en").notNullable().defaultTo(knex.fn.now());
  });
  await knex("auditoria").update({ creado_en: knex.ref("created_at") });
  await knex.schema.alterTable("auditoria", (t) => {
    t.dropColumn("created_at");
    t.dropColumn("updated_at");
    t.dropColumn("fecha");
  });
  await knex.schema.alterTable("auditoria", (t) => {
    t.foreign("usuario_id")
      .references("id")
      .inTable("usuarios")
      .onDelete("SET NULL");
  });
  await knex.schema.alterTable("sesiones", (t) => {
    t.integer("id").unsigned().notNullable().alter();
  });
  await knex.schema.alterTable("sesiones", (t) => {
    t.dropUnique(["sid"]);
  });
  await knex.schema.alterTable("sesiones", (t) => {
    t.dropPrimary();
    t.primary(["sid"]);
  });
  await knex.schema.alterTable("sesiones", (t) => {
    t.dropColumn("id");
    t.dropColumn("created_at");
    t.dropColumn("updated_at");
  });
};
