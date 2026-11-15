// Servicio de archivos: documentos (PDF) en disco y metadatos en la base.
// Las imágenes se delegan al servicio único de imágenes (src/modules/imagenes),
// que valida el contenido real, elimina EXIF/GPS y genera versiones WebP/JPG.
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const env = require("../../config/env");
const almacenamiento = require("../../services/almacenamiento");
const repositorio = require("./archivos.repository");
const imagenesServicio = require("../imagenes/imagenes.service");
const imagenesRepositorio = require("../imagenes/imagenes.repository");
const {
  solicitudInvalida,
  noEncontrado,
} = require("../../utils/errores");

const RAIZ = path.join(__dirname, "..", "..", "..");
const TIPOS_DOCUMENTO = ["application/pdf"];

/** Ruta absoluta de un archivo local (solo documentos y PDF). */
async function rutaLocal(clave) {
  const base = path.resolve(RAIZ, env.subidas.directorio);
  const ruta = path.resolve(base, clave);
  const relativa = path.relative(base, ruta);
  if (relativa.startsWith("..") || path.isAbsolute(relativa)) {
    const error = new Error("Ruta fuera del almacenamiento.");
    error.code = "ENOENT";
    throw error;
  }
  await fs.access(ruta);
  return ruta;
}

function nombreArchivoSeguro(nombre) {
  return String(nombre || "archivo")
    .replace(/[\r\n\t]/g, "")
    .replace(/[\\/]/g, "-")
    .trim()
    .slice(0, 120) || "archivo";
}

/** Guarda un documento PDF y devuelve su id. */
async function guardar(archivo, usuarioId) {
  if (!archivo) return null;
  if (!TIPOS_DOCUMENTO.includes(archivo.mimetype)) {
    throw solicitudInvalida("Solo se aceptan documentos PDF en este campo.");
  }
  const nombre = `${crypto.randomUUID()}.pdf`;
  const clave = `documentos/${nombre}`;
  await almacenamiento.guardar(clave, archivo.buffer);
  return repositorio.crear({
    autor_id: usuarioId,
    nombre_original: nombreArchivoSeguro(archivo.originalname),
    ruta: clave,
    mime: "application/pdf",
    tamano: archivo.buffer.length,
    ancho: null,
    alto: null,
    texto_alternativo: null,
    es_publica: false,
  });
}

/**
 * Guarda una imagen con sus variantes.
 * @param {object} archivo Archivo de multer.
 * @param {number} usuarioId Autor en la base.
 * @param {string} textoAlternativo Descripción obligatoria.
 * @param {object} opciones { publica, autor, licencia, formato, posicionX, posicionY }
 */
async function guardarImagen(archivo, usuarioId, textoAlternativo, opciones = {}) {
  return imagenesServicio.procesarSubida(
    archivo,
    usuarioId,
    textoAlternativo,
    opciones,
  );
}

/** Datos de presentación de varias imágenes (variantes + atribución). */
async function presentarImagenes(ids, { publica = false } = {}) {
  const lista = [].concat(ids || []).map(Number).filter(Boolean);
  if (!lista.length) return [];
  const variantes = await imagenesRepositorio.listarVariantes(lista);
  const porArchivo = new Map();
  for (const variante of variantes) {
    const id = Number(variante.archivo_id);
    if (!porArchivo.has(id)) porArchivo.set(id, []);
    porArchivo.get(id).push(variante);
  }
  const resultado = [];
  for (const id of lista) {
    const imagen = await imagenesServicio.obtenerDetalle(id);
    if (!imagen) continue;
    resultado.push(
      imagenesServicio.describe(
        { ...imagen, variantes: porArchivo.get(id) || imagen.variantes || [] },
        { publica },
      ),
    );
  }
  return resultado;
}

