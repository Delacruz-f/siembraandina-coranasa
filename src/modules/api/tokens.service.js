// Tokens personales para la API v1 (Fase 12).
// Formato: saa_<40 caracteres aleatorios>. Solo se muestra en claro la primera
// vez que se crea; después solo queda el hash SHA-256 en la base.
const crypto = require("crypto");
const repositorio = require("./tokens.repository");
const usuariosRepositorio = require("../usuarios/usuarios.repository");
const auditoria = require("../admin/auditoria.repository");
const { solicitudInvalida, noEncontrado } = require("../../utils/errores");

const PREFIJO = "saa_";
const BYTES = 30; // 30 bytes => 40 caracteres en base64url
const TOKEN_MAXIMOS = 10;

function hash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Genera un token, lo guarda y devuelve el valor en claro una única vez. */
async function crear(usuarioId, { nombre, dias }, { ip } = {}) {
  const etiqueta = String(nombre || "").trim();
  if (etiqueta.length < 3 || etiqueta.length > 80) {
    throw solicitudInvalida("Ponle un nombre de 3 a 80 caracteres al token.");
  }
  const existentes = await repositorio.listarDeUsuario(usuarioId);
  const vigentes = existentes.filter((fila) => !fila.revocado_en);
  if (vigentes.length >= TOKEN_MAXIMOS) {
    throw solicitudInvalida(
      `Puedes tener hasta ${TOKEN_MAXIMOS} tokens activos. Revoca uno antes de crear otro.`,
    );
  }
  const token = `${PREFIJO}${crypto.randomBytes(BYTES).toString("base64url")}`;
  const expiraEn = dias ? new Date(Date.now() + Number(dias) * 86400000) : null;
  const id = await repositorio.crear({
    usuarioId,
    nombre: etiqueta,
    prefijo: token.slice(0, PREFIJO.length + 6),
    tokenHash: hash(token),
    expiraEn,
  });
  await auditoria.registrar({
    usuarioId,
    accion: "token_api.creado",
    entidad: "tokens_api",
    entidadId: id,
    detalle: { nombre: etiqueta },
    ip,
  });
  return { id, token, nombre: etiqueta, expiraEn };
}

function listar(usuarioId) {
  return repositorio.listarDeUsuario(usuarioId);
}

async function revocar(id, usuarioId, { ip } = {}) {
  const token = await repositorio.buscarDeUsuario(id, usuarioId);
  if (!token) throw noEncontrado("No encontramos ese token.");
  await repositorio.revocar(id, usuarioId);
  await auditoria.registrar({
    usuarioId,
    accion: "token_api.revocado",
    entidad: "tokens_api",
    entidadId: Number(id),
    ip,
  });
}

/**
 * Autentica una petición con `Authorization: Bearer <token>`.
 * Devuelve los datos de sesión (id, roles, permisos) o null.
 */
async function autenticar(encabezado) {
  if (!encabezado || !/^Bearer\s+/i.test(encabezado)) return null;
  const token = encabezado.replace(/^Bearer\s+/i, "").trim();
  if (!token.startsWith(PREFIJO) || token.length < 20) return null;
  const fila = await repositorio.buscarPorHash(hash(token));
  if (!fila || !fila.activo) return null;
  await repositorio.marcarUso(fila.id);
  const [permisos, roles] = await Promise.all([
    usuariosRepositorio.permisosDeUsuario(fila.usuario_id),
    usuariosRepositorio.rolesDeUsuario(fila.usuario_id),
  ]);
  return { id: fila.usuario_id, roles, permisos, tokenId: fila.id };
}

module.exports = { crear, listar, revocar, autenticar, hash, PREFIJO };
