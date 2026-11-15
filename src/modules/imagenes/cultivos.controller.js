// Controlador de imágenes del catálogo de cultivos (públicas).
const servicio = require("./cultivos.service");
const { agregarMensaje } = require("../../middlewares/vistas");

async function listar(req, res) {
  const datos = await servicio.listarDeCultivo(req.params.id);
  return res.render("admin/cultivo_imagenes", {
    titulo: `Imágenes de ${datos.cultivo.nombre}`,
    ...datos,
  });
}

async function subir(req, res) {
  await servicio.subir(
    req.params.id,
    req.session.usuario.id,
    req.files,
    req.body,
    { ip: req.ip },
  );
  agregarMensaje(req, "exito", "Imágenes del cultivo guardadas.");
  return res.redirect(`/admin/cultivos/${req.params.id}/imagenes`);
}

async function eliminar(req, res) {
  await servicio.eliminar(
    req.params.id,
    req.params.archivoId,
    req.session.usuario.id,
    { ip: req.ip },
  );
  agregarMensaje(req, "exito", "Imagen eliminada del cultivo.");
  return res.redirect(`/admin/cultivos/${req.params.id}/imagenes`);
}

module.exports = { listar, subir, eliminar };
