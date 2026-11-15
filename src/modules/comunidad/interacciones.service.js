const repositorio = require("./interacciones.repository");
const publicoRepositorio = require("../publico/publico.repository");
const auditoria = require("../admin/auditoria.repository");
const { noEncontrado, solicitudInvalida } = require("../../utils/errores");

const VENTANA_EDICION_MS = 15 * 60 * 1000;

async function articuloPublicado(slug) {
  const articulo = await publicoRepositorio.buscarPublicacion(slug);
  if (!articulo) throw noEncontrado("No encontramos ese artículo publicado.");
  return articulo;
}

async function cultivoPublicado(slug) {
  const cultivo = await repositorio.obtenerCultivoPorSlug(slug);
  if (!cultivo) throw noEncontrado("No encontramos ese cultivo.");
  return cultivo;
}

async function resumenArticulo(publicacionId, usuarioId) {
  return repositorio.resumenInteracciones(
    "reacciones",
    "publicacion_id",
    publicacionId,
    usuarioId,
  );
}

async function resumenCultivo(cultivoId, usuarioId) {
  return repositorio.resumenInteracciones(
    "reacciones_cultivos",
    "cultivo_id",
    cultivoId,
    usuarioId,
  );
}

async function reaccionArticulo(slug, usuarioId, clave) {
  const articulo = await articuloPublicado(slug);
  const tipo = await repositorio.buscarTipoReaccion(clave);
  if (!tipo || !["util", "lo_probe"].includes(tipo.clave)) {
    throw solicitudInvalida("Elige una reacción válida.");
  }
  await repositorio.cambiarReaccion(
    "reacciones",
    "publicacion_id",
    articulo.id,
    usuarioId,
    tipo.id,
  );
}

async function reaccionCultivo(slug, usuarioId, clave) {
  const cultivo = await cultivoPublicado(slug);
  const tipo = await repositorio.buscarTipoReaccion(clave);
  if (!tipo || !["util", "lo_probe"].includes(tipo.clave)) {
    throw solicitudInvalida("Elige una reacción válida.");
  }
  await repositorio.cambiarReaccion(
    "reacciones_cultivos",
    "cultivo_id",
    cultivo.id,
    usuarioId,
    tipo.id,
  );
}

async function favoritoArticulo(slug, usuarioId) {
  const articulo = await articuloPublicado(slug);
  return repositorio.alternarFavorito(
    "favoritos",
    "publicacion_id",
    articulo.id,
    usuarioId,
  );
}

async function favoritoCultivo(slug, usuarioId) {
  const cultivo = await cultivoPublicado(slug);
  return repositorio.alternarFavorito(
    "favoritos_cultivos",
    "cultivo_id",
    cultivo.id,
    usuarioId,
  );
}

async function crearComentario(slug, usuarioId, contenido, comentarioPadreId) {
  const articulo = await articuloPublicado(slug);
  if (comentarioPadreId) {
    const padre = await repositorio.buscarComentario(comentarioPadreId);
    if (
      !padre ||
      Number(padre.publicacion_id) !== Number(articulo.id) ||
      padre.comentario_padre_id ||
      padre.deleted_at
    ) {
      throw solicitudInvalida(
        "Solo puedes responder a un comentario principal activo de este artículo.",
      );
    }
  }
  return repositorio.crearComentario({
    publicacion_id: articulo.id,
    usuario_id: usuarioId,
    comentario_padre_id: comentarioPadreId || null,
    contenido,
  });
}

async function obtenerComentarioPropio(id, usuarioId) {
  const comentario = await repositorio.buscarComentario(id);
  if (
    !comentario ||
    comentario.deleted_at ||
    Number(comentario.usuario_id) !== Number(usuarioId)
  ) {
    throw noEncontrado("No encontramos ese comentario.");
  }
  return comentario;
}

async function editarComentario(id, usuarioId, contenido) {
  const comentario = await obtenerComentarioPropio(id, usuarioId);
  const articulo = await repositorio.obtenerPublicacionPorId(
    comentario.publicacion_id,
  );
  const limite = new Date(Date.now() - VENTANA_EDICION_MS);
  if (new Date(comentario.created_at).getTime() < limite.getTime()) {
    throw solicitudInvalida(
      "Solo puedes editar un comentario durante los primeros 15 minutos.",
    );
  }
  const actualizado = await repositorio.actualizarComentarioPropio(
    id,
    usuarioId,
    limite,
    contenido,
  );
  if (!actualizado) {
    throw solicitudInvalida(
      "Se venció el plazo de edición. Actualiza la página e inténtalo de nuevo.",
    );
  }
  return articulo ? articulo.slug : null;
}

async function borrarComentario(id, usuarioId) {
  const comentario = await obtenerComentarioPropio(id, usuarioId);
  const articulo = await repositorio.obtenerPublicacionPorId(
    comentario.publicacion_id,
  );
  await repositorio.eliminarComentario(id);
  return articulo ? articulo.slug : null;
}

async function reportarComentario(id, usuarioId, motivo, detalle) {
  const comentario = await repositorio.buscarComentario(id);
  if (!comentario || comentario.deleted_at) {
    throw noEncontrado("No encontramos ese comentario.");
  }
  if (Number(comentario.usuario_id) === Number(usuarioId)) {
    throw solicitudInvalida("No puedes reportar tu propio comentario.");
  }
  if (await repositorio.buscarReporte(id, usuarioId)) {
    throw solicitudInvalida("Ya reportaste este comentario.");
  }
  const articulo = await repositorio.obtenerPublicacionPorId(
    comentario.publicacion_id,
  );
  const estado = await repositorio.buscarEstadoReporte("pendiente");
  await repositorio.crearReporte({
    comentario_id: id,
    usuario_id: usuarioId,
    estado_id: estado.id,
    motivo,
    detalle: detalle || null,
  });
  return articulo ? articulo.slug : null;
}

async function moderarReporte(id, usuarioId, accion, { ip } = {}) {
  const estadoClave = accion === "ocultar" ? "revisado" : "descartado";
  const actualizado = await repositorio.resolverReporte(
    id,
    estadoClave,
    usuarioId,
    accion === "ocultar",
  );
  if (!actualizado) throw noEncontrado("El reporte ya fue revisado o no existe.");
  await auditoria.registrar({
    usuarioId,
    accion: `comentario.reportado.${accion}`,
    entidad: "reportes_comentarios",
    entidadId: id,
    ip,
  });
}

async function reportesPendientes() {
  return repositorio.listarReportesPendientes();
}

module.exports = {
  resumenArticulo,
  resumenCultivo,
  reaccionArticulo,
  reaccionCultivo,
  favoritoArticulo,
  favoritoCultivo,
  crearComentario,
  editarComentario,
  borrarComentario,
  reportarComentario,
  moderarReporte,
  reportesPendientes,
};
