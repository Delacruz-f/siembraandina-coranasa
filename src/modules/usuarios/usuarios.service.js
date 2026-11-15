// Servicio de usuarios: registro, autenticación y perfil.
// No conoce Express: recibe datos planos y devuelve datos planos.
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const repositorio = require("./usuarios.repository");
const rolesRepositorio = require("./roles.repository");
const auditoria = require("../admin/auditoria.repository");
const correoServicio = require("../auth/correo.service");
const archivosServicio = require("./archivos.service");
const logger = require("../../config/logger");
const env = require("../../config/env");
const {
  ErrorHttp,
  solicitudInvalida,
  noAutorizado,
} = require("../../utils/errores");

const COSTO_BCRYPT = 12;
const INTENTOS_MAXIMOS = 5;
const DURACION_RECUPERACION_MS = 60 * 60 * 1000;
const HASH_FICTICIO =
  "$2a$12$EFYIMMXsYrDyVYtOACyAl.8pXljJflFAlTHLW8pemJ4KHlFYakBnW";

const enviosVerificacion = new Map(); // usuarioId -> [timestamps ms]
const LIMITE_VERIFICACION_HORA = 5;
const VENTANA_VERIFICACION_HORA_MS = 60 * 60 * 1000;
const ESPERA_VERIFICACION_MS = 2 * 60 * 1000;

function registrarIntentoEnvioVerificacion(usuarioId) {
  const ahora = Date.now();
  const previos = (enviosVerificacion.get(usuarioId) || []).filter(
    (t) => ahora - t < VENTANA_VERIFICACION_HORA_MS,
  );
  const ultimo = previos[previos.length - 1];
  if (ultimo && ahora - ultimo < ESPERA_VERIFICACION_MS) {
    const espera = Math.ceil((ESPERA_VERIFICACION_MS - (ahora - ultimo)) / 1000);
    throw solicitudInvalida(
      `Espera ${espera} segundos antes de solicitar otro enlace de verificación.`,
    );
  }
  if (previos.length >= LIMITE_VERIFICACION_HORA) {
    throw solicitudInvalida(
      "Alcanzaste el límite de envíos de verificación por hora. Inténtalo más tarde.",
    );
  }
  previos.push(ahora);
  enviosVerificacion.set(usuarioId, previos);
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function nuevoToken() {
  return crypto.randomBytes(32).toString("hex");
}

function urlToken(ruta, token) {
  return new URL(`${ruta}/${token}`, env.correo.urlBase).toString();
}

async function emitirVerificacion(usuarioId, email) {
  const token = nuevoToken();
  await repositorio.crearTokenVerificacion(
    usuarioId,
    hashToken(token),
    new Date(Date.now() + env.correo.duracionVerificacionMs),
  );
  const enlace = urlToken("/verificar-correo", token);
  await correoServicio.enviar({
    para: email,
    asunto: "Verifica tu correo · Siembra Andina",
    texto: `Confirma tu correo usando este enlace: ${enlace}`,
    html: `<p>Confirma tu correo para activar tu cuenta:</p><p><a href="${enlace}">Verificar correo</a></p>`,
    tipo: "verificacion",
  });
}

/** Quita el hash de la contraseña antes de devolver un usuario. */
function publico(usuario) {
  if (!usuario) return null;
  const { password_hash: _hash, ...resto } = usuario;
  return resto;
}

/** Carga el usuario con sus roles y permisos para guardarlo en la sesión. */
async function cargarSesion(usuarioId) {
  const usuario = await repositorio.buscarPorId(usuarioId);
  if (!usuario || !usuario.activo) return null;
  const [permisos, roles] = await Promise.all([
    repositorio.permisosDeUsuario(usuarioId),
    repositorio.rolesDeUsuario(usuarioId),
  ]);
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    email: usuario.email,
    telefono: usuario.telefono,
    comunidad: usuario.comunidad,
    foto_archivo_id: usuario.foto_archivo_id,
    rol: usuario.rol_clave,
    roles,
    permisos,
    correoVerificado: Boolean(usuario.email_verificado_en),
    email_verificado_en: usuario.email_verificado_en || null,
  };
}

