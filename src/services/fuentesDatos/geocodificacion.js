// Búsqueda de lugares con la API de geocodificación de Open-Meteo (sin clave).
// Documentación: https://open-meteo.com/en/docs/geocoding-api
// El filtro de país se hace con el parámetro `countryCode` (ISO-3166-1 alpha2),
// que Open-Meteo documenta como la forma inequívoca de limitar resultados a un
// país ("Use this parameter for unambiguous country-code filtering").
// Las coordenadas se redondean a dos decimales y el resultado se cachea 24 h.
const env = require("../../config/env");
const { solicitarJson } = require("./clienteHttp");

const PAIS = "PE";
const LONGITUD_MINIMA = 2;
const LONGITUD_MAXIMA = 80;
const RESULTADOS = 8;

// Límites aproximados del Perú; se usa la misma caja que el calendario.
const PERU = { latMin: -18.5, latMax: 0.1, lonMin: -81.5, lonMax: -68.5 };

function redondear(valor) {
  return Number(Number(valor).toFixed(2));
}

function enPeru(latitud, longitud) {
  const lat = Number(latitud);
  const lon = Number(longitud);
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= PERU.latMin &&
    lat <= PERU.latMax &&
    lon >= PERU.lonMin &&
    lon <= PERU.lonMax
  );
}

/** Valida el texto de búsqueda: 2 a 80 caracteres con letras o números. */
function normalizarConsulta(valor) {
  const texto = String(valor || "")
    .replace(/\s+/g, " ")
    .trim();
  if (texto.length < LONGITUD_MINIMA || texto.length > LONGITUD_MAXIMA) {
    return null;
  }
  if (!/^[\p{L}\p{N}][\p{L}\p{N}\s.'(),-]*$/u.test(texto)) return null;
  return texto;
}

function etiqueta(resultado) {
  return [resultado.name, resultado.admin1, resultado.country]
    .filter(Boolean)
    .join(", ");
}

/** Convierte la respuesta cruda de Open-Meteo en resultados de Perú. */
function normalizarRespuesta(datos) {
  const resultados = datos && Array.isArray(datos.results) ? datos.results : [];
  return resultados
    .filter(
      (fila) =>
        fila &&
        fila.country_code === PAIS &&
        Number.isFinite(Number(fila.latitude)) &&
        Number.isFinite(Number(fila.longitude)),
    )
    .map((fila) => {
      const latitud = redondear(fila.latitude);
      const longitud = redondear(fila.longitude);
      return {
        id: `${fila.id || etiqueta(fila)}:${latitud},${longitud}`,
        nombre: String(fila.name || ""),
        region: fila.admin1 ? String(fila.admin1) : null,
        pais: fila.country ? String(fila.country) : "Perú",
        etiqueta: etiqueta(fila),
        latitud,
        longitud,
        enPeru: enPeru(latitud, longitud),
      };
    });
}

async function buscar(texto, opciones = {}) {
  const consulta = normalizarConsulta(texto);
  if (!consulta) return [];
  const url = new URL(env.calendario.geocodificacionUrl);
  url.searchParams.set("name", consulta);
  url.searchParams.set("count", String(RESULTADOS));
  url.searchParams.set("language", "es");
  url.searchParams.set("format", "json");
  // Verificado en la documentación de Open-Meteo: el parámetro de país es
  // `countryCode`; "country" no existe como parámetro de esta API.
  url.searchParams.set("countryCode", PAIS);
  const datos = await solicitarJson(url.toString(), {
    timeoutMs: opciones.timeoutMs || env.openMeteo.tiempoLimiteMs,
    reintentos: opciones.reintentos || 1,
    cacheKey: `geocodificacion_open_meteo:${PAIS}:${consulta.toLowerCase()}`,
    cacheTtlMs: env.calendario.geocodificacion.cacheTtlMs,
  });
  if (datos && datos.error === true) {
    throw new Error("Open-Meteo rechazó la búsqueda de lugares.");
  }
  return normalizarRespuesta(datos);
}

module.exports = {
  PERU,
  PAIS,
  buscar,
  enPeru,
  normalizarConsulta,
  normalizarRespuesta,
  redondear,
};
