// Crea o promueve un administrador existente.
// Uso: node scripts/crear-admin.js correo@ejemplo.com "Nombre completo" "contraseña"
// La contraseña debe tener entre 12 y 72 caracteres.
const bcrypt = require("bcryptjs");
const { db, cerrarConexion } = require("../src/config/db");
const { insertarYDevolverId } = require("../src/utils/baseDatos");
const logger = require("../src/config/logger");
const auditoria = require("../src/modules/admin/auditoria.repository");

async function principal() {
  const [email, nombre, password] = process.argv.slice(2);
  if (!email || !nombre || !password) {
    console.error(
      'Uso: node scripts/crear-admin.js correo@ejemplo.com "Nombre completo" "contraseña"',
    );
    process.exitCode = 1;
    return;
  }
  if (password.length < 12 || password.length > 72) {
    console.error("La contraseña debe tener entre 12 y 72 caracteres.");
    process.exitCode = 1;
    return;
  }

  const correo = email.trim().toLowerCase();
  const rol = await db("roles").where({ clave: "administrador" }).first();
  if (!rol) {
    console.error(
      'Falta el rol "administrador". Ejecuta primero: npm run seed',
    );
    process.exitCode = 1;
    return;
  }

  await db.transaction(async (trx) => {
    let usuario = await trx("usuarios").where({ email: correo }).first();
    if (usuario && usuario.deleted_at) {
      throw new Error(
        "La cuenta está eliminada. Restáurala explícitamente antes de promoverla.",
      );
    }
    if (!usuario) {
      const usuarioId = await insertarYDevolverId(
        "usuarios",
        {
          email: correo,
          password_hash: await bcrypt.hash(password, 12),
          activo: true,
          email_verificado_en: trx.fn.now(),
        },
        trx,
      );
      usuario = { id: usuarioId };
      await trx("perfiles").insert({
        usuario_id: usuarioId,
        nombre: nombre.trim(),
      });
    } else {
      const perfil = await trx("perfiles")
        .where({ usuario_id: usuario.id })
        .first();
      if (!perfil) {
        await trx("perfiles").insert({
          usuario_id: usuario.id,
          nombre: nombre.trim(),
        });
      }
      await trx("usuarios")
        .where({ id: usuario.id })
        .update({ activo: true, updated_at: trx.fn.now() });
    }

    const asignacion = await trx("usuario_roles")
      .where({ usuario_id: usuario.id, rol_id: rol.id })
      .first();
    const cambioRol = !asignacion || !asignacion.es_principal;
    await trx("usuario_roles")
      .where({ usuario_id: usuario.id })
      .update({ es_principal: false, updated_at: trx.fn.now() });
    if (asignacion) {
      await trx("usuario_roles")
        .where({ id: asignacion.id })
        .update({ es_principal: true, updated_at: trx.fn.now() });
    } else {
      await trx("usuario_roles").insert({
        usuario_id: usuario.id,
        rol_id: rol.id,
        es_principal: true,
      });
    }
    if (cambioRol) {
      await auditoria.registrar({
        usuarioId: usuario.id,
        accion: "rol.asignado",
        entidad: "usuarios",
        entidadId: usuario.id,
        detalle: { rol: "administrador", origen: "script" },
        trx,
      });
    }
  });
  console.log(`Administrador listo: ${correo}.`);
}

principal()
  .catch((error) => {
    logger.error({ err: error }, "No se pudo crear el administrador");
    process.exitCode = 1;
  })
  .finally(() => cerrarConexion());