/** Registro público: siempre crea un agricultor. */
async function registrar(
  { nombre, email, password, telefono, comunidad },
  { ip } = {},
) {
  correoServicio.validarConfiguracion();
  const correo = email.trim().toLowerCase();
  if (await repositorio.buscarPorEmail(correo)) {
    throw new ErrorHttp(409, "Ese correo ya tiene una cuenta. Inicia sesión.", {
      codigo: "email_duplicado",
    });
  }
  const rol = await rolesRepositorio.buscarRolPorClave("agricultor");
  if (!rol)
    throw new ErrorHttp(
      500,
      'Falta el rol "agricultor". Ejecuta npm run seed.',
    );

  const id = await repositorio.crear(
    {
      email: correo,
      password_hash: await bcrypt.hash(password, COSTO_BCRYPT),
      activo: true,
      email_verificado_en: null,
    },
    {
      nombre: nombre.trim(),
      telefono: telefono || null,
      comunidad: comunidad || null,
    },
    rol.id,
  );
  await auditoria.registrar({
    usuarioId: id,
    accion: "usuario.registrado",
    entidad: "usuarios",
    entidadId: id,
    ip,
  });
  let verificacionEnviada = true;
  try {
    await emitirVerificacion(id, correo);
  } catch {
    verificacionEnviada = false;
    await auditoria.registrar({
      usuarioId: id,
      accion: "correo.fallo_envio",
      entidad: "usuarios",
      entidadId: id,
      detalle: { tipo: "verificacion" },
      ip,
    });
  }
  return { id, email: correo, verificacionEnviada };
}

/** Inicia sesión validando correo y contraseña. */
async function autenticar({ email, password }, { ip } = {}) {
  const usuario = await repositorio.buscarPorEmail(
    (email || "").trim().toLowerCase(),
  );
  const coincide = await bcrypt.compare(
    password || "",
    usuario ? usuario.password_hash : HASH_FICTICIO,
  );
  await bcrypt.compare(password || "", HASH_FICTICIO);
  const bloqueado =
    usuario?.bloqueado_hasta &&
    new Date(usuario.bloqueado_hasta).getTime() > Date.now();
  if (!usuario || !coincide || bloqueado) {
    if (usuario && !bloqueado) {
      await repositorio.registrarFalloIngreso(
        usuario.id,
        INTENTOS_MAXIMOS,
        env.autenticacion.duracionBloqueoMs,
      );
    }
    await auditoria.registrar({
      usuarioId: usuario ? usuario.id : null,
      accion: "sesion.fallida",
      entidad: "usuarios",
      entidadId: usuario ? usuario.id : null,
      detalle: { bloqueado: Boolean(bloqueado) },
      ip,
    });
    throw noAutorizado("Correo o contraseña incorrectos.");
  }
  if (!usuario.activo) {
    throw new ErrorHttp(
      403,
      "Tu cuenta está desactivada. Contacta al administrador.",
      { codigo: "cuenta_inactiva" },
    );
  }
  const actualizarHash =
    bcrypt.getRounds(usuario.password_hash) < COSTO_BCRYPT
      ? await bcrypt.hash(password, COSTO_BCRYPT)
      : undefined;
  await repositorio.registrarAcceso(usuario.id, actualizarHash);
  await auditoria.registrar({
    usuarioId: usuario.id,
    accion: "sesion.iniciada",
    entidad: "usuarios",
    entidadId: usuario.id,
    ip,
  });
  return cargarSesion(usuario.id);
}

