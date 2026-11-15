jest.mock("../src/modules/auth/correo.service", () => ({
  enviar: jest.fn().mockResolvedValue({ messageId: "correo-de-prueba" }),
  validarConfiguracion: jest.fn(),
}));

const request = require("supertest");
const bcrypt = require("bcryptjs");
const { crearApp } = require("../src/app");
const { db, cerrarConexion } = require("../src/config/db");
const { crearUsuario, extraerCsrf, iniciarSesion } = require("./ayudas");

const app = crearApp();
const sufijo = Date.now();
const usuariosCreados = [];

afterAll(async () => {
  if (usuariosCreados.length) {
    await db("usuarios")
      .whereIn(
        "email",
        usuariosCreados.map((usuario) => usuario.email),
      )
      .del();
  }
  await cerrarConexion();
});

// Cinco ingresos con bcrypt real superan los 5 s cuando la suite completa
// compite por CPU; se da más margen a todo el archivo.
jest.setTimeout(30000);

describe("Recuperación y bloqueo de acceso", () => {
  test("restablece la contraseña con token de un uso válido por una hora", async () => {
    const usuario = await crearUsuario({
      nombre: "Recuperación",
      email: `recuperacion.${sufijo}@prueba.pe`,
    });
    usuariosCreados.push(usuario);

    const agente = request.agent(app);
    const pagina = await agente.get("/recuperar");
    const solicitud = await agente
      .post("/recuperar")
      .type("form")
      .send({
        email: usuario.email,
        _csrf: extraerCsrf(pagina.text),
      });
    expect(solicitud.status).toBe(302);

    const correo = require("../src/modules/auth/correo.service").enviar.mock
      .calls[0][0];
    const enlace = /https?:\/\/\S+/.exec(correo.texto)[0];
    const ruta = new URL(enlace).pathname;
    const formulario = await agente.get(ruta);
    expect(formulario.status).toBe(200);
    const token = ruta.split("/").pop();
    const resultado = await agente
      .post(ruta)
      .type("form")
      .send({
        password: "nueva-clave-segura-123",
        confirmar: "nueva-clave-segura-123",
        _csrf: extraerCsrf(formulario.text),
      });
    expect(resultado.status).toBe(302);

    const registroToken = await db("tokens_recuperacion")
      .where({ usuario_id: usuario.id })
      .first();
    expect(registroToken.usado_en).not.toBeNull();
    const reuso = await agente.get(`/restablecer/${token}`);
    expect(reuso.status).toBe(302);
    expect(reuso.headers.location).toBe("/recuperar");

    const hashActualizado = await db("usuarios")
      .where({ id: usuario.id })
      .first("password_hash");
    expect(bcrypt.getRounds(hashActualizado.password_hash)).toBe(12);

    const ingreso = await iniciarSesion(app, {
      email: usuario.email,
      password: "nueva-clave-segura-123",
    });
    expect(ingreso).toBeDefined();
  });

  test("bloquea quince minutos tras cinco contraseñas incorrectas", async () => {
    const usuario = await crearUsuario({
      nombre: "Bloqueo",
      email: `bloqueo.${sufijo}@prueba.pe`,
    });
    usuariosCreados.push(usuario);

    const agente = request.agent(app);
    const pagina = await agente.get("/ingresar");
    const csrf = extraerCsrf(pagina.text);
    for (let intento = 0; intento < 5; intento += 1) {
      const respuesta = await agente.post("/ingresar").type("form").send({
        email: usuario.email,
        password: "incorrecta",
        _csrf: csrf,
      });
      expect(respuesta.status).toBe(401);
    }

    const bloqueado = await db("usuarios")
      .where({ id: usuario.id })
      .first("fallos_ingreso", "bloqueado_hasta");
    expect(Number(bloqueado.fallos_ingreso)).toBe(0);
    expect(new Date(bloqueado.bloqueado_hasta).getTime()).toBeGreaterThan(
      Date.now(),
    );

    const intentoCorrecto = await agente.post("/ingresar").type("form").send({
      email: usuario.email,
      password: usuario.password,
      _csrf: csrf,
    });
    expect(intentoCorrecto.status).toBe(401);
  });

  test("una cuenta con dos roles muestra y puede abrir ambos paneles", async () => {
    const usuario = await crearUsuario({
      nombre: "Cuenta con dos roles",
      email: `multirole.${sufijo}@prueba.pe`,
    });
    usuariosCreados.push(usuario);
    const rolTecnico = await db("roles").where({ clave: "tecnico" }).first();
    await db("usuario_roles").insert({
      usuario_id: usuario.id,
      rol_id: rolTecnico.id,
      es_principal: false,
    });

    const agente = await iniciarSesion(app, usuario);
    const panelAgricultor = await agente.get("/panel");
    expect(panelAgricultor.status).toBe(200);
    expect(panelAgricultor.text).toContain('href="/panel"');
    expect(panelAgricultor.text).toContain('href="/tecnico"');

    const panelTecnico = await agente.get("/tecnico");
    expect(panelTecnico.status).toBe(200);
    expect(panelTecnico.text).toContain("Técnico");

    const hash = await db("usuarios")
      .where({ id: usuario.id })
      .first("password_hash");
    expect(bcrypt.getRounds(hash.password_hash)).toBe(12);
  });
});
