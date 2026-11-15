// Consultas de campañas y sus registros de siembra y cosecha.
const { db } = require("../../config/db");
const { insertarYDevolverId } = require("../../utils/baseDatos");

function consultaCampania() {
  return db("campanias as ca")
    .join("parcelas as p", "p.id", "ca.parcela_id")
    .join("cultivos as c", "c.id", "ca.cultivo_id")
    .join("estados_campania as ec", "ec.id", "ca.estado_id")
    .leftJoin("variedades as v", "v.id", "ca.variedad_id")
    .select(
      "ca.*",
      "p.usuario_id",
      "p.nombre as parcela",
      "p.zona_id",
      "c.nombre as cultivo",
      "c.slug as cultivo_slug",
      "ec.clave as estado_clave",
      "ec.nombre as estado",
      "v.nombre as variedad",
    )
    .whereNull("p.deleted_at");
}

function listarDeParcela(parcelaId, usuarioId) {
  return consultaCampania()
    .where("ca.parcela_id", parcelaId)
    .andWhere("p.usuario_id", usuarioId)
    .orderBy("ca.id", "desc");
}

function buscarDeUsuario(id, usuarioId) {
  return consultaCampania()
    .where("ca.id", id)
    .andWhere("p.usuario_id", usuarioId)
    .first();
}

function listarEstados() {
  return db("estados_campania").select("id", "clave", "nombre").orderBy("id");
}

function buscarEstado(id) {
  return db("estados_campania").where({ id }).first();
}

function listarUnidades() {
  return db("unidades_medida")
    .select("id", "clave", "nombre")
    .orderBy("nombre");
}

function buscarUnidad(id) {
  return db("unidades_medida").where({ id }).first();
}

function buscarVentana(cultivoId, zonaId) {
  return db("calendario_tradicional")
    .where({ cultivo_id: cultivoId, zona_id: zonaId })
    .first();
}

function crear(datos) {
  return insertarYDevolverId("campanias", datos);
}

function actualizar(id, datos) {
  return db("campanias")
    .where({ id })
    .update({ ...datos, updated_at: db.fn.now() });
}

function listarSiembras(campaniaId) {
  return db("siembras")
    .where({ campania_id: campaniaId })
    .orderBy("fecha", "desc")
    .orderBy("id", "desc");
}

function registrarSiembra(datos) {
  return insertarYDevolverId("siembras", datos);
}

function listarCosechas(campaniaId) {
  return db("cosechas as co")
    .join("unidades_medida as um", "um.id", "co.unidad_id")
    .where("co.campania_id", campaniaId)
    .select("co.*", "um.nombre as unidad", "um.clave as unidad_clave")
    .orderBy("co.fecha", "desc")
    .orderBy("co.id", "desc");
}

function listarSiembrasPublicas({ cultivo, departamento, mes } = {}) {
  const cosechas = db("cosechas")
    .select("campania_id")
    .count({ cosechas_registradas: "id" })
    .groupBy("campania_id")
    .as("resumen_cosechas");
  const centrosDistrito = db("comunidades as co")
    .select("co.distrito_id")
    .avg({ latitud_distrito: "co.latitud" })
    .avg({ longitud_distrito: "co.longitud" })
    .whereNotNull("co.latitud")
    .whereNotNull("co.longitud")
    .groupBy("co.distrito_id")
    .as("centros_distrito");

  const consulta = db("siembras as s")
    .join("campanias as ca", "ca.id", "s.campania_id")
    .join("parcelas as p", "p.id", "ca.parcela_id")
    .join("cultivos as c", "c.id", "ca.cultivo_id")
    .join("estados_campania as ec", "ec.id", "ca.estado_id")
    .join("distritos as di", "di.id", "p.distrito_id")
    .join("provincias as pr", "pr.id", "di.provincia_id")
    .join("departamentos as de", "de.id", "pr.departamento_id")
    .leftJoin(cosechas, "resumen_cosechas.campania_id", "ca.id")
    .leftJoin(centrosDistrito, "centros_distrito.distrito_id", "di.id")
    .select(
      "di.id as distrito_id",
      "di.nombre as distrito",
      "pr.nombre as provincia",
      "de.id as departamento_id",
      "de.nombre as departamento",
      "c.id as cultivo_id",
      "c.nombre as cultivo",
      "c.slug as cultivo_slug",
      "s.fecha",
      "resumen_cosechas.cosechas_registradas",
      "centros_distrito.latitud_distrito",
      "centros_distrito.longitud_distrito",
    )
    .whereNull("p.deleted_at")
    .whereNot("ec.clave", "cancelada");

  if (cultivo) consulta.andWhere("c.slug", cultivo);
  if (departamento) consulta.andWhere("de.id", Number(departamento));
  if (mes) {
    consulta.andWhereRaw("EXTRACT(MONTH FROM ??) = ?", [
      "s.fecha",
      Number(mes),
    ]);
  }
  return consulta.orderBy(["di.id", "c.id", "s.fecha"]);
}

function registrarCosecha(datos) {
  return insertarYDevolverId("cosechas", datos);
}

module.exports = {
  listarDeParcela,
  buscarDeUsuario,
  listarEstados,
  buscarEstado,
  listarUnidades,
  buscarUnidad,
  buscarVentana,
  crear,
  actualizar,
  listarSiembras,
  registrarSiembra,
  listarCosechas,
  listarSiembrasPublicas,
  registrarCosecha,
};
