// Servicio de lecturas: registra humedad y temperatura del suelo.
// - El agricultor registra en sus propias parcelas.
// - El técnico solo puede registrar si el agricultor le dio acceso con escritura.
// - Las lecturas automáticas (NASA, Open-Meteo, sensor) no tienen registrado_por.
const repositorio = require("./lecturas.repository");
const parcelasRepositorio = require("../parcelas/parcelas.repository");
const auditoria = require("../admin/auditoria.repository");
const { analizarCsv } = require("./csv");
const { noEncontrado, solicitudInvalida } = require("../../utils/errores");

function listar(parcelaId, opciones) {
  return repositorio.listarDeParcela(parcelaId, opciones);
}

function ultima(parcelaId) {
  return repositorio.ultimaDeParcela(parcelaId);
}

function ultimaDeFuente(parcelaId, fuente) {
  return repositorio.ultimaDeParcelaPorFuente(parcelaId, fuente);
}

function estadoSincronizacion(parcelaId, fuente) {
  return repositorio.estadoSincronizacion(parcelaId, fuente);
}

function listarPaginadas(parcelaId, pagina) {
  return repositorio.listarPaginadasDeParcela(parcelaId, {
    pagina,
    limite: 20,
  });
}

function listarParaGrafico(parcelaId) {
  return repositorio.listarParaGrafico(parcelaId);
}

function listarPublicasDeComunidades(comunidadIds, opciones) {
  return repositorio.listarPublicasDeComunidades(comunidadIds, opciones);
}

/** Valida los valores de una lectura manual. */
function validarValores({ fecha, humedad, temperatura, observacion }) {
  const dia = new Date(`${fecha}T00:00:00Z`);
  if (
    !fecha ||
    !/^\d{4}-\d{2}-\d{2}$/.test(fecha) ||
    Number.isNaN(dia.getTime()) ||
    dia.toISOString().slice(0, 10) !== fecha
  )
    throw solicitudInvalida("Escribe una fecha válida.");
  if (dia.getTime() > Date.now())
    throw solicitudInvalida("La fecha no puede estar en el futuro.");

  const h = Number(humedad);
  const t = Number(temperatura);
  if (!Number.isFinite(h) || h < 0 || h > 100)
    throw solicitudInvalida("La humedad debe estar entre 0 y 100 %.");
  if (!Number.isFinite(t) || t < -30 || t > 60)
    throw solicitudInvalida("La temperatura debe estar entre -30 y 60 °C.");

  return {
    fecha,
    humedad: h,
    temperatura: t,
    observacion: observacion ? observacion.trim() : null,
  };
}

async function importarManual(usuario, parcelaId, filas, { ip } = {}) {
  const parcela = await parcelasRepositorio.buscarDeUsuario(
    parcelaId,
    usuario.id,
  );
  if (!parcela) throw noEncontrado("No encontramos esa parcela.");
  if (!filas.length) {
    throw solicitudInvalida("No hay lecturas válidas para importar.");
  }
  const fuente = await repositorio.fuentePorClave("manual");
  if (!fuente)
    throw new Error('Falta la fuente "manual". Ejecuta npm run seed.');
  const fechas = filas.map((fila) => fila.fecha);
  if (new Set(fechas).size !== fechas.length) {
    throw solicitudInvalida(
      "El archivo contiene más de una lectura manual para la misma fecha.",
    );
  }
  const existentes = await repositorio.listarFechasExistentes(
    parcelaId,
    fuente.id,
    fechas,
  );
  if (existentes.length) {
    throw solicitudInvalida(
      "Ya existe una lectura manual para alguna fecha del archivo. Quita esas filas y vuelve a importarlo.",
    );
  }
  const normalizadas = filas.map((fila) => ({
    parcela_id: Number(parcelaId),
    fuente_id: fuente.id,
    registrado_por: usuario.id,
    ...validarValores(fila),
  }));
  await repositorio.crearVarias(normalizadas);
  await auditoria.registrar({
    usuarioId: usuario.id,
    accion: "lecturas.importadas",
    entidad: "parcelas",
    entidadId: Number(parcelaId),
    detalle: { cantidad: normalizadas.length },
    ip,
  });
  return normalizadas.length;
}

/**
 * Registra una lectura manual.
 * @param {object} usuario Usuario de la sesión ({ id, permisos }).
 * @param {number} parcelaId Parcela destino.
 * @param {object} datos { fecha, humedad, temperatura, observacion }.
 */
async function registrarManual(usuario, parcelaId, datos, { ip } = {}) {
  const parcela = await parcelasRepositorio.buscarPorId(parcelaId);
  if (!parcela) throw noEncontrado("No encontramos esa parcela.");

  const esDueno = parcela.usuario_id === usuario.id;
  if (!esDueno) {
    // Solo un técnico con acceso de escritura puede registrar en parcelas ajenas.
    const esTecnico =
      Array.isArray(usuario.roles) && usuario.roles.includes("tecnico");
    const tienePermiso =
      Array.isArray(usuario.permisos) &&
      usuario.permisos.includes("lecturas.escribir_asignadas");
    if (!esTecnico || !tienePermiso) {
      throw noEncontrado("No encontramos esa parcela o no tienes acceso.");
    }
    const acceso = await parcelasRepositorio.accesoVigente(
      parcelaId,
      usuario.id,
    );
    if (!acceso || !acceso.puede_escribir) {
      throw noEncontrado("No encontramos esa parcela o no tienes acceso.");
    }
  }

  const limpios = validarValores(datos);
  const fuente = await repositorio.fuentePorClave("manual");
  if (!fuente)
    throw new Error('Falta la fuente "manual". Ejecuta npm run seed.');
  if (
    (
      await repositorio.listarFechasExistentes(parcelaId, fuente.id, [
        limpios.fecha,
      ])
    ).length
  ) {
    throw solicitudInvalida("Ya existe una lectura manual para esa fecha.");
  }

  const id = await repositorio.crear({
    parcela_id: parcelaId,
    fuente_id: fuente.id,
    registrado_por: usuario.id,
    ...limpios,
  });
  await auditoria.registrar({
    usuarioId: usuario.id,
    accion: "lectura.registrada",
    entidad: "lecturas",
    entidadId: id,
    detalle: {
      parcela_id: parcelaId,
      fecha: limpios.fecha,
      como_tecnico: !esDueno,
    },
    ip,
  });
  return id;
}

/** Elimina una lectura (solo el dueño de la parcela). */
async function eliminar(lecturaId, usuarioId, { ip } = {}) {
  const lectura = await repositorio.buscarPorId(lecturaId);
  if (!lectura) throw noEncontrado("No encontramos esa lectura.");
  const parcela = await parcelasRepositorio.buscarPorId(lectura.parcela_id);
  if (!parcela || parcela.usuario_id !== usuarioId)
    throw noEncontrado("No encontramos esa lectura o no tienes acceso.");
  await repositorio.eliminar(lecturaId);
  await auditoria.registrar({
    usuarioId,
    accion: "lectura.eliminada",
    entidad: "lecturas",
    entidadId: lecturaId,
    ip,
  });
}

module.exports = {
  listar,
  listarPaginadas,
  listarParaGrafico,
  listarPublicasDeComunidades,
  analizarCsv,
  ultima,
  ultimaDeFuente,
  estadoSincronizacion,
  registrarManual,
  importarManual,
  eliminar,
};
