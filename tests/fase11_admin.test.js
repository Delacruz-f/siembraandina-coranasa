// Pruebas de integración del panel de administración (Fase 11).
// Recorren catálogos, configuración, auditoría, contacto y trabajos.
jest.mock("../src/modules/auth/correo.service", () => ({
  enviar: jest.fn().mockResolvedValue({ messageId: "correo-de-prueba" }),
  validarConfiguracion: jest.fn(),
}));

const { crearApp } = require("../src/app");
const { db, cerrarConexion } = require("../src/config/db");
const { crearUsuario, iniciarSesion, extraerCsrf } = require("./ayudas");

jest.setTimeout(20000);

const app = crearApp();
const sufijo = Date.now();
const admin = {
  nombre: "Admin Catálogos",
  email: `adminc.${sufijo}@prueba.pe`,
  password: "clave-segura-123",
  rol: "administrador",
};
let idAdmin;
let idUsuarioRol;

beforeAll(async () => {
  idAdmin = (await crearUsuario(admin)).id;
});

afterAll(async () => {
  await db("variedades").where("slug", "like", `demo-${sufijo}%`).del();
  if (idUsuarioRol) await db("usuarios").where({ id: idUsuarioRol }).del();
  await db("usuarios").where({ id: idAdmin }).del();
  await cerrarConexion();
});

