const env = require("../../config/env");

const INSTRUCCIONES_SISTEMA =
  "Eres un asistente para agricultores de la sierra del Perú. Explica en lenguaje simple, sin tecnicismos, usando ÚNICAMENTE los datos del JSON. No inventes fechas, cifras ni fuentes. No recomiendes pesticidas ni dosis. Menciona que los datos vienen de NASA POWER y Open-Meteo. Termina recordando que para un análisis detallado conviene consultar a un técnico.";
const MESES =
  /\b(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/i;
const FECHA_LOCAL = /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/;
const FECHA_ISO = /\b\d{4}-\d{2}-\d{2}\b/g;
const ANIO = /\b20\d{2}\b/g;

function validarFechasIA(texto, fechasJSON) {
  if (typeof texto !== "string" || !Array.isArray(fechasJSON)) return false;
  const permitidas = new Set(
    fechasJSON.filter((fecha) => typeof fecha === "string"),
  );
  const fechas = texto.match(FECHA_ISO) || [];
  const aniosPermitidos = new Set(
    [...permitidas].map((fecha) => fecha.slice(0, 4)),
  );
  const textoSinFechas = texto.replace(FECHA_ISO, "");
  const anios = textoSinFechas.match(ANIO) || [];
  return !(
    fechas.length < 2 ||
    MESES.test(texto) ||
    FECHA_LOCAL.test(texto) ||
    fechas.some((fecha) => !permitidas.has(fecha)) ||
    anios.some((anio) => !aniosPermitidos.has(anio))
  );
}

function validarConfianzaIA(texto, confianzaJSON) {
  if (
    typeof texto !== "string" ||
    !["alta", "media", "baja"].includes(confianzaJSON)
  ) {
    return false;
  }
  const menciones = [
    ...texto.matchAll(/\bconfianza\s*(?::|es)?\s*(alta|media|baja)\b/gi),
  ];
  return (
    menciones.length === 1 &&
    menciones[0][1].toLowerCase() === confianzaJSON
  );
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

async function solicitarAnthropic(json, fetchImpl) {
  const respuesta = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ia.clave,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: env.ia.modelo,
      max_tokens: 240,
      system: INSTRUCCIONES_SISTEMA,
      messages: [
        {
          role: "user",
          content:
          "Redacta de 3 a 5 frases. Usa para cada fecha el formato ISO exacto YYYY-MM-DD incluido en el JSON, sin escribir fechas de otra forma. Incluye la confianza exacta del JSON. JSON: " +
            JSON.stringify(json),
        },
      ],
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

async function solicitarGemini(json, fetchImpl) {
  const modelo = env.ia.modelo.replace(/^models\//, "");
  const url = new URL(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`,
  );
  url.searchParams.set("key", env.ia.clave);
  const respuesta = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: INSTRUCCIONES_SISTEMA }] },
      contents: [
        {
          parts: [
            {
              text:
                "Redacta de 3 a 5 frases. Usa para cada fecha el formato ISO exacto YYYY-MM-DD incluido en el JSON, sin escribir fechas de otra forma. Incluye la confianza exacta del JSON. JSON: " +
                JSON.stringify(json),
            },
          ],
        },
      ],
      generationConfig: { temperature: 0.1, maxOutputTokens: 240 },
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

async function generarExplicacion(json, fetchImpl = global.fetch) {
  if (!env.ia.clave || !env.ia.proveedor) return null;
  const fechasJSON = [];
  for (const cultivo of json.cultivos) {
    for (const ventana of cultivo.ventanas) {
      fechasJSON.push(ventana.inicio, ventana.fin);
      if (ventana.cosecha) {
        fechasJSON.push(ventana.cosecha.inicio, ventana.cosecha.fin);
      }
    }
  }
  const texto =
    env.ia.proveedor === "anthropic"
      ? await solicitarAnthropic(json, fetchImpl)
      : await solicitarGemini(json, fetchImpl);
  const frases = texto.split(/[.!?]+/).filter((frase) => frase.trim()).length;
  const mencionaFuentes =
    /NASA POWER/i.test(texto) && /Open-Meteo/i.test(texto);
  const recuerdaTecnico = /t[eé]cnico/i.test(texto);
  return validarFechasIA(texto, fechasJSON) &&
    frases >= 3 &&
    frases <= 5 &&
    mencionaFuentes &&
    recuerdaTecnico &&
    validarConfianzaIA(texto, json.confianza)
    ? formatearFechas(texto)
    : null;
}

module.exports = {
  INSTRUCCIONES_SISTEMA,
  validarFechasIA,
  validarConfianzaIA,
  generarExplicacion,
};
