const archivosServicio = require("./archivos.service");

async function descargar(req, res, next) {
  const archivo = await archivosServicio.obtenerParaDescarga(
    req.params.id,
    req.session.usuario,
  );
  return res.download(archivo.ruta, archivo.nombre, (error) => {
    if (error) next(error);
  });
}

/** La imagen se sirve desde la ruta controlada /media/privadas/:id/:ancho. */
async function ver(req, res) {
  const imagen = await archivosServicio.obtenerImagenParaUsuario(
    req.params.id,
    req.session.usuario,
  );
  return res.redirect(302, `/media/privadas/${imagen.id}/800`);
}

module.exports = { descargar, ver };
