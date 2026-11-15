const servicio = require("./consultas.service");
const publicoRepositorio = require("../publico/publico.repository");
const consultaPublicaRepositorio = require("../consultaPublica/consultaPublica.repository");
const { agregarMensaje } = require("../../middlewares/vistas");

async function listarAgricultor(req, res) {
  const consultas = await servicio.listaAgricultor(req.session.usuario.id);
  return res.render("comunidad/consultas_agricultor", {
    titulo: "Mis consultas",
    consultas,
  });
}

async function nueva(req, res) {
  const [datos, provincias, consultaPublica] = await Promise.all([
    servicio.datosFormulario(),
    publicoRepositorio.listarProvinciasTodas(),
    req.session.consultaPublicaPendienteId
      ? consultaPublicaRepositorio.obtenerConsultaPublica(
          req.session.consultaPublicaPendienteId,
        )
      : Promise.resolve(null),
  ]);
  return res.render("comunidad/consulta_formulario", {
    titulo: "Nueva consulta",
    ...datos,
    provincias,
    consultaPublica,
  });
}

async function crear(req, res) {
  const id = await servicio.crearConsulta(
    req.session.usuario.id,
    req.body,
    req.files || [],
    req.session.consultaPublicaPendienteId || null,
  );
  delete req.session.consultaPublicaPendienteId;
  agregarMensaje(req, "exito", "Tu consulta se envió a los técnicos de la zona.");
  return res.redirect(`/panel/consultas/${id}`);
}

async function detalleAgricultor(req, res) {
  const consulta = await servicio.consultaAgricultor(
    req.params.id,
    req.session.usuario.id,
  );
  return res.render("comunidad/consulta_detalle", {
    titulo: consulta.titulo,
    consulta,
    modoTecnico: false,
  });
}

async function cerrar(req, res) {
  await servicio.cerrar(req.params.id, req.session.usuario.id);
  agregarMensaje(req, "exito", "La consulta quedó cerrada.");
  return res.redirect(`/panel/consultas/${req.params.id}`);
}

async function calificar(req, res) {
  await servicio.calificar(
    req.params.consultaId,
    req.params.respuestaId,
    req.session.usuario.id,
    req.body.puntuacion,
    req.body.comentario,
  );
  agregarMensaje(req, "exito", "Gracias por calificar la respuesta.");
  return res.redirect(`/panel/consultas/${req.params.consultaId}`);
}

async function listarTecnico(req, res) {
  const datos = await servicio.listaTecnico(req.session.usuario.id);
  return res.render("comunidad/tecnico_consultas", {
    titulo: "Consultas de mi zona",
    ...datos,
  });
}

async function detalleTecnico(req, res) {
  const consulta = await servicio.consultaTecnico(
    req.params.id,
    req.session.usuario,
  );
  return res.render("comunidad/consulta_detalle", {
    titulo: consulta.titulo,
    consulta,
    modoTecnico: true,
  });
}

async function responder(req, res) {
  await servicio.responder(
    req.params.id,
    req.session.usuario,
    req.body.contenido,
  );
  agregarMensaje(req, "exito", "Tu respuesta se envió al agricultor.");
  return res.redirect(`/tecnico/consultas/${req.params.id}`);
}

async function zonas(req, res) {
  const [distritos, departamentos, provincias] = await Promise.all([
    servicio.distritosTecnico(req.session.usuario.id),
    publicoRepositorio.listarDepartamentos(),
    publicoRepositorio.listarProvinciasTodas(),
  ]);
  return res.render("comunidad/tecnico_zonas", {
    titulo: "Mis zonas de atención",
    distritos,
    departamentos,
    provincias,
  });
}

async function agregarZona(req, res) {
  await servicio.agregarDistritoTecnico(
    req.session.usuario.id,
    req.body.distrito_id,
  );
  agregarMensaje(req, "exito", "Se agregó el distrito a tus zonas de atención.");
  return res.redirect("/tecnico/zonas");
}

async function quitarZona(req, res) {
  await servicio.quitarDistritoTecnico(
    req.session.usuario.id,
    req.params.distritoId,
  );
  agregarMensaje(req, "exito", "Se quitó el distrito de tus zonas de atención.");
  return res.redirect("/tecnico/zonas");
}

module.exports = {
  listarAgricultor,
  nueva,
  crear,
  detalleAgricultor,
  cerrar,
  calificar,
  listarTecnico,
  detalleTecnico,
  responder,
  zonas,
  agregarZona,
  quitarZona,
};
