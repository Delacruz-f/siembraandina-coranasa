// Pruebas de integración de la Fase 10 (imágenes centralizadas).
// Requieren la base de datos migrada y con seeds.
// Cubren los criterios de aceptación:
//  - una foto grande se reduce y se sirve rápido por una ruta controlada,
//  - el archivo guardado no conserva coordenadas GPS,
//  - un usuario no puede abrir la imagen privada de otro.
jest.mock("../src/modules/auth/correo.service", () => ({
  enviar: jest.fn().mockResolvedValue({ messageId: "correo-de-prueba" }),
  validarConfiguracion: jest.fn(),
}));

const fs = require("fs/promises");
const path = require("path");
const sharp = require("sharp");
const request = require("supertest");
const { crearApp } = require("../src/app");
const { db, cerrarConexion } = require("../src/config/db");
const env = require("../src/config/env");
const almacenamiento = require("../src/services/almacenamiento");
const imagenesServicio = require("../src/modules/imagenes/imagenes.service");
const { limpiarHuerfanos } = require("../src/jobs/limpiezaImagenes.service");
const { crearUsuario, iniciarSesion, tokenCsrf } = require("./ayudas");

jest.setTimeout(30000);

const app = crearApp();
const BASE = path.resolve(__dirname, "..", env.subidas.directorio);
const sufijo = Date.now();

const duena = {
  nombre: "Dueña de parcela",
  email: `duena.${sufijo}@prueba.pe`,
  password: "clave-segura-123",
};
const ajena = {
  nombre: "Usuario ajeno",
  email: `ajena.${sufijo}@prueba.pe`,
  password: "clave-segura-123",
};

let idDuena;
let idAjena;
let archivoId;
let carpetaImagen;
let rutaRelativa;

async function fotoGrande() {
  const svg = `<svg width="3200" height="2400"><rect width="100%" height="100%" fill="#6f8f5a"/><circle cx="1600" cy="1200" r="700" fill="#d9a52b"/></svg>`;
  return sharp({
    create: { width: 3200, height: 2400, channels: 3, background: "#6f8f5a" },
  })
    .composite([{ input: Buffer.from(svg) }])
    .jpeg({ quality: 96 })
    .withMetadata({ orientation: 1 })
    .withExifMerge({
      IFD3: { GPSLatitudeRef: "S", GPSLatitude: "13/1 31/1 0/1" },
    })
    .toBuffer();
}

async function borrarCarpetaImagen() {
  for (let intento = 0; intento < 20; intento += 1) {
    try {
      await fs.rm(carpetaImagen, { recursive: true, force: true });
      return;
    } catch {
      if (intento === 19) return;
      await new Promise((resolver) => setTimeout(resolver, 150));
    }
  }
}

beforeAll(async () => {
  idDuena = (await crearUsuario({ ...duena, rol: "agricultor" })).id;
  idAjena = (await crearUsuario({ ...ajena, rol: "agricultor" })).id;
});

afterAll(async () => {
  if (archivoId) {
    await db("archivos")
      .where({ id: archivoId })
      .del()
      .catch(() => {});
  }
  if (carpetaImagen) await borrarCarpetaImagen();
  await db("usuarios").whereIn("id", [idDuena, idAjena]).del();
  await cerrarConexion();
});

