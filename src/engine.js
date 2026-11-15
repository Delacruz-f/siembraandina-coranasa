// La recomendación compara lecturas únicamente con rangos almacenados en la base.
function evaluar(requerimiento, lectura) {
  if (!lectura) {
    return {
      cls: "none",
      titulo: "Sin datos",
      motivos: ["Registra una lectura del suelo para obtener una recomendación."],
    };
  }
  if (!requerimiento) {
    return {
      cls: "none",
      titulo: "Sin requerimiento",
      motivos: ["No hay un rango agronómico registrado para este cultivo y zona."],
    };
  }

  const hr = [Number(requerimiento.hum_min), Number(requerimiento.hum_max)];
  const tr = [Number(requerimiento.temp_min), Number(requerimiento.temp_max)];
  const h = Number(lectura.humedad);
  const t = Number(lectura.temperatura);
  if (
    ![...hr, ...tr, h, t].every(Number.isFinite) ||
    hr[0] > hr[1] ||
    tr[0] > tr[1]
  ) {
    return {
      cls: "none",
      titulo: "Datos incompletos",
      motivos: ["Revisa las lecturas y los rangos registrados para el cultivo."],
    };
  }

  const humedadAdecuada = h >= hr[0] && h <= hr[1];
  const temperaturaAdecuada = t >= tr[0] && t <= tr[1];
  const motivos = [];
  if (!humedadAdecuada) {
    motivos.push(
      h < hr[0]
        ? "La humedad está por debajo del rango registrado."
        : "La humedad supera el rango registrado.",
    );
  }
  if (!temperaturaAdecuada) {
    motivos.push(
      t < tr[0]
        ? "La temperatura está por debajo del rango registrado."
        : "La temperatura supera el rango registrado.",
    );
  }

  if (humedadAdecuada && temperaturaAdecuada) {
    return {
      cls: "ok",
      titulo: "Siembra ahora",
      motivos: ["Humedad y temperatura están dentro de los rangos registrados."],
      hr,
      tr,
    };
  }
  if (humedadAdecuada || temperaturaAdecuada) {
    return { cls: "mid", titulo: "Siembra con cuidado", motivos, hr, tr };
  }
  return { cls: "bad", titulo: "Espera", motivos, hr, tr };
}

function rangoValido(minimo, maximo) {
  const min = Number(minimo);
  const max = Number(maximo);
  return Number.isFinite(min) && Number.isFinite(max) && min <= max
    ? [min, max]
    : null;
}

function valorMetrica(condiciones, metrica) {
  const entrada = condiciones && condiciones[metrica];
  if (!entrada || entrada.valor === null || entrada.valor === undefined || entrada.valor === "") {
    return null;
  }
  const valor = Number(entrada.valor);
  return Number.isFinite(valor) ? valor : null;
}

function esRiesgoHelada(dia, umbral) {
  if (typeof dia.riesgoHelada === "boolean") return dia.riesgoHelada;
  if (!numeroDisponible(dia.temperaturaMinima)) return false;
  const minima = Number(dia.temperaturaMinima);
  return Number.isFinite(minima) && Number.isFinite(umbral) && minima <= umbral;
}

function esLluviaSignificativa(dia, umbral) {
  if (typeof dia.lluviaSignificativa === "boolean") return dia.lluviaSignificativa;
  if (!numeroDisponible(dia.precipitacionMm)) return false;
  const lluvia = Number(dia.precipitacionMm);
  return Number.isFinite(lluvia) && Number.isFinite(umbral) && lluvia >= umbral;
}

function numeroDisponible(valor) {
  return valor !== null && valor !== undefined && valor !== "" &&
    Number.isFinite(Number(valor));
}

function diaContinuo(anterior, actual) {
  const primero = new Date(`${anterior}T00:00:00Z`);
  const segundo = new Date(`${actual}T00:00:00Z`);
  return segundo.getTime() - primero.getTime() === 86400000;
}

function mejorVentana(dias, rangoHumedad, umbralHelada) {
  if (!rangoHumedad || !dias.length) return null;
  const aptos = dias.filter((dia) => (
    numeroDisponible(dia.humedadSuelo) &&
    numeroDisponible(dia.temperaturaMinima) &&
    Number(dia.humedadSuelo) >= rangoHumedad[0] &&
    Number(dia.humedadSuelo) <= rangoHumedad[1] &&
    !esRiesgoHelada(dia, umbralHelada)
  ));
  const ventanas = [];
  let actual = [];
  for (const dia of aptos) {
    if (actual.length && !diaContinuo(actual[actual.length - 1].fecha, dia.fecha)) {
      ventanas.push(actual);
      actual = [];
    }
    actual.push(dia);
  }
  if (actual.length) ventanas.push(actual);
  const mejor = ventanas.sort((a, b) => b.length - a.length)[0];
  if (!mejor) return null;
  return {
    inicio: mejor[0].fecha,
    fin: mejor[mejor.length - 1].fecha,
    cantidadDias: mejor.length,
    fechas: mejor.map((dia) => dia.fecha),
  };
}

