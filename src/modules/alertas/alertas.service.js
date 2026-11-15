const repositorio = require("./alertas.repository");
const openMeteo = require("../../openMeteo");
const correo = require("../auth/correo.service");
const logger = require("../../config/logger");
const condicionesServicio = require("../parcelas/condiciones.service");

function comparar(valor, operador, umbral) {
  if (operador === "lt") return valor < umbral;
  if (operador === "lte") return valor <= umbral;
  if (operador === "gt") return valor > umbral;
  if (operador === "gte") return valor >= umbral;
  throw new Error(`Operador de alerta desconocido: ${operador}`);
}

function diaISO(valor) {
  return valor instanceof Date
    ? valor.toISOString().slice(0, 10)
    : String(valor).slice(0, 10);
}

function diasConsecutivos(lecturas, cantidad, umbral, operador) {
  const porDia = new Map();
  for (const lectura of lecturas) {
    const dia = diaISO(lectura.fecha);
    if (!porDia.has(dia)) porDia.set(dia, lectura);
  }
  const dias = [...porDia.keys()].sort().reverse();
  if (dias.length < cantidad) return null;
  const masReciente = new Date(`${dias[0]}T00:00:00Z`);
  for (let indice = 0; indice < cantidad; indice += 1) {
    const esperado = new Date(masReciente);
    esperado.setUTCDate(esperado.getUTCDate() - indice);
    const lectura = porDia.get(esperado.toISOString().slice(0, 10));
    if (!lectura) return null;
    if (
      lectura.humedad === null ||
      lectura.humedad === undefined ||
      lectura.humedad === "" ||
      !Number.isFinite(Number(lectura.humedad))
    ) {
      return null;
    }
    if (!comparar(Number(lectura.humedad), operador, umbral)) return false;
  }
  return true;
}

function umbralDeRegla(regla, requerimiento) {
  if (regla.umbral_clave === "requerimiento_min") {
    return requerimiento ? Number(requerimiento.hum_min) : null;
  }
  if (regla.umbral_clave === "requerimiento_max") {
    return requerimiento ? Number(requerimiento.hum_max) : null;
  }
  return Number(regla.umbral);
}

async function evaluarHumedad(regla, parcela) {
  const requerimiento = await repositorio.buscarRequerimiento(
    parcela.cultivo_id,
    parcela.zona_id,
  );
  const umbral = umbralDeRegla(regla, requerimiento);
  if (!Number.isFinite(umbral)) {
    return { activa: false, evaluable: false, lecturaId: null };
  }
  const ahora = new Date();
  const fechaInicio = new Date(ahora);
  fechaInicio.setUTCDate(fechaInicio.getUTCDate() - regla.persistencia_dias - 1);
  const fechaFin = ahora.toISOString().slice(0, 10);
  const lecturas = await repositorio.lecturasDesde(
    parcela.id,
    fechaInicio.toISOString().slice(0, 10),
    fechaFin,
  );
  const condicion = diasConsecutivos(
    lecturas,
    Number(regla.persistencia_dias),
    umbral,
    regla.operador_clave,
  );
  return {
    activa: condicion === true,
    evaluable: condicion !== null,
    lecturaId: lecturas.length ? lecturas[0].id : null,
    valor: lecturas.length ? Number(lecturas[0].humedad) : null,
    umbral,
  };
}

async function evaluarTemperaturaAire(regla, parcela) {
  if (parcela.latitud === null || parcela.longitud === null) {
    return { activa: false, evaluable: false, valor: null };
  }
  const horas = Number(regla.horizonte_horas || 48);
  const temperaturas = await openMeteo.pronosticoHorario(
    Number(parcela.latitud),
    Number(parcela.longitud),
    horas,
  );
  const valores = temperaturas
    .map((fila) => fila.temperatura)
    .filter((valor) => valor !== null && valor !== undefined && valor !== "")
    .map(Number)
    .filter(Number.isFinite);
  const minima = valores.length ? Math.min(...valores) : null;
  const umbrales = await condicionesServicio.obtenerUmbrales();
  const umbral = umbrales.riesgoHelada;
  return {
    activa: minima !== null && comparar(minima, regla.operador_clave, umbral),
    evaluable: minima !== null,
    valor: minima,
    umbral,
  };
}

function aplicaAParcela(regla, parcela) {
  return (
    (!regla.cultivo_id ||
      Number(regla.cultivo_id) === Number(parcela.cultivo_id)) &&
    (!regla.zona_id || Number(regla.zona_id) === Number(parcela.zona_id))
  );
}

async function evaluarReglas() {
  const [reglas, parcelasConCultivo, parcelasConCoordenadas] = await Promise.all([
    repositorio.listarReglasActivas(),
    repositorio.listarParcelasConCampania(),
    repositorio.listarParcelasGeolocalizadas(),
  ]);
  const porId = new Map(
    parcelasConCoordenadas.map((parcela) => [Number(parcela.id), parcela]),
  );
  let creadas = 0;
  let resueltas = 0;
  for (const regla of reglas) {
    const parcelas =
      regla.metrica_clave === "temperatura_aire"
        ? parcelasConCoordenadas
        : parcelasConCultivo;
    for (const parcelaBase of parcelas) {
      const parcela = {
        ...parcelaBase,
        ...(porId.get(Number(parcelaBase.id)) || {}),
      };
      if (!aplicaAParcela(regla, parcela)) continue;
      let resultado;
      if (regla.metrica_clave === "humedad") {
        resultado = await evaluarHumedad(regla, parcela);
      } else if (regla.metrica_clave === "temperatura_aire") {
        resultado = await evaluarTemperaturaAire(regla, parcela);
      } else {
        logger.warn(
          { reglaId: regla.id, metrica: regla.metrica_clave },
          "La regla de alerta usa una métrica sin evaluador",
        );
        continue;
      }

      if (resultado.activa) {
        if (await repositorio.existeAlertaDelDia(regla.id, parcela.id)) {
          continue;
        }
        const mensaje =
          regla.metrica_clave === "humedad"
            ? `${parcela.nombre}: humedad del suelo (${resultado.valor} %) bajo el mínimo recomendado (${resultado.umbral} %) durante ${regla.persistencia_dias} días.`
            : `${parcela.nombre}: riesgo de helada; la temperatura mínima prevista es ${resultado.valor} °C en las próximas ${regla.horizonte_horas} horas.`;
        const creada = await repositorio.crearAlerta({
          regla,
          parcela,
          lecturaId: resultado.lecturaId,
          mensaje,
        });
        if (!creada) continue;
        creadas += 1;
        if ((regla.critica === true || Number(regla.critica) === 1) && creada.email) {
          try {
            await correo.enviar({
              para: creada.email,
              asunto: `Alerta crítica para ${parcela.nombre}`,
              texto: mensaje,
            });
          } catch (error) {
            logger.error(
              { err: error, alertaId: creada.id, usuarioId: parcela.usuario_id },
              "No se pudo enviar el correo opcional de alerta crítica",
            );
          }
        }
      } else if (resultado.evaluable) {
        resueltas += await repositorio.resolverAlerta(regla.id, parcela.id);
      }
    }
  }
  return { creadas, resueltas };
}

module.exports = { evaluarReglas, comparar, diasConsecutivos };
