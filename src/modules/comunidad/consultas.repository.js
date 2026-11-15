const { db } = require("../../config/db");
const { insertarYDevolverId } = require("../../utils/baseDatos");

function consultaBase() {
  return db("consultas as c")
    .join("estados_consulta as ec", "ec.id", "c.estado_id")
    .join("distritos as d", "d.id", "c.distrito_id")
    .join("provincias as pr", "pr.id", "d.provincia_id")
    .join("departamentos as de", "de.id", "pr.departamento_id")
    .leftJoin("cultivos as cu", "cu.id", "c.cultivo_id")
    .leftJoin("perfiles as autor", "autor.usuario_id", "c.usuario_id")
    .leftJoin("respuestas as r", "r.consulta_id", "c.id")
    .leftJoin("perfiles as tecnico", "tecnico.usuario_id", "r.usuario_id")
    .select(
      "c.id",
      "c.usuario_id",
      "c.distrito_id",
      "c.cultivo_id",
      "c.consulta_publica_id",
      "c.estado_id",
      "c.titulo",
      "c.contenido",
      "c.created_at",
      "c.updated_at",
      "ec.clave as estado",
      "d.nombre as distrito",
      "pr.nombre as provincia",
      "de.nombre as departamento",
      "cu.nombre as cultivo",
      "autor.nombre as agricultor",
      "r.id as respuesta_id",
      "r.usuario_id as tecnico_id",
      "r.contenido as respuesta",
      "r.created_at as respondida_en",
      "tecnico.nombre as tecnico",
    );
}

function listarDelAgricultor(usuarioId) {
  return consultaBase()
    .where("c.usuario_id", usuarioId)
    .orderBy("c.updated_at", "desc")
    .limit(100);
}

function listarAbiertasDeTecnico(tecnicoId) {
  return consultaBase()
    .join("tecnico_distritos as td", "td.distrito_id", "c.distrito_id")
    .where("td.tecnico_id", tecnicoId)
    .andWhere("ec.clave", "abierta")
    .orderBy("c.created_at")
    .limit(100);
}

function buscarDelAgricultor(id, usuarioId) {
  return consultaBase().where("c.id", id).andWhere("c.usuario_id", usuarioId).first();
}

function buscarParaTecnico(id, tecnicoId) {
  return consultaBase()
    .join("tecnico_distritos as td", "td.distrito_id", "c.distrito_id")
    .where("c.id", id)
    .andWhere("td.tecnico_id", tecnicoId)
    .first();
}

function buscarParaAdministrador(id) {
  return consultaBase().where("c.id", id).first();
}

function listarArchivos(consultaId) {
  return db("consulta_archivos as ca")
    .join("archivos as a", "a.id", "ca.archivo_id")
    .leftJoin("imagen_variantes as v", "v.archivo_id", "a.id")
    .select(
      "a.id",
      "a.texto_alternativo",
      "a.mime",
      "a.ancho",
      "a.alto",
      "v.ancho as variante_ancho",
      "v.ancho_px",
      "v.alto_px",
      "v.ruta_webp",
      "v.ruta_jpg",
    )
    .where("ca.consulta_id", consultaId)
    .whereNull("a.eliminado_en")
    .orderBy("ca.id")
    .orderBy("v.ancho");
}

async function crear(datos, idsArchivos, tecnicoIds) {
  return db.transaction(async (trx) => {
    const estado = await trx("estados_consulta").where({ clave: "abierta" }).first();
    const datosConsulta = { ...datos };
    const distritoNombre = datosConsulta.distrito_nombre;
    delete datosConsulta.distrito_nombre;
    const consultaId = await insertarYDevolverId(
      "consultas",
      { ...datosConsulta, estado_id: estado.id },
      trx,
    );
    for (const archivoId of idsArchivos) {
      await trx("consulta_archivos").insert({
        consulta_id: consultaId,
        archivo_id: archivoId,
      });
    }
    if (tecnicoIds.length) {
      const tipo = await trx("tipos_notificacion")
        .where({ clave: "consulta" })
        .first();
      for (const tecnicoId of tecnicoIds) {
        await trx("notificaciones").insert({
          usuario_id: tecnicoId,
          tipo_id: tipo.id,
          consulta_id: consultaId,
          leida: false,
          mensaje: `Nueva consulta en ${distritoNombre || "tu zona"}: ${datos.titulo}`,
        });
      }
    }
    return consultaId;
  });
}

function distritosDelTecnico(tecnicoId) {
  return db("tecnico_distritos as td")
    .join("distritos as d", "d.id", "td.distrito_id")
    .join("provincias as p", "p.id", "d.provincia_id")
    .join("departamentos as de", "de.id", "p.departamento_id")
    .select(
      "d.id",
      "d.nombre",
      "p.nombre as provincia",
      "de.nombre as departamento",
    )
    .where("td.tecnico_id", tecnicoId)
    .orderBy("de.nombre")
    .orderBy("p.nombre")
    .orderBy("d.nombre");
}

