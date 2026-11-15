// El inicio pertenece al sitio público, también cuando hay una sesión activa.
const publicoServicio = require("../publico/publico.service");
const { metadatos } = require("../publico/seo");
const equipo = require("../../config/equipo");

async function mostrarInicio(req, res) {
  const datos = await publicoServicio.datosInicio();
  return res.render("publico/inicio", {
    ...datos,
    equipo,
    ...metadatos(req, {
      titulo: "Siembra a tiempo en la sierra",
      descripcion:
        "Consulta calendarios de siembra tradicionales y observa datos de suelo para papa, maíz y quinua.",
    }),
  });
}

module.exports = { mostrarInicio };
