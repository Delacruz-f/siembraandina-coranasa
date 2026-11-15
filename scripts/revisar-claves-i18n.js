// Script temporal: compara las claves t('...') usadas con es.json.
const fs = require("fs");
const ruta = require("path").join(
  __dirname,
  "..",
  "src",
  "i18n",
  "locales",
  "es.json",
);
const es = JSON.parse(fs.readFileSync(ruta, "utf8"));
// Repara el carácter roto de qu.json y añade la clave nueva.
const rutaQu = require("path").join(
  __dirname,
  "..",
  "src",
  "i18n",
  "locales",
  "qu.json",
);
if (process.argv.includes("--reparar-qu")) {
  let textoQu = fs.readFileSync(rutaQu, "utf8");
  textoQu = textoQu.replace(
    /"calendario\.punto\.mapaAccesible": "[^"]*",/,
    '"calendario.punto.mapaAccesible": "Mapa del Perú para elegir un punto",\n  "calendario.punto.mapaError": "No pudimos cargar el mapa. Usa el buscador o las coordenadas manuales.",',
  );
  fs.writeFileSync(rutaQu, textoQu, "utf8");
  const qu = JSON.parse(fs.readFileSync(rutaQu, "utf8"));
  console.log("qu reparado:", qu["calendario.punto.mapaError"]);
  const faltanQu = Object.keys(es).filter((clave) => !(clave in qu));
  console.log("faltan en qu:", faltanQu.length ? faltanQu.join(", ") : "ninguna");
  const sobranQu = Object.keys(qu).filter((clave) => !(clave in es));
  console.log("sobran en qu:", sobranQu.length ? sobranQu.join(", ") : "ninguna");
}
const archivos = [
  "views/publico/calendario.ejs",
  "src/modules/publico/publico.controller.js",
  "src/modules/publico/publico.service.js",
  "src/modules/publico/publico.routes.js",
];
const usadas = new Set();
for (const archivo of archivos) {
  const texto = fs.readFileSync(
    require("path").join(__dirname, "..", archivo),
    "utf8",
  );
  for (const coincidencia of texto.matchAll(/\bt\(\s*["']([\w.]+)["']/g)) {
    usadas.add(coincidencia[1]);
  }
}
const faltan = [...usadas].filter((clave) => !(clave in es));
console.log("claves usadas:", usadas.size);
console.log("faltan:", faltan.length ? faltan.join(", ") : "ninguna");
