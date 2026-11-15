// Servicio único de imágenes (Fase 10).
// Responsabilidades:
//  1. Validar el tipo REAL por contenido con sharp (no por extensión ni por el
//     MIME que declara el navegador), limitar tamaño y renombrar con UUID.
//  2. Corregir orientación y eliminar TODOS los metadatos, incluida la
//     geolocalización GPS (sharp no copia metadatos si no se pide expresamente).
//  3. Generar tres anchos (400, 800, 1600) en WebP con respaldo JPG.
//  4. Guardar fuera de public/ a través de la interfaz de almacenamiento.
const crypto = require("crypto");
const sharp = require("sharp");
const env = require("../../config/env");
const logger = require("../../config/logger");
const almacenamiento = require("../../services/almacenamiento");
const repositorio = require("./imagenes.repository");
const {
  solicitudInvalida,
  ErrorHttp,
} = require("../../utils/errores");

// Tamaño máximo de píxeles: protege contra "bombas de descompresión".
const PIXELES_MAXIMOS = 40_000_000;
const FORMATOS_ACEPTADOS = new Set(["jpeg", "png", "webp"]);
const RECORTES = { cuadrado: 1, horizontal: 16 / 9, vertical: 4 / 5 };
// Por debajo de este ancho la imagen escala a 1600 px con pérdida visible.
const ANCHO_MINIMO_RECOMENDADO = 800;

function nuevoId() {
  return crypto.randomUUID();
}

/** Nombre de archivo legible y seguro para la descarga. */
function nombreSeguro(nombre) {
  const base = String(nombre || "imagen")
    .replace(/[\r\n\t]/g, "")
    .replace(/[\\/]/g, "-")
    .trim();
  return base.slice(0, 120) || "imagen";
}

function recortar(ancho, alto, formato, posicionX = 50, posicionY = 50) {
  const proporcion = RECORTES[formato];
  if (!proporcion) return null;
  const proporcionOriginal = ancho / alto;
  const recorteAncho =
    proporcionOriginal > proporcion ? Math.round(alto * proporcion) : ancho;
  const recorteAlto =
    proporcionOriginal > proporcion ? alto : Math.round(ancho / proporcion);
  const limitar = (valor) => Math.max(0, Math.min(100, Number(valor) || 50));
  return {
    left: Math.round(((ancho - recorteAncho) * limitar(posicionX)) / 100),
    top: Math.round(((alto - recorteAlto) * limitar(posicionY)) / 100),
    width: recorteAncho,
    height: recorteAlto,
  };
}

/**
 * Inspecciona el contenido real del archivo.
 * Devuelve { formato, ancho, alto } o lanza un error 400 en español.
 */
async function inspeccionar(buffer) {
  if (!buffer || !buffer.length) {
    throw solicitudInvalida("Selecciona una imagen para subir.", {
      codigo: "imagen_vacia",
    });
  }
  if (buffer.length > env.subidas.tamanoMaximoBytes) {
    const mb = Math.floor(env.subidas.tamanoMaximoBytes / (1024 * 1024));
    throw new ErrorHttp(413, `Cada imagen puede pesar hasta ${mb} MB.`, {
      codigo: "imagen_demasiado_grande",
    });
  }
  let metadatos;
  try {
    metadatos = await sharp(buffer, {
      limitInputPixels: PIXELES_MAXIMOS,
      failOn: "error",
    }).metadata();
  } catch (error) {
    logger.warn({ err: error }, "Contenido de imagen ilegible");
    throw solicitudInvalida(
      "El archivo no es una imagen válida. Usa JPG, PNG o WEBP.",
      { codigo: "imagen_invalida" },
    );
  }
  if (
    !FORMATOS_ACEPTADOS.has(metadatos.format) ||
    !metadatos.width ||
    !metadatos.height
  ) {
    throw solicitudInvalida(
      "El contenido no corresponde a una imagen JPG, PNG o WEBP.",
      { codigo: "formato_imagen_invalido" },
    );
  }
  return {
    formato: metadatos.format,
    ancho: metadatos.width,
    alto: metadatos.height,
  };
}

