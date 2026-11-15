const MILISEGUNDOS_DIA = 24 * 60 * 60 * 1000;
const PESOS = { historico: 0.6, tradicional: 0.25, pronostico: 0.15 };

function fechaUTC(valor) {
  const fecha = new Date(`${valor}T00:00:00Z`);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function aISO(fecha) {
  return fecha.toISOString().slice(0, 10);
}

function sumarDias(fechaISO, dias) {
  const fecha = fechaUTC(fechaISO);
  if (!fecha || !Number.isInteger(Number(dias))) return null;
  fecha.setUTCDate(fecha.getUTCDate() + Number(dias));
  return aISO(fecha);
}

function periodosDiezDias(fechaInicio, diasHorizonte = 365) {
  const inicio = fechaUTC(fechaInicio);
  if (!inicio || !Number.isInteger(diasHorizonte) || diasHorizonte < 1) return [];
  const limite = new Date(inicio.getTime() + diasHorizonte * MILISEGUNDOS_DIA);
  const periodos = [];
  const cursor = new Date(
    Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), 1),
  );

  while (cursor < limite) {
    for (const dia of [1, 11, 21]) {
      const comienzo = new Date(
        Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), dia),
      );
      if (comienzo >= limite) continue;
      const siguiente = new Date(comienzo);
      siguiente.setUTCDate(siguiente.getUTCDate() + 10);
      const finMes = new Date(
        Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0),
      );
      const fin = new Date(
        Math.min(
          siguiente.getTime() - MILISEGUNDOS_DIA,
          finMes.getTime(),
          limite.getTime() - MILISEGUNDOS_DIA,
        ),
      );
      const comienzoReal = comienzo < inicio ? inicio : comienzo;
      if (fin < comienzoReal) continue;
      periodos.push({ inicio: aISO(comienzoReal), fin: aISO(fin) });
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return periodos;
}

function dekada(fecha) {
  const dia = Number(fecha.slice(8, 10));
  return dia <= 10 ? 1 : dia <= 20 ? 2 : 3;
}

function dentroDeRango(valor, minimo, maximo) {
  const numero = Number(valor);
  return (
    valor !== null &&
    valor !== undefined &&
    valor !== "" &&
    Number.isFinite(numero) &&
    numero >= Number(minimo) &&
    numero <= Number(maximo)
  );
}

function dentroDeCalendario(fecha, calendario) {
  const mes = Number(fecha.slice(5, 7));
  return calendario.some((fila) => {
    const inicio = Number(fila.mes_inicio);
    const fin = Number(fila.mes_fin);
    return inicio <= fin
      ? mes >= inicio && mes <= fin
      : mes >= inicio || mes <= fin;
  });
}

function datosDentroDeRango(dia, requerimiento) {
  return (
    dentroDeRango(dia.humedad, requerimiento.hum_min, requerimiento.hum_max) &&
    dentroDeRango(
      dia.temperatura,
      requerimiento.temp_min,
      requerimiento.temp_max,
    )
  );
}

function promedio(valores) {
  if (!valores.length) return null;
  return valores.reduce((total, valor) => total + valor, 0) / valores.length;
}

function riesgoDeLaVentana(periodo, pronostico, requerimiento) {
  const dias = pronostico.filter(
    (dia) => dia.fecha >= periodo.inicio && dia.fecha <= periodo.fin,
  );
  const minimas = dias
    .map((dia) => dia.temperaturaMinima)
    .filter(
      (valor) =>
        valor !== null &&
        valor !== undefined &&
        valor !== "" &&
        Number.isFinite(Number(valor)),
    )
    .map(Number);
  const humedades = dias
    .map((dia) => dia.humedad)
    .filter(
      (valor) =>
        valor !== null &&
        valor !== undefined &&
        valor !== "" &&
        Number.isFinite(Number(valor)),
    )
    .map(Number);
  return {
    helada:
      minimas.length > 0
        ? minimas.some(
            (temperatura) => temperatura < Number(requerimiento.temp_min),
          )
        : null,
    humedadBaja:
      humedades.length > 0
        ? humedades.some((humedad) => humedad < Number(requerimiento.hum_min))
        : null,
    diasPronosticados: dias.length,
  };
}