describe("Panel de administración", () => {
  test("crea una variedad con slug válido y rechaza un slug inválido", async () => {
    const agente = await iniciarSesion(app, admin);
    const pagina = await agente.get("/admin/catalogos?tipo=variedad");
    expect(pagina.status).toBe(200);
    const token = extraerCsrf(pagina.text);

    const valida = await agente
      .post("/admin/catalogos/variedad")
      .type("form")
      .send({
        nombre: `Variedad ${sufijo}`,
        slug: `demo-${sufijo}`,
        descripcion: "Variedad creada por la prueba de integración.",
        activa: "1",
        _csrf: token,
      });
    expect(valida.status).toBe(302);
    expect(
      await db("variedades")
        .where({ slug: `demo-${sufijo}` })
        .first(),
    ).toBeTruthy();

    const invalida = await agente
      .post("/admin/catalogos/variedad")
      .type("form")
      .send({
        nombre: "Slug malo",
        slug: "Con Mayúsculas Y Espacios",
        _csrf: token,
      });
    expect(invalida.status).toBe(400);
  });

  test("rechaza un rango de humedad invertido", async () => {
    const agente = await iniciarSesion(app, admin);
    const pagina = await agente.get("/admin/catalogos?tipo=requerimiento");
    const token = extraerCsrf(pagina.text);
    const cultivo = await db("cultivos").first();
    const zona = await db("zonas_altitudinales").first();
    const respuesta = await agente
      .post("/admin/catalogos/requerimiento")
      .type("form")
      .send({
        cultivo_id: String(cultivo.id),
        zona_id: String(zona.id),
        hum_min: "50",
        hum_max: "10",
        temp_min: "5",
        temp_max: "12",
        _csrf: token,
      });
    expect(respuesta.status).toBe(400);
  });

  test("un tipo de catálogo desconocido se rechaza", async () => {
    const agente = await iniciarSesion(app, admin);
    const pagina = await agente.get("/admin/catalogos");
    const token = extraerCsrf(pagina.text);
    const respuesta = await agente
      .post("/admin/catalogos/usuarios")
      .type("form")
      .send({ nombre: "Intruso", _csrf: token });
    expect([400, 404]).toContain(respuesta.status);
  });

  test("guarda una configuración permitida y registra auditoría", async () => {
    const agente = await iniciarSesion(app, admin);
    const pagina = await agente.get("/admin/configuraciones");
    expect(pagina.status).toBe(200);
    const token = extraerCsrf(pagina.text);
    const respuesta = await agente
      .post("/admin/configuraciones/sitio.nombre")
      .type("form")
      .send({ valor: "Siembra Andina (demo)", _csrf: token });
    expect(respuesta.status).toBe(302);
    const registro = await db("auditoria")
      .where({ usuario_id: idAdmin, accion: "configuracion.actualizada" })
      .orderBy("id", "desc")
      .first();
    expect(registro).toBeTruthy();
  });

  test("rechaza una configuración no permitida", async () => {
    const agente = await iniciarSesion(app, admin);
    const pagina = await agente.get("/admin/configuraciones");
    const token = extraerCsrf(pagina.text);
    const respuesta = await agente
      .post("/admin/configuraciones/sitio.secreto")
      .type("form")
      .send({ valor: "intento", _csrf: token });
    expect([400, 404]).toContain(respuesta.status);
  });

  test("filtra la auditoría y exporta un CSV escapado", async () => {
    const agente = await iniciarSesion(app, admin);
    const filtrada = await agente.get(
      "/admin/auditoria?accion=rol.asignado&orden=usuario&direccion=asc",
    );
    expect(filtrada.status).toBe(200);
    const csv = await agente.get(
      "/admin/auditoria/exportar.csv?accion=rol.asignado",
    );
    expect(csv.status).toBe(200);
    expect(csv.text.split(/\r?\n/)[0]).toBe(
      "\uFEFFfecha,usuario,accion,entidad,entidad_id,detalle,ip",
    );
  });

  test("el rol asignado queda como principal al volver a iniciar sesión", async () => {
    const usuario = await crearUsuario({
      nombre: "Cambio de rol",
      email: `cambio-rol.${sufijo}@prueba.pe`,
      rol: "agricultor",
    });
    idUsuarioRol = usuario.id;

    const agenteAdmin = await iniciarSesion(app, admin);
    const pagina = await agenteAdmin.get("/admin/usuarios");
    const respuesta = await agenteAdmin
      .post(`/admin/usuarios/${usuario.id}/rol`)
      .type("form")
      .send({
        rol: "tecnico",
        _csrf: extraerCsrf(pagina.text),
      });

    expect(respuesta.status).toBe(302);
    const rolPrincipal = await db("usuario_roles as ur")
      .join("roles as r", "r.id", "ur.rol_id")
      .where({ "ur.usuario_id": usuario.id, "r.clave": "tecnico" })
      .first("ur.es_principal");
    expect(Boolean(rolPrincipal.es_principal)).toBe(true);

    const agenteUsuario = await iniciarSesion(app, usuario);
    const panel = await agenteUsuario.get("/panel");
    expect(panel.status).toBe(302);
    expect(panel.headers.location).toBe("/tecnico");

    const paginaTecnico = await agenteUsuario.get("/tecnico");
    expect(paginaTecnico.status).toBe(200);
    expect(paginaTecnico.text).toContain("Técnico");
  });

  test("lista y marca mensajes de contacto", async () => {
    const [id] = await db("mensajes_contacto").insert({
      nombre: "Visitante",
      email: "visitante@ejemplo.pe",
      asunto: "Consulta de la prueba",
      mensaje: "Quisiera información sobre la plataforma.",
    });
    const agente = await iniciarSesion(app, admin);
    const pagina = await agente.get("/admin/contacto");
    expect(pagina.status).toBe(200);
    const token = extraerCsrf(pagina.text);
    const marcado = await agente
      .post(`/admin/contacto/${id}/estado`)
      .type("form")
      .send({ leido: "1", _csrf: token });
    expect(marcado.status).toBe(302);
    const fila = await db("mensajes_contacto").where({ id }).first();
    expect(Boolean(fila.leido)).toBe(true);
    await db("mensajes_contacto").where({ id }).del();
  });

  test("muestra el resumen, los trabajos y la guía de estilo", async () => {
    const agente = await iniciarSesion(app, admin);
    for (const ruta of ["/admin", "/admin/trabajos", "/guia-estilo"]) {
      expect((await agente.get(ruta)).status).toBe(200);
    }
  });
});