describe("Fase 10 — imágenes centralizadas", () => {
  test("sube una foto grande desde el perfil y la guarda sin GPS", async () => {
    const agente = await iniciarSesion(app, duena);
    const token = await tokenCsrf(agente, "/perfil");
    const imagen = await fotoGrande();

    const respuesta = await agente
      .post("/perfil/foto")
      .set("x-csrf-token", token)
      .field("_csrf", token)
      .attach("foto", imagen, {
        filename: "celular.jpg",
        contentType: "image/jpeg",
      });
    expect(respuesta.status).toBe(302);

    const perfil = await db("perfiles").where({ usuario_id: idDuena }).first();
    expect(perfil.foto_archivo_id).toBeTruthy();
    archivoId = perfil.foto_archivo_id;

    const archivo = await db("archivos").where({ id: archivoId }).first();
    expect(archivo.es_publica).toBeFalsy();
    expect(archivo.texto_alternativo).toMatch(/^Foto de perfil de /);
    // Guardado fuera de public/ y con nombre UUID.
    expect(archivo.ruta).toMatch(/^privadas\/[0-9a-f-]{36}\/1600\.webp$/);
    rutaRelativa = archivo.ruta;
    carpetaImagen = path.join(BASE, "privadas", archivo.ruta.split("/")[1]);

    const variantes = await db("imagen_variantes")
      .where({ archivo_id: archivoId })
      .orderBy("ancho");
    expect(variantes.map((v) => Number(v.ancho))).toEqual([400, 800, 1600]);

    // Ningún archivo guardado contiene la ubicación GPS.
    for (const variante of variantes) {
      for (const clave of [variante.ruta_webp, variante.ruta_jpg]) {
        const bytes = await almacenamiento.leer(clave);
        expect(bytes.includes(Buffer.from("13/1 31/1"))).toBe(false);
        const meta = await sharp(bytes).metadata();
        expect(meta.exif).toBeUndefined();
      }
    }

    // Una foto de varios megas queda muy por debajo en cada variante.
    const mayor = variantes[variantes.length - 1];
    expect(Number(mayor.tamano_webp)).toBeLessThan(imagen.length);
    expect(Number(mayor.tamano_webp)).toBeLessThan(600 * 1024);
  });

  test("la dueña ve su imagen privada en varios tamaños", async () => {
    const agente = await iniciarSesion(app, duena);
    const cuadrada = await agente.get(`/media/privadas/${archivoId}/400`);
    expect(cuadrada.status).toBe(200);
    expect(cuadrada.headers["content-type"]).toContain("image/webp");
    expect(cuadrada.headers["cache-control"]).toContain("private");

    const jpg = await agente.get(
      `/media/privadas/${archivoId}/800?formato=jpg`,
    );
    expect(jpg.status).toBe(200);
    expect(jpg.headers["content-type"]).toContain("image/jpeg");

    const redireccion = await agente.get(`/archivos/${archivoId}/vista`);
    expect(redireccion.status).toBe(302);
    expect(redireccion.headers.location).toBe(
      `/media/privadas/${archivoId}/800`,
    );
  });

  test("otro usuario no puede abrir la imagen privada ajena", async () => {
    const agente = await iniciarSesion(app, ajena);
    expect((await agente.get(`/media/privadas/${archivoId}/400`)).status).toBe(
      404,
    );
    expect(
      (await agente.get(`/media/privadas/${archivoId}/800?formato=jpg`)).status,
    ).toBe(404);
    expect((await agente.get(`/media/imagenes/${archivoId}/800`)).status).toBe(
      404,
    );
    expect((await agente.get(`/archivos/${archivoId}/vista`)).status).toBe(404);
  });

  test("sin sesión no se sirve ninguna imagen privada", async () => {
    const anonimo = request(app);
    expect((await anonimo.get(`/media/privadas/${archivoId}/400`)).status).toBe(
      401,
    );
    expect((await anonimo.get(`/media/imagenes/${archivoId}/400`)).status).toBe(
      404,
    );
  });

  test("rechaza contenido que no es una imagen aunque la extensión lo diga", async () => {
    const agente = await iniciarSesion(app, duena);
    const token = await tokenCsrf(agente, "/perfil");
    const respuesta = await agente
      .post("/perfil/foto")
      .set("x-csrf-token", token)
      .field("_csrf", token)
      .attach("foto", Buffer.from("esto no es una imagen"), {
        filename: "falsa.jpg",
        contentType: "image/jpeg",
      });
    expect(respuesta.status).toBe(400);
  });

  test("la tarea de limpieza borra binarios sin registro", async () => {
    const huerfano = "privadas/999999999/400.webp";
    await almacenamiento.guardar(huerfano, Buffer.from("basura"));
    expect(await almacenamiento.existe(huerfano)).toBe(true);

    const resumen = await limpiarHuerfanos();
    expect(resumen.errores).toBe(0);
    expect(await almacenamiento.existe(huerfano)).toBe(false);
    // La imagen legítima no se toca.
    expect(await almacenamiento.existe(rutaRelativa)).toBe(true);
  });

  test("describe la imagen con srcset y proporción reservada", async () => {
    const detalle = await imagenesServicio.obtenerDetalle(archivoId);
    const datos = imagenesServicio.describe(detalle);
    expect(datos.variantes).toHaveLength(3);
    expect(datos.variantes[0].webp).toBe(`/media/privadas/${archivoId}/400`);
    expect(datos.variantes[2].webp).toBe(`/media/privadas/${archivoId}/1600`);
    expect(datos.proporcion).toMatch(/^\d+ \/ \d+$/);
    expect(datos.bajaResolucion).toBe(false);
  });
});