function puntuarPeriodo(periodo, requerimiento, calendario, historico, pronostico) {
  const mes = periodo.inicio.slice(5, 7);
  const claveHistorica = `${mes}-${dekada(periodo.inicio)}`;
  const muestraHistorica = historico.filter(
    (dia) =>
      typeof dia.fecha === "string" &&
      `${dia.fecha.slice(5, 7)}-${dekada(dia.fecha)}` === claveHistorica,
  );
  const datosHistoricos = muestraHistorica.filter(
    (dia) =>
      dia.humedad !== null &&
      dia.humedad !== undefined &&
      dia.temperatura !== null &&
      dia.temperatura !== undefined &&
      Number.isFinite(Number(dia.humedad)) &&
      Number.isFinite(Number(dia.temperatura)),
  );
  const datosPronostico = pronostico.filter(
    (dia) =>
      dia.fecha >= periodo.inicio &&
      dia.fecha <= periodo.fin &&
      dia.humedad !== null &&
      dia.humedad !== undefined &&
      dia.temperatura !== null &&
      dia.temperatura !== undefined &&
      Number.isFinite(Number(dia.humedad)) &&
      Number.isFinite(Number(dia.temperatura)),
  );
  const componentes = [];

  if (datosHistoricos.length) {
    componentes.push({
      clave: "historico",
      valor:
        datosHistoricos.filter((dia) => datosDentroDeRango(dia, requerimiento))
          .length / datosHistoricos.length,
    });
  }
  if (calendario.length) {
    const diasPeriodo = [];
    for (
      let fecha = fechaUTC(periodo.inicio);
      fecha && aISO(fecha) <= periodo.fin;
      fecha.setUTCDate(fecha.getUTCDate() + 1)
    ) {
      diasPeriodo.push(aISO(fecha));
    }
    componentes.push({
      clave: "tradicional",
      valor: diasPeriodo.some((fecha) => dentroDeCalendario(fecha, calendario))
        ? 1
        : 0,
    });
  }
  if (datosPronostico.length) {
    componentes.push({
      clave: "pronostico",
      valor:
        datosPronostico.filter((dia) => datosDentroDeRango(dia, requerimiento))
          .length / datosPronostico.length,
    });
  }

  const pesoTotal = componentes.reduce(
    (total, item) => total + PESOS[item.clave],
    0,
  );
  const puntaje =
    pesoTotal === 0
      ? 0
      : componentes.reduce(
          (total, item) => total + item.valor * PESOS[item.clave],
          0,
        ) / pesoTotal;

  return {
    puntaje: Number((puntaje * 100).toFixed(1)),
    componentes: Object.fromEntries(
      componentes.map((item) => [
        item.clave,
        Number((item.valor * 100).toFixed(1)),
      ]),
    ),
    riesgo: riesgoDeLaVentana(periodo, pronostico, requerimiento),
    diasHistoricos: datosHistoricos.length,
  };
}

function colorVentana(puntaje) {
  if (puntaje >= 70) return "verde";
  if (puntaje >= 40) return "amarillo";
  return "rojo";
}

function calcularVentanas({
  cultivo,
  requerimientos = [],
  calendarios = [],
  historico = [],
  pronostico = [],
  fechaInicio = new Date().toISOString().slice(0, 10),
  diasHorizonte = 365,
  limite = 3,
} = {}) {
  const periodos = periodosDiezDias(fechaInicio, diasHorizonte);
  const requerimientosValidos = requerimientos.filter(
    (fila) =>
      Number.isFinite(Number(fila.hum_min)) &&
      Number.isFinite(Number(fila.hum_max)) &&
      Number.isFinite(Number(fila.temp_min)) &&
      Number.isFinite(Number(fila.temp_max)),
  );
  if (!cultivo || !periodos.length || !requerimientosValidos.length) return [];

  const candidatas = periodos.map((periodo) => {
    const resultadosZona = requerimientosValidos.map((requerimiento) => {
      const calendarioZona = calendarios.filter(
        (fila) => Number(fila.zona_id) === Number(requerimiento.zona_id),
      );
      const puntuacion = puntuarPeriodo(
        periodo,
        requerimiento,
        calendarioZona,
        historico,
        pronostico,
      );
      return { requerimiento, ...puntuacion };
    });
    const puntaje = promedio(resultadosZona.map((fila) => fila.puntaje)) || 0;
    const mejorZona = resultadosZona
      .slice()
      .sort((a, b) => b.puntaje - a.puntaje)[0];
    const ciclo = Number(cultivo.dias_ciclo);
    const tieneCiclo = Number.isInteger(ciclo) && ciclo > 0;

    return {
      inicio: periodo.inicio,
      fin: periodo.fin,
      puntaje,
      color: colorVentana(puntaje),
      componentes: mejorZona ? mejorZona.componentes : {},
      riesgos: mejorZona
        ? mejorZona.riesgo
        : { helada: null, humedadBaja: null, diasPronosticados: 0 },
      cosecha: tieneCiclo
        ? {
            inicio: sumarDias(periodo.inicio, ciclo),
            fin: sumarDias(periodo.fin, ciclo),
            diasCiclo: ciclo,
            referencial: Boolean(cultivo.ciclo_referencial),
          }
        : null,
      diasHistoricos: mejorZona ? mejorZona.diasHistoricos : 0,
    };
  });

  return candidatas
    .sort((a, b) => b.puntaje - a.puntaje || a.inicio.localeCompare(b.inicio))
    .slice(0, Math.max(0, limite));
}

module.exports = {
  calcularVentanas,
  periodosDiezDias,
  sumarDias,
};
