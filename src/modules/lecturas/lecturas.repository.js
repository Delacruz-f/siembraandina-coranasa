// Repositorio de lecturas de suelo.
const { db } = require("../../config/db");
const { insertarYDevolverId } = require("../../utils/baseDatos");

function consultaBase() {
  return db("lecturas as l")
    .join("fuentes_datos as f", "f.id", "l.fuente_id")
    .leftJoin("usuarios as u", "u.id", "l.registrado_por")
    .leftJoin("perfiles as p", "p.usuario_id", "u.id")
    .select(
      "l.*",
      "f.clave as fuente",
      "f.nombre as fuente_nombre",
      "p.nombre as registrado_por_nombre",
    );
}

function listarDeParcela(parcelaId, { limite = 60 } = {}) {
  return consultaBase()
    .where("l.parcela_id", parcelaId)
    .orderBy([
      { column: "l.fecha", order: "desc" },
      { column: "l.id", order: "desc" },
    ])
    .limit(limite);
}

async function listarPaginadasDeParcela(
  parcelaId,
  { pagina = 1, limite = 20 } = {},
) {
  const conteo = await db("lecturas")
    .where({ parcela_id: parcelaId })
    .count({ total: "id" })
    .first();
  const filas = await consultaBase()
    .where("l.parcela_id", parcelaId)
    .orderBy([
      { column: "l.fecha", order: "desc" },
      { column: "l.id", order: "desc" },
    ])
    .limit(limite)
    .offset((pagina - 1) * limite);
  const total = Number(conteo.total);
  return {
    filas,
    total,
    pagina,
    paginas: Math.max(1, Math.ceil(total / limite)),
  };
}

async function listarParaGrafico(parcelaId, limite = 90) {
  const filas = await consultaBase()
    .where("l.parcela_id", parcelaId)
    .orderBy([
      { column: "l.fecha", order: "desc" },
      { column: "l.id", order: "desc" },
    ])
    .limit(limite);
  return filas.reverse();
}

function ultimaDeParcela(parcelaId) {
  return consultaBase()
    .where("l.parcela_id", parcelaId)
    .orderBy([
      { column: "l.fecha", order: "desc" },
      { column: "l.id", order: "desc" },
    ])
    .first();
}

function ultimaDeParcelaPorFuente(parcelaId, fuente) {
  return consultaBase()
    .where("l.parcela_id", parcelaId)
    .andWhere("f.clave", fuente)
    .orderBy([
      { column: "l.fecha", order: "desc" },
      { column: "l.id", order: "desc" },
    ])
    .first();
}

function listarPublicasDeComunidades(comunidadIds, desde) {
  if (!comunidadIds.length) return Promise.resolve([]);
  const consulta = db("lecturas as l")
    .join("parcelas as p", "p.id", "l.parcela_id")
    .join("comunidades as co", "co.id", "p.comunidad_id")
    .join("fuentes_datos as f", "f.id", "l.fuente_id")
    .select(
      "co.id as comunidad_id",
      "l.id",
      "l.fecha",
      "l.humedad",
      "l.temperatura",
      "f.clave as fuente",
      "l.registrado_por",
    )
    .whereIn("co.id", comunidadIds)
    .whereNull("p.deleted_at")
    .where(function fuentesPublicas() {
      this.whereIn("f.clave", ["nasa_power", "open_meteo_suelo"]).orWhere(
        function lecturaDeTecnico() {
          this.where("f.clave", "manual")
            .whereNotNull("l.registrado_por")
            .whereExists(function rolTecnico() {
              this.select(db.raw("1"))
                .from("usuario_roles as ur")
                .join("roles as r", "r.id", "ur.rol_id")
                .whereColumn("ur.usuario_id", "l.registrado_por")
                .andWhere("r.clave", "tecnico");
            });
        },
      );
    });
  if (desde) consulta.andWhere("l.fecha", ">=", desde);
  return consulta.orderBy([
    { column: "l.fecha", order: "desc" },
    { column: "l.id", order: "desc" },
  ]);
}

function estadoSincronizacion(parcelaId, fuente = "nasa_power") {
  return db("sincronizaciones_parcela as s")
    .join("fuentes_datos as f", "f.id", "s.fuente_id")
    .select(
      "s.exitosa",
      "s.consultado_en",
      "s.fecha_ultimo_dato",
      "s.error_resumido",
    )
    .where("s.parcela_id", parcelaId)
    .andWhere("f.clave", fuente)
    .first();
}

