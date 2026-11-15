// Repositorio de catálogos: cultivos y zonas.
const { db } = require("../../config/db");

function listarCultivos() {
  return db("cultivos")
    .where({ activo: true })
    .select("id", "nombre", "slug")
    .orderBy("nombre");
}

function listarZonas() {
  return db("zonas_altitudinales")
    .select(
      "id",
      "clave",
      "nombre",
      "orden",
      "altitud_min_m",
      "altitud_max_m",
    )
    .orderBy("orden");
}

function buscarCultivo(id) {
  return db("cultivos").where({ id }).first();
}

function buscarZona(id) {
  return db("zonas_altitudinales").where({ id }).first();
}

function buscarRequerimientoPorCultivoZona(cultivoId, zonaId) {
  return db("cultivo_requerimientos")
    .where({ cultivo_id: cultivoId, zona_id: zonaId })
    .first();
}

function listarVariedadesDeCultivo(cultivoId) {
  return db("cultivo_variedades as cv")
    .join("variedades as v", "v.id", "cv.variedad_id")
    .where("cv.cultivo_id", cultivoId)
    .andWhere("v.activa", true)
    .select("v.id", "v.nombre")
    .orderBy("v.nombre");
}

module.exports = {
  listarCultivos,
  listarZonas,
  buscarCultivo,
  buscarZona,
  buscarRequerimientoPorCultivoZona,
  listarVariedadesDeCultivo,
};

// ---------- Requerimientos y calendario (panel técnico) ----------

// MySQL devuelve los booleanos como 0/1: se normalizan a true/false.
function normalizar(fila) {
  return fila ? { ...fila, validado: Boolean(fila.validado) } : fila;
}

/** Requerimientos por cultivo y zona, con el nombre del validador. */
async function listarRequerimientos() {
  const filas = await db('cultivo_requerimientos as cr')
    .join('cultivos as c', 'c.id', 'cr.cultivo_id')
    .join('zonas_altitudinales as z', 'z.id', 'cr.zona_id')
    .leftJoin('usuarios as u', 'u.id', 'cr.validado_por')
    .leftJoin('perfiles as up', 'up.usuario_id', 'u.id')
    .select(
      'cr.*',
      'cr.hum_min as humedad_min',
      'cr.hum_max as humedad_max',
      'cr.temp_min as temperatura_min',
      'cr.temp_max as temperatura_max',
      'c.nombre as cultivo',
      'c.slug as cultivo_slug',
      'z.clave as zona',
      'z.nombre as zona_nombre',
      'up.nombre as validador'
    )
    .orderBy([{ column: 'c.nombre', order: 'asc' }, { column: 'z.orden', order: 'asc' }]);
  return filas.map(normalizar);
}

/** Calendario tradicional por cultivo y zona. */
async function listarCalendario() {
  const filas = await db('calendario_tradicional as ct')
    .join('cultivos as c', 'c.id', 'ct.cultivo_id')
    .join('zonas_altitudinales as z', 'z.id', 'ct.zona_id')
    .leftJoin('usuarios as u', 'u.id', 'ct.validado_por')
    .leftJoin('perfiles as up', 'up.usuario_id', 'u.id')
    .select(
      'ct.*',
      'c.nombre as cultivo',
      'c.slug as cultivo_slug',
      'z.clave as zona',
      'z.nombre as zona_nombre',
      'up.nombre as validador'
    )
    .orderBy([{ column: 'c.nombre', order: 'asc' }, { column: 'z.orden', order: 'asc' }]);
  return filas.map(normalizar);
}

async function buscarRequerimiento(id) {
  return normalizar(await db('cultivo_requerimientos').where({ id }).first());
}

async function buscarCalendario(id) {
  return normalizar(await db('calendario_tradicional').where({ id }).first());
}

function actualizarRequerimiento(id, datos) {
  return db('cultivo_requerimientos')
    .where({ id })
    .update({ ...datos, updated_at: db.fn.now() });
}

function actualizarCalendario(id, datos) {
  return db('calendario_tradicional')
    .where({ id })
    .update({ ...datos, updated_at: db.fn.now() });
}

module.exports.listarRequerimientos = listarRequerimientos;
module.exports.listarCalendario = listarCalendario;
module.exports.buscarRequerimiento = buscarRequerimiento;
module.exports.buscarCalendario = buscarCalendario;
module.exports.actualizarRequerimiento = actualizarRequerimiento;
module.exports.actualizarCalendario = actualizarCalendario;
