// Genera los íconos de la PWA (Fase 12) a partir del mismo dibujo del favicon.
// Uso: npm run iconos
// Salida: public/img/pwa/icono-{192,512}.png, icono-maskable-512.png,
//         apple-touch-icon.png y favicon.ico no se toca.
const fs = require("fs/promises");
const path = require("path");
const sharp = require("sharp");

const DESTINO = path.join(__dirname, "..", "public", "img", "pwa");

/** Dibujo vectorial común, con margen configurable (para el ícono maskable). */
function svg({ tamano, margen }) {
  const contenido = tamano - margen * 2;
  const escala = contenido / 64;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tamano}" height="${tamano}" viewBox="0 0 ${tamano} ${tamano}">
  <rect width="${tamano}" height="${tamano}" fill="#3F6B3A"/>
  <g transform="translate(${margen} ${margen}) scale(${escala})">
    <path d="M32 50V28" stroke="#EEF0E9" stroke-width="4" stroke-linecap="round"/>
    <path d="M32 32c-9 0-14-5-14-13 9 0 14 5 14 13z" fill="#8CBF7F"/>
    <path d="M32 38c9 0 14-5 14-13-9 0-14 5-14 13z" fill="#E0A92B"/>
  </g>
</svg>`);
}

async function crear(nombre, tamano, margen = 0) {
  const destino = path.join(DESTINO, nombre);
  await sharp(svg({ tamano, margen }), { density: 384 })
    .png({ compressionLevel: 9 })
    .toFile(destino);
  const { size } = await fs.stat(destino);
  console.log(
    `${nombre} — ${tamano}×${tamano} px, ${Math.round(size / 1024)} KB`,
  );
}

async function principal() {
  await fs.mkdir(DESTINO, { recursive: true });
  await crear("icono-192.png", 192);
  await crear("icono-512.png", 512);
  // Maskable: 20 % de margen seguro para que Android no recorte el dibujo.
  await crear("icono-maskable-512.png", 512, 102);
  await crear("apple-touch-icon.png", 180);
  console.log(`Íconos en ${DESTINO}`);
}

principal().catch((error) => {
  console.error("No se pudieron generar los íconos:", error.message);
  process.exitCode = 1;
});
