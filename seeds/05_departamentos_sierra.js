const DEPARTAMENTOS = [
  { codigo: "01", nombre: "Amazonas" },
  { codigo: "02", nombre: "Áncash" },
  { codigo: "03", nombre: "Apurímac" },
  { codigo: "04", nombre: "Arequipa" },
  { codigo: "05", nombre: "Ayacucho" },
  { codigo: "06", nombre: "Cajamarca" },
  { codigo: "08", nombre: "Cusco" },
  { codigo: "09", nombre: "Huancavelica" },
  { codigo: "10", nombre: "Huánuco" },
  { codigo: "11", nombre: "Ica" },
  { codigo: "12", nombre: "Junín" },
  { codigo: "13", nombre: "La Libertad" },
  { codigo: "14", nombre: "Lambayeque" },
  { codigo: "15", nombre: "Lima" },
  { codigo: "18", nombre: "Moquegua" },
  { codigo: "19", nombre: "Pasco" },
  { codigo: "20", nombre: "Piura" },
  { codigo: "21", nombre: "Puno" },
  { codigo: "23", nombre: "Tacna" },
];

exports.seed = async function seed(knex) {
  for (const departamento of DEPARTAMENTOS) {
    const existente = await knex("departamentos")
      .where({ codigo: departamento.codigo })
      .first();
    if (existente) {
      await knex("departamentos")
        .where({ id: existente.id })
        .update({ ...departamento, updated_at: knex.fn.now() });
    } else {
      await knex("departamentos").insert(departamento);
    }
  }
};
