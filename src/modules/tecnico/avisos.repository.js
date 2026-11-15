const { db } = require("../../config/db");
const { insertarYDevolverId } = require("../../utils/baseDatos");

function listarTipos() {
  return db("tipos_aviso_zona")
    .select("id", "clave", "nombre")
    .orderBy("nombre");
}

function listarDelTecnico(tecnicoId, esAdministrador = false) {
  const consulta = db("avisos_zona as a")
    .join("distritos as d", "d.id", "a.distrito_id")
    .join("provincias as p", "p.id", "d.provincia_id")
    .join("departamentos as de", "de.id", "p.departamento_id")
    .join("tipos_aviso_zona as t", "t.id", "a.tipo_id")
    .select(
      "a.id",
      "a.titulo",
      "a.mensaje",
      "a.vigente_desde",
      "a.vigente_hasta",
      "d.nombre as distrito",
      "p.nombre as provincia",
      "de.nombre as departamento",
      "t.nombre as tipo",
    )
    .orderBy("a.created_at", "desc")
    .limit(100);
  if (!esAdministrador) consulta.where("a.tecnico_id", tecnicoId);
  return consulta;
}

async function puedeAvisar(tecnicoId, distritoId, esAdministrador) {
  if (esAdministrador) return Boolean(await db("distritos").where({ id: distritoId }).first());
  return Boolean(
    await db("tecnico_distritos")
      .where({ tecnico_id: tecnicoId, distrito_id: distritoId })
      .first(),
  );
}

async function crear({ tecnicoId, distritoId, tipoId, titulo, mensaje, hasta }) {
  return db.transaction(async (trx) => {
    const avisoId = await insertarYDevolverId(
      "avisos_zona",
      {
        tecnico_id: tecnicoId,
        distrito_id: distritoId,
        tipo_id: tipoId,
        titulo,
        mensaje,
        vigente_hasta: hasta || null,
      },
      trx,
    );
    const usuarios = await trx("parcelas as p")
      .join("usuarios as u", "u.id", "p.usuario_id")
      .distinct("u.id")
      .where("p.distrito_id", distritoId)
      .whereNull("p.deleted_at")
      .whereNull("u.deleted_at")
      .andWhere("u.activo", true);
    if (usuarios.length) {
      const tipo = await trx("tipos_notificacion").where({ clave: "alerta" }).first();
      await trx("notificaciones").insert(
        usuarios.map((usuario) => ({
          usuario_id: usuario.id,
          tipo_id: tipo.id,
          aviso_zona_id: avisoId,
          leida: false,
          mensaje: `${titulo}: ${mensaje}`,
        })),
      );
    }
    return { avisoId, destinatarios: usuarios.length };
  });
}

function listarDistritos(tecnicoId, esAdministrador = false) {
  const consulta = db("distritos as d")
    .join("provincias as p", "p.id", "d.provincia_id")
    .join("departamentos as de", "de.id", "p.departamento_id")
    .select("d.id", "d.nombre", "p.nombre as provincia", "de.nombre as departamento")
    .orderBy("de.nombre")
    .orderBy("p.nombre")
    .orderBy("d.nombre");
  if (!esAdministrador) {
    consulta.join("tecnico_distritos as td", "td.distrito_id", "d.id")
      .where("td.tecnico_id", tecnicoId);
  }
  return consulta;
}

function tipoPorClave(clave) {
  return db("tipos_aviso_zona").where({ clave }).first();
}

function buscarAvisoParaUsuario(avisoId, usuarioId) {
  return db("avisos_zona as a")
    .join("distritos as d", "d.id", "a.distrito_id")
    .join("tipos_aviso_zona as t", "t.id", "a.tipo_id")
    .join("parcelas as p", "p.distrito_id", "d.id")
    .select(
      "a.id",
      "a.titulo",
      "a.mensaje",
      "a.vigente_desde",
      "a.vigente_hasta",
      "d.nombre as distrito",
      "t.nombre as tipo",
    )
    .where("a.id", avisoId)
    .andWhere("p.usuario_id", usuarioId)
    .andWhere("a.vigente_desde", "<=", db.fn.now())
    .whereNull("p.deleted_at")
    .where((q) =>
      q.whereNull("a.vigente_hasta").orWhere("a.vigente_hasta", ">=", db.fn.now()),
    )
    .first();
}

module.exports = {
  listarTipos,
  listarDelTecnico,
  puedeAvisar,
  crear,
  listarDistritos,
  tipoPorClave,
  buscarAvisoParaUsuario,
};
