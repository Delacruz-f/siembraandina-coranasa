// Controlador de parcelas: CRUD del agricultor y gestión de accesos.
const servicio = require("./parcelas.service");
const lecturasServicio = require("../lecturas/lecturas.service");
const campaniasServicio = require("../campanias/campanias.service");
const usuariosRepositorio = require("../usuarios/usuarios.repository");
const cultivosRepositorio = require("../cultivos/cultivos.repository");
const openMeteo = require("../../openMeteo");
const condicionesServicio = require("./condiciones.service");
const motor = require("../../engine");
const { agregarMensaje } = require("../../middlewares/vistas");

async function listar(req, res) {
  const parcelas = await servicio.listar(req.session.usuario.id);
  res.render("panel/parcelas", { titulo: "Mis parcelas", parcelas });
}

async function mostrarNueva(req, res) {
  const catalogos = await servicio.catalogos();
  res.render("panel/parcela_formulario", {
    titulo: "Nueva parcela",
    ...catalogos,
    parcela: null,
    usarMapaParcela: true,
  });
}

async function crear(req, res) {
  const id = await servicio.crear(req.session.usuario.id, req.body, {
    ip: req.ip,
  });
  agregarMensaje(req, "exito", "Parcela creada.");
  res.redirect(`/panel/parcelas/${id}`);
}

async function mostrarDetalle(req, res) {
  const parcela = await servicio.obtenerDelUsuario(
    req.params.id,
    req.session.usuario.id,
  );
  const pagina = Number(req.query.pagina || 1);
  const [
    lecturas,
    grafico,
    requerimiento,
    accesos,
    campanias,
    imagenes,
    condiciones,
    pronosticoCondiciones,
  ] = await Promise.all([
    lecturasServicio.listarPaginadas(parcela.id, pagina),
    lecturasServicio.listarParaGrafico(parcela.id),
    cultivosRepositorio.buscarRequerimientoPorCultivoZona(
      parcela.cultivo_id,
      parcela.zona_id,
    ),
    servicio.listarAccesos(parcela.id),
    campaniasServicio.listarDeParcela(parcela.id, req.session.usuario.id),
    servicio.listarImagenes(parcela.id, req.session.usuario.id),
    condicionesServicio.consolidar(parcela.id),
    condicionesServicio.obtenerPronostico(parcela),
  ]);
  const recomendacion = motor.evaluarV2({
    condiciones,
    requerimiento,
    pronostico: pronosticoCondiciones,
  });
  const chartData = {
    etiquetas: grafico.map((fila) => String(fila.fecha).slice(0, 10)),
    humedad: grafico.map((fila) => Number(fila.humedad)),
    temperatura: grafico.map((fila) => Number(fila.temperatura)),
    humMin: requerimiento ? Number(requerimiento.hum_min) : null,
    humMax: requerimiento ? Number(requerimiento.hum_max) : null,
    tempMin: requerimiento ? Number(requerimiento.temp_min) : null,
    tempMax: requerimiento ? Number(requerimiento.temp_max) : null,
  };
  res.render("panel/parcela_detalle", {
    titulo: parcela.nombre,
    parcela,
    lecturas,
    accesos,
    campanias,
    imagenes,
    chartData,
    requerimiento,
    condiciones,
    pronosticoCondiciones,
    recomendacion,
    hoy: new Date().toISOString().slice(0, 10),
  });
}

async function subirImagenes(req, res) {
  await servicio.guardarImagenes(
    req.params.id,
    req.session.usuario.id,
    req.files,
    req.body.textos_alternativos,
    { ip: req.ip },
  );
  agregarMensaje(req, "exito", "Imágenes de la parcela guardadas.");
  res.redirect(`/panel/parcelas/${req.params.id}`);
}

async function verificarPropiedad(req, res, next) {
  await servicio.obtenerDelUsuario(req.params.id, req.session.usuario.id);
  return next();
}

async function eliminarImagen(req, res) {
  await servicio.eliminarImagen(
    req.params.id,
    req.params.archivoId,
    req.session.usuario.id,
    { ip: req.ip },
  );
  agregarMensaje(req, "exito", "Imagen eliminada.");
  res.redirect(`/panel/parcelas/${req.params.id}`);
}

async function mostrarEditar(req, res) {
  const parcela = await servicio.obtenerDelUsuario(
    req.params.id,
    req.session.usuario.id,
  );
  const catalogos = await servicio.catalogos(parcela.distrito_id);
  res.render("panel/parcela_formulario", {
    titulo: "Editar parcela",
    ...catalogos,
    parcela,
    usarMapaParcela: true,
  });
}

async function estimarAltitud(req, res) {
  const altitud = await openMeteo.obtenerElevacion(
    Number(req.query.latitud),
    Number(req.query.longitud),
  );
  res.json({ altitud_m: altitud });
}

async function actualizar(req, res) {
  await servicio.actualizar(req.params.id, req.session.usuario.id, req.body, {
    ip: req.ip,
  });
  agregarMensaje(req, "exito", "Parcela actualizada.");
  res.redirect(`/panel/parcelas/${req.params.id}`);
}

async function eliminar(req, res) {
  await servicio.eliminar(req.params.id, req.session.usuario.id, {
    ip: req.ip,
  });
  agregarMensaje(req, "exito", "Parcela eliminada.");
  res.redirect("/panel/parcelas");
}

/** Busca técnicos por nombre o correo (para el formulario de acceso). */
async function buscarTecnicos(req, res) {
  const texto = (req.query.q || "").trim();
  const tecnicos =
    texto.length >= 2 ? await usuariosRepositorio.buscarTecnicos(texto) : [];
  res.json({ tecnicos });
}

async function concederAcceso(req, res) {
  await servicio.concederAcceso(
    req.params.id,
    req.session.usuario.id,
    req.body,
    { ip: req.ip },
  );
  agregarMensaje(req, "exito", "Acceso concedido al técnico.");
  res.redirect(`/panel/parcelas/${req.params.id}`);
}

async function revocarAcceso(req, res) {
  await servicio.revocarAcceso(req.params.accesoId, req.session.usuario.id, {
    ip: req.ip,
  });
  agregarMensaje(req, "exito", "Acceso revocado.");
  res.redirect(`/panel/parcelas/${req.params.id}`);
}

module.exports = {
  listar,
  mostrarNueva,
  crear,
  mostrarDetalle,
  mostrarEditar,
  estimarAltitud,
  actualizar,
  eliminar,
  subirImagenes,
  verificarPropiedad,
  eliminarImagen,
  buscarTecnicos,
  concederAcceso,
  revocarAcceso,
};
