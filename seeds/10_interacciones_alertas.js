async function guardarPorClave(knex, tabla, fila) {
  const existente = await knex(tabla).where({ clave: fila.clave }).first();
  if (existente) {
    await knex(tabla)
      .where({ id: existente.id })
      .update({ ...fila, updated_at: knex.fn.now() });
    return existente.id;
  }
  await knex(tabla).insert(fila);
  const creada = await knex(tabla).where({ clave: fila.clave }).first();
  return creada.id;
}

exports.seed = async function seed(knex) {
  const tiposAlerta = {};
  for (const fila of [
    { clave: "clima", nombre: "Riesgo climático" },
    { clave: "umbral", nombre: "Umbral agronómico" },
  ]) {
    tiposAlerta[fila.clave] = await guardarPorClave(
      knex,
      "tipos_alerta",
      fila,
    );
  }

  const metricas = {};
  for (const fila of [
    { clave: "humedad", nombre: "Humedad del suelo (%)" },
    {
      clave: "temperatura_aire",
      nombre: "Temperatura mínima del aire (°C)",
    },
  ]) {
    metricas[fila.clave] = await guardarPorClave(
      knex,
      "metricas_alerta",
      fila,
    );
  }

  const tiposUmbral = {};
  for (const fila of [
    { clave: "fijo", nombre: "Valor fijo de la regla" },
    {
      clave: "requerimiento_min",
      nombre: "Mínimo del requerimiento del cultivo",
    },
    {
      clave: "requerimiento_max",
      nombre: "Máximo del requerimiento del cultivo",
    },
  ]) {
    tiposUmbral[fila.clave] = await guardarPorClave(
      knex,
      "tipos_umbral",
      fila,
    );
  }

  const operadores = await knex("operadores_alerta").select("id", "clave");
  const idOperador = Object.fromEntries(
    operadores.map((operador) => [operador.clave, operador.id]),
  );
  for (const [tabla, fila] of [
    ["estados_reporte", {
      clave: "pendiente",
      nombre: "Pendiente",
    }],
    ["estados_reporte", {
      clave: "revisado",
      nombre: "Revisado",
    }],
    ["estados_reporte", {
      clave: "descartado",
      nombre: "Descartado",
    }],
    ["tipos_reaccion", {
      clave: "lo_probe",
      nombre: "Lo probé",
    }],
    ["tipos_notificacion", {
      clave: "consulta",
      nombre: "Consulta agrícola",
    }],
    ["tipos_notificacion", {
      clave: "respuesta",
      nombre: "Respuesta a consulta",
    }],
    ["tipos_aviso_zona", {
      clave: "helada",
      nombre: "Riesgo de helada",
    }],
    ["tipos_aviso_zona", {
      clave: "sequia",
      nombre: "Sequía",
    }],
    ["tipos_aviso_zona", {
      clave: "otro",
      nombre: "Otro aviso",
    }],
  ]) {
    await guardarPorClave(knex, tabla, fila);
  }

  const reglas = [
    {
      clave: "humedad_baja_3_dias",
      tipo_id: tiposAlerta.umbral,
      metrica_id: metricas.humedad,
      operador_id: idOperador.lt,
      cultivo_id: null,
      zona_id: null,
      nombre: "Humedad bajo el mínimo durante tres días",
      descripcion:
        "Se activa cuando las lecturas diarias permanecen bajo el mínimo recomendado.",
      umbral: 0,
      umbral_tipo_id: tiposUmbral.requerimiento_min,
      persistencia_dias: 3,
      horizonte_horas: null,
      critica: false,
      activa: true,
    },
    {
      clave: "riesgo_helada_48_horas",
      tipo_id: tiposAlerta.clima,
      metrica_id: metricas.temperatura_aire,
      operador_id: idOperador.lte,
      cultivo_id: null,
      zona_id: null,
      nombre: "Riesgo de helada en las próximas 48 horas",
      descripcion:
        "Se activa si el pronóstico de temperatura mínima del aire indica riesgo de helada en las próximas 48 horas.",
      umbral: 2,
      umbral_tipo_id: tiposUmbral.fijo,
      persistencia_dias: 1,
      horizonte_horas: 48,
      critica: true,
      activa: true,
    },
  ];

  for (const regla of reglas) {
    const existente = await knex("alerta_reglas")
      .where({ clave: regla.clave })
      .first();
    if (existente) {
      await knex("alerta_reglas")
        .where({ id: existente.id })
        .update({ ...regla, updated_at: knex.fn.now() });
    } else {
      await knex("alerta_reglas").insert(regla);
    }
  }
};
