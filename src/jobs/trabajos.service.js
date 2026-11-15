const cron = require("node-cron");
const logger = require("../config/logger");
const ejecucionesRepositorio = require("./ejecuciones.repository");
const sincronizacion = require("../modules/lecturas/sincronizacion.service");
const alertas = require("../modules/alertas/alertas.service");
const usuariosRepositorio = require("../modules/usuarios/usuarios.repository");
const usuariosServicio = require("../modules/usuarios/usuarios.service");
const editor = require("../modules/editor/editor.service");
const limpiezaImagenes = require("./limpiezaImagenes.service");
const auditoria = require("../modules/admin/auditoria.repository");

const TRABAJOS = [
  {
    clave: "sincronizacion_datos",
    nombre: "Sincronización diaria de suelo",
    horario: "0 5 * * *",
    ejecutar: sincronizacion.sincronizarParcelas,
  },
  {
    clave: "evaluacion_alertas",
    nombre: "Evaluación diaria de alertas",
    horario: "0 6 * * *",
    ejecutar: alertas.evaluarReglas,
  },
  {
    clave: "limpieza_tokens",
    nombre: "Limpieza de tokens vencidos",
    horario: "15 3 * * *",
    ejecutar: usuariosRepositorio.limpiarTokensVencidos,
  },
  {
    clave: "publicaciones_programadas",
    nombre: "Publicación de artículos programados",
    horario: "* * * * *",
    ejecutar: editor.publicarProgramados,
  },
  {
    clave: "limpieza_imagenes",
    nombre: "Limpieza de imágenes huérfanas",
    horario: "30 3 * * *",
    ejecutar: limpiezaImagenes.limpiarHuerfanos,
  },
  {
    clave: "limpieza_cuentas_sin_verificar",
    nombre: "Desactivación semanal de cuentas sin verificar",
    horario: "0 3 * * 0",
    ejecutar: usuariosServicio.limpiarCuentasSinVerificar,
  },
];
const trabajosEnCurso = new Set();

function resultadoParcial(resultado) {
  return Boolean(
    resultado &&
    (
      Number(resultado.fallidas) > 0 ||
      Number(resultado.errores) > 0
    ),
  );
}

async function ejecutar(clave, { origen = "cron", ejecutadoPor = null } = {}) {
  const trabajo = TRABAJOS.find((fila) => fila.clave === clave);
  if (!trabajo) throw new Error(`Trabajo programado desconocido: ${clave}`);
  if (trabajosEnCurso.has(clave)) {
    return { clave, estado: "ejecutando", omitida: true };
  }
  trabajosEnCurso.add(clave);
  let ejecucionId;
  try {
    ejecucionId = await ejecucionesRepositorio.iniciar({
      trabajo: clave,
      origen,
      ejecutadoPor,
    });
    const resultado = await trabajo.ejecutar();
    const estado = resultadoParcial(resultado) ? "parcial" : "exitoso";
    await ejecucionesRepositorio.finalizar(ejecucionId, {
      estado,
      resultado,
    });
    return { clave, estado, resultado };
  } catch (error) {
    logger.error({ err: error, trabajo: clave, ejecucionId }, "Falló un trabajo programado");
    if (ejecucionId) {
      await ejecucionesRepositorio.finalizar(ejecucionId, {
        estado: "fallido",
        error: String(error.message || "Error de ejecución").slice(0, 2000),
      });
    }
    return {
      clave,
      estado: "fallido",
      error: String(error.message || "Error de ejecución"),
    };
  } finally {
    trabajosEnCurso.delete(clave);
  }
}

async function ejecutarManualmente(clave, usuarioId, { ip } = {}) {
  const resultado = await ejecutar(clave, {
    origen: "manual",
    ejecutadoPor: usuarioId,
  });
  await auditoria.registrar({
    usuarioId,
    accion: "trabajo.ejecutado_manualmente",
    entidad: "ejecuciones_jobs",
    detalle: { trabajo: clave, estado: resultado.estado },
    ip,
  });
  return resultado;
}

async function listarEstados() {
  const ultimas = await ejecucionesRepositorio.ultimasPorTrabajo(
    TRABAJOS.map((trabajo) => trabajo.clave),
  );
  const porClave = new Map(ultimas.map((fila) => [fila.trabajo, fila]));
  return TRABAJOS.map((trabajo) => {
    const ultima = porClave.get(trabajo.clave) || null;
    let resultado = null;
    if (ultima && ultima.resultado) {
      try {
        resultado = JSON.parse(ultima.resultado);
      } catch (error) {
        logger.warn(
          { err: error, trabajo: ultima.trabajo, ejecucionId: ultima.id },
          "No se pudo interpretar el resultado guardado de un trabajo",
        );
        resultado = null;
      }
    }
    return {
      ...trabajo,
      ejecutando: trabajosEnCurso.has(trabajo.clave),
      ultima: ultima ? { ...ultima, resultado } : null,
    };
  });
}

function iniciarTrabajos() {
  const programados = TRABAJOS.map((trabajo) => cron.schedule(
    trabajo.horario,
    async () => {
      const resultado = await ejecutar(trabajo.clave, { origen: "cron" });
      if (resultado.estado === "fallido") {
        logger.error({ trabajo: trabajo.clave, error: resultado.error }, "Ejecución programada fallida");
      } else {
        logger.info(
          { trabajo: trabajo.clave, estado: resultado.estado, resultado: resultado.resultado },
          "Ejecución programada finalizada",
        );
      }
    },
    { timezone: "America/Lima" },
  ));
  return () => programados.forEach((trabajo) => trabajo.stop());
}

module.exports = { TRABAJOS, ejecutar, ejecutarManualmente, listarEstados, iniciarTrabajos };
