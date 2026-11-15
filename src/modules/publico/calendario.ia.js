// IA para el calendario público. Dos usos y nada más:
//  1) Estimar (con esquema validado) rangos y ciclo de cultivos fuera de la base.
//  2) Redactar 3 a 5 frases a partir del JSON ya calculado, sin inventar datos.
// La clave vive solo en el servidor (env.ia); nunca se envía al navegador.
// Si el proveedor falla, tarda o responde algo inválido, todo se degrada a
// "no hay datos suficientes" o a la plantilla fija (con las mismas fechas).
const env = require("../../config/env");

const INSTRUCCIONES_SISTEMA = [
  "Eres un asistente para agricultores de la sierra del Perú.",
  "Usa ÚNICAMENTE los datos del JSON proporcionado.",
  "No inventes fechas, cifras, lugares ni fuentes.",
  "Cita NASA POWER como fuente de los datos de suelo y clima.",
  "No recomiendes pesticidas ni dosis.",
  "Cierra sugiriendo consultar a un técnico y registrarse en Siembra Andina.",
].join(" ");

const INSTRUCCIONES_RANGOS = [
  "Eres un agrónomo experto en cultivos andinos del Perú.",
  "Devuelve SOLO un objeto JSON, sin texto adicional ni bloques de código, con esta forma exacta:",
  '{"nombre":"<cultivo>","humedadMin":<número>,"humedadMax":<número>,"tempMin":<número>,"tempMax":<número>,"diasCiclo":<entero>}',
  "humedadMin y humedadMax son humedad del suelo en porcentaje (0 a 100).",
  "tempMin y tempMax son temperatura del aire en grados Celsius (-20 a 45).",
  "diasCiclo es la duración típica de siembra a cosecha en días (30 a 400).",
  "El mínimo siempre debe ser menor que el máximo.",
].join(" ");

const INSTRUCCIONES_REDACCION = [
  "Redacta de 3 a 5 frases simples en español a partir del JSON.",
  "Escribe cada fecha exactamente en formato ISO YYYY-MM-DD, copiada del JSON.",
  "No escribas meses en palabras, ni otros años, ni cifras que no estén en el JSON.",
].join(" ");

