const cache = new Map();
const solicitudesEnCurso = new Map();

class ErrorHttpFuente extends Error {
  constructor(mensaje, estado) {
    super(mensaje);
    this.name = "ErrorHttpFuente";
    this.estado = estado;
  }
}

function coordenadaRedondeada(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) throw new TypeError("Coordenada no válida.");
  return Number(numero.toFixed(2));
}

function claveCoordenadas(prefijo, latitud, longitud, sufijo = "") {
  const lat = coordenadaRedondeada(latitud);
  const lon = coordenadaRedondeada(longitud);
  return `${prefijo}:${lat.toFixed(2)},${lon.toFixed(2)}:${sufijo}`;
}

function esperar(ms) {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

async function solicitarJson(url, {
  timeoutMs = 8000,
  reintentos = 2,
  cacheKey,
  cacheTtlMs = 0,
  pausaInicialMs = 150,
  fetchImpl = global.fetch,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("Este runtime no proporciona fetch para consultar fuentes externas.");
  }
  if (cacheKey) {
    const guardado = cache.get(cacheKey);
    if (guardado && guardado.expiraEn > Date.now()) return guardado.valor;
    if (guardado) cache.delete(cacheKey);
    if (solicitudesEnCurso.has(cacheKey)) return solicitudesEnCurso.get(cacheKey);
  }

  const solicitud = (async () => {
    let ultimoError;
    for (let intento = 0; intento <= reintentos; intento += 1) {
      const controlador = new AbortController();
      const temporizador = setTimeout(() => controlador.abort(), timeoutMs);
      try {
        const respuesta = await fetchImpl(url, { signal: controlador.signal });
        if (!respuesta.ok) {
          const error = new ErrorHttpFuente(
            `La fuente externa respondió HTTP ${respuesta.status}.`,
            respuesta.status,
          );
          if (respuesta.status < 500 && respuesta.status !== 429) throw error;
          ultimoError = error;
        } else {
          const valor = await respuesta.json();
          if (cacheKey && cacheTtlMs > 0) {
            cache.set(cacheKey, { valor, expiraEn: Date.now() + cacheTtlMs });
          }
          return valor;
        }
      } catch (error) {
        ultimoError = error;
        if (
          error instanceof ErrorHttpFuente &&
          error.estado < 500 &&
          error.estado !== 429
        ) {
          throw error;
        }
      } finally {
        clearTimeout(temporizador);
      }
      if (intento < reintentos) {
        await esperar(pausaInicialMs * (2 ** intento));
      }
    }
    throw ultimoError || new Error("No se pudo consultar la fuente externa.");
  })();

  if (cacheKey) solicitudesEnCurso.set(cacheKey, solicitud);
  try {
    return await solicitud;
  } finally {
    if (cacheKey) solicitudesEnCurso.delete(cacheKey);
  }
}

function limpiarCache() {
  cache.clear();
  solicitudesEnCurso.clear();
}

module.exports = {
  ErrorHttpFuente,
  coordenadaRedondeada,
  claveCoordenadas,
  solicitarJson,
  limpiarCache,
};
