/**
 * Contrato común de proveedores de datos geoespaciales:
 * obtener(latitud, longitud, fechaInicio, fechaFin) -> Promise<observacion[]>
 * Cada observación usa fecha, humedad y temperatura; las métricas no disponibles son null.
 */
function validarImplementacion(fuente) {
  if (!fuente || typeof fuente.obtener !== "function") {
    throw new TypeError("Una fuente de datos debe implementar obtener(latitud, longitud, fechaInicio, fechaFin).");
  }
  return fuente;
}

module.exports = { validarImplementacion };
