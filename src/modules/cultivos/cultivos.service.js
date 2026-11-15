// Servicio de cultivos: requerimientos y calendario tradicional.
// Un técnico puede corregir los valores y marcarlos como validados.
const repositorio = require("./cultivos.repository");
const auditoria = require("../admin/auditoria.repository");
const { noEncontrado, solicitudInvalida } = require("../../utils/errores");

function listarCultivos() {
  return repositorio.listarCultivos();
}

function listarZonas() {
  return repositorio.listarZonas();
}

/** Datos del panel técnico: requerimientos y calendario. */
async function panelTecnico() {
  const [requerimientos, calendario] = await Promise.all([
    repositorio.listarRequerimientos(),
    repositorio.listarCalendario(),
  ]);
  return { requerimientos, calendario };
}

function numero(valor, campo, { min, max }) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw solicitudInvalida(
      `${campo} debe ser un número entre ${min} y ${max}.`,
    );
  }
  return n;
}

/** Corrige un requerimiento y lo marca como validado por el técnico. */
async function actualizarRequerimiento(id, tecnicoId, datos, { ip } = {}) {
  const actual = await repositorio.buscarRequerimiento(id);
  if (!actual) throw noEncontrado("No encontramos ese requerimiento.");

  const humedadMin = numero(datos.humedad_min, "La humedad mínima", {
    min: 0,
    max: 100,
  });
  const humedadMax = numero(datos.humedad_max, "La humedad máxima", {
    min: 0,
    max: 100,
  });
  const temperaturaMin = numero(
    datos.temperatura_min,
    "La temperatura mínima",
    { min: -30, max: 60 },
  );
  const temperaturaMax = numero(
    datos.temperatura_max,
    "La temperatura máxima",
    { min: -30, max: 60 },
  );
  if (humedadMin >= humedadMax)
    throw solicitudInvalida("La humedad mínima debe ser menor que la máxima.");
  if (temperaturaMin >= temperaturaMax)
    throw solicitudInvalida(
      "La temperatura mínima debe ser menor que la máxima.",
    );

  await repositorio.actualizarRequerimiento(id, {
    hum_min: humedadMin,
    hum_max: humedadMax,
    temp_min: temperaturaMin,
    temp_max: temperaturaMax,
    fuente: datos.fuente ? datos.fuente.trim() : actual.fuente,
    validado: true,
    validado_por: tecnicoId,
    validado_en: new Date(),
  });
  await auditoria.registrar({
    usuarioId: tecnicoId,
    accion: "requerimiento.validado",
    entidad: "cultivo_requerimientos",
    entidadId: id,
    detalle: { antes: actual, despues: datos },
    ip,
  });
}

/** Corrige el calendario tradicional y lo marca como validado. */
async function actualizarCalendario(id, tecnicoId, datos, { ip } = {}) {
  const actual = await repositorio.buscarCalendario(id);
  if (!actual) throw noEncontrado("No encontramos ese calendario.");

  const mesInicio = numero(datos.mes_inicio, "El mes de inicio", {
    min: 1,
    max: 12,
  });
  const mesFin = numero(datos.mes_fin, "El mes de fin", { min: 1, max: 12 });

  await repositorio.actualizarCalendario(id, {
    mes_inicio: mesInicio,
    mes_fin: mesFin,
    fuente: datos.fuente ? datos.fuente.trim() : actual.fuente,
    validado: true,
    validado_por: tecnicoId,
    validado_en: new Date(),
  });
  await auditoria.registrar({
    usuarioId: tecnicoId,
    accion: "calendario.validado",
    entidad: "calendario_tradicional",
    entidadId: id,
    detalle: { antes: actual, despues: datos },
    ip,
  });
}

module.exports = {
  listarCultivos,
  listarZonas,
  panelTecnico,
  actualizarRequerimiento,
  actualizarCalendario,
};
