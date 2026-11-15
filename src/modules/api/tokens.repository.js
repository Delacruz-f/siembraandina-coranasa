// Repositorio de tokens personales de la API v1.
// Nunca se guarda ni se devuelve el token en claro: solo su hash.
const { db } = require("../../config/db");
const { insertarYDevolverId } = require("../../utils/baseDatos");

function crear({ usuarioId, nombre, prefijo, tokenHash, expiraEn }) {
  return insertarYDevolverId("tokens_api", {
    usuario_id: usuarioId,
    nombre,
    prefijo,
    token_hash: tokenHash,
    expira_en: expiraEn || null,
  });
}

function listarDeUsuario(usuarioId) {
  return db("tokens_api")
    .where({ usuario_id: usuarioId })
    .select(
      "id",
      "nombre",
      "prefijo",
      "ultimo_uso_en",
      "expira_en",
      "revocado_en",
      "created_at",
    )
    .orderBy("id", "desc");
}

function buscarPorHash(tokenHash) {
  return db("tokens_api")
    .join("usuarios as u", "u.id", "tokens_api.usuario_id")
    .where("tokens_api.token_hash", tokenHash)
    .whereNull("tokens_api.revocado_en")
    .whereNull("u.deleted_at")
    .andWhere((q) =>
      q
        .whereNull("tokens_api.expira_en")
        .orWhere("tokens_api.expira_en", ">", db.fn.now()),
    )
    .select(
      "tokens_api.id",
      "tokens_api.usuario_id",
      "tokens_api.prefijo",
      "u.activo",
    )
    .first();
}

function marcarUso(id) {
  return db("tokens_api").where({ id }).update({ ultimo_uso_en: db.fn.now() });
}

function revocar(id, usuarioId) {
  return db("tokens_api")
    .where({ id, usuario_id: usuarioId })
    .whereNull("revocado_en")
    .update({ revocado_en: db.fn.now() });
}

function buscarDeUsuario(id, usuarioId) {
  return db("tokens_api").where({ id, usuario_id: usuarioId }).first();
}

module.exports = {
  crear,
  listarDeUsuario,
  buscarPorHash,
  marcarUso,
  revocar,
  buscarDeUsuario,
};
