const servicio = require("./contacto.service");
const { agregarMensaje } = require("../../middlewares/vistas");
const { metadatos } = require("../publico/seo");

function mostrarFormulario(req, res) {
  return res.render("publico/contacto", {
    ...metadatos(req, {
      titulo: "Contacto",
      descripcion:
        "Escríbenos para compartir una consulta, sugerencia o comentario sobre Siembra Andina.",
    }),
  });
}

async function enviar(req, res) {
  await servicio.recibir(req.body);
  agregarMensaje(
    req,
    "exito",
    "Gracias por escribirnos. Recibimos tu mensaje.",
  );
  return res.redirect("/contacto#formulario");
}

module.exports = { mostrarFormulario, enviar };
