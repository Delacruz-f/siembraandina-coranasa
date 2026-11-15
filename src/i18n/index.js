// Internacionalización (Fase 12).
// Diseño incremental y tolerante:
//  - Los textos se guardan en src/i18n/locales/<idioma>.json con claves planas.
//  - Si falta una clave en el idioma activo se usa el idioma por defecto y,
//    si tampoco existe, se muestra la propia clave (nunca se rompe la vista).
//  - Las vistas usan la función `t("clave.saludo", { nombre })`.
//  - Las claves que aún no estén traducidas usan el idioma por defecto.
const fs = require("fs");
const path = require("path");
const env = require("../config/env");
const logger = require("../config/logger");

const DIRECTORIO = path.join(__dirname, "locales");
const cache = new Map();

function cargar(locale) {
  if (cache.has(locale)) return cache.get(locale);
  const ruta = path.join(DIRECTORIO, `${locale}.json`);
  let textos = {};
  try {
    textos = JSON.parse(fs.readFileSync(ruta, "utf8"));
  } catch (error) {
    logger.error(
      { err: error, locale },
      "No se pudo cargar el archivo de idioma",
    );
  }
  cache.set(locale, textos);
  return textos;
}

/** Idiomas activos según .env, filtrados a los que tienen archivo. */
function idiomasDisponibles() {
  return env.idiomas.disponibles.filter((locale) =>
    fs.existsSync(path.join(DIRECTORIO, `${locale}.json`)),
  );
}

/** ¿Es un idioma soportado? */
function esIdiomaValido(locale) {
  return idiomasDisponibles().includes(locale);
}

/**
 * Traduce una clave. Admite interpolación simple: "Hola {nombre}".
 * @param {string} clave
 * @param {object} [variables]
 * @param {string} [locale]
 */
function traducir(clave, variables = {}, locale = env.idiomas.porDefecto) {
  const base = cargar(env.idiomas.porDefecto);
  const activo = locale === env.idiomas.porDefecto ? base : cargar(locale);
  const texto = activo[clave] ?? base[clave] ?? clave;
  return String(texto).replace(/\{(\w+)\}/g, (_, nombre) =>
    Object.prototype.hasOwnProperty.call(variables, nombre)
      ? String(variables[nombre])
      : `{${nombre}}`,
  );
}

/** Atajo: devuelve una función t() atada a un idioma. */
function paraIdioma(locale) {
  const idioma = esIdiomaValido(locale) ? locale : env.idiomas.porDefecto;
  return (clave, variables) => traducir(clave, variables, idioma);
}

/** Nombre de un idioma en su propia lengua (para el selector). */
function nombreIdioma(locale) {
  return traducir(`idioma.${locale}`, {}, locale);
}

module.exports = {
  traducir,
  // Alias corto: t("clave", variables, idioma) para datos fuera de las vistas.
  t: traducir,
  paraIdioma,
  idiomasDisponibles,
  esIdiomaValido,
  nombreIdioma,
};