// Vocabulario de números que no son fechas (temp_min, % de humedad, días...).
const CAMPOS_NUMERICOS = [
  "humedadMin",
  "humedadMax",
  "tempMin",
  "tempMax",
  "diasCiclo",
  "puntaje",
  "humedad",
  "temperatura",
  "dias",
  "latitud",
  "longitud",
];
const MESES_EN_PALABRAS =
  /\b(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/i;
const FECHA_ISO = /\b\d{4}-\d{2}-\d{2}\b/g;
const FECHA_LOCAL = /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/;
const ANIO = /\b(?:19|20)\d{2}\b/g;
const LIMITES = {
  humedadMin: [0, 100],
  humedadMax: [0, 100],
  tempMin: [-20, 45],
  tempMax: [-20, 45],
  diasCiclo: [30, 400],
};

// ---------- Esquema de rangos estimados ----------

function enRango(valor, [minimo, maximo]) {
  return Number.isFinite(valor) && valor >= minimo && valor <= maximo;
}

/**
 * Valida el JSON de rangos con un esquema estricto.
 * Devuelve null si no cumple: números fuera de rango razonable, mínimo mayor o
 * igual que máximo, cultivo vacío, campos extra o valores que no son números.
 */
function validarEsquemaRangos(datos, cultivoEsperado) {
  if (!datos || typeof datos !== "object" || Array.isArray(datos)) return null;
  const claves = Object.keys(datos);
  const permitidas = new Set([
    "nombre",
    "humedadMin",
    "humedadMax",
    "tempMin",
    "tempMax",
    "diasCiclo",
  ]);
  if (claves.some((clave) => !permitidas.has(clave))) return null;
  if (typeof datos.nombre !== "string" || !datos.nombre.trim()) return null;
  if (datos.nombre.trim().length > 80) return null;

  const valores = {};
  for (const campo of ["humedadMin", "humedadMax", "tempMin", "tempMax"]) {
    if (typeof datos[campo] !== "number" || !enRango(datos[campo], LIMITES[campo])) {
      return null;
    }
    valores[campo] = Number(datos[campo].toFixed(1));
  }
  if (typeof datos.diasCiclo !== "number" || !Number.isInteger(datos.diasCiclo)) {
    return null;
  }
  if (!enRango(datos.diasCiclo, LIMITES.diasCiclo)) return null;
  if (valores.humedadMin >= valores.humedadMax) return null;
  if (valores.tempMin >= valores.tempMax) return null;

  return {
    nombre: datos.nombre.trim(),
    nombreConsultado: cultivoEsperado || datos.nombre.trim(),
    humedadMin: valores.humedadMin,
    humedadMax: valores.humedadMax,
    tempMin: valores.tempMin,
    tempMax: valores.tempMax,
    diasCiclo: datos.diasCiclo,
    estimado: true,
    etiqueta: "estimado_ia",
  };
}

/** Extrae el objeto JSON de una respuesta que pueda venir con texto extra. */
function extraerJson(texto) {
  if (typeof texto !== "string") return null;
  const sinBloque = texto.replace(/```(?:json)?/gi, " ");
  const inicio = sinBloque.indexOf("{");
  const fin = sinBloque.lastIndexOf("}");
  if (inicio === -1 || fin <= inicio) return null;
  try {
    return JSON.parse(sinBloque.slice(inicio, fin + 1));
  } catch {
    return null;
  }
}

// ---------- Validación del texto redactado ----------

function fechasPermitidas(json) {
  const fechas = new Set();
  const recolectar = (valor) => {
    if (typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor)) {
      fechas.add(valor);
    } else if (Array.isArray(valor)) {
      valor.forEach(recolectar);
    } else if (valor && typeof valor === "object") {
      Object.values(valor).forEach(recolectar);
    }
  };
  recolectar(json);
  return fechas;
}

function numerosPermitidos(json) {
  const numeros = new Set();
  for (const campo of CAMPOS_NUMERICOS) {
    const recolectar = (valor) => {
      if (!valor || typeof valor !== "object") return;
      for (const [clave, dato] of Object.entries(valor)) {
        if (clave === campo && Number.isFinite(Number(dato))) {
          numeros.add(Math.abs(Number(dato)));
        } else recolectar(dato);
      }
    };
    recolectar(json);
  }
  return numeros;
}

/**
 * Toda fecha del texto debe existir en el JSON; tampoco se admiten meses en
 * palabras, fechas en otros formatos, años sueltos ni cifras desconocidas.
 */
function validarFechasYNumeros(texto, json) {
  if (typeof texto !== "string" || !texto.trim()) return false;
  const permitidas = fechasPermitidas(json);
  const fechas = texto.match(FECHA_ISO) || [];
  if (fechas.some((fecha) => !permitidas.has(fecha))) return false;
  if (MESES_EN_PALABRAS.test(texto) || FECHA_LOCAL.test(texto)) return false;

  const aniosPermitidos = new Set(
    [...permitidas].map((fecha) => fecha.slice(0, 4)),
  );
  if ((texto.match(ANIO) || []).some((anio) => !aniosPermitidos.has(anio))) {
    return false;
  }

  // Las cifras sueltas (rangos, porcentajes, días) deben venir del JSON. Las
  // fechas ya se comprobaron arriba y aquí se excluyen del recuento.
  const numeros = numerosPermitidos(json);
  const textoSinFechas = texto.replace(FECHA_ISO, " ").replace(ANIO, " ");
  const cifras = textoSinFechas.match(/\d+(?:[.,]\d+)?/g) || [];
  return cifras.every((cifra) => {
    const valor = Math.abs(Number(cifra.replace(",", ".")));
    return (
      numeros.has(valor) ||
      (Number.isInteger(valor) && numeros.has(Math.round(valor)))
    );
  });
}

/** 3 a 5 frases y las menciones obligatorias del contrato. */
function validarRedaccion(texto, json) {
  if (!validarFechasYNumeros(texto, json)) return false;
  const frases = texto
    .split(/[.!?]+/)
    .map((frase) => frase.trim())
    .filter(Boolean);
  if (frases.length < 3 || frases.length > 5) return false;
  if (!/NASA\s*POWER/i.test(texto)) return false;
  if (!/t[eé]cnico/i.test(texto)) return false;
  // La IA redacta sin cifras obligatorias: lo importante es no inventarlas.
  // La tilde puede venir con acento combinado (NFC/NFD): se normaliza.
  const sinTildes = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!/(registr|crear (?:una )?cuenta|inscribete)/i.test(sinTildes)) {
    return false;
  }
  if (/pesticid|insecticid|fungicid|dosis|plaguicid/i.test(texto)) return false;
  return true;
}

function formatearFechas(texto) {
  return texto.replace(FECHA_ISO, (fecha) => {
    const [anio, mes, dia] = fecha.split("-").map(Number);
    return new Intl.DateTimeFormat("es-PE", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(anio, mes - 1, dia)));
  });
}

// ---------- Llamadas al proveedor ----------

async function solicitarAnthropic(sistema, usuario, maxTokens, fetchImpl) {
  const respuesta = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ia.clave,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: env.ia.modelo,
      max_tokens: maxTokens,
      temperature: 0.1,
      system: sistema,
      messages: [{ role: "user", content: usuario }],
    }),
    signal: AbortSignal.timeout(env.ia.tiempoLimiteMs),
  });
  if (!respuesta.ok) throw new Error("El proveedor de IA rechazó la solicitud.");
  const datos = await respuesta.json();
  return (datos.content || [])
    .filter((parte) => parte.type === "text")
    .map((parte) => parte.text)
    .join(" ")
    .trim();
}

async function solicitarGemini(sistema, usuario, maxTokens, fetchImpl) {
  const modelo = env.ia.modelo.replace(/^models\//, "");
  const url = new URL(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`,
  );
  url.searchParams.set("key", env.ia.clave);
  const respuesta = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: sistema }] },
      contents: [{ parts: [{ text: usuario }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: maxTokens,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            nombre: { type: "STRING" },
            humedadMin: { type: "NUMBER" },
            humedadMax: { type: "NUMBER" },
            tempMin: { type: "NUMBER" },
            tempMax: { type: "NUMBER" },
            diasCiclo: { type: "INTEGER" },
          },
          required: [
            "nombre",
            "humedadMin",
            "humedadMax",
            "tempMin",
            "tempMax",
            "diasCiclo",
          ],
        },
      },
    }),
    signal: AbortSignal.timeout(env.ia.tiempoLimiteMs),
  });
  if (!respuesta.ok) throw new Error("El proveedor de IA rechazó la solicitud.");
  const datos = await respuesta.json();
  return (datos.candidates || [])
    .flatMap((candidato) =>
      candidato.content && candidato.content.parts ? candidato.content.parts : [],
    )
    .map((parte) => parte.text || "")
    .join(" ")
    .trim();
}

