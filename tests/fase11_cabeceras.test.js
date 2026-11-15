// Pruebas de cabeceras de seguridad (Fase 11).
// No necesitan base de datos: /salud/vivo responde sin consultar nada.
const request = require("supertest");
const { crearApp } = require("../src/app");

const app = crearApp();

describe("Cabeceras de seguridad", () => {
  let respuesta;

  beforeAll(async () => {
    respuesta = await request(app).get("/salud/vivo");
  });

  test("la respuesta llega con CSP estricta", () => {
    const csp = respuesta.headers["content-security-policy"];
    expect(csp).toBeDefined();
    // Scripts solo del propio origen: ni inline ni eval.
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("default-src 'self'");
  });

  test("se desactiva MIME sniffing y se niega el encuadre", () => {
    expect(respuesta.headers["x-content-type-options"]).toBe("nosniff");
    expect(respuesta.headers["x-frame-options"]).toBe("DENY");
    expect(respuesta.headers["referrer-policy"]).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(respuesta.headers["cross-origin-resource-policy"]).toBe(
      "same-origin",
    );
  });

  test("Permissions-Policy limita cámara, micrófono y pagos", () => {
    const politica = respuesta.headers["permissions-policy"];
    expect(politica).toContain("camera=()");
    expect(politica).toContain("microphone=()");
    expect(politica).toContain("payment=()");
  });

  test("no se revela que el servidor usa Express", () => {
    expect(respuesta.headers["x-powered-by"]).toBeUndefined();
  });

  test("no se activa HSTS fuera de producción", () => {
    // En pruebas/preproducción el sitio puede servirse por HTTP local.
    expect(respuesta.headers["strict-transport-security"]).toBeUndefined();
  });
});
