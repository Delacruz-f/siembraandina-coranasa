// Imágenes del catálogo de cultivos (públicas).
// Las sube un administrador con permiso catalogos.gestionar; exigen autor,
// licencia y texto alternativo como cualquier imagen pública.
const repositorio = require("./imagenes.repository");
const publicoRepositorio = require("../publico/publico.repository");
const archivosServicio = require("../usuarios/archivos.service");
const auditoria = require("../admin/auditoria.repository");
const logger = require("../../config/logger");
const { noEncontrado, solicitudInvalida } = require("../../utils/errores");

async function listarDeCultivo(cultivoId) {
  const cultivo = await publicoRepositorio.buscarCultivoPorId(
    Number(cultivoId),
  );
  if (!cultivo) throw noEncontrado("No encontramos ese cultivo.");
  return {
    cultivo,
    imagenes: await publicoRepositorio.listarImagenesDeCultivo(cultivo.id),
  };
}

/** Sube imágenes públicas para un cultivo del catálogo. */
async function subir(cultivoId, usuarioId, archivos, datos, { ip } = {}) {
  const cultivo = await publicoRepositorio.buscarCultivoPorId(
    Number(cultivoId),
  );
  if (!cultivo) throw noEncontrado("No encontramos ese cultivo.");

  const adjuntos = [].concat(archivos || []).filter(Boolean);
  if (!adjuntos.length || adjuntos.length > 5) {
    throw solicitudInvalida("Selecciona entre 1 y 5 imágenes por envío.");
  }
  const textos = [].concat(datos.textos_alternativos || []);
  if (textos.length !== adjuntos.length) {
    throw solicitudInvalida(
      "Escribe un texto alternativo para cada imagen que subas.",
    );
  }

  const actuales = await publicoRepositorio.listarImagenesDeCultivo(cultivo.id);
  const guardadas = [];
  try {
    for (let indice = 0; indice < adjuntos.length; indice += 1) {
      const imagen = await archivosServicio.guardarImagen(
        adjuntos[indice],
        usuarioId,
        textos[indice],
        {
          publica: true,
          autor: { nombre: datos.autor_imagen, url: datos.autor_url },
          licencia: { nombre: datos.licencia, url: datos.licencia_url },
        },
      );
      await repositorio.asociarCultivo(
        cultivo.id,
        imagen.id,
        actuales.length + indice,
      );
      guardadas.push(imagen.id);
    }
  } catch (error) {
    for (const archivoId of guardadas) {
      try {
        await archivosServicio.eliminarPropio(archivoId, usuarioId);
      } catch (errorLimpieza) {
        logger.error(
          { err: errorLimpieza, archivoId, cultivoId },
          "No se pudo limpiar una imagen de cultivo tras fallar",
        );
      }
    }
    throw error;
  }

  await auditoria.registrar({
    usuarioId,
    accion: "cultivo_imagenes.subidas",
    entidad: "cultivos",
    entidadId: cultivo.id,
    detalle: { cantidad: guardadas.length },
    ip,
  });
}

async function eliminar(cultivoId, archivoId, usuarioId, { ip } = {}) {
  const cultivo = await publicoRepositorio.buscarCultivoPorId(
    Number(cultivoId),
  );
  if (!cultivo) throw noEncontrado("No encontramos ese cultivo.");
  const archivo = await repositorio.buscarPorId(Number(archivoId));
  if (!archivo || !archivo.es_publica) {
    throw noEncontrado("No encontramos esa imagen.");
  }
  await repositorio.quitarDeCultivo(cultivo.id, archivo.id);
  const enUso = await repositorio.estaEnUso(archivo.id);
  if (!enUso) {
    await archivosServicio.eliminarPropio(archivo.id, usuarioId);
  }
  await auditoria.registrar({
    usuarioId,
    accion: "cultivo_imagenes.eliminada",
    entidad: "cultivos",
    entidadId: cultivo.id,
    detalle: { archivo_id: archivo.id },
    ip,
  });
}

module.exports = { listarDeCultivo, subir, eliminar };
