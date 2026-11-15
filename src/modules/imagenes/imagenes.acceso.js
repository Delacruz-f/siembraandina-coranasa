// Reglas de acceso a las imágenes.
// - Públicas: artículos publicados y catálogo de cultivos. Se sirven sin sesión.
// - Privadas: fotos de parcelas, consultas, perfil y documentos. Solo el autor,
//   un administrador con permiso o un técnico con acceso vigente.
// Un usuario nunca puede abrir la imagen privada de otro: se responde 404 para
// no revelar siquiera que el archivo existe.
const repositorio = require("./imagenes.repository");
const archivosRepositorio = require("../usuarios/archivos.repository");
const almacenamiento = require("../../services/almacenamiento");
const { noEncontrado, solicitudInvalida } = require("../../utils/errores");

const TIPOS_IMAGEN = new Set(["image/webp", "image/jpeg"]);

function esAdministrador(usuario) {
  return (
    Array.isArray(usuario.permisos) &&
    usuario.permisos.includes("archivos.gestionar")
  );
}

function esTecnico(usuario) {
  return Array.isArray(usuario.roles) && usuario.roles.includes("tecnico");
}

/** ¿La imagen puede verse sin iniciar sesión? */
async function esPublica(archivo) {
  if (!archivo || archivo.eliminado_en) return false;
  if (archivo.es_publica) {
    const [enArticulo, enCultivo] = await Promise.all([
      repositorio.estaEnPublicacionPublicada(archivo.id),
      repositorio.estaEnCultivoPublico(archivo.id),
    ]);
    return Boolean(enArticulo || enCultivo);
  }
  // Compatibilidad: imágenes antiguas asociadas a artículos publicados.
  return Boolean(await repositorio.estaEnPublicacionPublicada(archivo.id));
}

/** ¿El usuario puede ver esta imagen privada? */
async function puedeVerPrivada(archivo, usuario) {
  if (!usuario) return false;
  if (Number(archivo.autor_id) === Number(usuario.id)) return true;
  if (esAdministrador(usuario)) return true;
  if (!esTecnico(usuario)) return false;
  const [desdeParcela, desdeConsulta] = await Promise.all([
    archivosRepositorio.puedeVerDesdeParcela(archivo.id, usuario.id),
    archivosRepositorio.puedeVerDesdeConsulta(archivo.id, usuario.id),
  ]);
  return Boolean(desdeParcela || desdeConsulta);
}

/** Variante solicitada: 400, 800 o 1600 (por defecto la mayor). */
function elegirVariante(archivo, ancho) {
  const variantes = archivo.variantes || [];
  if (!variantes.length) return null;
  const pedido = Number(ancho);
  if (!pedido) return variantes[variantes.length - 1];
  return (
    variantes.find((variante) => Number(variante.ancho) === pedido) ||
    variantes[variantes.length - 1]
  );
}

/**
 * Resuelve el binario que se enviará al navegador.
 * @param {object} archivo Registro de `archivos` con `variantes` cargadas.
 * @returns {{ buffer: Buffer, mime: string, clave: string }}
 */
async function resolverBinario(archivo, { ancho, formato } = {}) {
  const variante = elegirVariante(archivo, ancho);
  if (!variante) throw noEncontrado("La imagen no existe o no tienes acceso.");
  // La variante debe pertenecer a la misma imagen y a la misma zona
  // (pública o privada). La carpeta es el UUID del archivo, no su id numérico.
  const zona = archivo.es_publica ? "publicas" : "privadas";
  const carpeta = (ruta) => (ruta || "").split("/").slice(0, 2).join("/");
  const esperada = carpeta(archivo.ruta);
  const pertenece = (ruta) =>
    Boolean(ruta) &&
    ruta.startsWith(`${zona}/`) &&
    carpeta(ruta) === esperada;
  const jpg = String(formato || "").toLowerCase() === "jpg";
  const clave = jpg ? variante.ruta_jpg : variante.ruta_webp;
  const mime = jpg ? "image/jpeg" : "image/webp";
  if (!TIPOS_IMAGEN.has(mime)) {
    throw solicitudInvalida("Formato de imagen no soportado.");
  }
  if (!pertenece(clave)) {
    throw noEncontrado("La imagen no existe o no tienes acceso.");
  }
  if (!(await almacenamiento.existe(clave))) {
    throw noEncontrado("La imagen no existe o no tienes acceso.");
  }
  return { buffer: await almacenamiento.leer(clave), mime, clave };
}

/** Imagen pública por id (sin sesión). */
async function obtenerPublica(id) {
  const archivo = await repositorio.buscarPorId(id);
  if (!archivo || !(await esPublica(archivo))) {
    throw noEncontrado("La imagen no existe o no está publicada.");
  }
  return { ...archivo, variantes: await repositorio.listarVariantes(archivo.id) };
}

/** Imagen privada por id, comprobando permisos del usuario. */
async function obtenerPrivada(id, usuario) {
  const archivo = await repositorio.buscarPorId(id);
  if (!archivo || archivo.eliminado_en) {
    throw noEncontrado("La imagen no existe o no tienes acceso.");
  }
  if (!(await puedeVerPrivada(archivo, usuario))) {
    throw noEncontrado("La imagen no existe o no tienes acceso.");
  }
  return { ...archivo, variantes: await repositorio.listarVariantes(archivo.id) };
}

module.exports = {
  esPublica,
  puedeVerPrivada,
  obtenerPublica,
  obtenerPrivada,
  resolverBinario,
  elegirVariante,
};
