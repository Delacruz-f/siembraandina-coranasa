// Pruebas de la Fase 1: arranque de la app, salud, 404 y seguridad básica.
const request = require("supertest");
const { crearApp } = require("../src/app");
const { cerrarConexion } = require("../src/config/db");

const app = crearApp();

afterAll(async () => {
  await cerrarConexion();
});

describe("Página de inicio", () => {
  test("responde 200 y muestra el nombre de la plataforma", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Siembra Andina");
    expect(res.text).toContain("papa, maíz y quinua");
  });

  test("incluye cabeceras de seguridad de helmet", async () => {
    const res = await request(app).get("/");
    expect(res.headers["content-security-policy"]).toBeDefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});

describe("Ruta de salud", () => {
  test("GET /salud/vivo responde JSON sin tocar la base de datos", async () => {
    const res = await request(app).get("/salud/vivo");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, estado: "vivo" });
  });

  test("GET /salud responde JSON con el estado de la base de datos", async () => {
    const res = await request(app).get("/salud");
    expect([200, 503]).toContain(res.status);
    expect(res.body.servicio).toBe("siembra-andina");
    expect(res.body.baseDeDatos).toBeDefined();
    expect(["conectada", "sin_conexion"]).toContain(
      res.body.baseDeDatos.estado,
    );
    if (res.status === 200) expect(res.body.ok).toBe(true);
  });
});

describe("Errores", () => {
  test("una ruta inexistente devuelve 404 en HTML en español", async () => {
    const res = await request(app).get("/no-existe");
    expect(res.status).toBe(404);
    expect(res.text).toContain("No encontramos esta página");
  });

  test("una ruta /api inexistente devuelve 404 en JSON", async () => {
    const res = await request(app).get("/api/no-existe");
    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.codigo).toBe("ruta_no_encontrada");
  });

  test("un POST sin token CSRF devuelve 403", async () => {
    const res = await request(app).post("/salir").type("form").send({});
    expect(res.status).toBe(403);
    expect(res.text).toContain("No tienes permiso");
  });
});
