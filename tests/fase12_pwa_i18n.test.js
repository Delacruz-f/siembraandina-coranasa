// Pruebas de la PWA y de la internacionalización (Fase 12).
const request = require("supertest");
const fs = require("fs");
const path = require("path");
const { crearApp } = require("../src/app");
const { cerrarConexion } = require("../src/config/db");
const i18n = require("../src/i18n");

const app = crearApp();

afterAll(async () => {
  await cerrarConexion();
});

describe("PWA", () => {
  test("el manifest declara nombre, colores e íconos instalables", async () => {
    const respuesta = await request(app).get("/manifest.webmanifest");
    expect(respuesta.status).toBe(200);
    const manifest = JSON.parse(respuesta.text);
    expect(manifest.name).toBe("Siembra Andina");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toContain("/");
    const tamanos = manifest.icons.map((icono) => icono.sizes);
    expect(tamanos).toContain("192x192");
    expect(tamanos).toContain("512x512");
    expect(manifest.icons.some((icono) => icono.purpose === "maskable")).toBe(
      true,
    );
  });

  test("los íconos existen en disco y son PNG", () => {
    for (const nombre of [
      "icono-192.png",
      "icono-512.png",
      "icono-maskable-512.png",
      "apple-touch-icon.png",
    ]) {
      const ruta = path.join(__dirname, "..", "public", "img", "pwa", nombre);
      const bytes = fs.readFileSync(ruta);
      expect(bytes.subarray(0, 8)).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
    }
  });

  test("el layout enlaza el manifest y registra el service worker", async () => {
    const respuesta = await request(app).get("/");
    expect(respuesta.text).toContain(
      'rel="manifest" href="/manifest.webmanifest"',
    );
    expect(respuesta.text).toContain("/js/pwa.js");
  });

  test("el service worker nunca cachea rutas privadas", () => {
    const sw = fs.readFileSync(
      path.join(__dirname, "..", "public", "sw.js"),
      "utf8",
    );
    expect(sw).toContain("/media/privadas");
    expect(sw).toContain("esPrivada");
    expect(sw).toContain("/sin-conexion");
  });

  test("la página sin conexión responde y ofrece el calendario", async () => {
    const respuesta = await request(app).get("/sin-conexion");
    expect(respuesta.status).toBe(200);
    expect(respuesta.text).toContain("Sin conexión");
    expect(respuesta.text).toContain('href="/calendario"');
  });

  test("el calendario incluye el resumen para el modo offline", async () => {
    const respuesta = await request(app).get("/calendario");
    expect(respuesta.status).toBe(200);
    expect(respuesta.text).toContain('id="datos-calendario"');
  });
});

describe("Internacionalización", () => {
  test("traduce claves en español y en quechua", () => {
    expect(i18n.traducir("nav.calendario", {}, "es")).toBe("Calendario");
    expect(i18n.traducir("nav.calendario", {}, "qu")).toBe("Pacha mit'a");
  });

  test("si falta la clave en quechua usa el español", () => {
    expect(i18n.traducir("motor.ok", {}, "qu")).toBeTruthy();
    expect(i18n.traducir("clave.inexistente", {}, "qu")).toBe(
      "clave.inexistente",
    );
  });

  test("interpola variables en la traducción", () => {
    const texto = i18n.traducir(
      "calendario.actualizado",
      { fecha: "13/11/2026" },
      "es",
    );
    expect(texto).toContain("13/11/2026");
  });

  test("un idioma no soportado cae al idioma por defecto", () => {
    const t = i18n.paraIdioma("fr");
    expect(t("nav.inicio")).toBe("Inicio");
  });

  test("los archivos de traducción tienen las mismas claves principales", () => {
    const es = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, "..", "src", "i18n", "locales", "es.json"),
        "utf8",
      ),
    );
    const qu = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, "..", "src", "i18n", "locales", "qu.json"),
        "utf8",
      ),
    );
    expect(Object.keys(es).length).toBeGreaterThan(50);
    // Todas las claves de navegación y pie deben existir en quechua.
    const obligatorias = Object.keys(es).filter(
      (clave) => clave.startsWith("nav.") || clave.startsWith("pie."),
    );
    // Las claves incluyen puntos, así que se comprueba la pertenencia directa.
    for (const clave of obligatorias) {
      expect(Object.prototype.hasOwnProperty.call(qu, clave)).toBe(true);
    }
  });

  test("el selector cambia el idioma de la interfaz y lo recuerda", async () => {
    const agente = request.agent(app);
    const espanol = await agente.get("/");
    expect(espanol.text).toContain('<html lang="es">');
    expect(espanol.text).toContain("Calendario");

    const quechua = await agente.get("/?idioma=qu");
    expect(quechua.text).toContain('<html lang="qu">');
    expect(quechua.text).toContain("Pacha mit&#39;a");
    expect(quechua.headers["content-language"]).toBe("qu");

    // La cookie mantiene el idioma en la siguiente visita sin parámetro.
    const siguiente = await agente.get("/cultivos");
    expect(siguiente.text).toContain('<html lang="qu">');
  });

  test("un idioma desconocido se ignora y usa el de por defecto", async () => {
    const respuesta = await request(app).get("/?idioma=xx");
    expect(respuesta.text).toContain('<html lang="es">');
  });

  test("Accept-Language elige quechua si el navegador lo pide", async () => {
    const respuesta = await request(app)
      .get("/")
      .set("Accept-Language", "qu-PE,es;q=0.8");
    expect(respuesta.text).toContain('<html lang="qu">');
  });
});