describe("Panel técnico: validar requerimientos y calendario", () => {
  let idTecnico;

  beforeAll(async () => {
    idTecnico = (
      await crearUsuario({
        nombre: "Técnica Fase 11",
        email: `tecnica11.${sufijo}@prueba.pe`,
        rol: "tecnico",
      })
    ).id;
  });

  afterAll(async () => {
    // El aviso publicado referencia al técnico: se borra antes que el usuario.
    await db("avisos_zona").where({ tecnico_id: idTecnico }).del();
    await db("usuarios").where({ id: idTecnico }).del();
  });

  test("la página del técnico carga y permite validar un requerimiento", async () => {
    const agente = await iniciarSesion(app, {
      email: `tecnica11.${sufijo}@prueba.pe`,
      password: "clave-segura-123",
    });
    const panel = await agente.get("/tecnico");
    expect(panel.status).toBe(200);

    const requerimiento = await db("cultivo_requerimientos").first();
    const token = extraerCsrf(panel.text);
    const respuesta = await agente
      .post(`/tecnico/requerimientos/${requerimiento.id}`)
      .type("form")
      .send({
        humedad_min: "20.5",
        humedad_max: "34",
        temperatura_min: "8",
        temperatura_max: "16",
        fuente: "Medición en campo de la campaña 2026",
        _csrf: token,
      });
    expect(respuesta.status).toBe(302);
    const fila = await db("cultivo_requerimientos")
      .where({ id: requerimiento.id })
      .first();
    expect(Boolean(fila.validado)).toBe(true);
    expect(Number(fila.validado_por)).toBe(idTecnico);
  });

  test("rechaza un requerimiento con mínimo mayor que el máximo", async () => {
    const agente = await iniciarSesion(app, {
      email: `tecnica11.${sufijo}@prueba.pe`,
      password: "clave-segura-123",
    });
    const panel = await agente.get("/tecnico");
    const requerimiento = await db("cultivo_requerimientos").first();
    const token = extraerCsrf(panel.text);
    const respuesta = await agente
      .post(`/tecnico/requerimientos/${requerimiento.id}`)
      .type("form")
      .send({
        humedad_min: "60",
        humedad_max: "10",
        temperatura_min: "8",
        temperatura_max: "16",
        _csrf: token,
      });
    expect(respuesta.status).toBe(400);
  });

  test("valida un calendario tradicional y rechaza meses fuera de rango", async () => {
    const agente = await iniciarSesion(app, {
      email: `tecnica11.${sufijo}@prueba.pe`,
      password: "clave-segura-123",
    });
    const panel = await agente.get("/tecnico");
    const calendario = await db("calendario_tradicional").first();
    const token = extraerCsrf(panel.text);

    const valido = await agente
      .post(`/tecnico/calendario/${calendario.id}`)
      .type("form")
      .send({ mes_inicio: "9", mes_fin: "12", _csrf: token });
    expect(valido.status).toBe(302);

    const invalido = await agente
      .post(`/tecnico/calendario/${calendario.id}`)
      .type("form")
      .send({ mes_inicio: "13", mes_fin: "2", _csrf: token });
    expect(invalido.status).toBe(400);
  });

  test("publica un aviso por distrito", async () => {
    const agente = await iniciarSesion(app, {
      email: `tecnica11.${sufijo}@prueba.pe`,
      password: "clave-segura-123",
    });
    const distrito = await db("distritos").first();
    // El aviso exige que el técnico cubra ese distrito.
    await db("tecnico_distritos")
      .insert({ tecnico_id: idTecnico, distrito_id: distrito.id })
      .onConflict()
      .ignore();
    const pagina = await agente.get("/tecnico/avisos");
    expect(pagina.status).toBe(200);
    const token = extraerCsrf(pagina.text);
    const respuesta = await agente
      .post("/tecnico/avisos")
      .type("form")
      .send({
        distrito_id: String(distrito.id),
        tipo: "helada",
        titulo: "Helada prevista para el fin de semana",
        mensaje: "Se esperan temperaturas bajo cero; protege los almácigos.",
        _csrf: token,
      });
    expect(respuesta.status).toBe(302);
  });
});
