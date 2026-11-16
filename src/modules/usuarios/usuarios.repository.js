// Repositorio de usuarios: única capa que consulta las tablas de usuarios,
// roles y permisos.
const { db } = require("../../config/db");
const {
  insertarYDevolverId,
  operadorBusqueda,
} = require("../../utils/baseDatos");

// MySQL devuelve los booleanos como 0/1: se normalizan a true/false.
function normalizarUsuario(usuario) {
  if (!usuario) return usuario;
  return { ...usuario, activo: Boolean(usuario.activo) };
}

const COLUMNAS_PUBLICAS = [
  "u.id",
  "p.nombre",
  "u.email",
  "p.telefono",
  "p.comunidad",
  "p.foto_archivo_id",
  "u.activo",
  "ur.rol_id",
  "u.created_at as creado_en",
];

function consultaUsuario() {
  return db("usuarios as u")
    .leftJoin("perfiles as p", "p.usuario_id", "u.id")
    .leftJoin("usuario_roles as ur", function unirRolPrincipal() {
      this.on("ur.usuario_id", "=", "u.id").andOn(
        "ur.es_principal",
        "=",
        db.raw("?", [true]),
      );
    })
    .leftJoin("roles as r", "r.id", "ur.rol_id");
}

/** Busca un usuario por correo (incluye el hash de la contraseña). */
async function buscarPorEmail(email) {
  const usuario = await consultaUsuario()
    .select(
      ...COLUMNAS_PUBLICAS,
      "u.password_hash",
      "u.email_verificado_en",
      "u.fallos_ingreso",
      "u.bloqueado_hasta",
      "r.clave as rol_clave",
      "r.nombre as rol_nombre",
    )
    .where("u.email", email)
    .whereNull("u.deleted_at")
    .first();
  return normalizarUsuario(usuario);
}

/** Busca un usuario por id (sin el hash de la contraseña). */
async function buscarPorId(id) {
  const usuario = await consultaUsuario()
    .select(
      ...COLUMNAS_PUBLICAS,
      "u.email_verificado_en",
      "r.clave as rol_clave",
      "r.nombre as rol_nombre",
    )
    .where("u.id", id)
    .whereNull("u.deleted_at")
    .first();
  return normalizarUsuario(usuario);
}

/** Crea cuenta, perfil y rol principal en una sola transacción. */
async function crear(datos, perfil, rolId) {
  return db.transaction(async (trx) => {
    const id = await insertarYDevolverId("usuarios", datos, trx);
    await trx("perfiles").insert({ usuario_id: id, ...perfil });
    await trx("preferencias_notificacion").insert({ usuario_id: id });
    await trx("usuario_roles").insert({
      usuario_id: id,
      rol_id: rolId,
      es_principal: true,
    });
    return id;
  });
}

function actualizarFoto(id, fotoArchivoId) {
  return db("perfiles")
    .where({ usuario_id: id })
    .update({ foto_archivo_id: fotoArchivoId, updated_at: db.fn.now() });
}

async function obtenerPreferencias(id) {
  const preferencias = await db("preferencias_notificacion")
    .where({ usuario_id: id })
    .first();
  if (!preferencias) return null;
  return {
    ...preferencias,
    correo_alertas: Boolean(preferencias.correo_alertas),
    avisos_panel: Boolean(preferencias.avisos_panel),
    resumen_semanal: Boolean(preferencias.resumen_semanal),
  };
}

async function actualizarPreferencias(id, cambios) {
  return db("preferencias_notificacion")
    .where({ usuario_id: id })
    .update({ ...cambios, updated_at: db.fn.now() });
}

/** Actualiza datos del perfil. */
async function actualizar(id, datos) {
  const { nombre, telefono, comunidad, ...datosUsuario } = datos;
  await db.transaction(async (trx) => {
    if (Object.keys(datosUsuario).length) {
      await trx("usuarios")
        .where({ id })
        .update({ ...datosUsuario, updated_at: trx.fn.now() });
    }
    if (
      nombre !== undefined ||
      telefono !== undefined ||
      comunidad !== undefined
    ) {
      const datosPerfil = { updated_at: trx.fn.now() };
      if (nombre !== undefined) datosPerfil.nombre = nombre;
      if (telefono !== undefined) datosPerfil.telefono = telefono;
      if (comunidad !== undefined) datosPerfil.comunidad = comunidad;
      await trx("perfiles").where({ usuario_id: id }).update(datosPerfil);
    }
  });
}