/** Envía recuperación sin revelar si el correo está registrado. */
async function solicitarRecuperacion(email) {
  correoServicio.validarConfiguracion();
  const usuario = await repositorio.buscarPorEmail(
    (email || "").trim().toLowerCase(),
  );
  if (!usuario || !usuario.activo || !usuario.email_verificado_en) return;

  const token = nuevoToken();
  await repositorio.crearTokenRecuperacion(
    usuario.id,
    hashToken(token),
    new Date(Date.now() + DURACION_RECUPERACION_MS),
  );
  const enlace = urlToken("/restablecer", token);
  try {
    await correoServicio.enviar({
      para: usuario.email,
      asunto: "Recupera tu contraseña · Siembra Andina",
      texto: `Restablece tu contraseña en el plazo de una hora: ${enlace}`,
      html: `<p>Solicitaste restablecer tu contraseña. El enlace vence en una hora:</p><p><a href="${enlace}">Restablecer contraseña</a></p>`,
      tipo: "recuperacion",
    });
  } catch {
    await auditoria.registrar({
      usuarioId: usuario.id,
      accion: "correo.fallo_envio",
      entidad: "usuarios",
      entidadId: usuario.id,
      detalle: { tipo: "recuperacion" },
    }).catch(() => {});
  }
}

async function tokenRecuperacionValido(token) {
  if (!/^[a-f0-9]{64}$/i.test(token || "")) return false;
  return Boolean(
    await repositorio.tokenRecuperacionValido(hashToken(token)),
  );
}

async function restablecerPassword(token, password) {
  if (!/^[a-f0-9]{64}$/i.test(token || "")) {
    throw new ErrorHttp(410, "El enlace de recuperación venció o ya se usó.");
  }
  const actualizado = await repositorio.restablecerPassword(
    hashToken(token),
    await bcrypt.hash(password, COSTO_BCRYPT),
    new Date(),
  );
  if (!actualizado) {
    throw new ErrorHttp(410, "El enlace de recuperación venció o ya se usó.");
  }
}

async function verificarCorreo(token) {
  if (!/^[a-f0-9]{64}$/i.test(token || "")) {
    throw new ErrorHttp(410, "El enlace de verificación venció o ya se usó.");
  }
  const verificado = await repositorio.marcarCorreoVerificado(
    hashToken(token),
    new Date(),
  );
  if (!verificado) {
    throw new ErrorHttp(410, "El enlace de verificación venció o ya se usó.");
  }
  return verificado;
}

async function tokenVerificacionValido(token) {
  if (!/^[a-f0-9]{64}$/i.test(token || "")) return false;
  return Boolean(
    await repositorio.tokenVerificacionValido(hashToken(token)),
  );
}

/** Reenvía verificación sin confirmar si existe la cuenta. */
async function reenviarVerificacion(email) {
  correoServicio.validarConfiguracion();
  const usuario = await repositorio.buscarPorEmail(
    (email || "").trim().toLowerCase(),
  );
  if (!usuario || !usuario.activo || usuario.email_verificado_en) return;
  try {
    await emitirVerificacion(usuario.id, usuario.email);
  } catch {
    await auditoria.registrar({
      usuarioId: usuario.id,
      accion: "correo.fallo_envio",
      entidad: "usuarios",
      entidadId: usuario.id,
      detalle: { tipo: "verificacion_reenvio" },
    }).catch(() => {});
  }
}

async function reenviarVerificacionAdmin(usuarioId, { ip, actorId } = {}) {
  correoServicio.validarConfiguracion();
  const usuario = await repositorio.buscarPorId(usuarioId);
  if (!usuario) throw new ErrorHttp(404, "No encontramos ese usuario.");
  if (usuario.email_verificado_en) {
    throw solicitudInvalida("El correo de esta cuenta ya está verificado.");
  }
  if (!usuario.activo) {
    throw solicitudInvalida("No se puede reenviar la verificación a una cuenta desactivada.");
  }
  try {
    await emitirVerificacion(usuario.id, usuario.email);
    await auditoria.registrar({
      usuarioId: actorId || null,
      accion: "usuario.verificacion_reenviada",
      entidad: "usuarios",
      entidadId: usuario.id,
      ip,
    });
    return { enviado: true };
  } catch (error) {
    await auditoria.registrar({
      usuarioId: actorId || null,
      accion: "correo.fallo_envio",
      entidad: "usuarios",
      entidadId: usuario.id,
      detalle: { tipo: "verificacion_admin" },
      ip,
    }).catch(() => {});
    throw error;
  }
}

