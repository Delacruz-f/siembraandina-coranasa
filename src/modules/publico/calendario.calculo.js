// Cálculo determinista del calendario público. La IA no interviene aquí:
//  - divide los próximos 12 meses en periodos de 10 días,
//  - puntúa cada periodo con el historial de NASA POWER (GWETROOT y TS) frente
//    a los rangos del cultivo (de la base o estimados por IA y marcados como tal),
//  - devuelve 2 o 3 mejores ventanas, la cosecha estimada y los riesgos.
const MILISEGUNDOS_DIA = 86400000;
const PESO_HUMEDAD = 0.6;
const PESO_TEMPERATURA = 0.4;
const VENTANAS_MINIMAS = 2;
const VENTANAS_MAXIMAS = 3;
const DIAS_HISTORICO_MEDIA = 365;
// Días de historial que se consideran suficientes para una confianza media.
const DIAS_HISTORICO_SUFICIENTE = 300;
// Holgura de humedad (% del rango) para marcar "humedad baja".
const HOLGURA_HUMEDAD = 5;

function aFecha(fechaISO) {
  const fecha = new Date(`${fechaISO}T00:00:00Z`);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function aISO(fecha) {
  return fecha.toISOString().slice(0, 10);
}

function sumarDias(fechaISO, dias) {
  const fecha = aFecha(fechaISO);
  if (!fecha || !Number.isInteger(Number(dias))) return null;
  fecha.setUTCDate(fecha.getUTCDate() + Number(dias));
  return aISO(fecha);
}

function esNumero(valor) {
  return (
    valor !== null &&
    valor !== undefined &&
    valor !== "" &&
    Number.isFinite(Number(valor))
  );
}

function promedio(valores) {
  if (!valores.length) return null;
  return valores.reduce((total, valor) => total + valor, 0) / valores.length;
}

function redondear(valor, decimales = 1) {
  return Number(Number(valor).toFixed(decimales));
}

/** Acepta { humedadMin, humedadMax, tempMin, tempMax, diasCiclo }. */
function validarRangos(rangos) {
  if (!rangos) return null;
  const humedadMin = Number(rangos.humedadMin);
  const humedadMax = Number(rangos.humedadMax);
  const tempMin = Number(rangos.tempMin);
  const tempMax = Number(rangos.tempMax);
  const diasCiclo = Number(rangos.diasCiclo);
  if (![humedadMin, humedadMax, tempMin, tempMax].every(Number.isFinite)) {
    return null;
  }
  if (humedadMin >= humedadMax || tempMin >= tempMax) return null;
  return {
    humedadMin,
    humedadMax,
    tempMin,
    tempMax,
    // Sin ciclo no se puede estimar la cosecha; no invalida los rangos.
    diasCiclo:
      Number.isInteger(diasCiclo) && diasCiclo >= 30 && diasCiclo <= 400
        ? diasCiclo
        : null,
  };
}

/** Periodos de 10 días (dekadas dentro de cada mes) en los próximos 12 meses. */
function periodosDiezDias(fechaInicio, diasHorizonte = 365) {
  const inicio = aFecha(fechaInicio);
  if (!inicio || !Number.isInteger(diasHorizonte) || diasHorizonte < 1) {
    return [];
  }
  // Último día incluido: hoy + 365 días son 365 días de calendario.
  const limite = new Date(
    inicio.getTime() + (diasHorizonte - 1) * MILISEGUNDOS_DIA,
  );
  const periodos = [];
  const cursor = new Date(
    Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), 1),
  );
  while (cursor < limite) {
    const anio = cursor.getUTCFullYear();
    const mes = cursor.getUTCMonth();
    for (const inicioDia of [1, 11, 21]) {
      const comienzo = new Date(Date.UTC(anio, mes, inicioDia));
      const fin = new Date(Date.UTC(anio, mes, inicioDia + 9));
      // Se recorta el periodo al horizonte (12 meses) para no salirse del año.
      if (fin < inicio || comienzo > limite) continue;
      periodos.push({
        inicio: aISO(comienzo < inicio ? inicio : comienzo),
        fin: aISO(fin > limite ? limite : fin),
      });
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return periodos;
}

function claveDeFecha(fechaISO) {
  const mes = fechaISO.slice(5, 7);
  const dia = Number(fechaISO.slice(8, 10));
  return `${mes}-${dia <= 10 ? 1 : dia <= 20 ? 2 : 3}`;
}

/**
 * Agrupa el historial diario de NASA POWER por mes y dekada (clave MM-D):
 * es la referencia climática de cada periodo del próximo año.
 */
function agruparHistorial(historico = []) {
  const grupos = new Map();
  for (const dia of historico) {
    if (!dia || typeof dia.fecha !== "string" || dia.fecha.length !== 10) {
      continue;
    }
    const clave = claveDeFecha(dia.fecha);
    if (!grupos.has(clave)) {
      grupos.set(clave, { humedad: [], temperatura: [], anios: new Map() });
    }
    const grupo = grupos.get(clave);
    if (esNumero(dia.humedad)) grupo.humedad.push(Number(dia.humedad));
    if (esNumero(dia.temperatura)) {
      grupo.temperatura.push(Number(dia.temperatura));
      const anio = dia.fecha.slice(0, 4);
      if (!grupo.anios.has(anio)) grupo.anios.set(anio, []);
      grupo.anios.get(anio).push(Number(dia.temperatura));
    }
  }
  const resumen = new Map();
  for (const [clave, grupo] of grupos) {
    resumen.set(clave, {
      humedad: promedio(grupo.humedad),
      temperatura: promedio(grupo.temperatura),
      // Señal de riesgo: la dekada más fría observada en los años anteriores.
      minima: grupo.temperatura.length ? Math.min(...grupo.temperatura) : null,
      anios: grupo.anios.size,
      dias: Math.max(grupo.humedad.length, grupo.temperatura.length),
    });
  }
  return resumen;
}

/** Distancia al rango: 0 si está dentro; crece en % fuera del rango. */
function distanciaAlRango(valor, minimo, maximo) {
  if (valor < minimo) return minimo - valor;
  if (valor > maximo) return valor - maximo;
  return 0;
}

function puntuarPeriodo(mes, requerimiento) {
  if (!mes || !esNumero(mes.humedad) || !esNumero(mes.temperatura)) {
    return { puntaje: 0, sinDatos: true };
  }
  // Sin rango, la referencia es la media climática: se compara alejamiento real
  // (no se compara mm con %). La humedad del suelo es % igual que el rango.
  const humedad = Number(mes.humedad);
  const temperatura = Number(mes.temperatura);
  const excesoHumedad = distanciaAlRango(
    humedad,
    requerimiento.humedadMin,
    requerimiento.humedadMax,
  );
  const excesoTemperatura = distanciaAlRango(
    temperatura,
    requerimiento.tempMin,
    requerimiento.tempMax,
  );
  // Penalización lineal: 5 puntos por cada unidad % fuera y 6 por cada °C.
  const puntajeHumedad = Math.max(0, 100 - excesoHumedad * 5);
  const puntajeTemperatura = Math.max(0, 100 - excesoTemperatura * 6);
  return {
    puntaje: puntajeHumedad * PESO_HUMEDAD + puntajeTemperatura * PESO_TEMPERATURA,
    humedad: redondear(humedad),
    temperatura: redondear(temperatura),
    sinDatos: false,
  };
}

function calcularRiesgos(mes, requerimiento) {
  if (!mes) return { helada: null, humedadBaja: null };
  const minima = esNumero(mes.minima) ? Number(mes.minima) : null;
  const humedad = esNumero(mes.humedad) ? Number(mes.humedad) : null;
  return {
    // Helada: temperatura del suelo por debajo de 2 °C en el historial de esa
    // dekada. Si no hay historial de temperatura, no se afirma nada (null).
    helada: minima === null ? null : minima < 2,
    // Humedad baja: la referencia climática queda bajo el rango del cultivo.
    humedadBaja:
      humedad === null
        ? null
        : humedad < requerimiento.humedadMin - HOLGURA_HUMEDAD,
  };
}

// La confianza nunca es "alta" para un punto aproximado de zona.
function nivelConfianza(diasHistoricos, estimado) {
  if (estimado) return "baja";
  return diasHistoricos >= DIAS_HISTORICO_SUFICIENTE ? "media" : "baja";
}

/**
 * Calcula las mejores ventanas de siembra.
 * @param {object} datos
 * @param {object} datos.cultivo { nombre, diasCiclo, origen: "base"|"ia" }
 * @param {object} datos.rangos { humedadMin, humedadMax, tempMin, tempMax }
 * @param {Array} datos.historico historial diario de NASA POWER
 * @param {string} datos.fechaInicio fecha ISO de hoy
 * @param {number} [datos.diasHorizonte] 365
 * @param {number} [datos.limite] 2 o 3
 */
function calcularVentanas({
  cultivo,
  rangos,
  historico = [],
  fechaInicio = new Date().toISOString().slice(0, 10),
  diasHorizonte = 365,
  limite = VENTANAS_MAXIMAS,
} = {}) {
  const requerimiento = validarRangos(rangos);
  const periodos = periodosDiezDias(fechaInicio, diasHorizonte);
  if (!cultivo || !requerimiento || !periodos.length) {
    return { ventanas: [], confianza: "baja", diasHistoricos: 0 };
  }
  const agrupado = agruparHistorial(historico);
  const diasHistoricos = historico.filter(
    (dia) => dia && esNumero(dia.humedad) && esNumero(dia.temperatura),
  ).length;

  const candidatos = periodos
    .map((periodo) => {
      const mes = agrupado.get(claveDeFecha(periodo.inicio));
      return {
        ...periodo,
        mes,
        ...puntuarPeriodo(mes, requerimiento),
      };
    })
    .filter((fila) => !fila.sinDatos);

  if (candidatos.length < VENTANAS_MINIMAS) {
    return { ventanas: [], confianza: "baja", diasHistoricos };
  }

  // Una mejor ventana por mes: no se proponen dos del mismo mes.
  const mejoresPorMes = new Map();
  for (const fila of candidatos) {
    const claveMes = fila.inicio.slice(0, 7);
    const actual = mejoresPorMes.get(claveMes);
    if (!actual || fila.puntaje > actual.puntaje) {
      mejoresPorMes.set(claveMes, fila);
    }
  }
  const limiteSeguro = Math.min(
    VENTANAS_MAXIMAS,
    Math.max(VENTANAS_MINIMAS, Number.isInteger(limite) ? limite : VENTANAS_MAXIMAS),
  );
  const elegidas = [...mejoresPorMes.values()]
    .sort(
      (a, b) => b.puntaje - a.puntaje || a.inicio.localeCompare(b.inicio),
    )
    .slice(0, limiteSeguro)
    .map((fila, indice) => {
      const ciclo = requerimiento.diasCiclo;
      return {
        orden: indice + 1,
        inicio: fila.inicio,
        fin: fila.fin,
        puntaje: Math.round(fila.puntaje),
        humedad: fila.humedad,
        temperatura: fila.temperatura,
        cosecha: ciclo
          ? {
              inicio: sumarDias(fila.inicio, ciclo),
              fin: sumarDias(fila.fin, ciclo),
              diasCiclo: ciclo,
            }
          : null,
        riesgos: calcularRiesgos(fila.mes, requerimiento),
      };
    });

  return {
    ventanas: elegidas,
    confianza: nivelConfianza(diasHistoricos, cultivo.origen === "ia"),
    diasHistoricos,
  };
}

module.exports = {
  calcularVentanas,
  periodosDiezDias,
  agruparHistorial,
  validarRangos,
  sumarDias,
  claveDeFecha,
  DIAS_HISTORICO_MEDIA,
};
