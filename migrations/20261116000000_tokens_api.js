// Fase 12 — Tokens personales para la API v1.
// Se guarda solo el hash SHA-256 del token: si la base se filtra, los tokens
// no se pueden reutilizar. El prefijo visible (primeros 8 caracteres) sirve
// para que la persona identifique cada token en su perfil.
const { crearTabla } = require("../src/utils/migraciones");

exports.up = async function up(knex) {
  await crearTabla(knex, "tokens_api", (t) => {
    t.increments("id").primary();
    t.integer("usuario_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("usuarios")
      .onDelete("CASCADE");
    t.string("nombre", 80).notNullable();
    t.string("prefijo", 12).notNullable();
    t.string("token_hash", 64).notNullable().unique();
    t.timestamp("ultimo_uso_en").nullable();
    t.timestamp("expira_en").nullable();
    t.timestamp("revocado_en").nullable();
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    t.index(["usuario_id"], "idx_tokens_api_usuario");
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("tokens_api");
};
