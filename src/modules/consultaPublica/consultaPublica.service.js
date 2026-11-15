const logger = require("../../config/logger");
const openMeteo = require("../../services/fuentesDatos/openMeteo");
const geocodificacion = require("../../services/fuentesDatos/geocodificacion");
const { nasaPower } = require("../../services/fuentesDatos/nasaPower");
const { calcularVentanas } = require("./consultaPublica.calculo");
const ia = require("./consultaPublica.ia");
const repositorio = require("./consultaPublica.repository");
const publicoRepositorio = require("../publico/publico.repository");
const { ErrorHttp, solicitudInvalida } = require("../../utils/errores");

const CULTIVO_NO_SE = "no-se";

function iso(fecha) {
  return fecha.toISOString().slice(0, 10);
}

function redondearCoordenada(valor) {
  return Math.round(Number(valor) * 100) / 100;
}

function normalizarNombreLugar(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

function buscarPuntoDistrito(lugares, distrito) {
  const nombreDistrito = normalizarNombreLugar(distrito.nombre);
  const nombreDepartamento = normalizarNombreLugar(distrito.departamento);
  const coincidencias = lugares.filter(
    (candidato) =>
      candidato.enPeru &&
      normalizarNombreLugar(candidato.nombre) === nombreDistrito &&
      (!candidato.region ||
        normalizarNombreLugar(candidato.region).endsWith(nombreDepartamento)),
  );
  const puntos = new Map(
    coincidencias.map((candidato) => [
      `${candidato.latitud}:${candidato.longitud}`,
      candidato,
    ]),
  );
  return puntos.size === 1 ? puntos.values().next().value : null;
}

function validarCoordenadas(latitud, longitud) {
  return (
    latitud !== null &&
    longitud !== null &&
    latitud !== undefined &&
    longitud !== undefined &&
    latitud !== "" &&
    longitud !== "" &&
    Number.isFinite(Number(latitud)) &&
    Number.isFinite(Number(longitud)) &&
    Number(latitud) >= -90 &&
    Number(latitud) <= 90 &&
    Number(longitud) >= -180 &&
    Number(longitud) <= 180
  );
}

async function resolverUbicacion(datos) {
  let distrito = null;
  let provinciaId = datos.provinciaId ? Number(datos.provinciaId) : null;
  let comunidad = null;

  if (datos.distritoId) {
    distrito = await publicoRepositorio.buscarDistrito(
      Number(datos.distritoId),
    );
    if (!distrito) throw solicitudInvalida("Elige un distrito válido.");
    if (provinciaId && provinciaId !== Number(distrito.provincia_id)) {
      throw solicitudInvalida(
        "El distrito no corresponde a la provincia elegida.",
      );
    }
    provinciaId = Number(distrito.provincia_id);
  }

  let latitud;
  let longitud;
  if (validarCoordenadas(datos.latitud, datos.longitud)) {
    latitud = redondearCoordenada(datos.latitud);
    longitud = redondearCoordenada(datos.longitud);
  } else if (
    (datos.latitud !== undefined && datos.latitud !== "") ||
    (datos.longitud !== undefined && datos.longitud !== "")
  ) {
    throw solicitudInvalida("El punto elegido no tiene coordenadas válidas.");
  } else if (distrito) {
    comunidad = await publicoRepositorio.comunidadConCoordenadas(distrito.id);
    if (!comunidad) {
      let lugares = [];
      try {
        lugares = await geocodificacion.buscar(
          `${distrito.nombre}, ${distrito.departamento}`,
          { timeoutMs: 5000, reintentos: 0 },
        );
      } catch (error) {
        logger.warn(
          { distritoId: distrito.id, error: error.message },
          "No se pudo geocodificar el distrito para una consulta pública",
        );
      }
      const lugar = buscarPuntoDistrito(lugares, distrito);
      if (!lugar) {
        throw new ErrorHttp(
          400,
          "Elige un punto en el mapa o usa tu ubicación.",
          { codigo: "sin_coordenadas" },
        );
      }
      latitud = redondearCoordenada(lugar.latitud);
      longitud = redondearCoordenada(lugar.longitud);
    } else {
      latitud = redondearCoordenada(comunidad.latitud);
      longitud = redondearCoordenada(comunidad.longitud);
    }
  } else {
    throw solicitudInvalida("Elige un distrito o un punto en el mapa.");
  }

  const provincia = provinciaId
    ? await publicoRepositorio.buscarProvincia(provinciaId)
    : distrito
      ? {
          id: distrito.provincia_id,
          nombre: distrito.provincia,
          departamento_id: distrito.departamento_id,
        }
      : null;
  if (provinciaId && !provincia) {
    throw solicitudInvalida("La provincia elegida ya no está disponible.");
  }

  return {
    latitud,
    longitud,
    distrito,
    provincia,
    comunidad,
    provinciaId,
    lugar: [
      distrito && distrito.nombre,
      provincia && provincia.nombre,
      distrito && distrito.departamento,
    ]
      .filter(Boolean)
      .join(", "),
  };
}

function interpretarResultado(promesa, clave) {
  return promesa.then(
    (valor) => ({ disponible: true, valor }),
    () => {
      logger.warn(
        { fuente: clave },
        "No se pudieron obtener datos de consulta pública",
      );
      return { disponible: false, valor: [] };
    },
  );
}

function nivelConfianza(historico, suelo, temperaturas, altitudDisponible) {
  if (
    historico.length >= 1500 &&
    suelo.length >= 10 &&
    temperaturas.length >= 10 &&
    altitudDisponible
  ) {
    return "alta";
  }
  if (historico.length >= 90 && (suelo.length || temperaturas.length)) {
    return "media";
  }
  return "baja";
}

function explicacionFija(resultado) {
  const cultivo =
    resultado.cultivos.length === 1
      ? resultado.cultivos[0].nombre.toLowerCase()
      : "los cultivos elegidos";
  const ventana = resultado.cultivos
    .flatMap((fila) => fila.ventanas)
    .slice()
    .sort((a, b) => b.puntaje - a.puntaje)[0];
  if (!ventana) {
    return [
      "NASA POWER y Open-Meteo no ofrecen datos suficientes para proponer una ventana de siembra.",
      `La confianza de esta consulta es ${resultado.confianza}.`,
      "Para un análisis detallado conviene consultar a un técnico.",
    ].join(" ");
  }
  const cosecha = ventana.cosecha
    ? ` La cosecha estimada sería entre ${ventana.cosecha.inicio} y ${ventana.cosecha.fin}.`
    : "";
  return [
    `Según NASA POWER y Open-Meteo, la ventana con mayor coincidencia para ${cultivo} es del ${ventana.inicio} al ${ventana.fin}.`,
    `La confianza es ${resultado.confianza}.${cosecha}`,
    "Para un análisis detallado conviene consultar a un técnico.",
  ].join(" ");
}

function obtenerRangoHumedad(cultivo, requerimientos) {
  const filas = requerimientos.filter(
    (fila) => Number(fila.cultivo_id) === Number(cultivo.id),
  );
  if (!filas.length) return null;
  return {
    minimo: Math.min(...filas.map((fila) => Number(fila.hum_min))),
    maximo: Math.max(...filas.map((fila) => Number(fila.hum_max))),
  };
}

async function consultar(datos) {
  const ubicacion = await resolverUbicacion(datos);
  const catalogo = await repositorio.catalogoAgronomico();
  const cultivoSeleccionado = String(datos.cultivo || "");
  const cultivosConRequerimientos = catalogo.cultivos.filter((cultivo) =>
    catalogo.requerimientos.some(
      (requerimiento) =>
        Number(requerimiento.cultivo_id) === Number(cultivo.id),
    ),
  );
  const cultivoSeleccionadoValido =
    cultivoSeleccionado === CULTIVO_NO_SE ||
    cultivosConRequerimientos.some(
      (cultivo) => cultivo.slug === cultivoSeleccionado,
    );
  if (!cultivoSeleccionadoValido) {
    throw solicitudInvalida(
      "Elige un cultivo disponible con requerimientos registrados.",
    );
  }
  const cultivos =
    cultivoSeleccionado === CULTIVO_NO_SE
      ? cultivosConRequerimientos
      : cultivosConRequerimientos.filter(
          (cultivo) => cultivo.slug === cultivoSeleccionado,
        );
  if (!cultivos.length) {
    throw solicitudInvalida("No hay cultivos disponibles para esta consulta.");
  }

  const hoy = new Date();
  const inicioHistorico = new Date(hoy);
  inicioHistorico.setUTCFullYear(inicioHistorico.getUTCFullYear() - 5);
  const fechaInicio = iso(inicioHistorico);
  const fechaHoy = iso(hoy);
  const fechaFinPronostico = iso(
    new Date(hoy.getTime() + 15 * 24 * 60 * 60 * 1000),
  );
  const coordenadas = [ubicacion.latitud, ubicacion.longitud];
  const [
    resultadoNASA,
    resultadoSuelo,
    resultadoTemperaturas,
    resultadoAltitud,
  ] = await Promise.all([
    interpretarResultado(
      nasaPower.obtener(...coordenadas, fechaInicio, fechaHoy, {
        timeoutMs: 12000,
        reintentos: 1,
      }),
      "NASA POWER",
    ),
    interpretarResultado(
      openMeteo.obtenerSuelo(...coordenadas, {
        forecastDays: 16,
        timeoutMs: 10000,
        reintentos: 1,
      }),
      "Open-Meteo suelo",
    ),
    interpretarResultado(
      openMeteo.openMeteo.obtener(
        ...coordenadas,
        fechaHoy,
        fechaFinPronostico,
        { forecastDays: 16, timeoutMs: 10000, reintentos: 1 },
      ),
      "Open-Meteo temperatura",
    ),
    interpretarResultado(
      openMeteo.obtenerElevacion(...coordenadas),
      "Open-Meteo elevación",
    ),
  ]);

  const historico = resultadoNASA.valor;
  const suelo = resultadoSuelo.valor.pronostico || [];
  const temperaturasPorFecha = new Map(
    resultadoTemperaturas.valor.map((dia) => [dia.fecha, dia]),
  );
  const pronostico = suelo.map((dia) => {
    const temperatura = temperaturasPorFecha.get(dia.fecha);
    return {
      ...dia,
      temperaturaMinima: temperatura ? temperatura.temperaturaMinima : null,
    };
  });
  const zonas = resultadoAltitud.disponible
    ? catalogo.zonas.filter(
        (zona) =>
          Number(resultadoAltitud.valor) >= Number(zona.altitud_min_m) &&
          (zona.altitud_max_m === null ||
            Number(resultadoAltitud.valor) <= Number(zona.altitud_max_m)),
      )
    : [];
  const zonasAplicables = zonas.length ? zonas : catalogo.zonas;
  const zonasIds = new Set(zonasAplicables.map((zona) => Number(zona.id)));
  const cultivosConVentanas = cultivos.map((cultivo) => {
    const requerimientos = catalogo.requerimientos.filter(
      (fila) =>
        Number(fila.cultivo_id) === Number(cultivo.id) &&
        zonasIds.has(Number(fila.zona_id)),
    );
    const calendarios = catalogo.calendarios.filter(
      (fila) => Number(fila.cultivo_id) === Number(cultivo.id),
    );
    return {
      id: cultivo.id,
      nombre: cultivo.nombre,
      slug: cultivo.slug,
      cicloReferencial: Boolean(cultivo.ciclo_referencial),
      fuenteCiclo: cultivo.ciclo_fuente,
      rangoHumedad: obtenerRangoHumedad(cultivo, requerimientos),
      ventanas: calcularVentanas({
        cultivo,
        requerimientos,
        calendarios,
        historico,
        pronostico,
        fechaInicio: fechaHoy,
        diasHorizonte: 365,
        limite: 3,
      }),
    };
  });
  const confianza = nivelConfianza(
    historico,
    suelo,
    resultadoTemperaturas.valor,
    resultadoAltitud.disponible,
  );
  const resultado = {
    lugar: ubicacion.lugar || ubicacion.provincia?.nombre || "Punto elegido",
    distritoId: ubicacion.distrito ? ubicacion.distrito.id : null,
    provinciaId: ubicacion.provinciaId,
    cultivo: cultivoSeleccionado,
    cultivos: cultivosConVentanas,
    confianza,
    fuentes: {
      nasaPower: resultadoNASA.disponible && historico.length > 0,
      openMeteoSuelo: resultadoSuelo.disponible && suelo.length > 0,
      openMeteoTemperatura:
        resultadoTemperaturas.disponible &&
        resultadoTemperaturas.valor.length > 0,
      altitudDisponible: resultadoAltitud.disponible,
      fechaConsulta: fechaHoy,
      inicioHistorial: fechaInicio,
    },
    pronostico,
    tecnicos: ubicacion.provinciaId
      ? await repositorio.listarTecnicosDeProvincia(ubicacion.provinciaId)
      : [],
  };

  try {
    const explicacion = await ia.generarExplicacion({
      lugar: resultado.lugar,
      confianza: resultado.confianza,
      fuentes: resultado.fuentes,
      cultivos: resultado.cultivos.map((cultivo) => ({
        nombre: cultivo.nombre,
        ventanas: cultivo.ventanas,
      })),
    });
    resultado.explicacion = explicacion || explicacionFija(resultado);
    resultado.generadoConIA = Boolean(explicacion);
  } catch {
    logger.warn("Falló la explicación de IA para una consulta pública");
    resultado.explicacion = explicacionFija(resultado);
    resultado.generadoConIA = false;
  }

  const ventanasGuardadas = resultado.cultivos.flatMap((cultivo) =>
    cultivo.ventanas.map((ventana) => ({
      cultivo: cultivo.slug,
      nombre: cultivo.nombre,
      ...ventana,
    })),
  );
  resultado.id = await repositorio.guardarConsultaPublica({
    distritoId: resultado.distritoId,
    cultivoId: cultivoSeleccionado === CULTIVO_NO_SE ? null : cultivos[0].id,
    ventanas: ventanasGuardadas,
  });
  return resultado;
}

async function listarCultivosDisponibles() {
  const catalogo = await repositorio.catalogoAgronomico();
  const cultivosConRequerimientos = new Set(
    catalogo.requerimientos.map((fila) => Number(fila.cultivo_id)),
  );
  return catalogo.cultivos
    .filter((cultivo) => cultivosConRequerimientos.has(Number(cultivo.id)))
    .map(({ nombre, slug }) => ({ nombre, slug }));
}

module.exports = {
  consultar,
  resolverUbicacion,
  listarCultivosDisponibles,
};
