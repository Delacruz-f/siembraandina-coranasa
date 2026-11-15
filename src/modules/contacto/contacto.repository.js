// Solo este repositorio escribe la tabla de mensajes de contacto.
const { insertarYDevolverId } = require("../../utils/baseDatos");

function guardar(datos) {
  return insertarYDevolverId("mensajes_contacto", datos);
}

module.exports = { guardar };
