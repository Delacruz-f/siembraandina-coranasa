// Repositorio de salud: es el único lugar que consulta la base de datos
// para comprobar que responde.
const { db } = require("../../config/db");

/** Ejecuta una consulta mínima y devuelve el tiempo de respuesta en ms. */
async function medirRespuesta() {
  const inicio = process.hrtime.bigint();
  await db.raw("select 1 as ok");
  const fin = process.hrtime.bigint();
  return Number(fin - inicio) / 1e6;
}

module.exports = { medirRespuesta };
