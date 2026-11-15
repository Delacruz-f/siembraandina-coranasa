// Repositorio de parcelas y accesos de técnicos.
const { db } = require("../../config/db");
const { insertarYDevolverId } = require("../../utils/baseDatos");
const { ErrorHttp } = require("../../utils/errores");

// MySQL devuelve los booleanos como 0/1: se normalizan a true/false.
function normalizarParcela(parcela) {
  if (!parcela) return parcela;
  const normalizada = { ...parcela, activa: Boolean(parcela.activa) };
  if ("puede_escribir" in parcela) normalizada.puede_escribir = Boolean(parcela.puede_escribir);
  return normalizada;
}

const COLUMNAS = [
  "p.id",
  "p.usuario_id",
  "ca.id as campania_id",
  "ca.cultivo_id as cultivo_id",
  "ca.variedad_id",
  "ca.fecha_inicio as fecha_inicio_campania",
  "ca.fecha_fin as fecha_fin_campania",
  "ca.estado_id as estado_campania_id",
  "p.zona_id",
  "p.distrito_id",
  "p.nombre",
  "p.latitud",
  "p.longitud",
  "p.altitud_m",
  "p.area_hectareas",
  "p.notas",
  "p.activa",
  "p.created_at as creado_en",
];

function consultaBase() {
  return db("parcelas as p")
    .join("campanias as ca", function unirUltimaCampania() {
      this.on("ca.parcela_id", "=", "p.id").andOn(
        "ca.id",
        "=",
        db.raw(
          "(select max(c2.id) from campanias c2 where c2.parcela_id = p.id)",
        ),
      );
    })
    .join("zonas_altitudinales as z", "z.id", "p.zona_id")
    .join("cultivos as c", "c.id", "ca.cultivo_id")
    .leftJoin("distritos as di", "di.id", "p.distrito_id")
    .leftJoin("provincias as pr", "pr.id", "di.provincia_id")
    .leftJoin("departamentos as de", "de.id", "pr.departamento_id")
    .leftJoin("estados_campania as ec", "ec.id", "ca.estado_id")
    .whereNull("p.deleted_at")
    .select(
      ...COLUMNAS,
      "c.nombre as cultivo",
      "c.slug as cultivo_slug",
      "z.clave as zona",
      "z.nombre as zona_nombre",
      "z.altitud_min_m as zona_altitud_min_m",
      "z.altitud_max_m as zona_altitud_max_m",
      "di.nombre as distrito",
      "pr.nombre as provincia",
      "de.nombre as departamento",
      "ec.nombre as estado_campania",
    );
}

async function listarDeUsuario(usuarioId) {
  const filas = await consultaBase()
    .where("p.usuario_id", usuarioId)
    .orderBy("p.id", "desc");
  return filas.map(normalizarParcela);
}

async function buscarDeUsuario(id, usuarioId) {
  const parcela = await consultaBase()
    .where("p.id", id)
    .andWhere("p.usuario_id", usuarioId)
    .first();
  return normalizarParcela(parcela);
}

async function buscarPorId(id) {
  const parcela = await consultaBase().where("p.id", id).first();
  return normalizarParcela(parcela);
}

async function crear(datos) {
  const { cultivo_id: cultivoId, ...datosParcela } = datos;
  return db.transaction(async (trx) => {
    const estado = await trx("estados_campania")
      .where({ clave: "activa" })
      .first();
    if (!estado)
      throw new ErrorHttp(500, 'Falta el estado de campaña "activa".');
    const id = await insertarYDevolverId(
      "parcelas",
      { ...datosParcela, comunidad_id: null },
      trx,
    );
    await trx("campanias").insert({
      parcela_id: id,
      cultivo_id: cultivoId,
      estado_id: estado.id,
    });
    return id;
  });
}

async function actualizar(id, datos) {
  const datosParcela = { ...datos };
  delete datosParcela.cultivo_id;
  await db("parcelas")
    .where({ id })
    .update({
      ...datosParcela,
      comunidad_id: null,
      updated_at: db.fn.now(),
    });
}

function eliminar(id) {
  return db("parcelas")
    .where({ id })
    .update({ deleted_at: db.fn.now(), updated_at: db.fn.now() });
}

