const env = require("../../config/env");
const {
  claveCoordenadas,
  coordenadaRedondeada,
  solicitarJson,
} = require("./clienteHttp");
const { fechaISO, rangoFechas } = require("./fecha");
const { validarImplementacion } = require("./fuenteDatos");
const logger = require("../../config/logger");

const BASE_URL = "https://api.open-meteo.com/v1/forecast";

function crearUrl(latitud, longitud, tipo, opciones = {}) {
  const url = new URL(BASE_URL);
  url.searchParams.set("latitude", String(coordenadaRedondeada(latitud)));
  url.searchParams.set("longitude", String(coordenadaRedondeada(longitud)));
  url.searchParams.set("timezone", "auto");
  if (tipo === "diario") {
    url.searchParams.set(
      "daily",
      "temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,weather_code",
    );
    url.searchParams.set("forecast_days", String(opciones.forecastDays || 7));
  }
  return url;
}

async function consultar(url, clave, opciones = {}) {
  const {
    timeoutMs = env.openMeteo.tiempoLimiteMs,
    reintentos = env.fuentesDatos.reintentos,
  } = opciones;
  return solicitarJson(url, {
    timeoutMs,
    reintentos,
    cacheKey: clave,
    cacheTtlMs: env.fuentesDatos.cacheTtlMs,
  });
}

function promedio(valores) {
  const validos = valores
    .filter(
      (valor) =>
        valor !== null &&
        valor !== undefined &&
        valor !== "" &&
        Number.isFinite(Number(valor)),
    )
    .map(Number);
  if (!validos.length) return null;
  return validos.reduce((suma, valor) => suma + valor, 0) / validos.length;
}

function fechaHoyEnZona(zona) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: zona || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const partesPorTipo = Object.fromEntries(
    partes.map((parte) => [parte.type, parte.value]),
  );
  return `${partesPorTipo.year}-${partesPorTipo.month}-${partesPorTipo.day}`;
}

function valoresValidos(valores, minimo, maximo) {
  return valores.map((valor) => {
    const numero = Number(valor);
    if (
      valor === null ||
      valor === undefined ||
      valor === "" ||
      !Number.isFinite(numero) ||
      numero < minimo ||
      numero > maximo
    ) {
      return null;
    }
    return numero;
  });
}

async function obtenerSuelo(latitud, longitud, opciones = {}) {
  const { forecastDays = 7 } = opciones;
  if (
    !Number.isInteger(forecastDays) ||
    forecastDays < 1 ||
    forecastDays > 16
  ) {
    throw new RangeError(
      "El pronóstico de suelo debe solicitar entre 1 y 16 días.",
    );
  }
  const url = new URL(BASE_URL);
  url.searchParams.set("latitude", String(coordenadaRedondeada(latitud)));
  url.searchParams.set("longitude", String(coordenadaRedondeada(longitud)));
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("past_days", "3");
  url.searchParams.set("forecast_days", String(forecastDays));
  url.searchParams.set(
    "hourly",
    "soil_moisture_3_to_9cm,soil_moisture_9_to_27cm,soil_temperature_6cm",
  );
  const hoyUTC = new Date().toISOString().slice(0, 10);
  const datos = await consultar(
    url,
    claveCoordenadas(
      "open_meteo_suelo",
      latitud,
      longitud,
      `${hoyUTC}:${forecastDays}`,
    ),
    opciones,
  );
  if (datos && datos.error === true) {
    const reason = String(datos.reason || "Open-Meteo no indicó el motivo.");
    logger.warn(
      { reason },
      "Open-Meteo rechazó la consulta de datos del suelo",
    );
    throw new Error("Open-Meteo no pudo devolver los datos del suelo.");
  }

  const horario = datos && datos.hourly;
  const campos = [
    "time",
    "soil_moisture_3_to_9cm",
    "soil_moisture_9_to_27cm",
    "soil_temperature_6cm",
  ];
  if (
    !horario ||
    campos.some((campo) => !Array.isArray(horario[campo])) ||
    campos.some((campo) => horario[campo].length !== horario.time.length)
  ) {
    throw new Error("Open-Meteo devolvió datos horarios de suelo incompletos.");
  }

  const humedad3a9 = valoresValidos(horario.soil_moisture_3_to_9cm, 0, 1);
  const humedad9a27 = valoresValidos(horario.soil_moisture_9_to_27cm, 0, 1);
  const temperatura6 = valoresValidos(horario.soil_temperature_6cm, -30, 60);
  const dias = new Map();
  horario.time.forEach((hora, indice) => {
    const fecha = String(hora).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return;
    if (!dias.has(fecha)) {
      dias.set(fecha, {
        humedad3a9: [],
        humedad9a27: [],
        temperatura6: [],
      });
    }
    const dia = dias.get(fecha);
    if (humedad3a9[indice] !== null) dia.humedad3a9.push(humedad3a9[indice]);
    if (humedad9a27[indice] !== null) dia.humedad9a27.push(humedad9a27[indice]);
    if (temperatura6[indice] !== null)
      dia.temperatura6.push(temperatura6[indice]);
  });

  const hoy = fechaHoyEnZona(datos.timezone);
  const observadas = [];
  const pronostico = [];
  for (const [fecha, valores] of dias) {
    const humedad = promedio([
      promedio(valores.humedad3a9),
      promedio(valores.humedad9a27),
    ]);
    const temperatura = promedio(valores.temperatura6);
    if (humedad === null || temperatura === null) continue;
    const lectura = {
      fecha,
      humedad: Number((humedad * 100).toFixed(1)),
      temperatura: Number(temperatura.toFixed(1)),
    };
    (fecha <= hoy ? observadas : pronostico).push(lectura);
  }

  return { observadas, pronostico };
}

