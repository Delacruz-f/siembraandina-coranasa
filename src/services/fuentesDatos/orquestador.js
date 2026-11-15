const env = require("../../config/env");
const logger = require("../../config/logger");
const repositorio = require("../../modules/lecturas/lecturas.repository");
const { rangoFechas } = require("./fecha");
const openMeteo = require("./openMeteo");
const { nasaPower } = require("./nasaPower");
const { smap } = require("./smap");

const OPCIONES_HTTP = { timeoutMs: 8000, reintentos: 1 };
const RANGO_NASA_DIAS = 10;

function rangoDiario(dias, fecha) {
  const fin = new Date(fecha);
  const inicio = new Date(fin);
  inicio.setUTCDate(inicio.getUTCDate() - dias);
  return rangoFechas(inicio, fin);
}

function validarLectura(lectura) {
  return Boolean(
    lectura &&
    /^\d{4}-\d{2}-\d{2}$/.test(lectura.fecha) &&
    lectura.humedad !== null &&
    lectura.humedad !== undefined &&
    lectura.humedad !== "" &&
    Number.isFinite(Number(lectura.humedad)) &&
    Number(lectura.humedad) >= 0 &&
    Number(lectura.humedad) <= 100 &&
    lectura.temperatura !== null &&
    lectura.temperatura !== undefined &&
    lectura.temperatura !== "" &&
    Number.isFinite(Number(lectura.temperatura)) &&
    Number(lectura.temperatura) >= -30 &&
    Number(lectura.temperatura) <= 60,
  );
}

function esCoordenadaValida(valor, minimo, maximo) {
  if (valor === null || valor === undefined || valor === "") return false;
  const numero = Number(valor);
  return Number.isFinite(numero) && numero >= minimo && numero <= maximo;
}

function motivoDeError(error) {
  const mensaje = String(error && error.message ? error.message : "");
  if (
    (error && error.name === "AbortError") ||
    /timeout|timed out|tiempo agotado/i.test(mensaje)
  ) {
    return "tiempo agotado";
  }
  if (error && Number.isInteger(error.estado)) {
    return `error HTTP ${error.estado}`;
  }
  return "error de fuente externa";
}

function obtenerProveedores(fecha) {
  const rangoNASA = rangoDiario(RANGO_NASA_DIAS, fecha);
  return {
    open_meteo_suelo: {
      configurada: true,
      observacion:
        "Open-Meteo: humedad volumétrica media de 3–9 cm y 9–27 cm; temperatura de suelo a 6 cm.",
      obtener: async (parcela) => {
        const resultado = await openMeteo.obtenerSuelo(
          Number(parcela.latitud),
          Number(parcela.longitud),
          OPCIONES_HTTP,
        );
        return resultado.observadas;
      },
    },
    nasa_power: {
      configurada: true,
      observacion:
        "NASA POWER: GWETROOT × 100 (índice porcentual) y TS (temperatura superficial estimada).",
      obtener: (parcela) =>
        nasaPower.obtener(
          Number(parcela.latitud),
          Number(parcela.longitud),
          rangoNASA.inicio,
          rangoNASA.fin,
          OPCIONES_HTTP,
        ),
    },
    smap: {
      configurada: Boolean(
        env.fuentesDatos.earthdata.usuario && env.fuentesDatos.earthdata.token,
      ),
      observacion: "Lectura automática de SMAP.",
      obtener: (parcela) =>
        smap.obtener(
          Number(parcela.latitud),
          Number(parcela.longitud),
          rangoNASA.inicio,
          rangoNASA.fin,
        ),
    },
  };
}

async function registrarFallo(parcela, fuente, motivo, fecha) {
  logger.warn(
    { fuente: fuente.clave, motivo },
    "Falló una fuente de lecturas de suelo",
  );
  await repositorio.guardarEstadoSincronizacion(parcela.id, fuente.id, {
    exitosa: false,
    consultadoEn: fecha,
    errorResumido: motivo,
  });
  return { clave: fuente.clave, motivo };
}

async function obtenerLecturas(parcela, { fecha = new Date() } = {}) {
  if (!parcela || !Number.isInteger(Number(parcela.id))) {
    throw new TypeError(
      "Se requiere una parcela válida para consultar fuentes.",
    );
  }
  const filasFuentes = await repositorio.listarFuentesAutomaticas();
  const fuentes = filasFuentes
    .filter((fuente) =>
      ["open_meteo_suelo", "nasa_power", "smap"].includes(fuente.clave),
    )
    .sort(
      (a, b) =>
        Number(a.prioridad || 100) - Number(b.prioridad || 100) ||
        Number(a.id) - Number(b.id),
    );
  if (!fuentes.length) {
    throw new Error("No hay fuentes automáticas de suelo configuradas.");
  }
  const proveedores = obtenerProveedores(fecha);
  const resultado = {
    fuentesConsultadas: [],
    fuentesFallidas: [],
    fuentesOmitidas: [],
    lecturasInsertadas: 0,
  };

  for (const fuente of fuentes) {
    const proveedor = proveedores[fuente.clave];
    if (!proveedor.configurada) {
      resultado.fuentesOmitidas.push(fuente.clave);
      continue;
    }

    if (
      !esCoordenadaValida(parcela.latitud, -90, 90) ||
      !esCoordenadaValida(parcela.longitud, -180, 180)
    ) {
      resultado.fuentesFallidas.push(
        await registrarFallo(parcela, fuente, "coordenadas no válidas", fecha),
      );
      continue;
    }

    let lecturas;
    try {
      lecturas = await proveedor.obtener(parcela);
    } catch (error) {
      resultado.fuentesFallidas.push(
        await registrarFallo(parcela, fuente, motivoDeError(error), fecha),
      );
      continue;
    }

    const validas = Array.isArray(lecturas)
      ? lecturas.filter(validarLectura)
      : [];
    if (!validas.length) {
      resultado.fuentesFallidas.push(
        await registrarFallo(parcela, fuente, "sin datos", fecha),
      );
      continue;
    }

    const insertadas = await repositorio.registrarAutomaticas(
      parcela.id,
      fuente.id,
      validas,
      proveedor.observacion,
    );
    const fechaUltimoDato = validas
      .map((lectura) => lectura.fecha)
      .sort()
      .pop();
    await repositorio.guardarEstadoSincronizacion(parcela.id, fuente.id, {
      exitosa: true,
      consultadoEn: fecha,
      fechaUltimoDato,
    });
    resultado.fuentesConsultadas.push(fuente.clave);
    resultado.lecturasInsertadas += insertadas;
  }

  return resultado;
}

module.exports = { obtenerLecturas };