async function marcarCorreoVerificadoAdmin(usuarioId, { ip, actorId } = {}) {
  const usuario = await repositorio.buscarPorId(usuarioId);
  if (!usuario) throw new ErrorHttp(404, "No encontramos ese usuario.");
  if (usuario.email_verificado_en) {
    throw solicitudInvalida("El correo de esta cuenta ya está verificado.");
  }
  const ok = await repositorio.marcarCorreoVerificadoPorId(usuario.id, new Date());
  if (!ok) throw new ErrorHttp(404, "No encontramos ese usuario.");
  await auditoria.registrar({
    usuarioId: actorId || null,
    accion: "usuario.correo_verificado",
    entidad: "usuarios",
    entidadId: usuario.id,
    ip,
  });
  return { verificado: true };
}

/** Actualiza el perfil del propio usuario. */
async function actualizarPerfil(usuarioId, { nombre, telefono, comunidad, email, password_actual }) {
  if (!nombre || !nombre.trim())
    throw solicitudInvalida("El nombre es obligatorio.");
  const perfilActual = await repositorio.buscarPorId(usuarioId);
  if (!perfilActual) throw noAutorizado();

  const cambios = {
    nombre: nombre.trim(),
    telefono: telefono || null,
    comunidad: comunidad || null,
  };

  const correoNuevo = email ? String(email).trim().toLowerCase() : perfilActual.email;
  if (correoNuevo && correoNuevo !== perfilActual.email) {
    if (!password_actual) {
      throw solicitudInvalida("Escribe tu contraseña actual para cambiar el correo.");
    }
    const conHash = await repositorio.buscarPorEmail(perfilActual.email);
    if (!conHash || !(await bcrypt.compare(password_actual || "", conHash.password_hash))) {
      throw solicitudInvalida("La contraseña actual no es correcta.");
    }
    const existente = await repositorio.buscarPorEmail(correoNuevo);
    if (existente && Number(existente.id) !== Number(usuarioId)) {
      throw new ErrorHttp(409, "Ese correo ya tiene una cuenta. Inicia sesión.", {
        codigo: "email_duplicado",
      });
    }
    await repositorio.cambiarCorreo(usuarioId, correoNuevo);
    try {
      await emitirVerificacion(usuarioId, correoNuevo);
    } catch {
      await auditoria.registrar({
        usuarioId,
        accion: "correo.fallo_envio",
        entidad: "usuarios",
        entidadId: usuarioId,
        detalle: { tipo: "verificacion_cambio_correo" },
      }).catch(() => {});
    }
  }

  await repositorio.actualizar(usuarioId, cambios);
  return cargarSesion(usuarioId);
}

async function actualizarFoto(usuarioId, archivo) {
  const usuario = await repositorio.buscarPorId(usuarioId);
  if (!usuario) throw noAutorizado();
  const foto = await archivosServicio.guardarImagen(
    archivo,
    usuarioId,
    `Foto de perfil de ${usuario.nombre}`,
  );
  try {
    await repositorio.actualizarFoto(usuarioId, foto.id);
  } catch (error) {
    await archivosServicio.eliminarPropio(foto.id, usuarioId);
    throw error;
  }
  if (usuario.foto_archivo_id) {
    try {
      await archivosServicio.eliminarPropio(
        usuario.foto_archivo_id,
        usuarioId,
      );
    } catch (error) {
      logger.error(
        { err: error, usuarioId, archivoId: usuario.foto_archivo_id },
        "No se pudo limpiar la foto de perfil anterior",
      );
    }
  }
  return cargarSesion(usuarioId);
}

