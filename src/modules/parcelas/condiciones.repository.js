const { db } = require("../../config/db");

const FUENTES_ADMITIDAS = [
  "manual",
  "open_meteo_suelo",
  "nasa_power",
  "agromonitoring",
];

async function listarUltimasLecturasPorFuente(parcelaId) {
  const fuentes = await db("fuentes_datos as f")
    .join("lecturas as l", "l.fuente_id", "f.id")
    .distinct("f.id", "f.clave", "f.nombre")
    .where("l.parcela_id", parcelaId)
    .whereIn("f.clave", FUENTES_ADMITIDAS);

  return Promise.all(
    fuentes.map(async (fuente) => {
      const orden = fuente.clave === "manual" ? "l.created_at" : "l.fecha";
      const lectura = await db("lecturas as l")
        .join("fuentes_datos as f", "f.id", "l.fuente_id")
        .select(
          "l.id",
          "l.fecha",
          "l.humedad",
          "l.temperatura",
          "l.created_at",
          "l.registrado_por",
          "f.clave as fuente",
          "f.nombre as fuente_nombre",
        )
        .where("l.parcela_id", parcelaId)
        .andWhere("l.fuente_id", fuente.id)
        .orderBy(orden, "desc")
        .orderBy("l.id", "desc")
        .first();
      return lectura;
    }),
  );
}

function listarConfiguraciones(claves) {
  return db("configuraciones")
    .select("clave", "valor")
    .whereIn("clave", claves);
}

module.exports = { listarUltimasLecturasPorFuente, listarConfiguraciones };