function evaluarV2({ condiciones, requerimiento, pronostico, umbrales } = {}) {
  const hr = requerimiento && rangoValido(requerimiento.hum_min, requerimiento.hum_max);
  const tr = requerimiento && rangoValido(requerimiento.temp_min, requerimiento.temp_max);
  const humedad = valorMetrica(condiciones, "humedad");
  const temperatura = valorMetrica(condiciones, "temperatura");
  const dias = pronostico && Array.isArray(pronostico.dias) ? pronostico.dias : [];
  const clima = umbrales || (pronostico && pronostico.umbrales) || {};
  const umbralRiesgo = Number(clima.riesgoHelada);
  const umbralLluvia = Number(clima.lluviaSignificativa);
  const ventana = mejorVentana(dias, hr, umbralRiesgo);
  const motivos = [];

  if (!hr || !tr) {
    return {
      veredicto: "con_cuidado",
      cls: "none",
      titulo: "condiciones.veredicto.conCuidado",
      frase: "condiciones.frase.sinRangos",
      motivos: ["condiciones.motivo.sinRangos"],
      mejorVentana: ventana,
    };
  }

  if (humedad === null || temperatura === null) {
    motivos.push("condiciones.motivo.sinDatos");
  }

  const humedadEnRango = humedad !== null && humedad >= hr[0] && humedad <= hr[1];
  const temperaturaEnRango =
    temperatura !== null && temperatura >= tr[0] && temperatura <= tr[1];
  if (humedad !== null && !humedadEnRango) {
    motivos.push(
      humedad < hr[0]
        ? "condiciones.motivo.humedadBaja"
        : "condiciones.motivo.humedadAlta",
    );
  }
  if (temperatura !== null && !temperaturaEnRango) {
    motivos.push(
      temperatura < tr[0]
        ? "condiciones.motivo.temperaturaBaja"
        : "condiciones.motivo.temperaturaAlta",
    );
  }

  const lluviaProxima = dias
    .slice(0, 2)
    .some((dia) => esLluviaSignificativa(dia, umbralLluvia));
  const heladaProxima = dias
    .slice(0, 3)
    .some((dia) => esRiesgoHelada(dia, umbralRiesgo));
  const pronosticoInsuficiente =
    dias.length < 3 ||
    dias.slice(0, 3).some((dia) => !numeroDisponible(dia.temperaturaMinima));
  let veredicto = "siembra_ahora";
  let frase = "condiciones.frase.siembraAhora";

  if (humedad !== null && humedad < hr[0] && lluviaProxima) {
    veredicto = "espera";
    frase = "condiciones.frase.esperaLluvia";
    motivos.push("condiciones.motivo.esperaLluvia");
  }
  if (heladaProxima) {
    veredicto = "espera";
    frase = "condiciones.frase.esperaHelada";
    motivos.push("condiciones.motivo.riesgoHelada");
  } else if (pronosticoInsuficiente) {
    motivos.push("condiciones.motivo.sinPronostico");
    if (veredicto !== "espera") {
      veredicto = "con_cuidado";
      frase = "condiciones.frase.sinPronostico";
    }
  } else if (veredicto !== "espera" && !(humedadEnRango && temperaturaEnRango)) {
    veredicto =
      humedad === null || temperatura === null || humedadEnRango || temperaturaEnRango
        ? "con_cuidado"
        : "espera";
    frase = "condiciones.frase.revisarSuelo";
  }

  const confianzaBaja = condiciones &&
    (condiciones.confianza === "baja" ||
      condiciones.humedad?.confianza === "baja" ||
      condiciones.temperatura?.confianza === "baja");
  if (confianzaBaja) {
    if (veredicto === "siembra_ahora") veredicto = "con_cuidado";
    motivos.push("condiciones.motivo.confianzaBaja");
    if (frase === "condiciones.frase.siembraAhora") {
      frase = "condiciones.frase.confianzaBaja";
    }
  }

  const resultado = {
    veredicto,
    cls: {
      siembra_ahora: "ok",
      con_cuidado: "mid",
      espera: "bad",
    }[veredicto],
    titulo: `condiciones.veredicto.${{
      siembra_ahora: "siembraAhora",
      con_cuidado: "conCuidado",
      espera: "espera",
    }[veredicto]}`,
    frase,
    motivos,
    mejorVentana: ventana,
    hr,
    tr,
  };
  if (veredicto === "siembra_ahora" && motivos.length === 0) {
    resultado.motivos.push("condiciones.motivo.sueloEnRango");
  }
  return resultado;
}

module.exports = { evaluar, evaluarV2, mejorVentana };