/** Marca la fecha del último acceso. */
function registrarAcceso(id, passwordHash) {
  const cambios = {
    ultimo_acceso: db.fn.now(),
    updated_at: db.fn.now(),
    fallos_ingreso: 0,
    bloqueado_hasta: null,
  };
  if (passwordHash) cambios.password_hash = passwordHash;
  return db("usuarios").where({ id }).update(cambios);
}

async function registrarFalloIngreso(usuarioId, maxIntentos, bloqueoMs) {
  return db.transaction(async (trx) => {
    const usuario = await trx("usuarios")
      .where({ id: usuarioId })
      .whereNull("deleted_at")
      .forUpdate()
      .first();
    if (!usuario) return false;

    const ahora = Date.now();
    const bloqueadoHasta = usuario.bloqueado_hasta
      ? new Date(usuario.bloqueado_hasta).getTime()
      : 0;
    if (bloqueadoHasta > ahora) return true;

    const fallosPrevios =
      bloqueadoHasta && bloqueadoHasta <= ahora
        ? 0
        : Number(usuario.fallos_ingreso || 0);
    const fallos = fallosPrevios + 1;
    const bloquea = fallos >= maxIntentos;
    await trx("usuarios")
      .where({ id: usuarioId })
      .update({
        fallos_ingreso: bloquea ? 0 : fallos,
        bloqueado_hasta: bloquea ? new Date(ahora + bloqueoMs) : null,
        updated_at: trx.fn.now(),
      });
    return bloquea;
  });
}

async function crearTokenRecuperacion(usuarioId, tokenHash, expiraEn) {
  await db.transaction(async (trx) => {
    await trx("tokens_recuperacion")
      .where({ usuario_id: usuarioId })
      .whereNull("usado_en")
      .update({ usado_en: trx.fn.now(), updated_at: trx.fn.now() });
    await trx("tokens_recuperacion").insert({
      usuario_id: usuarioId,
      token_hash: tokenHash,
      expira_en: expiraEn,
    });
  });
}

async function tokenRecuperacionValido(tokenHash) {
  return db("tokens_recuperacion")
    .where({ token_hash: tokenHash })
    .whereNull("usado_en")
    .where("expira_en", ">", db.fn.now())
    .first();
}

async function restablecerPassword(tokenHash, passwordHash, ahora) {
  return db.transaction(async (trx) => {
    const token = await trx("tokens_recuperacion")
      .where({ token_hash: tokenHash })
      .whereNull("usado_en")
      .where("expira_en", ">", ahora)
      .forUpdate()
      .first();
    if (!token) return false;

    const usuario = await trx("usuarios")
      .where({ id: token.usuario_id })
      .whereNull("deleted_at")
      .forUpdate()
      .first();
    if (!usuario) return false;

    await trx("usuarios").where({ id: token.usuario_id }).update({
      password_hash: passwordHash,
      fallos_ingreso: 0,
      bloqueado_hasta: null,
      updated_at: trx.fn.now(),
    });
    await trx("tokens_recuperacion")
      .where({ usuario_id: token.usuario_id })
      .whereNull("usado_en")
      .update({ usado_en: trx.fn.now(), updated_at: trx.fn.now() });
    return true;
  });
}

async function crearTokenVerificacion(usuarioId, tokenHash, expiraEn) {
  await db.transaction(async (trx) => {
    await trx("tokens_verificacion")
      .where({ usuario_id: usuarioId })
      .whereNull("usado_en")
      .update({ usado_en: trx.fn.now(), updated_at: trx.fn.now() });
    await trx("tokens_verificacion").insert({
      usuario_id: usuarioId,
      token_hash: tokenHash,
      expira_en: expiraEn,
    });
  });
}

function tokenVerificacionValido(tokenHash) {
  return db("tokens_verificacion")
    .where({ token_hash: tokenHash })
    .whereNull("usado_en")
    .where("expira_en", ">", db.fn.now())
    .first();
}

