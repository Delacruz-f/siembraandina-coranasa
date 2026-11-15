jest.mock("../src/modules/imagenes/imagenes.repository", () => ({
  crear: jest.fn().mockResolvedValue(52),
  buscarPorId: jest.fn().mockResolvedValue(null),
  listarVariantes: jest.fn().mockResolvedValue([]),
}));

const fs = require("fs/promises");
const path = require("path");
const sharp = require("sharp");
const imagenesRepositorio = require("../src/modules/imagenes/imagenes.repository");
const imagenesServicio = require("../src/modules/imagenes/imagenes.service");
const almacenamiento = require("../src/services/almacenamiento");
const env = require("../src/config/env");

const BASE = path.resolve(__dirname, "..", env.subidas.directorio);

async function borrarCarpeta(id) {
  // En Windows sharp mantiene el archivo abierto unos milisegundos tras leerlo.
  const carpeta = path.join(BASE, "privadas", id);
  for (let intento = 0; intento < 20; intento += 1) {
    try {
      await fs.rm(carpeta, { recursive: true, force: true });
      return;
    } catch {
      if (intento === 19) {
        // La limpieza es best-effort: no debe hacer fallar la prueba.
        return;
      }
      await new Promise((resolver) => setTimeout(resolver, 150));
    }
  }
}

