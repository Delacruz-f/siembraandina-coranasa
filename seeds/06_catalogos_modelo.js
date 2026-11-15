async function guardarPorClave(knex, tabla, filas) {
  for (const fila of filas) {
    const existente = await knex(tabla).where({ clave: fila.clave }).first();
    if (existente) {
      await knex(tabla)
        .where({ id: existente.id })
        .update({ ...fila, updated_at: knex.fn.now() });
    } else {
      await knex(tabla).insert(fila);
    }
  }
}

exports.seed = async function seed(knex) {
  await guardarPorClave(knex, "estados_campania", [
    { clave: "activa", nombre: "Activa" },
    { clave: "planificada", nombre: "Planificada" },
    { clave: "finalizada", nombre: "Finalizada" },
    { clave: "cancelada", nombre: "Cancelada" },
  ]);
  await guardarPorClave(knex, "unidades_medida", [
    { clave: "kg", nombre: "Kilogramo" },
    { clave: "t", nombre: "Tonelada" },
  ]);
  await guardarPorClave(knex, "tipos_alerta", [
    { clave: "umbral", nombre: "Umbral agronómico" },
    { clave: "siembra", nombre: "Ventana de siembra" },
  ]);
  await guardarPorClave(knex, "estados_alerta", [
    { clave: "activa", nombre: "Activa" },
    { clave: "resuelta", nombre: "Resuelta" },
    { clave: "descartada", nombre: "Descartada" },
  ]);
  await guardarPorClave(knex, "metricas_alerta", [
    { clave: "humedad", nombre: "Humedad del suelo (%)" },
    { clave: "temperatura", nombre: "Temperatura del suelo (°C)" },
  ]);
  await guardarPorClave(knex, "operadores_alerta", [
    { clave: "lt", nombre: "Menor que" },
    { clave: "lte", nombre: "Menor o igual que" },
    { clave: "gt", nombre: "Mayor que" },
    { clave: "gte", nombre: "Mayor o igual que" },
  ]);
  await guardarPorClave(knex, "tipos_notificacion", [
    { clave: "alerta", nombre: "Alerta agrícola" },
    { clave: "respuesta", nombre: "Respuesta a consulta" },
    { clave: "publicacion", nombre: "Actividad de publicación" },
    { clave: "solicitud", nombre: "Solicitud de rol" },
  ]);
  await guardarPorClave(knex, "estados_publicacion", [
    { clave: "borrador", nombre: "Borrador" },
    { clave: "programada", nombre: "Programada" },
    { clave: "publicada", nombre: "Publicada" },
    { clave: "archivada", nombre: "Archivada" },
  ]);
  await guardarPorClave(knex, "tipos_reaccion", [
    { clave: "me_gusta", nombre: "Me gusta" },
    { clave: "util", nombre: "Útil" },
    { clave: "gracias", nombre: "Gracias" },
  ]);
  await guardarPorClave(knex, "estados_consulta", [
    { clave: "abierta", nombre: "Abierta" },
    { clave: "respondida", nombre: "Respondida" },
    { clave: "cerrada", nombre: "Cerrada" },
  ]);

  const categorias = [
    { nombre: "Agricultura", slug: "agricultura" },
    { nombre: "Clima y suelo", slug: "clima-y-suelo" },
    { nombre: "Comunidad", slug: "comunidad" },
  ];
  for (const categoria of categorias) {
    const existente = await knex("categorias")
      .where({ slug: categoria.slug })
      .first();
    if (existente) {
      await knex("categorias")
        .where({ id: existente.id })
        .update({ ...categoria, updated_at: knex.fn.now() });
    } else {
      await knex("categorias").insert(categoria);
    }
  }
};
