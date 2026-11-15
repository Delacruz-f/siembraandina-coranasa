// Controlador de lecturas: registro manual y eliminación.
const servicio = require("./lecturas.service");
const parcelasServicio = require("../parcelas/parcelas.service");
const { agregarMensaje } = require("../../middlewares/vistas");
const crypto = require("crypto");
const { solicitudInvalida } = require("../../utils/errores");

async function mostrarImportar(req, res) {
  const parcela = await parcelasServicio.obtenerDelUsuario(
    req.params.id,
    req.session.usuario.id,
  );
  res.render("panel/lecturas_importar", {
    titulo: "Importar lecturas",
    parcela,
    importacion:
      req.session.importacionLecturas &&
      req.session.importacionLecturas.parcelaId === Number(parcela.id)
        ? req.session.importacionLecturas
        : null,
  });
}

async function verificarPropiedad(req, res, next) {
  await parcelasServicio.obtenerDelUsuario(req.params.id, req.session.usuario.id);
  return next();
}

async function previsualizarCsv(req, res) {
  const parcela = await parcelasServicio.obtenerDelUsuario(
    req.params.id,
    req.session.usuario.id,
  );
  if (
    !req.file ||
    !/\.csv$/i.test(req.file.originalname) ||
    !["text/csv", "application/vnd.ms-excel", "text/plain"].includes(
      req.file.mimetype,
    )
  ) {
    throw solicitudInvalida(
      "Selecciona un archivo .csv codificado en UTF-8.",
    );
  }
  const importacion = servicio.analizarCsv(req.file.buffer);
  const token = crypto.randomBytes(24).toString("hex");
  req.session.importacionLecturas = {
    token,
    parcelaId: Number(parcela.id),
    filas: importacion.validas.map((fila) => ({
      fecha: fila.fecha,
      humedad: fila.humedad,
      temperatura: fila.temperatura,
      observacion: fila.observacion,
    })),
    validas: importacion.validas,
    errores: importacion.errores,
  };
  res.json({
    ok: true,
    url: `/panel/parcelas/${parcela.id}/lecturas/importar`,
  });
}

async function confirmarImportacion(req, res) {
  const parcelaId = Number(req.params.id);
  const borrador = req.session.importacionLecturas;
  if (
    !borrador ||
    borrador.parcelaId !== parcelaId ||
    borrador.token !== req.body.token
  ) {
    throw solicitudInvalida(
      "La vista previa venció o ya se procesó. Vuelve a cargar el CSV.",
    );
  }
  const cantidad = await servicio.importarManual(
    req.session.usuario,
    parcelaId,
    borrador.filas,
    { ip: req.ip },
  );
  delete req.session.importacionLecturas;
  agregarMensaje(req, "exito", `Se importaron ${cantidad} lecturas válidas.`);
  res.redirect(`/panel/parcelas/${parcelaId}`);
}

async function registrar(req, res) {
  const parcelaId = Number(req.params.id);
  await servicio.registrarManual(req.session.usuario, parcelaId, req.body, {
    ip: req.ip,
  });
  agregarMensaje(req, "exito", "Lectura registrada.");
  // El técnico vuelve a su vista de parcela; el agricultor, a la suya.
  const esDueno = await parcelasServicio
    .obtenerDelUsuario(parcelaId, req.session.usuario.id)
    .then(() => true)
    .catch(() => false);
  res.redirect(
    esDueno ? `/panel/parcelas/${parcelaId}` : `/tecnico/parcelas/${parcelaId}`,
  );
}

async function eliminar(req, res) {
  await servicio.eliminar(req.params.lecturaId, req.session.usuario.id, {
    ip: req.ip,
  });
  agregarMensaje(req, "exito", "Lectura eliminada.");
  res.redirect(`/panel/parcelas/${req.params.id}`);
}

module.exports = {
  registrar,
  eliminar,
  mostrarImportar,
  verificarPropiedad,
  previsualizarCsv,
  confirmarImportacion,
};
