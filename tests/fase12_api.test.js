// Pruebas de la API v1 y de los tokens personales (Fase 12).
jest.mock("../src/modules/auth/correo.service", () => ({
  enviar: jest.fn().mockResolvedValue({ messageId: "correo-de-prueba" }),
  validarConfiguracion: jest.fn(),
}));

const request = require("supertest");
const { crearApp } = require("../src/app");
const { db, cerrarConexion } = require("../src/config/db");
const { crearUsuario, iniciarSesion, tokenCsrf } = require("./ayudas");
const tokensService = require("../src/modules/api/tokens.service");
const { especificacion } = require("../src/modules/api/openapi");

jest.setTimeout(20000);

const app = crearApp();
const sufijo = Date.now();
const cuenta = {
  nombre: "API Agricultora",
  email: `api.${sufijo}@prueba.pe`,
  password: "clave-segura-123",
  rol: "agricultor",
};
let idUsuario;
let idParcela;

beforeAll(async () => {
  idUsuario = (await crearUsuario(cuenta)).id;
  // Parcela con campaña y una lectura para poder calcular la recomendación.
  const cultivo = await db("cultivos").first();
  const zona = await db("zonas_altitudinales").first();
  const distrito = await db("distritos").first();
  const estado = await db("estados_campania")
    .where({ clave: "activa" })
    .first();
  const [parcelaId] = await db("parcelas").insert({
    usuario_id: idUsuario,
    zona_id: zona.id,
    distrito_id: distrito.id,
    nombre: `Parcela API ${sufijo}`,
    latitud: -13.5,
    longitud: -72.1,
    altitud_m: 3500,
    activa: true,
  });
  idParcela = parcelaId;
  await db("campanias").insert({
    parcela_id: parcelaId,
    cultivo_id: cultivo.id,
    estado_id: estado.id,
  });
  const fuente = await db("fuentes_datos").where({ clave: "manual" }).first();
  await db("lecturas").insert({
    parcela_id: parcelaId,
    fecha: new Date().toISOString().slice(0, 10),
    humedad: 26,
    temperatura: 13,
    fuente_id: fuente.id,
    registrado_por: idUsuario,
  });
});

afterAll(async () => {
  await db("usuarios").where({ id: idUsuario }).del();
  await cerrarConexion();
});

describe("API v1 pública", () => {
  test("la raíz informa la versión y dónde está la documentación", async () => {
    const respuesta = await request(app).get("/api/v1");
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.api).toBe("1");
    expect(respuesta.body.datos.documentacion).toBe("/api/docs");
  });

  test("lista los cultivos activos", async () => {
    const respuesta = await request(app).get("/api/v1/cultivos");
    expect(respuesta.status).toBe(200);
    expect(Array.isArray(respuesta.body.datos)).toBe(true);
    expect(respuesta.body.datos.length).toBeGreaterThan(0);
  });

  test("la ficha de un cultivo incluye variedades, rangos y calendario", async () => {
    const respuesta = await request(app).get("/api/v1/cultivos/papa");
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos).toHaveProperty("requerimientos");
    expect(respuesta.body.datos).toHaveProperty("calendario");
  });

  test("un cultivo inexistente devuelve 404 en JSON", async () => {
    const respuesta = await request(app).get("/api/v1/cultivos/no-existe");
    expect(respuesta.status).toBe(404);
    expect(respuesta.body.ok).toBe(false);
  });

  test("el calendario acepta filtros y devuelve recomendaciones", async () => {
    const respuesta = await request(app).get("/api/v1/calendario?cultivo=papa");
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos).toHaveProperty("calendario");
    expect(Array.isArray(respuesta.body.datos.recomendaciones)).toBe(true);
    expect(respuesta.body.datos.generado_en).toMatch(/Z$/);
  });

  test("un filtro de calendario inválido se rechaza con 400", async () => {
    const respuesta = await request(app).get(
      "/api/v1/calendario?cultivo=Malo Con Espacios",
    );
    expect(respuesta.status).toBe(400);
  });

  test("lista artículos y permite ver el detalle de uno publicado", async () => {
    const lista = await request(app).get("/api/v1/articulos");
    expect(lista.status).toBe(200);
    const primero = lista.body.datos[0];
    expect(primero).toHaveProperty("slug");
    const detalle = await request(app).get(`/api/v1/articulos/${primero.slug}`);
    expect(detalle.status).toBe(200);
    expect(detalle.body.datos).toHaveProperty("contenido_html");
  });

  test("lista comunidades con coordenadas numéricas", async () => {
    const respuesta = await request(app).get("/api/v1/comunidades");
    expect(respuesta.status).toBe(200);
    expect(Array.isArray(respuesta.body.datos)).toBe(true);
  });

  test("la especificación OpenAPI es válida y declara los endpoints", () => {
    const doc = especificacion({});
    expect(doc.openapi).toBe("3.0.3");
    expect(Object.keys(doc.paths)).toContain("/parcelas/{id}/recomendacion");
    expect(doc.components.securitySchemes.tokenPersonal.scheme).toBe("bearer");
    const respuesta = request(app).get("/api/v1/openapi.json");
    return expect(respuesta).resolves.toMatchObject({ status: 200 });
  });

  test("/api/docs sirve la documentación interactiva", async () => {
    const pagina = await request(app).get("/api/docs");
    expect(pagina.status).toBe(200);
    expect(pagina.text).toContain("swagger-ui");
    const css = await request(app).get("/api/docs/swagger-ui.css");
    expect(css.status).toBe(200);
  });
});

