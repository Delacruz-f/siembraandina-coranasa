exports.seed = async function seed(knex) {
  const estados = [
    { clave: "ejecutando", nombre: "En ejecución" },
    { clave: "exitoso", nombre: "Completado" },
    { clave: "parcial", nombre: "Completado con errores" },
    { clave: "fallido", nombre: "Fallido" },
  ];
  for (const estado of estados) {
    const existente = await knex("estados_jobs")
      .where({ clave: estado.clave })
      .first();
    if (existente) {
      await knex("estados_jobs")
        .where({ id: existente.id })
        .update({ ...estado, updated_at: knex.fn.now() });
    } else {
      await knex("estados_jobs").insert(estado);
    }
  }
};