const openMeteo = validarImplementacion({
  clave: "open_meteo",
  async obtener(latitud, longitud, fechaInicio, fechaFin, opciones = {}) {
    const { inicio, fin } = rangoFechas(fechaInicio, fechaFin);
    const forecastDays = opciones.forecastDays || 7;
    if (
      !Number.isInteger(forecastDays) ||
      forecastDays < 1 ||
      forecastDays > 16
    ) {
      throw new RangeError(
        "El pronóstico diario debe solicitar entre 1 y 16 días.",
      );
    }
    const url = crearUrl(latitud, longitud, "diario", { forecastDays });
    const datos = await consultar(
      url,
      claveCoordenadas(
        "open_meteo_diario",
        latitud,
        longitud,
        `${inicio}:${fin}:${forecastDays}`,
      ),
      opciones,
    );
    const diario = datos && datos.daily;
    const campos = [
      "time",
      "temperature_2m_min",
      "temperature_2m_max",
      "precipitation_probability_max",
      "precipitation_sum",
      "weather_code",
    ];
    if (
      !diario ||
      campos.some((campo) => !Array.isArray(diario[campo])) ||
      campos.some((campo) => diario[campo].length !== diario.time.length)
    ) {
      throw new Error("Open-Meteo devolvió un pronóstico diario incompleto.");
    }
    return diario.time.flatMap((fecha, indice) => {
      if (fecha < inicio || fecha > fin) return [];
      const temperaturaMinima = valoresValidos(
        [diario.temperature_2m_min[indice]],
        -90,
        65,
      )[0];
      const temperaturaMaxima = valoresValidos(
        [diario.temperature_2m_max[indice]],
        -90,
        65,
      )[0];
      return [
        {
          fecha: fechaISO(fecha),
          humedad: null,
          temperatura: temperaturaMinima,
          temperaturaMinima,
          temperaturaMaxima,
          probabilidadLluvia:
            diario.precipitation_probability_max[indice] == null
              ? null
              : Number(diario.precipitation_probability_max[indice]),
          precipitacionMm:
            diario.precipitation_sum[indice] == null
              ? null
              : Number(diario.precipitation_sum[indice]),
          codigoClima:
            diario.weather_code[indice] == null
              ? null
              : Number(diario.weather_code[indice]),
        },
      ];
    });
  },
});

async function pronostico(latitud, longitud) {
  const hoy = new Date().toISOString().slice(0, 10);
  const fin = new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10);
  return openMeteo.obtener(latitud, longitud, hoy, fin);
}

async function pronosticoHorario(latitud, longitud, horas = 48) {
  if (!Number.isInteger(horas) || horas < 1 || horas > 168) {
    throw new RangeError(
      "El pronóstico horario debe solicitar entre 1 y 168 horas.",
    );
  }
  const url = new URL(BASE_URL);
  url.searchParams.set("latitude", String(coordenadaRedondeada(latitud)));
  url.searchParams.set("longitude", String(coordenadaRedondeada(longitud)));
  url.searchParams.set("hourly", "temperature_2m");
  url.searchParams.set("forecast_hours", String(horas));
  url.searchParams.set("timezone", "auto");
  const datos = await consultar(
    url,
    claveCoordenadas(
      "open_meteo_horario",
      latitud,
      longitud,
      `${new Date().toISOString().slice(0, 10)}:${horas}-h`,
    ),
  );
  const horario = datos && datos.hourly;
  if (
    !horario ||
    !Array.isArray(horario.time) ||
    !Array.isArray(horario.temperature_2m) ||
    horario.time.length !== horario.temperature_2m.length
  ) {
    throw new Error("Open-Meteo devolvió un pronóstico horario incompleto.");
  }
  return horario.time.map((fecha, indice) => ({
    fecha,
    temperatura: Number(horario.temperature_2m[indice]),
  }));
}

async function obtenerElevacion(latitud, longitud) {
  const url = new URL("https://api.open-meteo.com/v1/elevation");
  url.searchParams.set("latitude", String(coordenadaRedondeada(latitud)));
  url.searchParams.set("longitude", String(coordenadaRedondeada(longitud)));
  const datos = await consultar(
    url,
    claveCoordenadas("open_meteo_elevacion", latitud, longitud),
  );
  const elevacion = Array.isArray(datos.elevation)
    ? Number(datos.elevation[0])
    : NaN;
  if (!Number.isFinite(elevacion) || elevacion < 0 || elevacion > 6000) {
    throw new Error("Open-Meteo no devolvió una altitud válida.");
  }
  return Math.round(elevacion);
}

module.exports = {
  openMeteo,
  obtenerSuelo,
  pronostico,
  pronosticoHorario,
  obtenerElevacion,
};
