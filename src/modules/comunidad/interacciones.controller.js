const servicio = require("./interacciones.service");
const { agregarMensaje } = require("../../middlewares/vistas");

async function reaccionArticulo(req, res) {
  await servicio.reaccionArticulo(
    req.params.slug,
    req.session.usuario.id,
    req.body.tipo,
  );
  return res.redirect(`/saberes/${encodeURIComponent(req.params.slug)}#interacciones`);
}

async function reaccionCultivo(req, res) {
  await servicio.reaccionCultivo(
    req.params.slug,
    req.session.usuario.id,
    req.body.tipo,
  );
  return res.redirect(`/cultivos/${encodeURIComponent(req.params.slug)}#interacciones`);
}

async function favoritoArticulo(req, res) {
  const guardado = await servicio.favoritoArticulo(
    req.params.slug,
    req.session.usuario.id,
  );
  agregarMensaje(
    req,
    "exito",
    guardado ? "Artículo guardado en tus favoritos." : "Artículo quitado de favoritos.",
  );
  return res.redirect(`/saberes/${encodeURIComponent(req.params.slug)}#interacciones`);
}

async function favoritoCultivo(req, res) {
  const guardado = await servicio.favoritoCultivo(
    req.params.slug,
    req.session.usuario.id,
  );
  agregarMensaje(
    req,
    "exito",
    guardado ? "Cultivo guardado en tus favoritos." : "Cultivo quitado de favoritos.",
  );
  return res.redirect(`/cultivos/${encodeURIComponent(req.params.slug)}#interacciones`);
}

async function crearComentario(req, res) {
  await servicio.crearComentario(
    req.params.slug,
    req.session.usuario.id,
    req.body.contenido,
    req.body.comentario_padre_id ? Number(req.body.comentario_padre_id) : null,
  );
  agregarMensaje(req, "exito", "Tu comentario se publicó.");
  return res.redirect(`/saberes/${encodeURIComponent(req.params.slug)}#comentarios`);
}

async function editarComentario(req, res) {
  const slug = await servicio.editarComentario(
    req.params.id,
    req.session.usuario.id,
    req.body.contenido,
  );
  agregarMensaje(req, "exito", "Comentario actualizado.");
  return res.redirect(slug ? `/saberes/${encodeURIComponent(slug)}#comentarios` : "/saberes");
}

async function borrarComentario(req, res) {
  const slug = await servicio.borrarComentario(req.params.id, req.session.usuario.id);
  agregarMensaje(req, "exito", "Comentario eliminado.");
  return res.redirect(slug ? `/saberes/${encodeURIComponent(slug)}#comentarios` : "/saberes");
}

async function reportarComentario(req, res) {
  const slug = await servicio.reportarComentario(
    req.params.id,
    req.session.usuario.id,
    req.body.motivo,
    req.body.detalle,
  );
  agregarMensaje(req, "exito", "Gracias. El comentario se envió a moderación.");
  return res.redirect(slug ? `/saberes/${encodeURIComponent(slug)}#comentarios` : "/saberes");
}

async function mostrarModeracion(req, res) {
  const reportes = await servicio.reportesPendientes();
  return res.render("editor/moderacion_comentarios", {
    titulo: "Moderación de comentarios",
    reportes,
  });
}

async function moderarReporte(req, res) {
  await servicio.moderarReporte(
    req.params.id,
    req.session.usuario.id,
    req.body.accion,
    { ip: req.ip },
  );
  agregarMensaje(req, "exito", "El reporte fue procesado.");
  return res.redirect("/editor/moderacion/comentarios");
}

module.exports = {
  reaccionArticulo,
  reaccionCultivo,
  favoritoArticulo,
  favoritoCultivo,
  crearComentario,
  editarComentario,
  borrarComentario,
  reportarComentario,
  mostrarModeracion,
  moderarReporte,
};
