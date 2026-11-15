exports.up = async function up(knex) {
  const tienePrioridad = await knex.schema.hasColumn(
    "fuentes_datos",
    "prioridad",
  );
  if (!tienePrioridad) {
    await knex.schema.alterTable("fuentes_datos", (tabla) => {
      tabla.integer("prioridad").notNullable().defaultTo(100);
    });
  }

  const fuenteOpenMeteo = await knex("fuentes_datos")
    .where({ clave: "open_meteo_suelo" })
    .first();
  if (fuenteOpenMeteo) {
    await knex("fuentes_datos")
      .where({ id: fuenteOpenMeteo.id })
      .update({
        nombre: "Open-Meteo (suelo)",
        es_automatica: true,
        prioridad: 1,
      });
  } else {
    await knex("fuentes_datos").insert({
      clave: "open_meteo_suelo",
      nombre: "Open-Meteo (suelo)",
      es_automatica: true,
      prioridad: 1,
    });
  }

  await knex("fuentes_datos")
    .where({ clave: "nasa_power" })
    .update({ prioridad: 3 });
};

exports.down = async function down(knex) {
  const fuenteOpenMeteo = await knex("fuentes_datos")
    .where({ clave: "open_meteo_suelo" })
    .first();
  if (fuenteOpenMeteo) {
    const [lectura, sincronizacion] = await Promise.all([
      knex("lecturas").where({ fuente_id: fuenteOpenMeteo.id }).first(),
      knex("sincronizaciones_parcela")
        .where({ fuente_id: fuenteOpenMeteo.id })
        .first(),
    ]);
    if (lectura || sincronizacion) {
      throw new Error(
        "No se puede revertir la fuente Open-Meteo de suelo mientras tenga lecturas o sincronizaciones asociadas.",
      );
    }
  }

  const tienePrioridad = await knex.schema.hasColumn(
    "fuentes_datos",
    "prioridad",
  );
  if (tienePrioridad) {
    await knex.schema.alterTable("fuentes_datos", (tabla) => {
      tabla.dropColumn("prioridad");
    });
  }
  if (fuenteOpenMeteo) {
    await knex("fuentes_datos").where({ id: fuenteOpenMeteo.id }).del();
  }
};
