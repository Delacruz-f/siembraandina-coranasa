// Servicio de salud: arma el estado del sistema sin conocer Express.
const env = require("../../config/env");
const repositorio = require("./salud.repository");

const VERSION = require("../../../package.json").version;

/**
 * Comprueba la base de datos y devuelve un objeto de estado.
 * @returns {Promise<{ok: boolean, estado: string, datos: object}>}
 */
async function estadoDelSistema() {
  const base = {
    servicio: "siembra-andina",
    version: VERSION,
    entorno: env.entorno,
    motor: env.db.client,
    fecha: new Date().toISOString(),
    tiempoActivoSegundos: Math.round(process.uptime()),
  };

  try {
    const latenciaMs = await repositorio.medirRespuesta();
    return {
      ok: true,
      estado: "ok",
      datos: {
        ...base,
        baseDeDatos: {
          estado: "conectada",
          latenciaMs: Number(latenciaMs.toFixed(1)),
        },
      },
    };
  } catch (error) {
    return {
      ok: false,
      estado: "degradado",
      datos: {
        ...base,
        baseDeDatos: {
          estado: "sin_conexion",
          mensaje: "No se pudo consultar la base de datos.",
        },
        // El detalle técnico solo se expone fuera de producción.
        ...(env.esProduccion ? {} : { detalle: error.message }),
      },
    };
  }
}

module.exports = { estadoDelSistema };