async function obtenerPreferencias(usuarioId) {
  const preferencias = await repositorio.obtenerPreferencias(usuarioId);
  if (!preferencias) {
    throw new Error(
      "No encontramos las preferencias de notificación de esta cuenta.",
    );
  }
  return preferencias;
}

async function actualizarPreferencias(usuarioId, datos) {
  const valor = (campo) => ["on", "true", "1"].includes(datos[campo]);
  await repositorio.actualizarPreferencias(usuarioId, {
    correo_alertas: valor("correo_alertas"),
    avisos_panel: valor("avisos_panel"),
    resumen_semanal: valor("resumen_semanal"),
  });
  return obtenerPreferencias(usuarioId);
}

/** Cambia la contraseña verificando la actual. */
async function cambiarPassword(usuarioId, { actual, nueva }) {
  const perfil = await repositorio.buscarPorId(usuarioId);
  if (!perfil) throw noAutorizado();
  const usuario = await repositorio.buscarPorEmail(perfil.email);
  if (!(await bcrypt.compare(actual || "", usuario.password_hash))) {
    throw solicitudInvalida("La contraseña actual no es correcta.");
  }
  await repositorio.actualizar(usuarioId, {
    password_hash: await bcrypt.hash(nueva, COSTO_BCRYPT),
  });
}

async function enviarVerificacionPerfil(usuarioId, { ip } = {}) {
  correoServicio.validarConfiguracion();
  const usuario = await repositorio.buscarPorId(usuarioId);
  if (!usuario) throw noAutorizado();
  if (usuario.email_verificado_en) {
    throw solicitudInvalida("Tu correo ya está verificado.");
  }
  registrarIntentoEnvioVerificacion(usuarioId);
  try {
    await emitirVerificacion(usuario.id, usuario.email);
    await auditoria.registrar({
      usuarioId: usuario.id,
      accion: "usuario.verificacion_solicitada",
      entidad: "usuarios",
      entidadId: usuario.id,
      ip,
    });
  } catch (error) {
    await auditoria.registrar({
      usuarioId: usuario.id,
      accion: "correo.fallo_envio",
      entidad: "usuarios",
      entidadId: usuario.id,
      detalle: { tipo: "verificacion_perfil" },
      ip,
    }).catch(() => {});
    const mensaje = (correoServicio.traducirErrorCorreo && correoServicio.traducirErrorCorreo(error)) || "No se pudo enviar el correo. Inténtalo más tarde.";
    throw solicitudInvalida(mensaje);
  }
}

async function limpiarCuentasSinVerificar() {
  const dias = 30;
  const limite = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  const candidatas = await repositorio.listarCuentasSinVerificarInactivas(limite);
  let desactivadas = 0;
  for (const cuenta of candidatas) {
    const ok = await repositorio.desactivarCuenta(cuenta.id);
    if (!ok) continue;
    desactivadas += 1;
    await auditoria.registrar({
      usuarioId: null,
      accion: "usuario.desactivado_sin_verificacion",
      entidad: "usuarios",
      entidadId: cuenta.id,
      detalle: { motivo: "sin_verificacion_sin_actividad", dias },
    }).catch(() => {});
  }
  return { desactivadas, revisadas: candidatas.length };
}

module.exports = {
  registrar,
  autenticar,
  solicitarRecuperacion,
  tokenRecuperacionValido,
  restablecerPassword,
  tokenVerificacionValido,
  verificarCorreo,
  reenviarVerificacion,
  reenviarVerificacionAdmin,
  marcarCorreoVerificadoAdmin,
  enviarVerificacionPerfil,
  limpiarCuentasSinVerificar,
  cargarSesion,
  actualizarPerfil,
  actualizarFoto,
  obtenerPreferencias,
  actualizarPreferencias,
  cambiarPassword,
  publico,
};