/** Crea una imagen JPEG grande con metadatos EXIF y GPS incrustados. */
async function fotoConGps({ ancho = 2400, alto = 1700 } = {}) {
  return sharp({
    create: {
      width: ancho,
      height: alto,
      channels: 3,
      background: { r: 120, g: 160, b: 90 },
    },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="${ancho}" height="${alto}"><rect width="100%" height="100%" fill="#7aa05a"/><circle cx="${ancho / 2}" cy="${alto / 2}" r="${Math.min(ancho, alto) / 3}" fill="#d9a52b"/></svg>`,
        ),
      },
    ])
    .jpeg({ quality: 95 })
    .withMetadata({ orientation: 6 })
    .withExif({ IFD0: { Copyright: "Prueba Siembra Andina" } })
    .withExifMerge({ IFD3: { GPSLatitudeRef: "S", GPSLatitude: "13/1 31/1 0/1" } })
    .toBuffer();
}

describe("Fase 10 — servicio único de imágenes", () => {
  // sharp tarda en procesar imágenes grandes; se amplía el límite por prueba.
  jest.setTimeout(30000);
  test("calcula un recorte cuadrado desde la derecha sin salir de la imagen", () => {
    expect(imagenesServicio.recortar(2000, 1000, "cuadrado", 100, 0)).toEqual({
      left: 1000,
      top: 0,
      width: 1000,
      height: 1000,
    });
  });

  test("limita el ajuste vertical al área recortable", () => {
    const recorte = imagenesServicio.recortar(1000, 2000, "horizontal", 50, 100);
    expect(recorte.left).toBe(0);
    expect(recorte.top + recorte.height).toBe(2000);
    expect(recorte.width / recorte.height).toBeCloseTo(16 / 9, 2);
  });

  test("no recorta el original y limita posiciones fuera de rango", () => {
    expect(imagenesServicio.recortar(1000, 500, "original")).toBeNull();
    expect(imagenesServicio.recortar(1000, 500, "cuadrado", -10, 200)).toEqual({
      left: 0,
      top: 0,
      width: 500,
      height: 500,
    });
  });

  test("genera tres tamaños WebP y JPG, sin EXIF ni GPS, con UUID", async () => {
    const buffer = await fotoConGps();
    const original = await sharp(buffer).metadata();
    expect(original.exif).toBeDefined();

    const resultado = await imagenesServicio.procesarSubida(
      { buffer, mimetype: "image/jpeg", originalname: "foto-celular.jpg" },
      12,
      "Parcela con surcos de papa",
    );
    try {
      expect(resultado.variantes.map((v) => v.ancho)).toEqual([400, 800, 1600]);
      expect(imagenesRepositorio.crear).toHaveBeenCalledTimes(1);
      const llamada = imagenesRepositorio.crear.mock.calls[0][0];
      // Renombrado con UUID y guardado fuera de public/.
      expect(llamada.archivo.ruta).toMatch(
        /^privadas\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//,
      );
      expect(llamada.archivo.ruta.startsWith("public/")).toBe(false);
      expect(llamada.archivo.texto_alternativo).toBe("Parcela con surcos de papa");
      expect(llamada.variantes).toHaveLength(3);

      for (const variante of llamada.variantes) {
        const webp = path.join(BASE, variante.ruta_webp);
        const jpg = path.join(BASE, variante.ruta_jpg);
        const metaWebp = await sharp(webp).metadata();
        const metaJpg = await sharp(jpg).metadata();
        expect(metaWebp.format).toBe("webp");
        expect(metaJpg.format).toBe("jpeg");
        // La orientación EXIF se aplica (foto 2400x1700 girada => 1700 de ancho)
        // y se elimina: ni EXIF ni GPS viajan al archivo guardado.
        expect(metaWebp.exif).toBeUndefined();
        expect(metaJpg.exif).toBeUndefined();
        expect(metaWebp.orientation).toBeUndefined();
        expect(metaJpg.orientation).toBeUndefined();
        expect(variante.ancho_px).toBeLessThanOrEqual(variante.ancho);
      }

      const absoluta = path.join(BASE, resultado.ruta);
      const guardado = await fs.readFile(absoluta);
      // Se comprueba sobre los bytes: no queda ni exif ni el bloque GPS.
      expect(guardado.includes(Buffer.from("GPSLatitude"))).toBe(false);
      expect(guardado.includes(Buffer.from("13/1 31/1"))).toBe(false);
      const metadatosGuardado = await sharp(absoluta).metadata();
      expect(metadatosGuardado.exif).toBeUndefined();

      // La variante de 1600 debe estar limitada a 1600 px de ancho.
      const mayor = llamada.variantes[2];
      expect(mayor.ancho_px).toBeLessThanOrEqual(1600);
    } finally {
      await borrarCarpeta(path.basename(path.dirname(resultado.ruta)));
    }
  });

  test("reduce una foto de 8 MB a variantes mucho más ligeras", async () => {
    const buffer = await fotoConGps({ ancho: 4000, alto: 3000 });
    expect(buffer.length).toBeGreaterThan(50 * 1024);
    const resultado = await imagenesServicio.procesarSubida(
      { buffer, mimetype: "image/jpeg", originalname: "grande.jpg" },
      12,
      "Vista general del terreno",
    );
    try {
      const llamada = imagenesRepositorio.crear.mock.calls.at(-1)[0];
      for (const variante of llamada.variantes) {
        expect(variante.tamano_webp).toBeLessThan(buffer.length);
        expect(variante.tamano_jpg).toBeLessThan(buffer.length);
      }
    } finally {
      await borrarCarpeta(path.basename(path.dirname(resultado.ruta)));
    }
  });

  test("exige tipo real por contenido y no por la extensión declarada", async () => {
    const falso = Buffer.from("no soy una imagen");
    await expect(
      imagenesServicio.procesarSubida(
        { buffer: falso, mimetype: "image/png", originalname: "falsa.png" },
        12,
        "Archivo falso",
      ),
    ).rejects.toMatchObject({ estado: 400, codigo: "solicitud_invalida" });
  });

  test("exige autor y licencia para imágenes públicas", async () => {
    const buffer = await fotoConGps({ ancho: 600, alto: 400 });
    await expect(
      imagenesServicio.procesarSubida(
        { buffer, mimetype: "image/jpeg", originalname: "publica.jpg" },
        12,
        "Papa nativa",
        { publica: true },
      ),
    ).rejects.toMatchObject({ codigo: "autor_obligatorio" });
  });

  test("describe genera srcset por tamaño y avisa de baja resolución", () => {
    const datos = imagenesServicio.describe({
      id: 7,
      texto_alternativo: "Surcos",
      ancho: 300,
      alto: 200,
      variantes: [
        {
          ancho: 400,
          ancho_px: 300,
          alto_px: 200,
          ruta_webp: "privadas/7/400.webp",
          ruta_jpg: "privadas/7/400.jpg",
        },
      ],
    });
    expect(datos.variantes[0].webp).toBe("/media/privadas/7/400");
    expect(datos.variantes[0].jpg).toBe("/media/privadas/7/400?formato=jpg");
    expect(datos.bajaResolucion).toBe(true);
    expect(datos.proporcion).toBe("300 / 200");
  });

  test("el adaptador local no expone URLs públicas", () => {
    expect(almacenamiento.urlPublica("privadas/1/400.webp")).toBeNull();
    expect(almacenamiento.nombre).toBe("local");
  });
});
