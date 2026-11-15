// Cultivos, requerimientos por zona y calendario tradicional (referencial).
// Valores pendientes de validar con técnicos: validado = false.
// Humedad en % volumétrico aproximado; temperatura en °C; meses del 1 al 12.
const CULTIVOS = [
  {
    nombre: "Papa",
    slug: "papa",
    descripcion: "Tubérculo andino; sensible a heladas y al exceso de humedad.",
    dias_ciclo: null,
    ciclo_referencial: false,
    ciclo_fuente: null,
  },
  {
    nombre: "Maíz",
    slug: "maiz",
    descripcion: "Grano básico; requiere suelos templados y buen drenaje.",
    dias_ciclo: 270,
    ciclo_referencial: true,
    ciclo_fuente:
      "Estimación referencial de 270 días; pendiente de validación técnica según variedad y altitud.",
  },
  {
    nombre: "Quinua",
    slug: "quinua",
    descripcion:
      "Grano andino resistente; tolera frío pero no el encharcamiento.",
    dias_ciclo: 180,
    ciclo_referencial: true,
    ciclo_fuente:
      "Estimación referencial de 180 días; pendiente de validación técnica según ecotipo y altitud.",
  },
];

const REQUERIMIENTOS = [
  {
    cultivo: "papa",
    zona: "valle",
    humedad_min: 20,
    humedad_max: 35,
    temperatura_min: 11,
    temperatura_max: 20,
  },
  {
    cultivo: "papa",
    zona: "quechua",
    humedad_min: 20,
    humedad_max: 35,
    temperatura_min: 9,
    temperatura_max: 18,
  },
  {
    cultivo: "papa",
    zona: "puna",
    humedad_min: 20,
    humedad_max: 35,
    temperatura_min: 7,
    temperatura_max: 16,
  },
  {
    cultivo: "maiz",
    zona: "valle",
    humedad_min: 18,
    humedad_max: 32,
    temperatura_min: 14,
    temperatura_max: 22,
  },
  {
    cultivo: "maiz",
    zona: "quechua",
    humedad_min: 18,
    humedad_max: 32,
    temperatura_min: 12,
    temperatura_max: 20,
  },
  {
    cultivo: "maiz",
    zona: "puna",
    humedad_min: 18,
    humedad_max: 32,
    temperatura_min: 10,
    temperatura_max: 18,
  },
  {
    cultivo: "quinua",
    zona: "valle",
    humedad_min: 15,
    humedad_max: 28,
    temperatura_min: 12,
    temperatura_max: 20,
  },
  {
    cultivo: "quinua",
    zona: "quechua",
    humedad_min: 15,
    humedad_max: 28,
    temperatura_min: 10,
    temperatura_max: 18,
  },
  {
    cultivo: "quinua",
    zona: "puna",
    humedad_min: 15,
    humedad_max: 28,
    temperatura_min: 8,
    temperatura_max: 16,
  },
];

// Igual en las tres zonas por ahora.
const CALENDARIO = [
  { cultivo: "papa", mes_inicio: 8, mes_fin: 10 },
  { cultivo: "maiz", mes_inicio: 9, mes_fin: 11 },
  { cultivo: "quinua", mes_inicio: 9, mes_fin: 11 },
];

const FUENTE = "Seed inicial referencial (pendiente de validación técnica)";

exports.seed = async function seed(knex) {
  for (const cultivo of CULTIVOS) {
    const existente = await knex("cultivos")
      .where({ slug: cultivo.slug })
      .first();
    if (existente)
      await knex("cultivos")
        .where({ id: existente.id })
        .update({ ...cultivo, updated_at: knex.fn.now() });
    else await knex("cultivos").insert(cultivo);
  }

  const cultivos = await knex("cultivos").select("id", "slug");
  const zonas = await knex("zonas_altitudinales").select("id", "clave");
  const idCultivo = Object.fromEntries(cultivos.map((c) => [c.slug, c.id]));
  const idZona = Object.fromEntries(zonas.map((z) => [z.clave, z.id]));

  for (const r of REQUERIMIENTOS) {
    const fila = {
      cultivo_id: idCultivo[r.cultivo],
      zona_id: idZona[r.zona],
      hum_min: r.humedad_min,
      hum_max: r.humedad_max,
      temp_min: r.temperatura_min,
      temp_max: r.temperatura_max,
    };
    const existente = await knex("cultivo_requerimientos")
      .where({ cultivo_id: fila.cultivo_id, zona_id: fila.zona_id })
      .first();
    // No se sobrescriben valores ya validados por un técnico.
    if (existente && existente.validado) continue;
    if (existente)
      await knex("cultivo_requerimientos")
        .where({ id: existente.id })
        .update({ ...fila, updated_at: knex.fn.now() });
    else
      await knex("cultivo_requerimientos").insert({
        ...fila,
        validado: false,
        fuente: FUENTE,
      });
  }

  for (const c of CALENDARIO) {
    for (const zona of zonas) {
      const fila = {
        cultivo_id: idCultivo[c.cultivo],
        zona_id: zona.id,
        mes_inicio: c.mes_inicio,
        mes_fin: c.mes_fin,
      };
      const existente = await knex("calendario_tradicional")
        .where({ cultivo_id: fila.cultivo_id, zona_id: fila.zona_id })
        .first();
      if (existente && existente.validado) continue;
      if (existente)
        await knex("calendario_tradicional")
          .where({ id: existente.id })
          .update({ ...fila, updated_at: knex.fn.now() });
      else
        await knex("calendario_tradicional").insert({
          ...fila,
          validado: false,
          fuente: FUENTE,
        });
    }
  }
};
