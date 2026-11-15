const lecturasServicio = require("../lecturas/lecturas.service");
const publicoRepositorio = require("./publico.repository");
const logger = require("../../config/logger");
const openMeteo = require("../../services/fuentesDatos/openMeteo");
const { nasaPower } = require("../../services/fuentesDatos/nasaPower");

const DIAS_TECNICO_RECIENTE = 30;
const DIAS_HISTORIAL_ACTUAL = 45;
const FUENTES_ORDENADAS = ["manual", "nasa_power", "open_meteo_suelo"];
const OPCIONES_FUENTES = { timeoutMs: 6000, reintentos: 0 };

function diaIso(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  const dia = String(valor).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : null;
}

function restarDias(fecha, dias) {
  const resultado = new Date(fecha);
  resultado.setUTCDate(resultado.getUTCDate() - dias);
  return resultado.toISOString().slice(0, 10);
}

function restarMeses(fecha, meses) {
  const resultado = new Date(fecha);
  resultado.setUTCDate(1);
  resultado.setUTCMonth(resultado.getUTCMonth() - meses);
  return resultado.toISOString().slice(0, 10);
}

function diasEntre(inicio, fin) {
  const fechaInicio = new Date(`${inicio}T00:00:00Z`);
  const fechaFin = new Date(`${fin}T00:00:00Z`);
  return Math.max(0, Math.floor((fechaFin - fechaInicio) / 86400000));
}

function coordenadasValidas(comunidad) {
  return (
    comunidad &&
    comunidad.latitud !== null &&
    comunidad.latitud !== undefined &&
    comunidad.latitud !== "" &&
    comunidad.longitud !== null &&
    comunidad.longitud !== undefined &&
    comunidad.longitud !== "" &&
    Number.isFinite(Number(comunidad.latitud)) &&
    Number.isFinite(Number(comunidad.longitud)) &&
    Number(comunidad.latitud) >= -90 &&
    Number(comunidad.latitud) <= 90 &&
    Number(comunidad.longitud) >= -180 &&
    Number(comunidad.longitud) <= 180
  );
}

function ultimoDato(filas, desde, hasta) {
  return filas
    .filter((fila) => {
      const fecha = diaIso(fila.fecha);
      const tieneValores = ["humedad", "temperatura"].every(
        (campo) =>
          fila[campo] !== null &&
          fila[campo] !== undefined &&
          fila[campo] !== "" &&
          Number.isFinite(Number(fila[campo])),
      );
      return fecha && fecha >= desde && fecha <= hasta && tieneValores;
    })
    .sort((a, b) => diaIso(a.fecha).localeCompare(diaIso(b.fecha)))
    .pop();
}

function formatoLectura(fila, fuente, fechaActual) {
  return {
    fecha: diaIso(fila.fecha),
    humedad: Number(fila.humedad),
    temperatura: Number(fila.temperatura),
    fuente,
    diasDesde: diasEntre(diaIso(fila.fecha), fechaActual),
  };
}

async function datosDeFuentes(comunidad, fechaActual, hoy) {
  if (!coordenadasValidas(comunidad)) return null;
  const desde = restarDias(hoy, DIAS_HISTORIAL_ACTUAL);
  const latitud = Number(comunidad.latitud);
  const longitud = Number(comunidad.longitud);

  try {
    const filas = await nasaPower.obtener(
      latitud,
      longitud,
      desde,
      fechaActual,
      OPCIONES_FUENTES,
    );
    const lectura = ultimoDato(filas, desde, fechaActual);
    if (lectura) return formatoLectura(lectura, "nasa_power", fechaActual);
  } catch (error) {
    logger.warn(
      { comunidadId: comunidad.id, fuente: "nasa_power", error: error.message },
      "No se pudieron obtener datos NASA para el monitor público",
    );
  }

  try {
    const resultado = await openMeteo.obtenerSuelo(latitud, longitud, {
      ...OPCIONES_FUENTES,
      forecastDays: 1,
    });
    const lectura = ultimoDato(resultado.observadas || [], desde, fechaActual);
    if (lectura)
      return formatoLectura(lectura, "open_meteo_suelo", fechaActual);
  } catch (error) {
    logger.warn(
      {
        comunidadId: comunidad.id,
        fuente: "open_meteo_suelo",
        error: error.message,
      },
      "No se pudieron obtener datos Open-Meteo para el monitor público",
    );
  }
  return null;
}

