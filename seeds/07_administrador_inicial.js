const bcrypt = require("bcryptjs");

async function insertarYDevolverId(knex, tabla, datos) {
  const resultado = await knex(tabla).insert(datos);
  const primero = Array.isArray(resultado) ? resultado[0] : resultado;
  if (primero && typeof primero === "object") return primero.id;
  return Number(primero);
}

exports.seed = async function seed(knex) {
  const correo = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const nombre = (process.env.ADMIN_NOMBRE || "").trim();
  const clave = process.env.ADMIN_PASSWORD || "";
  const configurados = [correo, nombre, clave].filter(Boolean).length;

  if (configurados === 0) return;
  if (configurados !== 3) {
    throw new Error(
      "Configura ADMIN_EMAIL, ADMIN_NOMBRE y ADMIN_PASSWORD juntos o déjalos vacíos.",
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    throw new Error("ADMIN_EMAIL debe contener un correo válido.");
  }
  if (nombre.length < 3 || nombre.length > 120) {
    throw new Error("ADMIN_NOMBRE debe tener entre 3 y 120 caracteres.");
  }
  if (clave.length < 12 || clave.length > 72) {
    throw new Error("ADMIN_PASSWORD debe tener entre 12 y 72 caracteres.");
  }

  const rol = await knex("roles").where({ clave: "administrador" }).first();
  if (!rol) throw new Error('No existe el rol "administrador".');

  await knex.transaction(async (trx) => {
    let usuario = await trx("usuarios").where({ email: correo }).first();
    if (usuario && usuario.deleted_at) {
      throw new Error(
        "El correo ADMIN_EMAIL pertenece a una cuenta eliminada; restaúrala explícitamente antes de sembrar.",
      );
    }
    if (!usuario) {
      const usuarioId = await insertarYDevolverId(trx, "usuarios", {
        email: correo,
        password_hash: await bcrypt.hash(clave, 12),
        activo: true,
        email_verificado_en: trx.fn.now(),
      });
      usuario = { id: usuarioId };
      await trx("perfiles").insert({
        usuario_id: usuarioId,
        nombre,
      });
    } else {
      const perfil = await trx("perfiles")
        .where({ usuario_id: usuario.id })
        .first();
      if (!perfil) {
        await trx("perfiles").insert({
          usuario_id: usuario.id,
          nombre,
        });
      }
      await trx("usuarios")
        .where({ id: usuario.id })
        .update({ activo: true, updated_at: trx.fn.now() });
    }

    await trx("usuario_roles")
      .where({ usuario_id: usuario.id })
      .update({ es_principal: false, updated_at: trx.fn.now() });
    const asignacion = await trx("usuario_roles")
      .where({ usuario_id: usuario.id, rol_id: rol.id })
      .first();
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
  });
};