async function marcarCorreoVerificado(tokenHash, ahora) {
  return db.transaction(async (trx) => {
    const token = await trx("tokens_verificacion")
      .where({ token_hash: tokenHash })
      .whereNull("usado_en")
      .where("expira_en", ">", ahora)
      .forUpdate()
      .first();
    if (!token) return false;

    const usuariosActualizados = await trx("usuarios")
      .where({ id: token.usuario_id })
      .whereNull("deleted_at")
      .update({
        email_verificado_en: ahora,
        updated_at: trx.fn.now(),
      });
    if (!usuariosActualizados) return false;
    await trx("tokens_verificacion")
      .where({ usuario_id: token.usuario_id })
      .whereNull("usado_en")
      .update({ usado_en: trx.fn.now(), updated_at: trx.fn.now() });
    return true;
  });
}

async function marcarCorreoVerificadoPorId(usuarioId, ahora = new Date()) {
  return db.transaction(async (trx) => {
    const usuariosActualizados = await trx("usuarios")
      .where({ id: usuarioId })
      .whereNull("deleted_at")
      .update({
        email_verificado_en: trx.raw("COALESCE(email_verificado_en, ?)", [
          ahora,
        ]),
        updated_at: trx.fn.now(),
      });
    if (!usuariosActualizados) return false;
    await trx("tokens_verificacion")
      .where({ usuario_id: usuarioId })
      .whereNull("usado_en")
      .update({ usado_en: trx.fn.now(), updated_at: trx.fn.now() });
    return true;
  });
}

async function invalidarTokensVerificacion(usuarioId) {
  return db("tokens_verificacion")
    .where({ usuario_id: usuarioId })
    .whereNull("usado_en")
    .update({ usado_en: db.fn.now(), updated_at: db.fn.now() });
}

async function cambiarCorreo(usuarioId, emailNuevo) {
  return db.transaction(async (trx) => {
    await trx("usuarios").where({ id: usuarioId }).update({
      email: emailNuevo,
      email_verificado_en: null,
      updated_at: trx.fn.now(),
    });
    await trx("tokens_verificacion")
      .where({ usuario_id: usuarioId })
      .whereNull("usado_en")
      .update({ usado_en: trx.fn.now(), updated_at: trx.fn.now() });
  });
}

async function listarCuentasSinVerificarInactivas(limite) {
  return db("usuarios as u")
    .leftJoin("parcelas as p", "p.usuario_id", "u.id")
    .leftJoin("consultas as co", "co.usuario_id", "u.id")
    .leftJoin("comentarios as cm", "cm.usuario_id", "u.id")
    .where("u.activo", true)
    .whereNull("u.deleted_at")
    .whereNull("u.email_verificado_en")
    .where("u.created_at", "<=", limite)
    .groupBy("u.id")
    .havingRaw("COUNT(p.id) = 0")
    .havingRaw("COUNT(co.id) = 0")
    .havingRaw("COUNT(cm.id) = 0")
    .select("u.id");
}

function desactivarCuenta(usuarioId) {
  return db("usuarios")
    .where({ id: usuarioId, activo: true })
    .whereNull("deleted_at")
    .update({ activo: false, updated_at: db.fn.now() });
}

async function limpiarTokensVencidos() {
  const ahora = db.fn.now();
  const recuperacion = await db("tokens_recuperacion")
    .where("expira_en", "<=", ahora)
    .orWhereNotNull("usado_en")
    .del();
  const verificacion = await db("tokens_verificacion")
    .where("expira_en", "<=", ahora)
    .orWhereNotNull("usado_en")
    .del();
  return { recuperacion, verificacion, total: recuperacion + verificacion };
}

/** Devuelve las claves de los permisos de un usuario (rol principal + roles extra). */
async function permisosDeUsuario(usuarioId) {
  const filas = await db("usuario_roles as ur")
    .join("rol_permisos as rp", "rp.rol_id", "ur.rol_id")
    .join("permisos as p", "p.id", "rp.permiso_id")
    .where("ur.usuario_id", usuarioId)
    .distinct("p.clave")
    .select("p.clave");
  return filas.map((f) => f.clave).sort();
}

