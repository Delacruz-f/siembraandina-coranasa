const env = require("../../config/env");
const { claveCoordenadas, coordenadaRedondeada, solicitarJson } = require("./clienteHttp");
const { fechaNASA, rangoFechas } = require("./fecha");
const { validarImplementacion } = require("./fuenteDatos");

const BASE_URL = "https://power.larc.nasa.gov/api/temporal/daily/point";

function convertirHumedad(gwetroot) {
  if (gwetroot === null || gwetroot === undefined || gwetroot === "") return null;
  const indice = Number(gwetroot);
  if (!Number.isFinite(indice) || indice < 0 || indice > 1) return null;
  return Number((indice * 100).toFixed(1));
}

const nasaPower = validarImplementacion({
  clave: "nasa_power",
  async obtener(latitud, longitud, fechaInicio, fechaFin, opciones = {}) {
    const { inicio, fin } = rangoFechas(fechaInicio, fechaFin);
    const lat = coordenadaRedondeada(latitud);
    const lon = coordenadaRedondeada(longitud);
    const parametros = new URLSearchParams({
      parameters: "GWETROOT,TS",
      community: "AG",
      longitude: String(lon),
      latitude: String(lat),
      start: fechaNASA(inicio),
      end: fechaNASA(fin),
      format: "JSON",
    });
    const {
      timeoutMs = env.nasa.tiempoLimiteMs,
      reintentos = env.fuentesDatos.reintentos,
    } = opciones;
    const respuesta = await solicitarJson(`${BASE_URL}?${parametros}`, {
      timeoutMs,
      reintentos,
      cacheKey: claveCoordenadas("nasa_power", lat, lon, `${inicio}:${fin}`),
      cacheTtlMs: env.fuentesDatos.cacheTtlMs,
    });
    const parametrosRespuesta = respuesta &&
      respuesta.properties &&
      respuesta.properties.parameter;
    const humedadDiaria = parametrosRespuesta && parametrosRespuesta.GWETROOT;
    const temperaturaDiaria = parametrosRespuesta && parametrosRespuesta.TS;
    if (!humedadDiaria || !temperaturaDiaria) {
      throw new Error("NASA POWER devolvió una respuesta sin GWETROOT o TS.");
    }
    return Object.keys(temperaturaDiaria)
      .sort()
      .flatMap((dia) => {
        const temperatura = Number(temperaturaDiaria[dia]);
        const humedad = convertirHumedad(humedadDiaria[dia]);
        if (
          !Number.isFinite(temperatura) ||
          temperatura <= -90 ||
          temperatura > 65 ||
          humedad === null
        ) {
          return [];
        }
        return [{
          fecha: `${dia.slice(0, 4)}-${dia.slice(4, 6)}-${dia.slice(6, 8)}`,
          humedad,
          temperatura: Number(temperatura.toFixed(1)),
          precipitacionMm: null,
          temperaturaMinima: null,
        }];
      });
  },
});

module.exports = { nasaPower, convertirHumedad };
