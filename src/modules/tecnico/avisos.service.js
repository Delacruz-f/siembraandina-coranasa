const repositorio = require("./avisos.repository");
const auditoria = require("../admin/auditoria.repository");
const { solicitudInvalida, noEncontrado } = require("../../utils/errores");

async function datosPanel(usuario) {
  const esAdministrador = usuario.roles.includes("administrador");
  const [distritos, tipos, avisos] = await Promise.all([
    repositorio.listarDistritos(usuario.id, esAdministrador),
    repositorio.listarTipos(),
    repositorio.listarDelTecnico(usuario.id, esAdministrador),
  ]);
  return { distritos, tipos, avisos };
}

async function publicar(usuario, datos, contexto = {}) {
  const distritoId = Number(datos.distrito_id);
  const tipo = await repositorio.tipoPorClave(datos.tipo);
  if (!tipo) throw solicitudInvalida("Elige un tipo de aviso válido.");
  if (!(await repositorio.puedeAvisar(
    usuario.id,
    distritoId,
    usuario.roles.includes("administrador"),
  ))) {
    throw noEncontrado("El distrito no existe o no forma parte de tu cobertura.");
  }
  const hasta = datos.vigente_hasta ? new Date(datos.vigente_hasta) : null;
  if (hasta && (Number.isNaN(hasta.getTime()) || hasta <= new Date())) {
    throw solicitudInvalida("La vigencia debe terminar en una fecha futura.");
  }
  const resultado = await repositorio.crear({
    tecnicoId: usuario.id,
    distritoId,
    tipoId: tipo.id,
    titulo: datos.titulo.trim(),
    mensaje: datos.mensaje.trim(),
    hasta,
  });
  await auditoria.registrar({
    usuarioId: usuario.id,
    accion: "aviso_zonal.publicado",
    entidad: "avisos_zona",
    entidadId: resultado.avisoId,
    detalle: { distritoId, destinatarios: resultado.destinatarios },
    ip: contexto.ip,
  });
  return resultado;
}

module.exports = { datosPanel, publicar };