function tieneDistrito(tecnicoId, distritoId) {
  return db("tecnico_distritos")
    .where({ tecnico_id: tecnicoId, distrito_id: distritoId })
    .first();
}

function existeDistrito(id) {
  return db("distritos").where({ id }).first();
}

async function agregarDistrito(tecnicoId, distritoId) {
  const existente = await tieneDistrito(tecnicoId, distritoId);
  if (!existente) {
    await db("tecnico_distritos").insert({
      tecnico_id: tecnicoId,
      distrito_id: distritoId,
    });
  }
}

function quitarDistrito(tecnicoId, distritoId) {
  return db("tecnico_distritos")
    .where({ tecnico_id: tecnicoId, distrito_id: distritoId })
    .del();
}

async function listarTecnicosDeDistrito(distritoId) {
  const filas = await db("tecnico_distritos as td")
    .join("usuarios as u", "u.id", "td.tecnico_id")
    .join("perfiles as p", "p.usuario_id", "u.id")
    .where("td.distrito_id", distritoId)
    .andWhere("u.activo", true)
    .whereNull("u.deleted_at")
    .select("u.id");
  return filas.map((fila) => fila.id);
}

async function responder(id, tecnicoId, contenido, esAdministrador) {
  return db.transaction(async (trx) => {
    let consulta = trx("consultas as c")
      .join("estados_consulta as ec", "ec.id", "c.estado_id")
      .select("c.id", "c.usuario_id", "c.distrito_id", "ec.clave as estado")
      .where("c.id", id)
      .forUpdate();
    if (!esAdministrador) {
      consulta = consulta.whereExists(
        trx("tecnico_distritos as td")
          .select("td.id")
          .whereColumn("td.distrito_id", "c.distrito_id")
          .andWhere("td.tecnico_id", tecnicoId),
      );
    }
    const fila = await consulta.first();
    if (!fila || fila.estado !== "abierta") return null;

    const respuestaId = await insertarYDevolverId(
      "respuestas",
      { consulta_id: id, usuario_id: tecnicoId, contenido },
      trx,
    );
    const estado = await trx("estados_consulta")
      .where({ clave: "respondida" })
      .first();
    await trx("consultas")
      .where({ id })
      .update({ estado_id: estado.id, updated_at: trx.fn.now() });
    const tipo = await trx("tipos_notificacion")
      .where({ clave: "respuesta" })
      .first();
    await trx("notificaciones").insert({
      usuario_id: fila.usuario_id,
      tipo_id: tipo.id,
      consulta_id: id,
      leida: false,
      mensaje: "Un técnico respondió tu consulta.",
    });
    return respuestaId;
  });
}

async function cerrar(id, usuarioId) {
  const estado = await db("estados_consulta").where({ clave: "cerrada" }).first();
  return db("consultas")
    .where({ id, usuario_id: usuarioId })
    .whereIn(
      "estado_id",
      db("estados_consulta")
        .select("id")
        .whereIn("clave", ["abierta", "respondida"]),
    )
    .update({ estado_id: estado.id, updated_at: db.fn.now() });
}

function buscarRespuestaDelPropietario(respuestaId, usuarioId) {
  return db("respuestas as r")
    .join("consultas as c", "c.id", "r.consulta_id")
    .leftJoin("estados_consulta as ec", "ec.id", "c.estado_id")
    .select("r.id", "r.consulta_id", "c.usuario_id", "ec.clave as estado")
    .where("r.id", respuestaId)
    .andWhere("c.usuario_id", usuarioId)
    .first();
}

function buscarCalificacion(respuestaId, usuarioId) {
  return db("calificaciones_respuestas")
    .where({ respuesta_id: respuestaId, usuario_id: usuarioId })
    .first();
}

function calificar(respuestaId, usuarioId, puntuacion, comentario) {
  return insertarYDevolverId("calificaciones_respuestas", {
    respuesta_id: respuestaId,
    usuario_id: usuarioId,
    puntuacion,
    comentario: comentario || null,
  });
}

function buscarCalificacionRespuesta(respuestaId) {
  return db("calificaciones_respuestas")
    .where({ respuesta_id: respuestaId })
    .first();
}

module.exports = {
  listarDelAgricultor,
  listarAbiertasDeTecnico,
  buscarDelAgricultor,
  buscarParaTecnico,
  buscarParaAdministrador,
  listarArchivos,
  crear,
  distritosDelTecnico,
  existeDistrito,
  agregarDistrito,
  quitarDistrito,
  listarTecnicosDeDistrito,
  responder,
  cerrar,
  buscarRespuestaDelPropietario,
  buscarCalificacion,
  calificar,
  buscarCalificacionRespuesta,
};
