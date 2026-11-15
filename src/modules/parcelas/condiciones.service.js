const repositorio = require("./condiciones.repository");
const openMeteo = require("../../openMeteo");
const logger = require("../../config/logger");

const CLAVES_CONFIGURACION = {
  toleranciaHumedad: "condiciones.tolerancia_humedad_pct",
  toleranciaTemperatura: "condiciones.tolerancia_temperatura_c",
  vigenciaManual: "condiciones.vigencia_manual_horas",
  riesgoHelada: "pronostico.riesgo_helada_c",
  helada: "pronostico.helada_c",
  lluviaSignificativa: "pronostico.lluvia_significativa_mm",
};
const CLAVES = Object.values(CLAVES_CONFIGURACION);
const MS_POR_DIA = 86400000;
const MS_POR_HORA = 3600000;

function fechaISO(valor) {
  return valor instanceof Date
    ? valor.toISOString().slice(0, 10)
    : String(valor).slice(0, 10);
}

function numeroFinito(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

function leerConfiguracion(fila) {
  let contenido;
  try {
    contenido = JSON.parse(fila.valor);
  } catch {
    contenido = fila.valor;
  }
  const valor = numeroFinito(
    contenido && typeof contenido === "object" ? contenido.valor : contenido,
  );
  if (valor === null) {
    throw new Error(`La configuración "${fila.clave}" debe contener un número.`);
  }
  return {
    valor,
    validado: Boolean(contenido && contenido.validado === true),
  };
}

async function obtenerUmbrales() {
  const filas = await repositorio.listarConfiguraciones(CLAVES);
  const porClave = new Map(filas.map((fila) => [fila.clave, fila]));
  const umbrales = Object.fromEntries(
    Object.entries(CLAVES_CONFIGURACION).map(([nombre, clave]) => {
      const fila = porClave.get(clave);
      if (!fila) {
        throw new Error(`Falta la configuración requerida "${clave}". Ejecuta npm run seed.`);
      }
      const configuracion = leerConfiguracion(fila);
      return [nombre, configuracion.valor];
    }),
  );
  if (
    umbrales.toleranciaHumedad < 0 ||
    umbrales.toleranciaTemperatura < 0 ||
    umbrales.vigenciaManualHoras <= 0 ||
    umbrales.lluviaSignificativa < 0 ||
    umbrales.helada > umbrales.riesgoHelada
  ) {
    throw new Error("Las configuraciones de condiciones de parcela contienen umbrales inválidos.");
  }
  return umbrales;
}

function tiempoDeLectura(lectura) {
  const valor = lectura.created_at || lectura.fecha;
  const fecha = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha.getTime();
}

function edadEnDias(fecha) {
  const partes = fechaISO(fecha).split("-").map(Number);
  return Date.UTC(partes[0], partes[1] - 1, partes[2]);
}

function valorDe(lectura, metrica) {
  return numeroFinito(lectura[metrica]);
}

function aUnaDecimal(valor) {
  return Number(valor.toFixed(1));
}

function describirFuente(lectura, metrica, principal) {
  return {
    nombre: lectura.fuente_nombre,
    clave: lectura.fuente,
    valor: aUnaDecimal(valorDe(lectura, metrica)),
    fecha: fechaISO(lectura.fecha),
    tipo: lectura.fuente === "manual" ? "medicion_propia" : "estimacion",
    principal,
  };
}

function calcularRango(fuentes) {
  const valores = fuentes.map((fuente) => fuente.valor);
  return {
    minimo: aUnaDecimal(Math.min(...valores)),
    maximo: aUnaDecimal(Math.max(...valores)),
  };
}

function consolidarMetrica(lecturas, metrica, tolerancia, vigenciaManualHoras, ahora) {
  const validas = lecturas
    .filter((lectura) => valorDe(lectura, metrica) !== null)
    .sort((a, b) => edadEnDias(b.fecha) - edadEnDias(a.fecha));
  const manual = validas.find((lectura) => lectura.fuente === "manual");
  const edadManual = manual ? ahora - tiempoDeLectura(manual) : null;
  const manualReciente = Boolean(
    manual &&
    edadManual !== null &&
    edadManual >= 0 &&
    edadManual <= vigenciaManualHoras * MS_POR_HORA,
  );

  if (manualReciente) {
    const automaticas = validas.filter((lectura) => lectura.fuente !== "manual");
    const fuentes = [
      describirFuente(manual, metrica, true),
      ...automaticas.map((lectura) => describirFuente(lectura, metrica, false)),
    ];
    const valores = fuentes.map((fuente) => fuente.valor);
    const coincide = valores.length < 2
      ? null
      : Math.max(...valores) - Math.min(...valores) <= tolerancia;
    return {
      valor: aUnaDecimal(valorDe(manual, metrica)),
      rango: calcularRango(fuentes),
      confianza: "alta",
      fuentes,
      actualizadaEn: manual.created_at || manual.fecha,
      coinciden: coincide,
      lecturaManualReciente: true,
    };
  }

  const automaticas = validas.filter((lectura) => lectura.fuente !== "manual");
  if (!automaticas.length) {
    return {
      valor: null,
      rango: { minimo: null, maximo: null },
      confianza: "sin_datos",
      fuentes: [],
      actualizadaEn: null,
      coinciden: null,
      lecturaManualReciente: false,
    };
  }

  const masReciente = edadEnDias(automaticas[0].fecha);
  const cercanas = automaticas.filter(
    (lectura) => masReciente - edadEnDias(lectura.fecha) <= MS_POR_DIA,
  );
  const fuentes = cercanas.map((lectura) =>
    describirFuente(lectura, metrica, true),
  );
  const rango = calcularRango(fuentes);
  const coincide = fuentes.length < 2
    ? null
    : rango.maximo - rango.minimo <= tolerancia;
  const valor = fuentes.reduce((total, fuente) => total + fuente.valor, 0) /
    fuentes.length;
  const ultima = cercanas.reduce((actual, lectura) => {
    const tiempo = tiempoDeLectura(lectura);
    return tiempo !== null && (actual === null || tiempo > actual) ? tiempo : actual;
  }, null);

  return {
    valor: aUnaDecimal(valor),
    rango,
    confianza: fuentes.length === 1 ? "media" : coincide ? "alta" : "baja",
    fuentes,
    actualizadaEn: ultima === null ? cercanas[0].fecha : new Date(ultima),
    coinciden: coincide,
    lecturaManualReciente: false,
  };
}

async function consolidar(parcelaId, { ahora = Date.now() } = {}) {
  const [lecturas, umbrales] = await Promise.all([
    repositorio.listarUltimasLecturasPorFuente(parcelaId),
    obtenerUmbrales(),
  ]);
  const humedad = consolidarMetrica(
    lecturas,
    "humedad",
    umbrales.toleranciaHumedad,
    umbrales.vigenciaManual,
    ahora,
  );
  const temperatura = consolidarMetrica(
    lecturas,
    "temperatura",
    umbrales.toleranciaTemperatura,
    umbrales.vigenciaManual,
    ahora,
  );
  const confianzaOrden = ["sin_datos", "baja", "media", "alta"];
  const confianza = [humedad.confianza, temperatura.confianza].reduce(
    (menor, actual) => (
      confianzaOrden.indexOf(actual) < confianzaOrden.indexOf(menor) ? actual : menor
    ),
    "alta",
  );
  const actualizadas = [humedad.actualizadaEn, temperatura.actualizadaEn]
    .filter(Boolean)
    .map((valor) => new Date(valor).getTime())
    .filter(Number.isFinite);
  return {
    humedad,
    temperatura,
    confianza,
    actualizadaEn: actualizadas.length ? new Date(Math.max(...actualizadas)) : null,
    lecturaManualReciente:
      humedad.lecturaManualReciente || temperatura.lecturaManualReciente,
    umbrales,
  };
}

function numeroPronostico(valor) {
  const numero = numeroFinito(valor);
  return numero === null ? null : aUnaDecimal(numero);
}

async function obtenerPronostico(parcela) {
  const umbrales = await obtenerUmbrales();
  const vacio = {
    disponible: false,
    dias: [],
    fuentes: [],
    umbrales,
  };
  if (
    !parcela ||
    numeroFinito(parcela.latitud) === null ||
    numeroFinito(parcela.longitud) === null
  ) {
    return vacio;
  }

  const [clima, suelo] = await Promise.allSettled([
    openMeteo.pronostico(Number(parcela.latitud), Number(parcela.longitud)),
    openMeteo.obtenerSuelo(Number(parcela.latitud), Number(parcela.longitud)),
  ]);
  const climaDisponible = clima.status === "fulfilled" && Array.isArray(clima.value);
  const sueloDisponible = suelo.status === "fulfilled" && Array.isArray(suelo.value.pronostico);
  if (clima.status === "rejected") {
    logger.warn(
      { err: clima.reason, parcelaId: parcela.id, fuente: "open_meteo_clima" },
      "No se pudo consultar el pronóstico diario de Open-Meteo",
    );
  }
  if (suelo.status === "rejected") {
    logger.warn(
      { err: suelo.reason, parcelaId: parcela.id, fuente: "open_meteo_suelo" },
      "No se pudo consultar la humedad pronosticada del suelo",
    );
  }

  const porFecha = new Map();
  if (climaDisponible) {
    for (const dia of clima.value) {
      porFecha.set(fechaISO(dia.fecha), {
        fecha: fechaISO(dia.fecha),
        temperaturaMinima: numeroPronostico(dia.temperaturaMinima),
        precipitacionMm: numeroPronostico(dia.precipitacionMm),
        humedadSuelo: null,
      });
    }
  }
  if (sueloDisponible) {
    for (const dia of suelo.value.pronostico) {
      const fecha = fechaISO(dia.fecha);
      const actual = porFecha.get(fecha) || {
        fecha,
        temperaturaMinima: null,
        precipitacionMm: null,
        humedadSuelo: null,
      };
      actual.humedadSuelo = numeroPronostico(dia.humedad);
      porFecha.set(fecha, actual);
    }
  }

  const dias = [...porFecha.values()]
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .slice(0, 7)
    .map((dia) => {
      const riesgoHelada = dia.temperaturaMinima !== null &&
        dia.temperaturaMinima <= umbrales.riesgoHelada;
      const helada = dia.temperaturaMinima !== null &&
        dia.temperaturaMinima <= umbrales.helada;
      const lluviaSignificativa = dia.precipitacionMm !== null &&
        dia.precipitacionMm >= umbrales.lluviaSignificativa;
      return {
        ...dia,
        riesgoHelada,
        helada,
        lluviaSignificativa,
        estado: riesgoHelada
          ? "helada"
          : lluviaSignificativa
            ? "lluvia"
            : dia.temperaturaMinima !== null
              ? "bueno"
              : "sin_datos",
      };
    });

  const fuentes = climaDisponible || sueloDisponible ? ["open_meteo"] : [];
  return {
    disponible: dias.length > 0,
    dias,
    fuentes,
    umbrales,
  };
}

module.exports = { consolidar, obtenerPronostico, obtenerUmbrales, CLAVES_CONFIGURACION };
