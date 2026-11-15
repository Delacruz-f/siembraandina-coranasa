// Datos sintéticos para probar el mapa; las coordenadas son referencias
// aproximadas de los distritos, no ubicaciones verificadas de comunidades.
const COMUNIDADES_DEMO = [
  {
    codigo_departamento: "08",
    provincia: "Urubamba",
    distrito: "Chinchero",
    nombre: "Demo: Comunidad agrícola de Chinchero",
    latitud: -13.3917,
    longitud: -72.0488,
  },
  {
    codigo_departamento: "08",
    provincia: "Urubamba",
    distrito: "Maras",
    nombre: "Demo: Comunidad agrícola de Maras",
    latitud: -13.3344,
    longitud: -72.1569,
  },
  {
    codigo_departamento: "08",
    provincia: "Quispicanchi",
    distrito: "Andahuaylillas",
    nombre: "Demo: Comunidad agrícola de Andahuaylillas",
    latitud: -13.673,
    longitud: -71.682,
  },
  {
    codigo_departamento: "21",
    provincia: "Puno",
    distrito: "Acora",
    nombre: "Demo: Comunidad agrícola de Acora",
    latitud: -15.971,
    longitud: -69.798,
  },
  {
    codigo_departamento: "21",
    provincia: "Lampa",
    distrito: "Pucara",
    nombre: "Demo: Comunidad agrícola de Pucara",
    latitud: -15.042,
    longitud: -70.367,
  },
  {
    codigo_departamento: "03",
    provincia: "Cotabambas",
    distrito: "Tambobamba",
    nombre: "Demo: Comunidad agrícola de Tambobamba",
    latitud: -13.948,
    longitud: -72.177,
  },
];

exports.seed = async function seed(knex) {
  for (const comunidad of COMUNIDADES_DEMO) {
    const distrito = await knex("distritos as di")
      .join("provincias as pr", "pr.id", "di.provincia_id")
      .join("departamentos as de", "de.id", "pr.departamento_id")
      .select("di.id")
      .where("de.codigo", comunidad.codigo_departamento)
      .where("pr.nombre", comunidad.provincia)
      .where("di.nombre", comunidad.distrito)
      .first();

    if (!distrito) {
      throw new Error(
        `No se encontró UBIGEO para ${comunidad.distrito}, ${comunidad.provincia}. Ejecuta primero npm run seed.`,
      );
    }

    await knex("comunidades")
      .insert({
        distrito_id: distrito.id,
        nombre: comunidad.nombre,
        latitud: comunidad.latitud,
        longitud: comunidad.longitud,
      })
      .onConflict(["distrito_id", "nombre"])
      .ignore();
  }
};
