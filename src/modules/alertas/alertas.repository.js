const { db } = require("../../config/db");
const { insertarYDevolverId } = require("../../utils/baseDatos");

function rangoDiaPeru(ahora = new Date()) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(ahora);
  const fecha = Object.fromEntries(partes.map((parte) => [parte.type, parte.value]));
  const inicio = Date.UTC(
    Number(fecha.year),
    Number(fecha.month) - 1,
    Number(fecha.day),
    5,
  );
  return {
    inicio: new Date(inicio),
    fin: new Date(inicio + 86400000),
  };
}

async function existeAlertaDelDia(reglaId, parcelaId, ahora = new Date()) {
  const { inicio, fin } = rangoDiaPeru(ahora);
  const alerta = await db("alertas")
    .select("id")
    .where({ regla_id: reglaId, parcela_id: parcelaId })
    .andWhere("fecha", ">=", inicio)
    .andWhere("fecha", "<", fin)
    .first();
  return Boolean(alerta);
}

async function listarReglasActivas() {
  return db("alerta_reglas as ar")
    .join("tipos_alerta as ta", "ta.id", "ar.tipo_id")
    .join("metricas_alerta as m", "m.id", "ar.metrica_id")
    .join("operadores_alerta as o", "o.id", "ar.operador_id")
    .leftJoin("tipos_umbral as tu", "tu.id", "ar.umbral_tipo_id")
    .select(
      "ar.*",
      "ta.clave as tipo_clave",
      "ta.nombre as tipo_nombre",
      "m.clave as metrica_clave",
      "o.clave as operador_clave",
      "tu.clave as umbral_clave",
    )
    .where("ar.activa", true)
    .orderBy("ar.id");
}

async function listarParcelasConCampania() {
  const ultimaCampania = db("campanias as ca")
    .join("estados_campania as ec", "ec.id", "ca.estado_id")
    .select("ca.parcela_id")
    .max({ campania_id: "ca.id" })
    .whereNotIn("ec.clave", ["cancelada", "finalizada"])
    .groupBy("ca.parcela_id")
    .as("ultima");
  return db("parcelas as p")
    .join(ultimaCampania, "ultima.parcela_id", "p.id")
    .join("campanias as ca", "ca.id", "ultima.campania_id")
    .join("cultivos as c", "c.id", "ca.cultivo_id")
    .select(
      "p.id",
      "p.usuario_id",
      "p.zona_id",
      "p.latitud",
      "p.longitud",
      "p.nombre",
      "ca.cultivo_id",
      "c.nombre as cultivo",
    )
    .whereNull("p.deleted_at");
}

function listarParcelasGeolocalizadas() {
  return db("parcelas as p")
    .select("p.id", "p.usuario_id", "p.latitud", "p.longitud", "p.nombre")
    .whereNull("p.deleted_at")
    .whereNotNull("p.latitud")
    .whereNotNull("p.longitud");
}

function buscarRequerimiento(cultivoId, zonaId) {
  return db("cultivo_requerimientos")
    .where({ cultivo_id: cultivoId, zona_id: zonaId })
    .first();
}

function lecturasDesde(parcelaId, fechaInicio, fechaFin) {
  return db("lecturas")
    .select("id", "fecha", "humedad", "temperatura")
    .where({ parcela_id: parcelaId })
    .andWhere("fecha", ">=", fechaInicio)
    .andWhere("fecha", "<=", fechaFin)
    .orderBy("fecha", "desc")
    .orderBy("id", "desc");
}

async function crearAlerta({ regla, parcela, lecturaId, mensaje }) {
  return db.transaction(async (trx) => {
    await trx("parcelas").where({ id: parcela.id }).forUpdate().first();
    const { inicio, fin } = rangoDiaPeru();
    const activa = await trx("estados_alerta").where({ clave: "activa" }).first();
    const delDia = await trx("alertas")
      .where({ regla_id: regla.id, parcela_id: parcela.id })
      .andWhere("fecha", ">=", inicio)
      .andWhere("fecha", "<", fin)
      .forUpdate()
      .first();
    if (delDia) return null;
    const repetida = await trx("alertas")
      .where({
        regla_id: regla.id,
        parcela_id: parcela.id,
        estado_id: activa.id,
      })
      .forUpdate()
      .first();
    if (repetida) return null;

    const alertaId = await insertarYDevolverId(
      "alertas",
      {
        regla_id: regla.id,
        parcela_id: parcela.id,
        lectura_id: lecturaId || null,
        estado_id: activa.id,
        mensaje,
        fecha: trx.fn.now(),
      },
      trx,
    );
    const tipo = await trx("tipos_notificacion")
      .where({ clave: "alerta" })
      .first();
    await trx("notificaciones").insert({
      usuario_id: parcela.usuario_id,
      tipo_id: tipo.id,
      alerta_id: alertaId,
      leida: false,
      mensaje,
    });
    const usuario = await trx("usuarios as u")
      .leftJoin(
        "preferencias_notificacion as pn",
        "pn.usuario_id",
        "u.id",
      )
      .select("u.email", "u.email_verificado_en", "pn.correo_alertas")
      .where("u.id", parcela.usuario_id)
      .first();
    return {
      id: alertaId,
      email:
        usuario && usuario.correo_alertas && usuario.email_verificado_en
          ? usuario.email
          : null,
    };
  });
}

async function resolverAlerta(reglaId, parcelaId) {
  const resuelta = await db("estados_alerta").where({ clave: "resuelta" }).first();
  return db("alertas")
    .where({ regla_id: reglaId, parcela_id: parcelaId })
    .whereIn(
      "estado_id",
      db("estados_alerta").select("id").where({ clave: "activa" }),
    )
    .update({
      estado_id: resuelta.id,
      resuelta_en: db.fn.now(),
      updated_at: db.fn.now(),
    });
}

module.exports = {
  listarReglasActivas,
  listarParcelasConCampania,
  listarParcelasGeolocalizadas,
  buscarRequerimiento,
  lecturasDesde,
  existeAlertaDelDia,
  crearAlerta,
  resolverAlerta,
  rangoDiaPeru,
};
