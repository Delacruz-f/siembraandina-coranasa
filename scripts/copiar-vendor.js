const fs = require("fs");
const path = require("path");

const raiz = path.resolve(__dirname, "..");
const recursos = [
  {
    origen: path.join(raiz, "node_modules", "leaflet", "dist"),
    destino: path.join(raiz, "public", "vendor", "leaflet"),
  },
  {
    origen: path.join(raiz, "node_modules", "chart.js", "dist"),
    destino: path.join(raiz, "public", "vendor", "chartjs"),
  },
];

for (const recurso of recursos) {
  fs.cpSync(recurso.origen, recurso.destino, {
    recursive: true,
    force: true,
  });
}

console.info("Recursos estáticos de Leaflet y Chart.js copiados.");
