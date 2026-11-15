const publicoRepositorio = require("../publico/publico.repository");
const servicio = require("./consultaPublica.service");
const { metadatos } = require("../publico/seo");

async function pagina(req, res) {
  const [departamentos, cultivos] = await Promise.all([
    publicoRepositorio.listarDepartamentos(),
    servicio.listarCultivosDisponibles(),
  ]);
  return res.render("publico/consulta", {
    ...metadatos(req, {
      titulo: "Consulta tu lugar",
      descripcion:
        "Explora ventanas referenciales de siembra con datos de suelo, temperatura y calendario andino.",
    }),
    departamentos,
    cultivos,
    usarConsultaPublica: true,
  });
}

async function consultar(req, res) {
  res.set("Cache-Control", "no-store");
  const resultado = await servicio.consultar({
    latitud: req.body.latitud,
    longitud: req.body.longitud,
    distritoId: req.body.distrito_id,
    provinciaId: req.body.provincia_id,
    cultivo: req.body.cultivo,
  });
  req.session.consultaPublicaPendienteId = resultado.id;
  return res.json({ ok: true, resultado });
}

module.exports = { pagina, consultar };
