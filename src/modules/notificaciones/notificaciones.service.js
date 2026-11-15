const repositorio = require("./notificaciones.repository");

const POR_PAGINA = 20;

function enlace(fila, roles = []) {
  if (fila.tipo === "solicitud") {
    return "/admin/solicitudes";
  }
  if (fila.aviso_zona_id) {
    return `/notificaciones/avisos/${Number(fila.aviso_zona_id)}`;
  }
  if (fila.alerta_parcela_id) {
    return `/panel/parcelas/${Number(fila.alerta_parcela_id)}`;
  }
  if (fila.consulta_id) {
    const esTecnico =
      roles.includes("tecnico") || roles.includes("administrador");
    return `/${esTecnico ? "tecnico" : "panel"}/consultas/${Number(fila.consulta_id)}`;
  }
  return "/notificaciones";
}

async function listar(usuarioId, pagina = 1, roles = []) {
  const { filas, total } = await repositorio.listar(
    usuarioId,
    pagina,
    POR_PAGINA,
  );
  return {
    notificaciones: filas.map((fila) => ({
      ...fila,
      leida: Boolean(fila.leida),
      enlace: enlace(fila, roles),
    })),
    pagina,
    paginas: Math.max(1, Math.ceil(total / POR_PAGINA)),
    total,
    noLeidas: await repositorio.contarNoLeidas(usuarioId),
  };
}

function contarNoLeidas(usuarioId) {
  return repositorio.contarNoLeidas(usuarioId);
}

async function nuevasDesde(usuarioId, id, roles) {
  const filas = await repositorio.nuevasDesde(usuarioId, id);
  return filas.map((fila) => ({
    ...fila,
    leida: Boolean(fila.leida),
    enlace: enlace(fila, roles),
  }));
}

function ultimoId(usuarioId) {
  return repositorio.ultimoId(usuarioId);
}

function marcarLeida(id, usuarioId) {
  return repositorio.marcarLeida(id, usuarioId);
}

module.exports = {
  listar,
  contarNoLeidas,
  nuevasDesde,
  ultimoId,
  marcarLeida,
};
