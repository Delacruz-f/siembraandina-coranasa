const servicio = require("./editor.service");
const { agregarMensaje } = require("../../middlewares/vistas");

async function panel(req, res) {
  const datos = await servicio.panel({
    busqueda: String(req.query.q || "").trim(),
    pagina: Number(req.query.pagina || 1),
  });
  return res.render("editor/panel", { titulo: "Panel editorial", ...datos });
}

async function nuevo(req, res) {
  const datos = await servicio.formulario(null, req.session.usuario.id);
  return res.render("editor/articulo", {
    titulo: "Nuevo artículo",
    accion: "/editor/articulos",
    ...datos,
  });
}

async function editar(req, res) {
  const datos = await servicio.formulario(req.params.id, req.session.usuario.id);
  return res.render("editor/articulo", {
    titulo: "Editar artículo",
    accion: `/editor/articulos/${req.params.id}`,
    ...datos,
  });
}

async function guardar(req, res) {
  const id = req.params.id ? Number(req.params.id) : null;
  await servicio.guardar(id, req.session.usuario.id, req.body, { ip: req.ip });
  agregarMensaje(req, "exito", "Artículo guardado.");
  return res.redirect("/editor");
}

async function eliminar(req, res) {
  await servicio.eliminar(
    Number(req.params.id),
    req.session.usuario.id,
    { ip: req.ip },
  );
  agregarMensaje(req, "exito", "Artículo archivado.");
  return res.redirect("/editor");
}

async function subirImagen(req, res) {
  await servicio.subirImagen(req.file, req.session.usuario.id, req.body);
  agregarMensaje(req, "exito", "Imagen guardada en la biblioteca.");
  const destino = req.body.articulo_id
    ? `/editor/articulos/${req.body.articulo_id}/editar`
    : "/editor/biblioteca";
  return res.redirect(destino);
}

async function biblioteca(req, res) {
  const imagenes = await servicio.biblioteca(req.session.usuario.id);
  return res.render("editor/biblioteca", {
    titulo: "Biblioteca de imágenes",
    imagenes,
  });
}

module.exports = { panel, nuevo, editar, guardar, eliminar, subirImagen, biblioteca };