function promedio(filas, campo) {
  const valores = filas
    .map((fila) => fila[campo])
    .filter(
      (valor) =>
        valor !== null &&
        valor !== undefined &&
        valor !== "" &&
        Number.isFinite(Number(valor)),
    )
    .map(Number);
  if (!valores.length) return null;
  return valores.reduce((total, valor) => total + valor, 0) / valores.length;
}

function agruparPorDiaYFuente(filas) {
  const grupos = new Map();
  for (const fila of filas) {
    const fecha = diaIso(fila.fecha);
    if (!fecha) continue;
    const fuente = fila.fuente === "manual" ? "tecnico" : fila.fuente;
    const clave = `${fecha}:${fuente}`;
    if (!grupos.has(clave)) grupos.set(clave, { fecha, fuente, filas: [] });
    grupos.get(clave).filas.push(fila);
  }
  return [...grupos.values()].map((grupo) => ({
    fecha: grupo.fecha,
    fuente: grupo.fuente,
    humedad: promedio(grupo.filas, "humedad"),
    temperatura: promedio(grupo.filas, "temperatura"),
  }));
}

function datosPorComunidad(filas, fechaActual) {
  const porFuente = new Map();
  const grupos = agruparPorDiaYFuente(filas);
  for (const fuente of FUENTES_ORDENADAS) {
    const claveFuente = fuente === "manual" ? "tecnico" : fuente;
    const candidatas = grupos
      .filter((grupo) => grupo.fuente === claveFuente)
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
    const lectura = candidatas[0];
    if (lectura) porFuente.set(fuente, lectura);
  }

  const lecturaTecnica = porFuente.get("manual");
  if (
    lecturaTecnica &&
    diasEntre(lecturaTecnica.fecha, fechaActual) <= DIAS_TECNICO_RECIENTE
  ) {
    return lecturaTecnica;
  }
  return (
    porFuente.get("nasa_power") || porFuente.get("open_meteo_suelo") || null
  );
}

async function datosActuales(comunidadIds, { hoy = new Date() } = {}) {
  if (!comunidadIds.length) return {};
  const comunidades = comunidadIds.map((fila) =>
    fila && typeof fila === "object" ? fila : { id: fila },
  );
  const ids = comunidades.map((comunidad) => Number(comunidad.id));
  const fechaActual = diaIso(hoy);
  const filas = await lecturasServicio.listarPublicasDeComunidades(
    ids,
    restarDias(hoy, DIAS_HISTORIAL_ACTUAL),
  );
  const porComunidad = new Map();
  for (const fila of filas) {
    const id = Number(fila.comunidad_id);
    if (!porComunidad.has(id)) porComunidad.set(id, []);
    porComunidad.get(id).push(fila);
  }

  const resultados = await Promise.all(
    comunidades.map(async (comunidad) => {
      const id = Number(comunidad.id);
      const lectura = datosPorComunidad(
        porComunidad.get(id) || [],
        fechaActual,
      );
      if (lectura) {
        return [
          id,
          {
            fecha: lectura.fecha,
            humedad: lectura.humedad,
            temperatura: lectura.temperatura,
            fuente: lectura.fuente,
            diasDesde: diasEntre(lectura.fecha, fechaActual),
          },
        ];
      }
      return [id, await datosDeFuentes(comunidad, fechaActual, hoy)];
    }),
  );
  return Object.fromEntries(resultados);
}

