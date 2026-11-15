// Catálogos de la Fase 2: estados de solicitud, fuentes de lectura y zonas.
exports.seed = async function seed(knex) {
  const estados = [
    { clave: "pendiente", nombre: "Pendiente" },
    { clave: "aprobada", nombre: "Aprobada" },
    { clave: "rechazada", nombre: "Rechazada" },
  ];
  for (const estado of estados) {
    const existente = await knex("estados_solicitud")
      .where({ clave: estado.clave })
      .first();
    if (existente)
      await knex("estados_solicitud")
        .where({ id: existente.id })
        .update({ ...estado, updated_at: knex.fn.now() });
    else await knex("estados_solicitud").insert(estado);
  }

  const fuentes = [
    { clave: "manual", nombre: "Registro manual", es_automatica: false },
    { clave: "nasa_power", nombre: "NASA POWER", es_automatica: true },
    { clave: "open_meteo", nombre: "Open-Meteo", es_automatica: true },
    { clave: "smap", nombre: "SMAP", es_automatica: true },
  ];
  for (const fuente of fuentes) {
    const existente = await knex("fuentes_datos")
      .where({ clave: fuente.clave })
      .first();
    if (existente)
      await knex("fuentes_datos")
        .where({ id: existente.id })
        .update({ ...fuente, updated_at: knex.fn.now() });
    else await knex("fuentes_datos").insert(fuente);
  }

  const zonas = [
    {
      clave: "valle",
      nombre: "Valle (menos de 3 000 m)",
      altitud_min_m: 0,
      altitud_max_m: 3000,
      orden: 1,
    },
    {
      clave: "quechua",
      nombre: "Quechua alta (3 000 a 3 800 m)",
      altitud_min_m: 3000,
      altitud_max_m: 3800,
      orden: 2,
    },
    {
      clave: "puna",
      nombre: "Puna (más de 3 800 m)",
      altitud_min_m: 3800,
      altitud_max_m: 5000,
      orden: 3,
    },
  ];
  for (const zona of zonas) {
    const existente = await knex("zonas_altitudinales")
      .where({ clave: zona.clave })
      .first();
    if (existente)
      await knex("zonas_altitudinales")
        .where({ id: existente.id })
        .update({ ...zona, updated_at: knex.fn.now() });
    else await knex("zonas_altitudinales").insert(zona);
  }
};
