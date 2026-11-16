// Utilidades de base de datos compatibles con MySQL y PostgreSQL.
// MySQL no soporta "returning" en INSERT: se obtiene el id con insertId.
const { db } = require("../config/db");
const env = require("../config/env");

function operadorBusqueda() {
  return env.db.client === "pg" ? "ilike" : "like";
}

/**
 * Inserta una fila y devuelve su id, en cualquier motor.
 * @param {string} tabla Nombre de la tabla.
 * @param {object|object[]} datos Fila o filas a insertar.
 * @returns {Promise<number>} Id de la primera fila insertada.
 */
async function insertarYDevolverId(tabla, datos, conexion = db) {
  const insercion = conexion(tabla).insert(datos);
  const resultado =
    env.db.client === "pg" ? await insercion.returning("id") : await insercion;
  // PostgreSQL devuelve [{ id }]; MySQL devuelve [insertId].
  const primero = Array.isArray(resultado) ? resultado[0] : resultado;
  if (primero && typeof primero === "object") return primero.id;
  return Number(primero);
}

module.exports = { insertarYDevolverId, operadorBusqueda };