function listarImagenesDeUsuario(parcelaId, usuarioId) {
  return db("parcela_archivos as pa")
    .join("parcelas as p", "p.id", "pa.parcela_id")
    .join("archivos as a", "a.id", "pa.archivo_id")
    .leftJoin("imagen_variantes as v", "v.archivo_id", "a.id")
    .where("pa.parcela_id", parcelaId)
    .andWhere("p.usuario_id", usuarioId)
    .whereNull("p.deleted_at")
    .andWhere("a.mime", "like", "image/%")
    .whereNull("a.eliminado_en")
    .select(
      "a.id",
      "a.texto_alternativo",
      "a.ancho",
      "a.alto",
      "a.created_at",
      "v.ancho as variante_ancho",
      "v.ancho_px",
      "v.alto_px",
      "v.ruta_webp",
      "v.ruta_jpg",
    )
    .orderBy("pa.id", "desc")
    .orderBy("v.ancho");
}

function asociarImagenes(parcelaId, archivoIds) {
  return db.transaction(async (trx) => {
    await trx("parcela_archivos").insert(
      archivoIds.map((archivoId) => ({
        parcela_id: parcelaId,
        archivo_id: archivoId,
      })),
    );
  });
}

function buscarImagenDeUsuario(parcelaId, archivoId, usuarioId) {
  return db("parcela_archivos as pa")
    .join("parcelas as p", "p.id", "pa.parcela_id")
    .join("archivos as a", "a.id", "pa.archivo_id")
    .where("pa.parcela_id", parcelaId)
    .andWhere("pa.archivo_id", archivoId)
    .andWhere("p.usuario_id", usuarioId)
    .whereNull("p.deleted_at")
    .select("a.id", "a.autor_id", "a.mime")
    .first();
}

function quitarImagen(parcelaId, archivoId) {
  return db("parcela_archivos")
    .where({ parcela_id: parcelaId, archivo_id: archivoId })
    .del();
}

/** Parcelas a las que un técnico tiene acceso vigente. */
async function listarAsignadasATecnico(tecnicoId) {
  const filas = await consultaBase()
    .join("accesos_parcela as ap", "ap.parcela_id", "p.id")
    .join("usuarios as dueno", "dueno.id", "p.usuario_id")
    .join("perfiles as dp", "dp.usuario_id", "dueno.id")
    .where("ap.tecnico_id", tecnicoId)
    .whereNull("ap.revocado_en")
    .select("ap.puede_escribir", "dp.nombre as dueno_nombre")
    .orderBy("p.id", "desc");
  return filas.map(normalizarParcela);
}

function listarHistorialAccesosTecnico(tecnicoId) {
  return db("accesos_parcela as ap")
    .join("parcelas as p", "p.id", "ap.parcela_id")
    .join("usuarios as u", "u.id", "p.usuario_id")
    .join("perfiles as pe", "pe.usuario_id", "u.id")
    .leftJoin("distritos as d", "d.id", "p.distrito_id")
    .select(
      "p.id as parcela_id",
      "p.nombre as parcela",
      "d.nombre as distrito",
      "pe.nombre as agricultor",
      "ap.puede_escribir",
      "ap.created_at as concedido_en",
      "ap.revocado_en",
    )
    .where("ap.tecnico_id", tecnicoId)
    .whereNull("p.deleted_at")
    .orderBy("ap.created_at", "desc")
    .limit(200);
}

/** Acceso vigente de un técnico a una parcela (o undefined). */
async function accesoVigente(parcelaId, tecnicoId) {
  const acceso = await db("accesos_parcela")
    .where({ parcela_id: parcelaId, tecnico_id: tecnicoId })
    .whereNull("revocado_en")
    .first();
  return normalizarParcela(acceso);
}

/** Accesos (vigentes y revocados) de una parcela, con datos del técnico. */
async function listarAccesos(parcelaId) {
  const filas = await db("accesos_parcela as ap")
    .join("usuarios as t", "t.id", "ap.tecnico_id")
    .join("perfiles as tp", "tp.usuario_id", "t.id")
    .where("ap.parcela_id", parcelaId)
    .select("ap.*", "tp.nombre as tecnico_nombre", "t.email as tecnico_email")
    .orderBy("ap.id", "desc");
  return filas.map(normalizarParcela);
}

async function crearAcceso(datos) {
  return insertarYDevolverId("accesos_parcela", datos);
}

function revocarAcceso(id) {
  return db("accesos_parcela")
    .where({ id })
    .update({ revocado_en: db.fn.now(), updated_at: db.fn.now() });
}

function buscarAcceso(id) {
  return db("accesos_parcela").where({ id }).first();
}

module.exports = {
  listarDeUsuario,
  buscarDeUsuario,
  buscarPorId,
  crear,
  actualizar,
  eliminar,
  listarImagenesDeUsuario,
  asociarImagenes,
  buscarImagenDeUsuario,
  quitarImagen,
  listarAsignadasATecnico,
  listarHistorialAccesosTecnico,
  accesoVigente,
  listarAccesos,
  crearAcceso,
  revocarAcceso,
  buscarAcceso,
};