/** Devuelve las claves de los roles de un usuario (principal + adicionales). */
async function rolesDeUsuario(usuarioId) {
  const filas = await db("usuario_roles as ur")
    .join("roles as r", "r.id", "ur.rol_id")
    .where("ur.usuario_id", usuarioId)
    .orderBy("ur.es_principal", "desc")
    .orderBy("r.clave")
    .select("r.clave");
  return filas.map((f) => f.clave);
}

/** Asigna un rol adicional (idempotente). */
async function asignarRol(usuarioId, rolId, otorgadoPor, esPrincipal = false) {
  if (esPrincipal) {
    await cambiarRolPrincipal(usuarioId, rolId, otorgadoPor);
    return (
      await db("usuario_roles")
        .where({ usuario_id: usuarioId, rol_id: rolId })
        .first()
    ).id;
  }
  const existente = await db("usuario_roles")
    .where({ usuario_id: usuarioId, rol_id: rolId })
    .first();
  if (existente) return existente.id;
  return insertarYDevolverId("usuario_roles", {
    usuario_id: usuarioId,
    rol_id: rolId,
    otorgado_por: otorgadoPor,
    es_principal: esPrincipal,
  });
}

/** Cambia el rol principal del usuario. */
async function cambiarRolPrincipal(usuarioId, rolId, otorgadoPor = null) {
  await db.transaction(async (trx) => {
    const existente = await trx("usuario_roles")
      .where({ usuario_id: usuarioId, rol_id: rolId })
      .first();
    if (!existente) {
      await trx("usuario_roles").insert({
        usuario_id: usuarioId,
        rol_id: rolId,
        otorgado_por: otorgadoPor,
        es_principal: true,
      });
    }
    await trx("usuario_roles")
      .where({ usuario_id: usuarioId })
      .update({ es_principal: false, updated_at: trx.fn.now() });
    await trx("usuario_roles")
      .where({ usuario_id: usuarioId, rol_id: rolId })
      .update({ es_principal: true, updated_at: trx.fn.now() });
  });
}

/** Lista usuarios con su rol, para el panel de administración. */
async function listar({ busqueda } = {}) {
  const consulta = consultaUsuario()
    .whereNull("u.deleted_at")
    .select(
      ...COLUMNAS_PUBLICAS,
      "r.clave as rol_clave",
      "r.nombre as rol_nombre",
    )
    .orderBy("u.id", "desc");
  if (busqueda)
    consulta.where((q) =>
      q
        .where("p.nombre", operadorBusqueda(), `%${busqueda}%`)
        .orWhere("u.email", operadorBusqueda(), `%${busqueda}%`),
    );
  const filas = await consulta;
  return filas.map(normalizarUsuario);
}

/** Busca técnicos activos por nombre o correo (para conceder acceso). */
function buscarTecnicos(texto) {
  return db("usuarios as u")
    .join("usuario_roles as ur", "ur.usuario_id", "u.id")
    .join("roles as r", "r.id", "ur.rol_id")
    .join("perfiles as p", "p.usuario_id", "u.id")
    .where("r.clave", "tecnico")
    .andWhere("u.activo", true)
    .andWhereNull("u.deleted_at")
    .andWhere((q) =>
      q
        .where("p.nombre", operadorBusqueda(), `%${texto}%`)
        .orWhere("u.email", operadorBusqueda(), `%${texto}%`),
    )
    .select("u.id", "p.nombre", "u.email", "p.comunidad")
    .limit(20);
}

module.exports = {
  buscarPorEmail,
  buscarPorId,
  crear,
  actualizar,
  actualizarFoto,
  obtenerPreferencias,
  actualizarPreferencias,
  registrarAcceso,
  registrarFalloIngreso,
  crearTokenRecuperacion,
  tokenRecuperacionValido,
  restablecerPassword,
  crearTokenVerificacion,
  tokenVerificacionValido,
  marcarCorreoVerificado,
  marcarCorreoVerificadoPorId,
  invalidarTokensVerificacion,
  cambiarCorreo,
  listarCuentasSinVerificarInactivas,
  desactivarCuenta,
  limpiarTokensVencidos,
  permisosDeUsuario,
  rolesDeUsuario,
  asignarRol,
  cambiarRolPrincipal,
  listar,
  buscarTecnicos,
};
