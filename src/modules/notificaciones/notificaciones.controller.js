const servicio = require("./notificaciones.service");
const logger = require("../../config/logger");
const { noEncontrado } = require("../../utils/errores");
const { agregarMensaje } = require("../../middlewares/vistas");
const avisosRepositorio = require("../tecnico/avisos.repository");

const conexionesPorUsuario = new Map();
const MAX_CONEXIONES_POR_USUARIO = 3;
const INTERVALO_MS = 10000;

async function mostrar(req, res) {
  const pagina = Number(req.query.pagina || 1);
  const datos = await servicio.listar(
    req.session.usuario.id,
    pagina,
    req.session.usuario.roles,
  );
  return res.render("notificaciones/lista", {
    titulo: "Notificaciones",
    ...datos,
  });
}

async function resumen(req, res) {
  const cantidad = await servicio.contarNoLeidas(req.session.usuario.id);
  return res.json({ noLeidas: cantidad });
}

async function marcarLeida(req, res) {
  const existe = await servicio.marcarLeida(
    req.params.id,
    req.session.usuario.id,
  );
  if (!existe) throw noEncontrado("No encontramos esa notificación.");
  agregarMensaje(req, "exito", "Notificación marcada como leída.");
  return res.redirect(req.get("Referrer")?.startsWith("/notificaciones") ? req.get("Referrer") : "/notificaciones");
}

async function mostrarAviso(req, res) {
  const aviso = await avisosRepositorio.buscarAvisoParaUsuario(
    req.params.id,
    req.session.usuario.id,
  );
  if (!aviso) throw noEncontrado("No encontramos ese aviso para tus parcelas.");
  return res.render("notificaciones/aviso", { titulo: aviso.titulo, aviso });
}

async function eventos(req, res) {
  if (process.env.VERCEL !== undefined) return res.status(204).end();

  const usuarioId = Number(req.session.usuario.id);
  const activas = conexionesPorUsuario.get(usuarioId) || 0;
  if (activas >= MAX_CONEXIONES_POR_USUARIO) {
    return res.status(429).end();
  }
  conexionesPorUsuario.set(usuarioId, activas + 1);
  let cerrada = false;
  let listo = false;
  let consultando = false;
  let ultimo = Number(req.get("Last-Event-ID") || req.query.desde || 0);
  const liberarConexion = () => {
    if (cerrada) return;
    cerrada = true;
    clearInterval(temporizador);
    const cantidad = conexionesPorUsuario.get(usuarioId) || 1;
    if (cantidad <= 1) conexionesPorUsuario.delete(usuarioId);
    else conexionesPorUsuario.set(usuarioId, cantidad - 1);
  };
  res.on("close", liberarConexion);

  const enviar = async () => {
    if (cerrada || !listo || consultando) return;
    consultando = true;
    try {
      const filas = await servicio.nuevasDesde(
        usuarioId,
        ultimo,
        req.session.usuario.roles,
      );
      for (const fila of filas) {
        ultimo = Number(fila.id);
        res.write(`id: ${ultimo}\nevent: notificacion\ndata: ${JSON.stringify(fila)}\n\n`);
      }
      const noLeidas = await servicio.contarNoLeidas(usuarioId);
      res.write(`event: contador\ndata: ${JSON.stringify({ noLeidas })}\n\n`);
      if (typeof res.flush === "function") res.flush();
    } finally {
      consultando = false;
    }
  };

  const temporizador = setInterval(() => {
    if (!listo) return;
    enviar().catch((error) => {
      logger.error({ err: error, usuarioId }, "Falló la actualización SSE de notificaciones");
      clearInterval(temporizador);
      if (!res.writableEnded) res.end();
    });
  }, INTERVALO_MS);

  if (!Number.isSafeInteger(ultimo) || ultimo < 0 || ultimo === 0) {
    ultimo = await servicio.ultimoId(usuarioId);
  }
  if (cerrada) return;

  res.status(200).set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  listo = true;

  await enviar().catch((error) => {
    logger.error(
      { err: error, usuarioId },
      "No se pudo iniciar la actualización SSE de notificaciones",
    );
    clearInterval(temporizador);
    if (!res.writableEnded) res.end();
  });
}

module.exports = { mostrar, resumen, marcarLeida, mostrarAviso, eventos };
