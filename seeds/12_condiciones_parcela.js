const CONFIGURACIONES = [
  { clave: "condiciones.tolerancia_humedad_pct", valor: "5" },
  { clave: "condiciones.tolerancia_temperatura_c", valor: "3" },
  { clave: "condiciones.vigencia_manual_horas", valor: "48" },
  {
    clave: "pronostico.riesgo_helada_c",
    valor: JSON.stringify({ valor: 2, validado: false }),
  },
  {
    clave: "pronostico.helada_c",
    valor: JSON.stringify({ valor: 0, validado: false }),
  },
  {
    clave: "pronostico.lluvia_significativa_mm",
    valor: JSON.stringify({ valor: 5, validado: false }),
  },
];

exports.seed = async function seed(knex) {
  for (const configuracion of CONFIGURACIONES) {
    const existente = await knex("configuraciones")
      .where({ clave: configuracion.clave })
      .first();
    if (!existente) await knex("configuraciones").insert(configuracion);
  }
};