/** Normaliza la orientación y borra metadatos, recortando si se pidió. */
function construirBase(buffer, imagen, opciones) {
  let procesador = sharp(buffer, {
    limitInputPixels: PIXELES_MAXIMOS,
    failOn: "error",
  })
    .rotate() // aplica la orientación EXIF y la elimina del resultado
    .flatten({ background: "#ffffff" }); // PNG transparente => blanco
  const recorte = recortar(
    imagen.ancho,
    imagen.alto,
    opciones.formato,
    opciones.posicionX,
    opciones.posicionY,
  );
  if (recorte) procesador = procesador.extract(recorte);
  return procesador;
}

/**
 * Procesa un archivo subido y devuelve el registro creado.
 * @param {object} archivo Archivo de multer (buffer en memoria).
 * @param {number} usuarioId Dueño del archivo.
 * @param {string} textoAlternativo Texto alternativo obligatorio.
 * @param {object} [opciones]
 * @param {boolean} [opciones.publica] true para artículos y cultivos.
 * @param {object} [opciones.autor] { nombre, url } (obligatorio si publica).
 * @param {object} [opciones.licencia] { nombre, url } (obligatorio si publica).
 */
async function procesarSubida(archivo, usuarioId, textoAlternativo, opciones = {}) {
  if (!archivo) throw solicitudInvalida("Selecciona una imagen para subir.");
  const alt = String(textoAlternativo || "").trim();
  if (!alt || alt.length > 255) {
    throw new ErrorHttp(
      400,
      "Escribe un texto alternativo de 1 a 255 caracteres para la imagen.",
      { codigo: "alt_obligatorio" },
    );
  }
  const publica = Boolean(opciones.publica);
  let autor = null;
  let licencia = null;
  if (publica) {
    autor = {
      nombre: String((opciones.autor && opciones.autor.nombre) || "").trim(),
      url: String((opciones.autor && opciones.autor.url) || "").trim() || null,
    };
    licencia = {
      nombre: String(
        (opciones.licencia && opciones.licencia.nombre) || "",
      ).trim(),
      url:
        String((opciones.licencia && opciones.licencia.url) || "").trim() ||
        null,
    };
    if (!autor.nombre || autor.nombre.length > 160) {
      throw new ErrorHttp(
        400,
        "Indica el autor de la imagen (obligatorio para imágenes públicas).",
        { codigo: "autor_obligatorio" },
      );
    }
    if (!licencia.nombre || licencia.nombre.length > 160) {
      throw new ErrorHttp(
        400,
        "Indica la licencia de la imagen (obligatorio para imágenes públicas).",
        { codigo: "licencia_obligatoria" },
      );
    }
  }

  const imagen = await inspeccionar(archivo.buffer);
  const base = construirBase(archivo.buffer, imagen, opciones);

  // Se procesa una vez por ancho; se conserva el primero como tamaño principal.
  const variantesBinarias = [];
  for (const ancho of env.imagenes.anchos) {
    const webp = await base
      .clone()
      .resize({ width: ancho, withoutEnlargement: true })
      .webp({ quality: env.imagenes.calidadWebp })
      .toBuffer({ resolveWithObject: true });
    const jpg = await base
      .clone()
      .resize({ width: ancho, withoutEnlargement: true })
      .jpeg({ quality: env.imagenes.calidadJpg, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    variantesBinarias.push({
      ancho,
      webp,
      jpg,
      anchoPx: jpg.info.width,
      altoPx: jpg.info.height,
    });
  }
  const principal = variantesBinarias[variantesBinarias.length - 1];

  const id = nuevoId();
  const carpeta = `${publica ? "publicas" : "privadas"}/${id}`;
  const guardadas = [];
  try {
    const variantes = [];
    for (const variante of variantesBinarias) {
      const claveWebp = `${carpeta}/${variante.ancho}.webp`;
      const claveJpg = `${carpeta}/${variante.ancho}.jpg`;
      await almacenamiento.guardar(claveWebp, variante.webp.data);
      guardadas.push(claveWebp);
      await almacenamiento.guardar(claveJpg, variante.jpg.data);
      guardadas.push(claveJpg);
      variantes.push({
        ancho: variante.ancho,
        ancho_px: variante.anchoPx,
        alto_px: variante.altoPx,
        ruta_webp: claveWebp,
        ruta_jpg: claveJpg,
        tamano_webp: variante.webp.data.length,
        tamano_jpg: variante.jpg.data.length,
      });
    }

    const archivoId = await repositorio.crear({
      archivo: {
        autor_id: usuarioId || null,
        nombre_original: nombreSeguro(archivo.originalname),
        // Ruta de la variante WebP más grande (por compatibilidad con el
        // código previo; las demás variantes viven en imagen_variantes).
        ruta: variantes[variantes.length - 1].ruta_webp,
        mime: "image/webp",
        tamano: principal.webp.data.length,
        // Ancho de la variante más pequeña generada (400 px salvo que la
        // original sea menor). Describe la proporción reservada en las vistas.
        ancho: variantes[0].ancho_px,
        alto: variantes[0].alto_px,
        texto_alternativo: alt,
        licencia: licencia ? licencia.nombre : null,
        licencia_url: licencia ? licencia.url : null,
        autor_imagen: autor ? autor.nombre : null,
        autor_url: autor ? autor.url : null,
        es_publica: publica,
      },
      variantes,
    });
    return {
      id: archivoId,
      ruta: variantes[variantes.length - 1].ruta_webp,
      variantes,
      ancho: variantes[0].ancho_px,
      alto: variantes[0].alto_px,
    };
  } catch (error) {
    // Rollback manual de los binarios ya escritos.
    await Promise.all(
      guardadas.map((clave) =>
        almacenamiento.eliminar(clave).catch((errorLimpieza) => {
          logger.error(
            { err: errorLimpieza, clave },
            "No se pudo limpiar una variante tras fallar la subida",
          );
        }),
      ),
    );
    throw error;
  }
}

/** Carga una imagen con sus variantes y datos de atribución. */
async function obtenerDetalle(id) {
  const archivo = await repositorio.buscarPorId(id);
  if (!archivo) return null;
  const variantes = await repositorio.listarVariantes(archivo.id);
  return { ...archivo, variantes };
}

/**
 * Datos para el atributo srcset de las etiquetas <picture>.
 * En local las URLs pasan por /media/imagenes/:id/:ancho; con S3/Cloudinary
 * se usa la URL del CDN (pero solo para imágenes públicas).
 */
function describe(archivo, { publica = false } = {}) {
  const prefijo = publica ? "/media/imagenes" : "/media/privadas";
  const variantes = (archivo.variantes || []).map((variante) => {
    const webpCdn = publica ? almacenamiento.urlPublica(variante.ruta_webp) : null;
    const jpgCdn = publica ? almacenamiento.urlPublica(variante.ruta_jpg) : null;
    return {
      ancho: Number(variante.ancho),
      anchoPx: Number(variante.ancho_px),
      altoPx: Number(variante.alto_px),
      webp: webpCdn || `${prefijo}/${archivo.id}/${variante.ancho}`,
      jpg: jpgCdn || `${prefijo}/${archivo.id}/${variante.ancho}?formato=jpg`,
    };
  });
  const bajaResolucion =
    variantes.length > 0 &&
    Math.max(...variantes.map((variante) => variante.anchoPx)) <
      ANCHO_MINIMO_RECOMENDADO;
  return {
    id: archivo.id,
    alt: archivo.texto_alternativo || "",
    ancho: archivo.ancho,
    alto: archivo.alto,
    variantes,
    bajaResolucion,
    autor: archivo.autor_imagen || null,
    autorUrl: archivo.autor_url || null,
    licencia: archivo.licencia || null,
    licenciaUrl: archivo.licencia_url || null,
    // Proporción reservada: evita saltos de diseño mientras carga.
    proporcion:
      archivo.ancho && archivo.alto ? `${archivo.ancho} / ${archivo.alto}` : "3 / 2",
  };
}

module.exports = {
  inspeccionar,
  recortar,
  procesarSubida,
  obtenerDetalle,
  describe,
  nuevoId,
  ANCHO_MINIMO_RECOMENDADO,
};
