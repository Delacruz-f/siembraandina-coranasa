const sanitizeHtml = require("sanitize-html");
const repositorio = require("./editor.repository");
const archivosServicio = require("../usuarios/archivos.service");
const imagenesServicio = require("../imagenes/imagenes.service");
const imagenesRepositorio = require("../imagenes/imagenes.repository");
const auditoria = require("../admin/auditoria.repository");
const { noEncontrado, solicitudInvalida } = require("../../utils/errores");

const HTML_PERMITIDO = {
  allowedTags: [
    "p", "br", "h2", "h3", "h4", "strong", "em", "u", "blockquote",
    "ul", "ol", "li", "a", "img",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { img: ["http", "https"] },
  exclusiveFilter(frame) {
    return (
      frame.tag === "img" &&
      (
        !/^\/media\/publicaciones\/[1-9]\d*$/.test(frame.attribs.src || "") ||
        !String(frame.attribs.alt || "").trim()
      )
    );
  },
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", {
      rel: "noopener noreferrer",
      target: "_blank",
    }),
  },
};

const ESTADOS_EDITABLES = new Set(["borrador", "publicada", "programada", "archivada"]);

function sanitizar(contenido) {
  return sanitizeHtml(contenido, HTML_PERMITIDO);
}

function aLista(valor) {
  if (Array.isArray(valor)) return valor;
  return valor ? [valor] : [];
}

async function panel({ busqueda = "", pagina = 1 } = {}) {
  const limite = 20;
  const [resultado, categorias, etiquetas, estados] = await Promise.all([
    repositorio.listar({ busqueda, pagina, limite }),
    repositorio.listarCategorias(),
    repositorio.listarEtiquetas(),
    repositorio.estados(),
  ]);
  return {
    ...resultado,
    categorias,
    etiquetas,
    estados,
    busqueda,
    pagina,
    paginas: Math.max(1, Math.ceil(resultado.total / limite)),
  };
}

async function biblioteca(usuarioId) {
  const filas = await repositorio.listarBiblioteca(usuarioId);
  const variantes = await imagenesRepositorio.listarVariantes(
    filas.map((fila) => fila.id),
  );
  const porArchivo = new Map();
  for (const variante of variantes) {
    const id = Number(variante.archivo_id);
    if (!porArchivo.has(id)) porArchivo.set(id, []);
    porArchivo.get(id).push(variante);
  }
  return filas.map((fila) =>
    imagenesServicio.describe(
      { ...fila, variantes: porArchivo.get(Number(fila.id)) || [] },
      { publica: true },
    ),
  );
}

async function formulario(id, usuarioId) {
  const [articulo, categorias, etiquetas, estados, imagenes] = await Promise.all([
    id ? repositorio.buscarParaEdicion(id) : Promise.resolve(null),
    repositorio.listarCategorias(),
    repositorio.listarEtiquetas(),
    repositorio.estados(),
    biblioteca(usuarioId),
  ]);
  if (id && !articulo) throw noEncontrado("No encontramos ese artículo.");
  if (articulo) articulo.contenido = sanitizar(articulo.contenido || "");
  return { articulo, categorias, etiquetas, estados, imagenes };
}

async function guardar(id, usuarioId, entrada, contexto = {}) {
  const estado = String(entrada.estado || "borrador");
  if (!ESTADOS_EDITABLES.has(estado)) {
    throw solicitudInvalida("Elige un estado válido para el artículo.");
  }
  const titulo = String(entrada.titulo || "").trim();
  const contenido = sanitizar(String(entrada.contenido || ""));
  if (!contenido.replace(/<[^>]*>/g, "").trim()) {
    throw solicitudInvalida("El contenido debe tener texto después de sanitizarlo.");
  }
  const categoriaId = Number(entrada.categoria_id);
  const categoria = await repositorio.listarCategorias();
  if (!categoria.some((fila) => Number(fila.id) === categoriaId)) {
    throw solicitudInvalida("Selecciona una categoría existente.");
  }
  let publicadaEn = null;
  if (estado === "publicada") publicadaEn = new Date();
  if (estado === "programada") {
    publicadaEn = new Date(entrada.publicada_en);
    if (
      Number.isNaN(publicadaEn.getTime()) ||
      publicadaEn.getTime() <= Date.now()
    ) {
      throw solicitudInvalida("La fecha programada debe ser posterior a este momento.");
    }
  }

  const etiquetas = [...new Set(
    String(entrada.etiquetas || "")
      .split(",")
      .map((texto) => texto.trim())
      .filter(Boolean),
  )];
  if (etiquetas.length > 10 || etiquetas.some((texto) => texto.length > 60)) {
    throw solicitudInvalida("Usa hasta 10 etiquetas de no más de 60 caracteres.");
  }
  const idsEtiquetas = await repositorio.asegurarEtiquetas(etiquetas);
  const idsImagenes = [...new Set(aLista(entrada.archivo_ids).map(Number))];
  if (idsImagenes.length > 10 || idsImagenes.some((archivoId) => !Number.isInteger(archivoId) || archivoId < 1)) {
    throw solicitudInvalida("Selecciona hasta 10 imágenes válidas de tu biblioteca.");
  }
  const estadoId = await repositorio.estadoId(estado);
  const slug = await repositorio.slugArticulo(titulo, id);
  const articuloId = await repositorio.guardar({
    id: id ? Number(id) : null,
    datos: {
      usuario_id: usuarioId,
      categoria_id: categoriaId,
      estado_id: estadoId,
      titulo,
      slug,
      contenido,
      publicada_en: publicadaEn,
    },
    etiquetas: idsEtiquetas,
    archivoIds: idsImagenes,
  }).catch((error) => {
    if (error.code === "ARCHIVO_NO_PROPIO") {
      throw solicitudInvalida("Solo puedes adjuntar imágenes de tu biblioteca.");
    }
    throw error;
  });
  await auditoria.registrar({
    usuarioId,
    accion: id ? "publicacion.actualizada" : "publicacion.creada",
    entidad: "publicaciones",
    entidadId: articuloId,
    detalle: { estado },
    ip: contexto.ip,
  });
  return articuloId;
}

async function subirImagen(archivo, usuarioId, datos) {
  return archivosServicio.guardarImagen(archivo, usuarioId, datos.texto_alternativo, {
    publica: true,
    autor: { nombre: datos.autor_imagen, url: datos.autor_url },
    licencia: { nombre: datos.licencia, url: datos.licencia_url },
    formato: datos.formato_recorte || "original",
    posicionX: Number(datos.recorte_x || 50),
    posicionY: Number(datos.recorte_y || 50),
  });
}

async function eliminar(id, usuarioId, contexto = {}) {
  const articulo = await repositorio.buscarParaEdicion(id);
  if (!articulo) throw noEncontrado("No encontramos ese artículo.");
  await repositorio.eliminar(id);
  await auditoria.registrar({
    usuarioId,
    accion: "publicacion.eliminada",
    entidad: "publicaciones",
    entidadId: id,
    ip: contexto.ip,
  });
}

async function publicarProgramados() {
  const articulos = await repositorio.publicarProgramados();
  for (const articulo of articulos) {
    await auditoria.registrar({
      usuarioId: articulo.usuario_id,
      accion: "publicacion.publicada_programada",
      entidad: "publicaciones",
      entidadId: articulo.id,
      detalle: { titulo: articulo.titulo },
    });
  }
  return articulos.length;
}

module.exports = {
  panel,
  formulario,
  guardar,
  biblioteca,
  subirImagen,
  eliminar,
  publicarProgramados,
  sanitizar,
};
