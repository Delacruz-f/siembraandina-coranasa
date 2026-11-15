const { db } = require("../../config/db");
const { insertarYDevolverId } = require("../../utils/baseDatos");

async function listar({ busqueda, pagina, limite }) {
  const consulta = db("publicaciones as p")
    .join("categorias as c", "c.id", "p.categoria_id")
    .join("estados_publicacion as ep", "ep.id", "p.estado_id")
    .whereNull("p.deleted_at");
  if (busqueda) {
    consulta.andWhere((q) =>
      q
        .where("p.titulo", "like", `%${busqueda}%`)
        .orWhere("p.slug", "like", `%${busqueda}%`),
    );
  }
  const cuenta = await consulta.clone().count({ total: "p.id" }).first();
  const articulos = await consulta
    .clone()
    .select(
      "p.id",
      "p.titulo",
      "p.slug",
      "p.publicada_en",
      "p.updated_at",
      "c.nombre as categoria",
      "ep.clave as estado",
    )
    .orderBy("p.updated_at", "desc")
    .limit(limite)
    .offset((pagina - 1) * limite);
  return { articulos, total: Number(cuenta ? cuenta.total : 0) };
}

function listarCategorias() {
  return db("categorias").select("id", "nombre").orderBy("nombre");
}

function listarEtiquetas() {
  return db("etiquetas").select("id", "nombre", "slug").orderBy("nombre");
}

function listarBiblioteca(autorId) {
  return db("archivos as a")
    .leftJoin("publicacion_archivos as pa", "pa.archivo_id", "a.id")
    .select(
      "a.id",
      "a.nombre_original",
      "a.texto_alternativo",
      "a.mime",
      "a.ancho",
      "a.alto",
      "a.autor_imagen",
      "a.autor_url",
      "a.licencia",
      "a.licencia_url",
      "pa.publicacion_id",
    )
    .where("a.autor_id", autorId)
    .andWhere("a.mime", "like", "image/%")
    .whereNull("a.eliminado_en")
    .orderBy("a.created_at", "desc")
    .limit(100);
}

async function buscarParaEdicion(id) {
  const articulo = await db("publicaciones as p")
    .select(
      "p.id",
      "p.titulo",
      "p.slug",
      "p.contenido",
      "p.categoria_id",
      "p.estado_id",
      "p.publicada_en",
      "ep.clave as estado",
    )
    .join("estados_publicacion as ep", "ep.id", "p.estado_id")
    .where("p.id", id)
    .whereNull("p.deleted_at")
    .first();
  if (!articulo) return null;
  const [etiquetas, archivos] = await Promise.all([
    db("publicacion_etiquetas as pe")
      .join("etiquetas as e", "e.id", "pe.etiqueta_id")
      .where("pe.publicacion_id", id)
      .select("e.id", "e.nombre", "e.slug")
      .orderBy("e.nombre"),
    db("publicacion_archivos as pa")
      .join("archivos as a", "a.id", "pa.archivo_id")
      .where("pa.publicacion_id", id)
      .select("a.id", "a.texto_alternativo", "a.mime")
      .orderBy("pa.id"),
  ]);
  return { ...articulo, etiquetas, archivos };
}

async function guardar({ id, datos, etiquetas, archivoIds }) {
  return db.transaction(async (trx) => {
    let articuloId = id;
    if (id) {
      const cambios = { ...datos };
      delete cambios.usuario_id;
      await trx("publicaciones").where({ id }).update({
        ...cambios,
        updated_at: trx.fn.now(),
      });
    } else {
      articuloId = await insertarYDevolverId("publicaciones", datos, trx);
    }

    await trx("publicacion_etiquetas").where({ publicacion_id: articuloId }).del();
    if (etiquetas.length) {
      await trx("publicacion_etiquetas").insert(
        etiquetas.map((etiquetaId) => ({
          publicacion_id: articuloId,
          etiqueta_id: etiquetaId,
        })),
      );
    }
    await trx("publicacion_archivos").where({ publicacion_id: articuloId }).del();
    if (archivoIds.length) {
      const propios = await trx("archivos")
        .whereIn("id", archivoIds)
        .andWhere({ autor_id: datos.usuario_id })
        .andWhere("mime", "like", "image/%")
        .select("id");
      if (propios.length !== archivoIds.length) {
        const error = new Error("Una imagen seleccionada no pertenece a tu biblioteca.");
        error.code = "ARCHIVO_NO_PROPIO";
        throw error;
      }
      await trx("publicacion_archivos").insert(
        archivoIds.map((archivoId) => ({
          publicacion_id: articuloId,
          archivo_id: archivoId,
        })),
      );
    }
    return articuloId;
  });
}

async function asegurarEtiquetas(nombres) {
  const ids = [];
  for (const nombre of nombres) {
    let etiqueta = await db("etiquetas")
      .where({ nombre })
      .orWhere({ slug: slugificar(nombre) })
      .first();
    if (!etiqueta) {
      const slug = await slugUnico(db, "etiquetas", slugificar(nombre));
      const id = await insertarYDevolverId("etiquetas", { nombre, slug });
      etiqueta = { id };
    }
    ids.push(Number(etiqueta.id));
  }
  return [...new Set(ids)];
}

function slugificar(texto) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70);
}

async function slugUnico(conexion, tabla, base) {
  let slug = base || "articulo";
  let sufijo = 2;
  while (await conexion(tabla).where({ slug }).first()) {
    slug = `${base || "articulo"}-${sufijo}`;
    sufijo += 1;
  }
  return slug;
}

async function slugArticulo(titulo, id) {
  const base = slugificar(titulo).slice(0, 180) || "articulo";
  let slug = base;
  let sufijo = 2;
  while (
    await db("publicaciones")
      .where({ slug })
      .modify((q) => {
        if (id) q.whereNot("id", id);
      })
      .first()
  ) {
    slug = `${base}-${sufijo}`;
    sufijo += 1;
  }
  return slug;
}

function estados() {
  return db("estados_publicacion").select("id", "clave", "nombre").orderBy("id");
}

async function estadoId(clave, trx = db) {
  const fila = await trx("estados_publicacion").where({ clave }).first();
  if (!fila) throw new Error(`Falta el estado de publicación "${clave}".`);
  return fila.id;
}

async function eliminar(id) {
  const cuenta = await db("publicaciones")
    .where({ id })
    .whereNull("deleted_at")
    .update({ deleted_at: db.fn.now(), updated_at: db.fn.now() });
  return Boolean(cuenta);
}

async function publicarProgramados() {
  return db.transaction(async (trx) => {
    const [programada, publicada] = await Promise.all([
      trx("estados_publicacion").where({ clave: "programada" }).first(),
      trx("estados_publicacion").where({ clave: "publicada" }).first(),
    ]);
    if (!programada || !publicada) return [];
    const vencidos = await trx("publicaciones")
      .select("id", "usuario_id", "titulo")
      .where({ estado_id: programada.id })
      .whereNull("deleted_at")
      .where("publicada_en", "<=", trx.fn.now())
      .forUpdate();
    for (const articulo of vencidos) {
      await trx("publicaciones").where({ id: articulo.id }).update({
        estado_id: publicada.id,
        updated_at: trx.fn.now(),
      });
    }
    return vencidos;
  });
}

module.exports = {
  listar,
  listarCategorias,
  listarEtiquetas,
  listarBiblioteca,
  buscarParaEdicion,
  guardar,
  asegurarEtiquetas,
  slugArticulo,
  estados,
  estadoId,
  eliminar,
  publicarProgramados,
};
