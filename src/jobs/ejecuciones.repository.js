const { db } = require("../config/db");
const { insertarYDevolverId } = require("../utils/baseDatos");

async function iniciar({ trabajo, origen, ejecutadoPor }) {
  const estado = await db("estados_jobs").where({ clave: "ejecutando" }).first();
  if (!estado) throw new Error('Falta el estado de trabajo "ejecutando". Ejecuta npm run seed.');
  return insertarYDevolverId("ejecuciones_jobs", {
    trabajo,
    estado_id: estado.id,
    origen,
    ejecutado_por: ejecutadoPor || null,
    iniciado_en: new Date(),
  });
}

async function finalizar(id, { estado: claveEstado, resultado, error }) {
  const estado = await db("estados_jobs").where({ clave: claveEstado }).first();
  if (!estado) throw new Error(`Falta el estado de trabajo "${claveEstado}". Ejecuta npm run seed.`);
  await db("ejecuciones_jobs").where({ id }).update({
    estado_id: estado.id,
    finalizado_en: new Date(),
    resultado: resultado == null ? null : JSON.stringify(resultado),
    error: error || null,
    updated_at: db.fn.now(),
  });
}

async function ultimasPorTrabajo(claves) {
  const filas = await Promise.all(claves.map((trabajo) =>
    db("ejecuciones_jobs as e")
      .join("estados_jobs as s", "s.id", "e.estado_id")
      .leftJoin("usuarios as u", "u.id", "e.ejecutado_por")
      .leftJoin("perfiles as p", "p.usuario_id", "u.id")
      .select(
        "e.id",
        "e.trabajo",
        "e.origen",
        "e.iniciado_en",
        "e.finalizado_en",
        "e.resultado",
        "e.error",
        "s.clave as estado",
        "p.nombre as ejecutado_por",
      )
      .where("e.trabajo", trabajo)
      .orderBy("e.id", "desc")
      .first(),
  ));
  return filas.filter(Boolean);
}

module.exports = { iniciar, finalizar, ultimasPorTrabajo };