function fuentePorClave(clave) {
  return db("fuentes_datos").where({ clave }).first();
}

function listarFuentesAutomaticas() {
  return db("fuentes_datos")
    .select("id", "clave", "nombre", "prioridad")
    .where({ es_automatica: true })
    .orderBy([
      { column: "prioridad", order: "asc" },
      { column: "id", order: "asc" },
    ]);
}

async function registrarAutomaticas(
  parcelaId,
  fuenteId,
  lecturas,
  observacion = "NASA POWER: GWETROOT × 100 (índice porcentual) y TS (temperatura superficial estimada).",
) {
  if (!lecturas.length) return 0;
  return db.transaction(async (trx) => {
    const fechas = [...new Set(lecturas.map((lectura) => lectura.fecha))];
    const existentes = await trx("lecturas")
      .select("fecha")
      .where({ parcela_id: parcelaId, fuente_id: fuenteId })
      .whereIn("fecha", fechas);
    const fechasExistentes = new Set(
      existentes.map((fila) =>
        fila.fecha instanceof Date
          ? fila.fecha.toISOString().slice(0, 10)
          : String(fila.fecha).slice(0, 10),
      ),
    );
    const fechasProcesadas = new Set(fechasExistentes);
    const nuevas = lecturas.filter((lectura) => {
      if (fechasProcesadas.has(lectura.fecha)) return false;
      fechasProcesadas.add(lectura.fecha);
      return true;
    });
    if (!nuevas.length) return 0;
    await trx("lecturas")
      .insert(
        nuevas.map((lectura) => ({
          parcela_id: parcelaId,
          fuente_id: fuenteId,
          registrado_por: null,
          fecha: lectura.fecha,
          humedad: lectura.humedad,
          temperatura: lectura.temperatura,
          observacion,
        })),
      )
      .onConflict(["parcela_id", "fuente_id", "fecha"])
      .ignore();
    return nuevas.length;
  });
}

function listarFechasExistentes(parcelaId, fuenteId, fechas) {
  if (!fechas.length) return Promise.resolve([]);
  return db("lecturas")
    .select("fecha")
    .where({ parcela_id: parcelaId, fuente_id: fuenteId })
    .whereIn("fecha", fechas);
}

function guardarEstadoSincronizacion(parcelaId, fuenteId, estado) {
  const datos = {
    parcela_id: parcelaId,
    fuente_id: fuenteId,
    exitosa: estado.exitosa,
    consultado_en: estado.consultadoEn,
    fecha_ultimo_dato: estado.fechaUltimoDato || null,
    error_resumido: estado.errorResumido || null,
    updated_at: db.fn.now(),
  };
  return db("sincronizaciones_parcela")
    .insert(datos)
    .onConflict(["parcela_id", "fuente_id"])
    .merge({
      exitosa: datos.exitosa,
      consultado_en: datos.consultado_en,
      fecha_ultimo_dato: datos.fecha_ultimo_dato,
      error_resumido: datos.error_resumido,
      updated_at: datos.updated_at,
    });
}

function listarParcelasActivasParaSincronizar() {
  return db("parcelas")
    .select("id", "latitud", "longitud", "nombre")
    .where({ activa: true })
    .whereNull("deleted_at")
    .orderBy("id");
}

async function crear(datos) {
  return insertarYDevolverId("lecturas", datos);
}

function crearVarias(datos) {
  return db.transaction(async (trx) => {
    await trx("lecturas").insert(datos);
  });
}

function buscarPorId(id) {
  return consultaBase().where("l.id", id).first();
}

function eliminar(id) {
  return db("lecturas").where({ id }).del();
}

module.exports = {
  listarDeParcela,
  listarPaginadasDeParcela,
  listarParaGrafico,
  ultimaDeParcela,
  ultimaDeParcelaPorFuente,
  listarPublicasDeComunidades,
  estadoSincronizacion,
  fuentePorClave,
  listarFuentesAutomaticas,
  registrarAutomaticas,
  listarFechasExistentes,
  guardarEstadoSincronizacion,
  listarParcelasActivasParaSincronizar,
  crear,
  crearVarias,
  buscarPorId,
  eliminar,
};
