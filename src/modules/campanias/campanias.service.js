// Reglas de negocio de campañas; las consultas se delegan al repositorio.
const repositorio = require("./campanias.repository");
const parcelasServicio = require("../parcelas/parcelas.service");
const cultivosRepositorio = require("../cultivos/cultivos.repository");
const auditoria = require("../admin/auditoria.repository");
const { noEncontrado, solicitudInvalida } = require("../../utils/errores");

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function fechaValida(fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || "")) return false;
  const fechaParseada = new Date(`${fecha}T00:00:00Z`);
  return (
    !Number.isNaN(fechaParseada.getTime()) &&
    fechaParseada.toISOString().slice(0, 10) === fecha
  );
}

async function catalogos(cultivoId) {
  const [estados, variedades] = await Promise.all([
    repositorio.listarEstados(),
    cultivosRepositorio.listarVariedadesDeCultivo(cultivoId),
  ]);
  return { estados, variedades };
}

function listarDeParcela(parcelaId, usuarioId) {
  return repositorio.listarDeParcela(parcelaId, usuarioId);
}

function variedades(cultivoId) {
  return cultivosRepositorio.listarVariedadesDeCultivo(cultivoId);
}

async function obtenerDelUsuario(id, usuarioId) {
  const campania = await repositorio.buscarDeUsuario(id, usuarioId);
  if (!campania) throw noEncontrado("No encontramos esa campaña.");
  return campania;
}

async function validarDatos(datos) {
  const cultivo = await cultivosRepositorio.buscarCultivo(
    Number(datos.cultivo_id),
  );
  if (!cultivo) throw solicitudInvalida("Elige un cultivo válido.");
  const estado = await repositorio.buscarEstado(Number(datos.estado_id));
  if (!estado) throw solicitudInvalida("Elige un estado válido.");

  const variedadId = datos.variedad_id ? Number(datos.variedad_id) : null;
  if (variedadId) {
    const variedades = await cultivosRepositorio.listarVariedadesDeCultivo(
      cultivo.id,
    );
    if (!variedades.some((variedad) => variedad.id === variedadId)) {
      throw solicitudInvalida(
        "Elige una variedad registrada para el cultivo seleccionado.",
      );
    }
  }

  const inicio = datos.fecha_inicio || null;
  const fin = datos.fecha_fin || null;
  if ((inicio && !fechaValida(inicio)) || (fin && !fechaValida(fin))) {
    throw solicitudInvalida("Escribe fechas válidas para la campaña.");
  }
  if (inicio && fin && inicio > fin) {
    throw solicitudInvalida(
      "La fecha final debe ser igual o posterior a la fecha inicial.",
    );
  }
  return {
    cultivo_id: cultivo.id,
    variedad_id: variedadId,
    estado_id: estado.id,
    fecha_inicio: inicio,
    fecha_fin: fin,
  };
}

async function crear(parcelaId, usuarioId, datos, { ip } = {}) {
  await parcelasServicio.obtenerDelUsuario(parcelaId, usuarioId);
  const limpios = await validarDatos(datos);
  const id = await repositorio.crear({
    parcela_id: Number(parcelaId),
    ...limpios,
  });
  await auditoria.registrar({
    usuarioId,
    accion: "campania.creada",
    entidad: "campanias",
    entidadId: id,
    detalle: { parcela_id: Number(parcelaId), cultivo_id: limpios.cultivo_id },
    ip,
  });
  return id;
}

async function actualizar(id, usuarioId, datos, { ip } = {}) {
  const campania = await obtenerDelUsuario(id, usuarioId);
  const limpios = await validarDatos(datos);
  await repositorio.actualizar(id, limpios);
  await auditoria.registrar({
    usuarioId,
    accion: "campania.actualizada",
    entidad: "campanias",
    entidadId: id,
    ip,
  });
  return campania.parcela_id;
}

async function registrarSiembra(id, usuarioId, datos, { ip } = {}) {
  const campania = await obtenerDelUsuario(id, usuarioId);
  if (!fechaValida(datos.fecha))
    throw solicitudInvalida("Escribe una fecha de siembra válida.");
  if (new Date(`${datos.fecha}T00:00:00Z`).getTime() > Date.now()) {
    throw solicitudInvalida("La fecha de siembra no puede estar en el futuro.");
  }
  const metodo = (datos.metodo || "").trim();
  const observaciones = (datos.observaciones || "").trim();
  if (metodo.length > 100 || observaciones.length > 2000) {
    throw solicitudInvalida(
      "El método admite 100 caracteres y las observaciones 2 000.",
    );
  }
  const siembraId = await repositorio.registrarSiembra({
    campania_id: campania.id,
    fecha: datos.fecha,
    metodo: metodo || null,
    observaciones: observaciones || null,
  });
  await auditoria.registrar({
    usuarioId,
    accion: "siembra.registrada",
    entidad: "siembras",
    entidadId: siembraId,
    detalle: { campania_id: campania.id },
    ip,
  });
}

