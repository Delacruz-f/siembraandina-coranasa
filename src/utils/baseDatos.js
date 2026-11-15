// Utilidades de base de datos compatibles con MySQL y PostgreSQL.
// MySQL no soporta "returning" en INSERT: se obtiene el id con insertId.
const { db } = require("../config/db");

/**
 * Inserta una fila y devuelve su id, en cualquier motor.
 * @param {string} tabla Nombre de la tabla.
 * @param {object|object[]} datos Fila o filas a insertar.
 * @returns {Promise<number>} Id de la primera fila insertada.
 */
async function insertarYDevolverId(tabla, datos, conexion = db) {
  const resultado = await conexion(tabla).insert(datos);
  // PostgreSQL devuelve [{ id }]; MySQL devuelve [insertId].
  const primero = Array.isArray(resultado) ? resultado[0] : resultado;
  if (primero && typeof primero === "object") return primero.id;
  return Number(primero);
}

module.exports = { insertarYDevolverId };
