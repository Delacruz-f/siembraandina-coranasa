// Utilidades para las pruebas: crear usuarios con rol y obtener el token CSRF.
const request = require("supertest");
const bcrypt = require("bcryptjs");
const { db } = require("../src/config/db");
const { insertarYDevolverId } = require("../src/utils/baseDatos");

/** Crea (o reutiliza) un usuario con el rol indicado. Devuelve { id, email, password }. */
async function crearUsuario({
  nombre,
  email,
  password = "clave-segura-123",
  rol = "agricultor",
}) {
  const filaRol = await db("roles").where({ clave: rol }).first();
  if (!filaRol) throw new Error(`Falta el rol ${rol}. Ejecuta npm run seed.`);
  const existente = await db("usuarios").where({ email }).first();
  if (existente) {
    await db("usuarios")
      .where({ id: existente.id })
      .update({
        activo: true,
        deleted_at: null,
        email_verificado_en: db.fn.now(),
        fallos_ingreso: 0,
        bloqueado_hasta: null,
      });
    await db("perfiles")
      .where({ usuario_id: existente.id })
      .update({ nombre });
    const preferencias = await db("preferencias_notificacion")
      .where({ usuario_id: existente.id })
      .first();
    if (!preferencias) {
      await db("preferencias_notificacion").insert({
        usuario_id: existente.id,
      });
    }
    const asignacion = await db("usuario_roles")
      .where({ usuario_id: existente.id, rol_id: filaRol.id })
      .first();
    if (!asignacion) {
      await db("usuario_roles").insert({
        usuario_id: existente.id,
        rol_id: filaRol.id,
        es_principal: true,
      });
    } else {
      await db("usuario_roles")
        .where({ usuario_id: existente.id })
        .update({ es_principal: false });
      await db("usuario_roles")
        .where({ id: asignacion.id })
        .update({ es_principal: true });
    }
    return { id: existente.id, email, password };
  }
  const usuarioId = await insertarYDevolverId("usuarios", {
    email,
    password_hash: await bcrypt.hash(password, 4),
    activo: true,
    email_verificado_en: db.fn.now(),
  });
  await db("perfiles").insert({ usuario_id: usuarioId, nombre });
  await db("preferencias_notificacion").insert({ usuario_id: usuarioId });
  await db("usuario_roles").insert({
    usuario_id: usuarioId,
    rol_id: filaRol.id,
    es_principal: true,
  });
  return { id: usuarioId, email, password };
}

/** Inicia sesión con Supertest y devuelve el agente con la cookie de sesión. */
async function iniciarSesion(app, { email, password }) {
  const agente = request.agent(app);
  const pagina = await agente.get("/ingresar");
  const token = extraerCsrf(pagina.text);
  const respuesta = await agente
    .post("/ingresar")
    .type("form")
    .send({ email, password, _csrf: token });
  if (respuesta.status !== 302)
    throw new Error(`No se pudo iniciar sesión (${respuesta.status})`);
  return agente;
}

/** Extrae el token CSRF del HTML de un formulario. */
function extraerCsrf(html) {
  const coincidencia = /name="_csrf" value="([^"]+)"/.exec(html);
  if (!coincidencia)
    throw new Error("No se encontró el token CSRF en la página");
  return coincidencia[1];
}

/** Obtiene un token CSRF válido para el agente (desde cualquier página con formulario). */
async function tokenCsrf(agente, ruta = "/perfil") {
  const pagina = await agente.get(ruta);
  return extraerCsrf(pagina.text);
}

module.exports = { crearUsuario, iniciarSesion, extraerCsrf, tokenCsrf };