async function obtenerParaUsuario(id, usuario) {
  const archivo = await repositorio.buscarPorId(id);
  if (!archivo || archivo.eliminado_en) {
    throw noEncontrado("El archivo no existe o no tienes acceso.");
  }

  const esAutor = Number(archivo.autor_id) === Number(usuario.id);
  const esAdministrador =
    Array.isArray(usuario.permisos) &&
    usuario.permisos.includes("archivos.gestionar");
  const esTecnico =
    Array.isArray(usuario.roles) && usuario.roles.includes("tecnico");
  const desdeParcela =
    esTecnico &&
    (await repositorio.puedeVerDesdeParcela(archivo.id, usuario.id));
  const desdeConsulta =
    esTecnico &&
    (await repositorio.puedeVerDesdeConsulta(archivo.id, usuario.id));
  if (!esAutor && !esAdministrador && !desdeParcela && !desdeConsulta) {
    throw noEncontrado("El archivo no existe o no tienes acceso.");
  }

  try {
    // Las imágenes viven en el almacenamiento de imágenes; los documentos
    // (PDF) siguen en disco. Se comprueba el binario según el tipo.
    if (archivo.mime && archivo.mime.startsWith("image/")) {
      const variantes = await imagenesRepositorio.listarVariantes(archivo.id);
      const clave = variantes.length ? variantes[0].ruta_webp : archivo.ruta;
      if (!(await almacenamiento.existe(clave))) {
        throw noEncontrado("El archivo no existe o no tienes acceso.");
      }
    } else {
      await rutaLocal(archivo.ruta);
    }
  } catch (error) {
    if (error.code === "ENOENT" || error.estado === 404) {
      throw noEncontrado("El archivo no existe o no tienes acceso.");
    }
    throw error;
  }
  return {
    archivo,
    nombre: nombreArchivoSeguro(archivo.nombre_original),
    mime: archivo.mime,
  };
}

/** Descarga directa de un documento (PDF). */
async function obtenerParaDescarga(id, usuario) {
  const datos = await obtenerParaUsuario(id, usuario);
  const ruta = await rutaLocal(datos.archivo.ruta);
  return { ruta, nombre: datos.nombre, mime: datos.mime };
}

/** Imagen privada por id: se sirve desde las rutas controladas /media. */
async function obtenerImagenParaUsuario(id, usuario) {
  const datos = await obtenerParaUsuario(id, usuario);
  if (!datos.mime || !datos.mime.startsWith("image/")) {
    throw noEncontrado("La imagen no existe o no tienes acceso.");
  }
  return { id: Number(datos.archivo.id), mime: datos.mime };
}

/** Comprueba que la imagen está en un artículo publicado (ruta antigua). */
async function obtenerImagenPublicada(id) {
  const archivo = await repositorio.buscarPorId(id);
  if (!archivo || archivo.eliminado_en || !archivo.mime?.startsWith("image/")) {
    throw noEncontrado("La imagen no existe o no está publicada.");
  }
  const publicada = await repositorio.puedeVerDesdePublicacionPublicada(archivo.id);
  if (!publicada) throw noEncontrado("La imagen no existe o no está publicada.");
  const variante = (await repositorio.listarVariantes(archivo.id))[0];
  if (!variante) throw noEncontrado("La imagen no existe o no está publicada.");
  return { archivo, variante };
}

/** Elimina una imagen propia: metadatos y todos sus binarios. */
async function eliminarPropio(id, usuarioId) {
  const archivo = await repositorio.buscarPorId(id);
  if (!archivo || Number(archivo.autor_id) !== Number(usuarioId)) {
    throw noEncontrado("El archivo no existe o no tienes acceso.");
  }
  const claves = await imagenesRepositorio.listarClavesVariantes(archivo.id);
  await repositorio.eliminar(id);
  const todas = new Set([archivo.ruta]);
  for (const fila of claves) {
    todas.add(fila.ruta_webp);
    todas.add(fila.ruta_jpg);
  }
  for (const clave of todas) {
    if (clave) await almacenamiento.eliminar(clave);
  }
}

module.exports = {
  guardar,
  guardarImagen,
  presentarImagenes,
  obtenerParaUsuario,
  obtenerParaDescarga,
  obtenerImagenParaUsuario,
  obtenerImagenPublicada,
  eliminarPropio,
  nombreArchivoSeguro,
  RAIZ,
};
