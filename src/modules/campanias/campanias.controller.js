const servicio = require("./campanias.service");
const parcelasServicio = require("../parcelas/parcelas.service");
const { agregarMensaje } = require("../../middlewares/vistas");

async function nueva(req, res) {
  const parcela = await parcelasServicio.obtenerDelUsuario(
    req.params.parcelaId,
    req.session.usuario.id,
  );
  const cultivos = (await parcelasServicio.catalogos()).cultivos;
  const cultivoId = Number(req.query.cultivo_id || parcela.cultivo_id);
  const { estados, variedades } = await servicio.catalogos(cultivoId);
  res.render("panel/campania_formulario", {
    titulo: "Nueva campaña",
    parcela,
    campania: null,
    cultivos,
    estados,
    variedades,
  });
}

async function listarVariedades(req, res) {
  const variedades = await servicio.variedades(Number(req.params.cultivoId));
  res.json({ variedades });
}

async function editar(req, res) {
  const campania = await servicio.obtenerDelUsuario(
    req.params.id,
    req.session.usuario.id,
  );
  const cultivos = (await parcelasServicio.catalogos()).cultivos;
  const { estados, variedades } = await servicio.catalogos(campania.cultivo_id);
  res.render("panel/campania_formulario", {
    titulo: "Editar campaña",
    parcela: { id: campania.parcela_id, nombre: campania.parcela },
    campania,
    cultivos,
    estados,
    variedades,
  });
}

async function crear(req, res) {
  const id = await servicio.crear(
    req.params.parcelaId,
    req.session.usuario.id,
    req.body,
    { ip: req.ip },
  );
  agregarMensaje(req, "exito", "Campaña creada.");
  res.redirect(`/panel/campanias/${id}`);
}

async function actualizar(req, res) {
  const parcelaId = await servicio.actualizar(
    req.params.id,
    req.session.usuario.id,
    req.body,
    { ip: req.ip },
  );
  agregarMensaje(req, "exito", "Campaña actualizada.");
  res.redirect(`/panel/parcelas/${parcelaId}`);
}

async function detalle(req, res) {
  const datos = await servicio.detalle(req.params.id, req.session.usuario.id);
  res.render("panel/campania_detalle", {
    titulo: `Campaña de ${datos.campania.cultivo}`,
    ...datos,
  });
}

async function registrarSiembra(req, res) {
  const campania = await servicio.obtenerDelUsuario(
    req.params.id,
    req.session.usuario.id,
  );
  await servicio.registrarSiembra(
    req.params.id,
    req.session.usuario.id,
    req.body,
    { ip: req.ip },
  );
  agregarMensaje(req, "exito", "Siembra real registrada.");
  res.redirect(`/panel/campanias/${campania.id}`);
}

async function registrarCosecha(req, res) {
  const campania = await servicio.obtenerDelUsuario(
    req.params.id,
    req.session.usuario.id,
  );
  await servicio.registrarCosecha(
    req.params.id,
    req.session.usuario.id,
    req.body,
    { ip: req.ip },
  );
  agregarMensaje(req, "exito", "Cosecha registrada.");
  res.redirect(`/panel/campanias/${campania.id}`);
}

module.exports = {
  nueva,
  listarVariedades,
  editar,
  crear,
  actualizar,
  detalle,
  registrarSiembra,
  registrarCosecha,
};