async function historialPublicoComunidad(
  comunidadId,
  meses = 1,
  { hoy = new Date() } = {},
) {
  const desde = meses === 1 ? restarDias(hoy, 30) : restarMeses(hoy, meses);
  const filas = await lecturasServicio.listarPublicasDeComunidades(
    [comunidadId],
    desde,
  );
  const series = agruparPorDiaYFuente(filas);
  if (!filas.some((fila) => fila.fuente === "nasa_power")) {
    const comunidad =
      await publicoRepositorio.buscarComunidadConCoordenadas(comunidadId);
    if (coordenadasValidas(comunidad)) {
      let nasaDisponible = false;
      try {
        const nasa = await nasaPower.obtener(
          Number(comunidad.latitud),
          Number(comunidad.longitud),
          desde,
          diaIso(hoy),
          OPCIONES_FUENTES,
        );
        const datosNASA = nasa
          .filter((fila) => {
            const fecha = diaIso(fila.fecha);
            return (
              fecha &&
              fecha >= desde &&
              fecha <= diaIso(hoy) &&
              fila.humedad !== null &&
              fila.humedad !== undefined &&
              fila.temperatura !== null &&
              fila.temperatura !== undefined &&
              Number.isFinite(Number(fila.humedad)) &&
              Number.isFinite(Number(fila.temperatura))
            );
          })
          .map((fila) => ({
            fecha: diaIso(fila.fecha),
            fuente: "nasa_power",
            humedad: Number(fila.humedad),
            temperatura: Number(fila.temperatura),
          }));
        nasaDisponible = datosNASA.length > 0;
        series.push(...datosNASA);
      } catch (error) {
        logger.warn(
          { comunidadId, fuente: "nasa_power", error: error.message },
          "No se pudo obtener el historial NASA del monitor público",
        );
      }
      if (!nasaDisponible) {
        try {
          const resultado = await openMeteo.obtenerSuelo(
            Number(comunidad.latitud),
            Number(comunidad.longitud),
            { ...OPCIONES_FUENTES, forecastDays: 1 },
          );
          const observadas = (resultado.observadas || []).filter((fila) => {
            const fecha = diaIso(fila.fecha);
            return (
              fecha &&
              fecha >= desde &&
              fecha <= diaIso(hoy) &&
              fila.humedad !== null &&
              fila.humedad !== undefined &&
              fila.temperatura !== null &&
              fila.temperatura !== undefined &&
              Number.isFinite(Number(fila.humedad)) &&
              Number.isFinite(Number(fila.temperatura))
            );
          });
          series.push(
            ...observadas.map((fila) => ({
              fecha: diaIso(fila.fecha),
              fuente: "open_meteo_suelo",
              humedad: Number(fila.humedad),
              temperatura: Number(fila.temperatura),
            })),
          );
        } catch (error) {
          logger.warn(
            {
              comunidadId,
              fuente: "open_meteo_suelo",
              error: error.message,
            },
            "No se pudo obtener el historial Open-Meteo del monitor público",
          );
        }
      }
    }
  }
  const porFecha = new Map();

  for (const serie of series) {
    const actual = porFecha.get(serie.fecha);
    const prioridad = FUENTES_ORDENADAS.indexOf(
      serie.fuente === "tecnico" ? "manual" : serie.fuente,
    );
    const prioridadActual = actual
      ? FUENTES_ORDENADAS.indexOf(
          actual.fuente === "tecnico" ? "manual" : actual.fuente,
        )
      : Number.POSITIVE_INFINITY;
    if (!actual || prioridad < prioridadActual)
      porFecha.set(serie.fecha, serie);
  }

  return [...porFecha.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

function clasificarHumedad(valor) {
  if (valor === null || valor === undefined || valor === "") return "sin_datos";
  const humedad = Number(valor);
  if (!Number.isFinite(humedad)) return "sin_datos";
  if (humedad < 20) return "muy_seca";
  if (humedad < 40) return "seca";
  if (humedad < 60) return "adecuada";
  if (humedad < 80) return "humeda";
  return "saturada";
}

module.exports = {
  datosActuales,
  historialPublicoComunidad,
  clasificarHumedad,
};
