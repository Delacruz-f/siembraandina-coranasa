const { nasaPower } = require("./services/fuentesDatos/nasaPower");

async function ultimosDatos(latitud, longitud) {
  const hoy = new Date();
  const inicio = new Date(Date.now() - 10 * 86400000);
  return nasaPower.obtener(latitud, longitud, inicio, hoy);
}

// Historial diario (GWETROOT y TS) entre dos fechas, para el calendario público.
async function historial(latitud, longitud, fechaInicio, fechaFin) {
  return nasaPower.obtener(latitud, longitud, fechaInicio, fechaFin);
}

module.exports = { ultimosDatos, historial };
