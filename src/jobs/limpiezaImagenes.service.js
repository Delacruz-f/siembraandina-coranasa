// Tarea de limpieza de imágenes huérfanas (Fase 10).
// Un binario es huérfano cuando:
//   1. No tiene fila en `archivos` (p. ej. la subida falló a medio proceso), o
//   2. Su fila está marcada con `eliminado_en` (borrado lógico).
// Las filas marcadas solo se borran definitivamente de la base cuando ya no
// tienen binarios; y como red de seguridad, un registro antiguo sin variantes
// que ningún contenido usa se considera huérfano tras IMAGE_ORPHAN_HOURS.
const almacenamiento = require("../services/almacenamiento");
const repositorio = require("../modules/imagenes/imagenes.repository");
const archivosRepositorio = require("../modules/usuarios/archivos.repository");
const env = require("../config/env");
const logger = require("../config/logger");

const PREFIJOS = ["publicas", "privadas"];

function limiteDeEspera() {
  return new Date(Date.now() - env.imagenes.horasHuerfano * 60 * 60 * 1000);
}

/** Agrupa las claves por imagen: publicas/<id>/<variante> => Map(id -> claves). */
function agruparPorImagen(archivos, prefijo) {
  const porId = new Map();
  for (const archivo of archivos) {
    const [carpeta, id] = archivo.clave.split("/");
    if (carpeta !== prefijo || !/^\d+$/.test(id || "")) continue;
    if (!porId.has(id)) porId.set(id, []);
    porId.get(id).push(archivo.clave);
  }
  return porId;
}

async function borrarClaves(claves) {
  const eliminados = [];
  const errores = [];
  for (const clave of claves) {
    try {
      await almacenamiento.eliminar(clave);
      eliminados.push(clave);
    } catch (error) {
      logger.error({ err: error, clave }, "No se pudo eliminar un archivo huérfano");
      errores.push(clave);
    }
  }
  return { eliminados, errores };
}

/**
 * Recorre el almacenamiento y borra los binarios sin registro vigente.
 * Devuelve un resumen apto para guardarse en ejecuciones_jobs.
 */
async function limpiarHuerfanos() {
  const eliminados = [];
  const errores = [];
  let revisados = 0;

  // 1) Filas con borrado lógico: se borran sus binarios y, si ya no queda
  //    ninguno, también el registro.
  const marcadas = await repositorio.listarMarcadasEliminadas();
  for (const fila of marcadas) {
    const variantes = await repositorio.listarClavesVariantes(fila.id);
    const claves = [
      fila.ruta,
      ...variantes.flatMap((v) => [v.ruta_webp, v.ruta_jpg]),
    ];
    const resultado = await borrarClaves([...new Set(claves.filter(Boolean))]);
    eliminados.push(...resultado.eliminados);
    errores.push(...resultado.errores);
    revisados += 1;
    if (!resultado.errores.length) {
      try {
        await repositorio.eliminarFisico(fila.id);
      } catch (error) {
        logger.error(
          { err: error, archivoId: fila.id },
          "No se pudo borrar el registro de una imagen eliminada",
        );
        errores.push(`registro:${fila.id}`);
      }
    }
  }

  // 2) Binarios sin fila en `archivos` (subidas interrumpidas, etc.).
  for (const prefijo of PREFIJOS) {
    let archivos;
    try {
      archivos = await almacenamiento.listar(prefijo);
    } catch (error) {
      logger.error({ err: error, prefijo }, "No se pudo listar el almacenamiento");
      errores.push(prefijo);
      continue;
    }
    revisados += archivos.length;
    const porId = agruparPorImagen(archivos, prefijo);
    for (const [id, claves] of porId) {
      const registro = await archivosRepositorio.buscarPorId(Number(id));
      if (registro) continue;
      const resultado = await borrarClaves(claves);
      eliminados.push(...resultado.eliminados);
      errores.push(...resultado.errores);
    }
  }

  // Red de seguridad: filas antiguas sin variantes que ningún contenido usa.
  const antiguas = await repositorio.listarSinVariantes(200);
  for (const fila of antiguas) {
    const creado = new Date(fila.created_at).getTime();
    if (!Number.isFinite(creado) || creado > limiteDeEspera().getTime()) continue;
    if (await repositorio.estaEnUso(fila.id)) continue;
    try {
      await repositorio.marcarEliminado(fila.id);
      const resultado = await borrarClaves([fila.ruta].filter(Boolean));
      eliminados.push(...resultado.eliminados);
      errores.push(...resultado.errores);
    } catch (error) {
      logger.error(
        { err: error, archivoId: fila.id },
        "No se pudo limpiar un registro de imagen antiguo",
      );
      errores.push(`registro:${fila.id}`);
    }
  }

  return {
    revisados,
    eliminados: eliminados.length,
    errores: errores.length,
    detalle: eliminados.slice(0, 50),
  };
}

module.exports = { limpiarHuerfanos };
