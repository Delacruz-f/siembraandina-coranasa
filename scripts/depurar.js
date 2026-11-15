// Depuración temporal del cálculo del calendario público.
const {
  calcularVentanas,
} = require("../src/modules/publico/calendario.calculo");

function historial() {
  const dias = [];
  const inicio = new Date("2025-11-01T00:00:00Z");
  for (let i = 0; i < 120; i += 1) {
    const fecha = new Date(inicio.getTime() + i * 86400000);
    dias.push({
      fecha: fecha.toISOString().slice(0, 10),
      humedad: 28,
      temperatura: 14,
    });
  }
  return dias;
}

const resultado = calcularVentanas({
  cultivo: { nombre: "Papa", origen: "base" },
  rangos: {
    humedadMin: 20,
    humedadMax: 35,
    tempMin: 9,
    tempMax: 18,
    diasCiclo: null,
  },
  historico: historial(),
  fechaInicio: new Date().toISOString().slice(0, 10),
  diasHorizonte: 365,
  limite: 3,
});
console.log(JSON.stringify(resultado, null, 1));