async function registrarCosecha(id, usuarioId, datos, { ip } = {}) {
  const campania = await obtenerDelUsuario(id, usuarioId);
  if (!fechaValida(datos.fecha))
    throw solicitudInvalida("Escribe una fecha de cosecha válida.");
  if (new Date(`${datos.fecha}T00:00:00Z`).getTime() > Date.now()) {
    throw solicitudInvalida("La fecha de cosecha no puede estar en el futuro.");
  }
  const cantidad = Number(datos.cantidad);
  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    throw solicitudInvalida("La cantidad cosechada debe ser mayor que cero.");
  }
  const unidad = await repositorio.buscarUnidad(Number(datos.unidad_id));
  if (!unidad) throw solicitudInvalida("Elige una unidad válida.");
  const observaciones = (datos.observaciones || "").trim();
  if (observaciones.length > 2000) {
    throw solicitudInvalida("Las observaciones admiten hasta 2 000 caracteres.");
  }
  const cosechaId = await repositorio.registrarCosecha({
    campania_id: campania.id,
    unidad_id: unidad.id,
    fecha: datos.fecha,
    cantidad,
    observaciones: observaciones || null,
  });
  await auditoria.registrar({
    usuarioId,
    accion: "cosecha.registrada",
    entidad: "cosechas",
    entidadId: cosechaId,
    detalle: { campania_id: campania.id },
    ip,
  });
}

function dentroDeVentana(mes, inicio, fin) {
  return inicio <= fin ? mes >= inicio && mes <= fin : mes >= inicio || mes <= fin;
}

function compararSiembra(siembra, ventana) {
  if (!ventana) {
    return {
      texto: "No hay una ventana tradicional registrada para esta zona.",
      fechaReferencia: null,
      diferenciaDias: null,
      dentroDeVentana: false,
    };
  }
  const fecha = new Date(`${siembra.fecha}T00:00:00Z`);
  const mes = fecha.getUTCMonth() + 1;
  const dentro = dentroDeVentana(mes, ventana.mes_inicio, ventana.mes_fin);
  const anioInicio =
    ventana.mes_inicio > ventana.mes_fin && mes <= ventana.mes_fin
      ? fecha.getUTCFullYear() - 1
      : fecha.getUTCFullYear();
  const candidatos = [anioInicio - 1, anioInicio, anioInicio + 1].map(
    (anio) => new Date(Date.UTC(anio, ventana.mes_inicio - 1, 1)),
  );
  const referencia = candidatos.reduce((mejor, candidato) =>
    Math.abs(candidato - fecha) < Math.abs(mejor - fecha) ? candidato : mejor,
  );
  const diferenciaDias = Math.round((fecha - referencia) / 86400000);
  const etiquetaVentana = `${MESES[ventana.mes_inicio - 1]} a ${MESES[ventana.mes_fin - 1]}`;
  if (dentro) {
    return {
      texto: `Siembra registrada dentro de la ventana tradicional (${etiquetaVentana}).`,
      fechaReferencia: referencia,
      diferenciaDias,
      dentroDeVentana: true,
    };
  }
  return {
    texto: `${Math.abs(diferenciaDias)} días ${diferenciaDias < 0 ? "antes" : "después"} del inicio de la ventana tradicional (${etiquetaVentana}).`,
    fechaReferencia: referencia,
    diferenciaDias,
    dentroDeVentana: false,
  };
}

async function detalle(id, usuarioId) {
  const campania = await obtenerDelUsuario(id, usuarioId);
  const [siembras, cosechas, ventana, unidades] = await Promise.all([
    repositorio.listarSiembras(campania.id),
    repositorio.listarCosechas(campania.id),
    repositorio.buscarVentana(campania.cultivo_id, campania.zona_id),
    repositorio.listarUnidades(),
  ]);
  return {
    campania,
    siembras: siembras.map((siembra) => ({
      ...siembra,
      comparacion: compararSiembra(siembra, ventana),
    })),
    cosechas,
    unidades,
    ventana,
    hoy: new Date().toISOString().slice(0, 10),
  };
}

module.exports = {
  catalogos,
  variedades,
  listarDeParcela,
  obtenerDelUsuario,
  crear,
  actualizar,
  registrarSiembra,
  registrarCosecha,
  detalle,
};
