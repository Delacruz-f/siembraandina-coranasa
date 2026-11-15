function fechaISO(valor) {
  const fecha = valor instanceof Date ? valor : new Date(`${valor}T00:00:00Z`);
  if (Number.isNaN(fecha.getTime())) throw new TypeError("Fecha no válida para la fuente de datos.");
  return fecha.toISOString().slice(0, 10);
}

function fechaNASA(valor) {
  return fechaISO(valor).replace(/-/g, "");
}

function rangoFechas(fechaInicio, fechaFin) {
  const inicio = fechaISO(fechaInicio);
  const fin = fechaISO(fechaFin);
  if (inicio > fin) throw new RangeError("La fecha inicial debe ser anterior a la fecha final.");
  return { inicio, fin };
}

module.exports = { fechaISO, fechaNASA, rangoFechas };
