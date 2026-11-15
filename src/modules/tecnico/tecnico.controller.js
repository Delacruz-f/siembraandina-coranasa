// Controlador del panel técnico: parcelas asignadas y validación de datos.
const parcelasServicio = require("../parcelas/parcelas.service");
const lecturasServicio = require("../lecturas/lecturas.service");
const cultivosServicio = require("../cultivos/cultivos.service");
const parcelasRepositorio = require("../parcelas/parcelas.repository");
const avisosServicio = require("./avisos.service");
const { agregarMensaje } = require("../../middlewares/vistas");

async function panel(req, res) {
  const [parcelas, datos, historialAccesos] = await Promise.all([
    parcelasServicio.asignadasATecnico(req.session.usuario.id),
    cultivosServicio.panelTecnico(),
    parcelasRepositorio.listarHistorialAccesosTecnico(req.session.usuario.id),
  ]);
  res.render("tecnico/panel", {
    titulo: "Panel técnico",
    parcelas,
    historialAccesos,
    ...datos,
  });
}

async function parcela(req, res) {
  const { parcela: datos, acceso } = await parcelasServicio.obtenerParaTecnico(
    req.params.id,
    req.session.usuario.id,
  );
  const lecturas = await lecturasServicio.listar(datos.id);
  res.render("tecnico/parcela", {
    titulo: datos.nombre,
    parcela: datos,
    acceso,
    lecturas,
    hoy: new Date().toISOString().slice(0, 10),
  });
}

async function actualizarRequerimiento(req, res) {
  await cultivosServicio.actualizarRequerimiento(
    req.params.id,
    req.session.usuario.id,
    req.body,
    { ip: req.ip },
  );
  agregarMensaje(req, "exito", "Requerimiento validado.");
  res.redirect("/tecnico");
}

async function actualizarCalendario(req, res) {
  await cultivosServicio.actualizarCalendario(
    req.params.id,
    req.session.usuario.id,
    req.body,
    { ip: req.ip },
  );
  agregarMensaje(req, "exito", "Calendario validado.");
  res.redirect("/tecnico");
}

async function avisos(req, res) {
  const datos = await avisosServicio.datosPanel(req.session.usuario);
  return res.render("tecnico/avisos", { titulo: "Avisos por zona", ...datos });
}

async function publicarAviso(req, res) {
  const resultado = await avisosServicio.publicar(
    req.session.usuario,
    req.body,
    { ip: req.ip },
  );
  agregarMensaje(
    req,
    "exito",
    `Aviso enviado a ${resultado.destinatarios} agricultor(es) con parcelas en la zona.`,
  );
  return res.redirect("/tecnico/avisos");
}

module.exports = {
  panel,
  parcela,
  actualizarRequerimiento,
  actualizarCalendario,
  avisos,
  publicarAviso,
};
