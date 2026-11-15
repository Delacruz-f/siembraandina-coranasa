// Fase 2 — Roles, permisos y usuarios.
// - roles: catálogo de roles (agricultor, tecnico, editor, administrador).
// - permisos: acciones del sistema (parcelas.crear, solicitudes.aprobar...).
// - rol_permisos: qué permisos tiene cada rol (editable desde la base de datos).
// - usuarios: cuentas; el rol principal se guarda en rol_id y los roles
//   adicionales en usuario_roles (un usuario puede ser técnico y editor).
// - usuario_roles: asignaciones de rol con quién y cuándo las otorgó.
exports.up = async function up(knex) {
  await knex.schema.createTable('roles', (t) => {
    t.increments('id').primary();
    t.string('clave', 40).notNullable().unique();
    t.string('nombre', 80).notNullable();
    t.string('descripcion', 255).nullable();
    // Los roles del sistema no se pueden borrar; los nuevos sí.
    t.boolean('es_sistema').notNullable().defaultTo(false);
    t.timestamp('creado_en').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('permisos', (t) => {
    t.increments('id').primary();
    t.string('clave', 60).notNullable().unique();
    t.string('descripcion', 255).nullable();
  });

  await knex.schema.createTable('rol_permisos', (t) => {
    t.increments('id').primary();
    t.integer('rol_id').unsigned().notNullable().references('id').inTable('roles').onDelete('CASCADE');
    t.integer('permiso_id').unsigned().notNullable().references('id').inTable('permisos').onDelete('CASCADE');
    t.unique(['rol_id', 'permiso_id']);
  });

  await knex.schema.createTable('usuarios', (t) => {
    t.increments('id').primary();
    t.string('nombre', 120).notNullable();
    t.string('email', 190).notNullable().unique();
    t.string('password_hash', 120).notNullable();
    // Rol principal (el que se muestra y se usa por defecto).
    t.integer('rol_id').unsigned().notNullable().references('id').inTable('roles').onDelete('RESTRICT');
    t.string('telefono', 30).nullable();
    t.string('comunidad', 120).nullable();
    t.boolean('activo').notNullable().defaultTo(true);
    t.timestamp('ultimo_acceso').nullable();
    t.timestamp('creado_en').notNullable().defaultTo(knex.fn.now());
    t.timestamp('actualizado_en').notNullable().defaultTo(knex.fn.now());
    t.index(['rol_id'], 'idx_usuarios_rol');
  });

  await knex.schema.createTable('usuario_roles', (t) => {
    t.increments('id').primary();
    t.integer('usuario_id').unsigned().notNullable().references('id').inTable('usuarios').onDelete('CASCADE');
    t.integer('rol_id').unsigned().notNullable().references('id').inTable('roles').onDelete('CASCADE');
    t.integer('otorgado_por').unsigned().nullable().references('id').inTable('usuarios').onDelete('SET NULL');
    t.timestamp('otorgado_en').notNullable().defaultTo(knex.fn.now());
    t.unique(['usuario_id', 'rol_id']);
  });
};

exports.down = async function down(knex) {
  for (const tabla of ['usuario_roles', 'usuarios', 'rol_permisos', 'permisos', 'roles']) {
    await knex.schema.dropTableIfExists(tabla);
  }
};