describe("Tokens personales", () => {
  test("crear un token lo muestra una sola vez y guarda solo el hash", async () => {
    const agente = await iniciarSesion(app, cuenta);
    const token = await tokenCsrf(agente, "/perfil");
    const respuesta = await agente
      .post("/perfil/tokens")
      .type("form")
      .send({ nombre: "App Android", _csrf: token });
    expect(respuesta.status).toBe(201);
    expect(respuesta.text).toContain("saa_");

    const fila = await db("tokens_api")
      .where({ usuario_id: idUsuario })
      .orderBy("id", "desc")
      .first();
    expect(fila.token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(fila.nombre).toBe("App Android");
  });

  test("la página del perfil no vuelve a mostrar el token en claro", async () => {
    const agente = await iniciarSesion(app, cuenta);
    const pagina = await agente.get("/perfil");
    expect(pagina.status).toBe(200);
    expect(pagina.text).not.toMatch(/saa_[A-Za-z0-9_-]{20,}/);
    expect(pagina.text).toContain("Acceso a la API");
  });

  test("un nombre de token demasiado corto se rechaza", async () => {
    const agente = await iniciarSesion(app, cuenta);
    const token = await tokenCsrf(agente, "/perfil");
    const respuesta = await agente
      .post("/perfil/tokens")
      .type("form")
      .send({ nombre: "ab", _csrf: token });
    expect(respuesta.status).toBe(400);
  });

  test("autenticar con un token válido devuelve el usuario", async () => {
    const creado = await tokensService.crear(idUsuario, {
      nombre: "Prueba unitaria",
    });
    const sesion = await tokensService.autenticar(`Bearer ${creado.token}`);
    expect(sesion).toMatchObject({ id: idUsuario });
    expect(sesion.roles).toContain("agricultor");
  });

  test("un token con formato incorrecto no autentica", async () => {
    await expect(tokensService.autenticar("Bearer abc")).resolves.toBeNull();
    await expect(tokensService.autenticar(undefined)).resolves.toBeNull();
    await expect(tokensService.autenticar("Basic x")).resolves.toBeNull();
  });

  test("revocar un token lo desactiva de inmediato", async () => {
    const creado = await tokensService.crear(idUsuario, {
      nombre: "A revocar",
    });
    await tokensService.revocar(creado.id, idUsuario);
    await expect(
      tokensService.autenticar(`Bearer ${creado.token}`),
    ).resolves.toBeNull();
  });
});

describe("Recomendación personal", () => {
  test("sin token la respuesta es 401 en JSON", async () => {
    const respuesta = await request(app).get(
      `/api/v1/parcelas/${idParcela}/recomendacion`,
    );
    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe("token_api_invalido");
  });

  test("con token devuelve la recomendación de la parcela propia", async () => {
    const creado = await tokensService.crear(idUsuario, { nombre: "Móvil" });
    const respuesta = await request(app)
      .get(`/api/v1/parcelas/${idParcela}/recomendacion`)
      .set("Authorization", `Bearer ${creado.token}`);
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.recomendacion.codigo).toMatch(
      /^(ok|mid|bad|none)$/,
    );
    expect(respuesta.body.datos.lectura.humedad).toBe(26);
  });

  test("una parcela ajena devuelve 404 con el token de otro usuario", async () => {
    const otra = await crearUsuario({
      nombre: "Otra API",
      email: `otra.${sufijo}@prueba.pe`,
      rol: "agricultor",
    });
    const creado = await tokensService.crear(otra.id, { nombre: "Otra app" });
    const respuesta = await request(app)
      .get(`/api/v1/parcelas/${idParcela}/recomendacion`)
      .set("Authorization", `Bearer ${creado.token}`);
    expect(respuesta.status).toBe(404);
    await db("tokens_api").where({ usuario_id: otra.id }).del();
    await db("usuarios").where({ id: otra.id }).del();
  });
});