async function solicitar(sistema, usuario, maxTokens, fetchImpl) {
  return env.ia.proveedor === "anthropic"
    ? solicitarAnthropic(sistema, usuario, maxTokens, fetchImpl)
    : solicitarGemini(sistema, usuario, maxTokens, fetchImpl);
}

function iaDisponible() {
  return Boolean(env.ia.clave && env.ia.proveedor);
}

/**
 * Pide los rangos típicos de un cultivo que no está en la base.
 * @returns {Promise<object|null>} null si no hay datos suficientes.
 */
async function estimarRangosCultivo(cultivo, fetchImpl = global.fetch) {
  if (!iaDisponible() || !cultivo) return null;
  let texto;
  try {
    texto = await solicitar(
      INSTRUCCIONES_RANGOS,
      `Cultivo consultado: ${JSON.stringify(cultivo)}. Responde solo con el JSON.`,
      220,
      fetchImpl,
    );
  } catch {
    // IA caída, lenta o sin clave: no hay datos suficientes para ese cultivo.
    return null;
  }
  try {
    // El esquema estricto descarta números fuera de rango y mínimo >= máximo.
    return validarEsquemaRangos(extraerJson(texto), cultivo);
  } catch {
    return null;
  }
}

/**
 * Redacta la explicación del calendario a partir del JSON calculado.
 * @returns {Promise<string|null>} null si falla la validación o el proveedor.
 */
async function redactarExplicacion(json, fetchImpl = global.fetch) {
  if (!iaDisponible() || !json) return null;
  let texto;
  try {
    texto = await solicitar(
      `${INSTRUCCIONES_SISTEMA} ${INSTRUCCIONES_REDACCION}`,
      `JSON: ${JSON.stringify(json)}`,
      300,
      fetchImpl,
    );
  } catch {
    return null;
  }
  return validarRedaccion(texto, json) ? formatearFechas(texto) : null;
}

/** Plantilla fija: usa exactamente las mismas fechas y cifras que el JSON. */
function plantillaExplicacion(json, textos) {
  if (!json) return textos.sinVentanas;
  const cultivo = json.cultivo && json.cultivo.nombre;
  const ventanas = Array.isArray(json.ventanas) ? json.ventanas : [];
  if (!ventanas.length) return textos.sinVentanas;
  const primera = ventanas[0];
  const frases = [
    textos.intro
      .replace("{cultivo}", cultivo)
      .replace("{inicio}", primera.inicio)
      .replace("{fin}", primera.fin),
  ];
  if (primera.cosecha) {
    frases.push(
      textos.cosecha
        .replace("{desde}", primera.cosecha.inicio)
        .replace("{hasta}", primera.cosecha.fin),
    );
  }
  frases.push(
    textos.otras.replace("{cantidad}", String(ventanas.length)),
    textos.estimadoIA,
    textos.fuente
      .replace("{fuente}", json.fuente || "NASA POWER")
      .replace("{fecha}", json.fechaDatos || ""),
    textos.cierre,
  );
  return frases.join(" ");
}

module.exports = {
  INSTRUCCIONES_SISTEMA,
  INSTRUCCIONES_RANGOS,
  INSTRUCCIONES_REDACCION,
  LIMITES,
  validarEsquemaRangos,
  validarFechasYNumeros,
  validarRedaccion,
  extraerJson,
  estimarRangosCultivo,
  redactarExplicacion,
  plantillaExplicacion,
  iaDisponible,
};
