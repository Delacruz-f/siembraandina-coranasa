// Variedades y artículos introductorios. Las recomendaciones locales siguen
// dependiendo del calendario validado por la comunidad y de datos recientes.
const VARIEDADES = [
  { cultivo: "papa", nombre: "Yungay", slug: "yungay" },
  { cultivo: "papa", nombre: "Peruanita", slug: "peruanita" },
  { cultivo: "papa", nombre: "Perricholi", slug: "perricholi" },
  { cultivo: "maiz", nombre: "Blanco Urubamba", slug: "blanco-urubamba" },
  { cultivo: "maiz", nombre: "Chullpi", slug: "chullpi" },
  { cultivo: "maiz", nombre: "Morado", slug: "maiz-morado" },
  { cultivo: "quinua", nombre: "Blanca de Junín", slug: "blanca-de-junin" },
  { cultivo: "quinua", nombre: "Kancolla", slug: "kancolla" },
  { cultivo: "quinua", nombre: "Pasankalla", slug: "pasankalla" },
];

const ETIQUETAS = [
  { nombre: "Calendario", slug: "calendario" },
  { nombre: "Suelo", slug: "suelo" },
  { nombre: "Papa", slug: "papa" },
  { nombre: "Maíz", slug: "maiz" },
  { nombre: "Quinua", slug: "quinua" },
];

const ARTICULOS = [
  {
    titulo: "Leer el calendario junto con la comunidad",
    slug: "leer-el-calendario-con-la-comunidad",
    categoria: "agricultura",
    etiquetas: ["calendario"],
    contenido:
      "El calendario tradicional recoge observaciones y acuerdos de cada comunidad. Sus ventanas pueden variar entre valles y zonas de altura.\n\nUsa estas fechas como referencia inicial y conversa con agricultoras, agricultores o personal técnico de tu zona antes de decidir.",
  },
  {
    titulo: "Qué anotar al observar la humedad del suelo",
    slug: "observar-la-humedad-del-suelo",
    categoria: "clima-y-suelo",
    etiquetas: ["suelo", "calendario"],
    contenido:
      "Registra la fecha, el lugar, la profundidad y el método de medición. Anotar quién tomó el dato ayuda a comparar observaciones posteriores.\n\nUna lectura aislada no describe toda la parcela. Contrástala con el drenaje, las lluvias recientes y el conocimiento local.",
  },
  {
    titulo: "Papa: planificar sin perder de vista la zona",
    slug: "papa-planificar-segun-la-zona",
    categoria: "agricultura",
    etiquetas: ["papa", "calendario"],
    contenido:
      "La papa se cultiva en ambientes andinos diversos. Por eso, una ventana de siembra registrada para una zona no debe trasladarse automáticamente a otra.\n\nCompara el calendario comunitario con la humedad y temperatura disponibles. Si faltan mediciones locales, la plataforma mostrará esa limitación.",
  },
  {
    titulo: "Maíz: combinar observación y registro",
    slug: "maiz-observar-y-registrar",
    categoria: "agricultura",
    etiquetas: ["maiz", "suelo"],
    contenido:
      "El momento adecuado depende de las condiciones de la parcela y de la variedad. Mantén un registro de las fechas y condiciones observadas para conversar con tu comunidad.\n\nLos datos de clima regional sirven como orientación, no reemplazan una medición del suelo.",
  },
  {
    titulo: "Quinua: comparar campañas en tu localidad",
    slug: "quinua-comparar-campanas",
    categoria: "agricultura",
    etiquetas: ["quinua", "calendario"],
    contenido:
      "Las experiencias de campañas anteriores ayudan a reconocer diferencias entre sectores de una misma comunidad.\n\nAnota la zona, el calendario acordado y las observaciones del suelo. Valida cualquier ajuste con la experiencia local.",
  },
];

async function obtenerPorClave(knex, tabla, datos) {
  const existente = await knex(tabla).where({ slug: datos.slug }).first();
  if (existente) return existente.id;
  const [id] = await knex(tabla).insert(datos);
  return id;
}

exports.seed = async function seed(knex) {
  const cultivos = await knex("cultivos").select("id", "slug");
  const cultivoIdPorSlug = new Map(cultivos.map((fila) => [fila.slug, fila.id]));

  for (const variedad of VARIEDADES) {
    let fila = await knex("variedades")
      .where({ slug: variedad.slug })
      .first();
    if (!fila) {
      const [id] = await knex("variedades").insert({
        nombre: variedad.nombre,
        slug: variedad.slug,
        activa: true,
      });
      fila = { id };
    }
    const cultivoId = cultivoIdPorSlug.get(variedad.cultivo);
    if (!cultivoId) continue;
    await knex("cultivo_variedades")
      .insert({ cultivo_id: cultivoId, variedad_id: fila.id })
      .onConflict(["cultivo_id", "variedad_id"])
      .ignore();
  }

  const etiquetaIdPorSlug = new Map();
  for (const etiqueta of ETIQUETAS) {
    etiquetaIdPorSlug.set(
      etiqueta.slug,
      await obtenerPorClave(knex, "etiquetas", etiqueta),
    );
  }

  const categorias = await knex("categorias").select("id", "slug");
  const categoriaIdPorSlug = new Map(
    categorias.map((fila) => [fila.slug, fila.id]),
  );
  const estado = await knex("estados_publicacion")
    .where({ clave: "publicada" })
    .first();
  if (!estado) throw new Error('Falta el estado "publicada". Ejecuta npm run seed.');

  for (const articulo of ARTICULOS) {
    let fila = await knex("publicaciones")
      .where({ slug: articulo.slug })
      .first();
    if (!fila) {
      const [id] = await knex("publicaciones").insert({
        categoria_id: categoriaIdPorSlug.get(articulo.categoria),
        estado_id: estado.id,
        titulo: articulo.titulo,
        slug: articulo.slug,
        contenido: articulo.contenido,
        publicada_en: knex.fn.now(),
      });
      fila = { id };
    }

    for (const slug of articulo.etiquetas) {
      const etiquetaId = etiquetaIdPorSlug.get(slug);
      if (!etiquetaId) continue;
      await knex("publicacion_etiquetas")
        .insert({ publicacion_id: fila.id, etiqueta_id: etiquetaId })
        .onConflict(["publicacion_id", "etiqueta_id"])
        .ignore();
    }
  }
};
