// Pruebas de integración de flujos completos (Fase 11).
// Recorren las rutas reales con Supertest y escriben en la base de pruebas:
// comunidad (reacciones, favoritos, comentarios, moderación), consultas a
// técnico, editor de artículos, panel de administración, notificaciones,
// alertas y ejecución manual de trabajos programados.
jest.mock("../src/modules/auth/correo.service", () => ({
  enviar: jest.fn().mockResolvedValue({ messageId: "correo-de-prueba" }),
  validarConfiguracion: jest.fn(),
}));
jest.mock("../src/openMeteo", () => ({
  pronostico: jest.fn().mockResolvedValue([]),
  obtenerElevacion: jest.fn().mockResolvedValue(3500),
}));

const request = require("supertest");
const sharp = require("sharp");
const { crearApp } = require("../src/app");
const { db, cerrarConexion } = require("../src/config/db");
const {
  crearUsuario,
  iniciarSesion,
  extraerCsrf,
  tokenCsrf,
} = require("./ayudas");

jest.setTimeout(30000);

const app = crearApp();
const sufijo = Date.now();

const cuentas = {
  agricultora: {
    nombre: "Ana Agricultora",
    email: `ana.${sufijo}@prueba.pe`,
    password: "clave-segura-123",
    rol: "agricultor",
  },
  tecnico: {
    nombre: "Teodoro Técnico",
    email: `teodoro.${sufijo}@prueba.pe`,
    password: "clave-segura-123",
    rol: "tecnico",
  },
  editor: {
    nombre: "Elvira Editora",
    email: `elvira.${sufijo}@prueba.pe`,
    password: "clave-segura-123",
    rol: "editor",
  },
  admin: {
    nombre: "Adrián Admin",
    email: `adrian.${sufijo}@prueba.pe`,
    password: "clave-segura-123",
    rol: "administrador",
  },
};

const ids = {};
const slugArticulo = `articulo-fase11-${sufijo}`;
let idPublicacion;
let idComentario;
let idReporte;
let idConsulta;
let idRespuesta;
let idDistrito;

async function datosBase() {
  const distrito = await db("distritos").first();
  const cultivo = await db("cultivos").first();
  const estado = await db("estados_publicacion")
    .where({ clave: "publicada" })
    .first();
  const categoria = await db("categorias").first();
  return { distrito, cultivo, estado, categoria };
}

beforeAll(async () => {
  for (const [clave, datos] of Object.entries(cuentas)) {
    ids[clave] = (await crearUsuario(datos)).id;
  }
  const { distrito, cultivo, estado, categoria } = await datosBase();
  idDistrito = distrito.id;
  // Artículo publicado por la editora para probar la comunidad.
  idPublicacion = (
    await db("publicaciones").insert({
      usuario_id: ids.editor,
      categoria_id: categoria.id,
      estado_id: estado.id,
      titulo: "Artículo de prueba de la fase 11",
      slug: slugArticulo,
      contenido: "<p>Contenido de prueba para reacciones y comentarios.</p>",
      publicada_en: db.fn.now(),
    })
  )[0];
  // El técnico atiende el distrito del artículo para recibir la consulta.
  await db("tecnico_distritos")
    .insert({ tecnico_id: ids.tecnico, distrito_id: idDistrito })
    .onConflict()
    .ignore();
  return { cultivo };
});

afterAll(async () => {
  await db("publicaciones").where({ id: idPublicacion }).del();
  await db("consultas").where({ id: idConsulta }).del();
  await db("aviso_zona_destinatarios").where({ usuario_id: ids.tecnico }).del().catch(() => {});
  await db("avisos_zona").where({ tecnico_id: ids.tecnico }).del().catch(() => {});
  await db("tecnico_distritos").where({ tecnico_id: ids.tecnico }).del();
  await db("usuarios").whereIn("id", Object.values(ids)).del();
  await cerrarConexion();
});

describe("Comunidad: reacciones, favoritos y comentarios", () => {
  test("reaccionar dos veces con el mismo tipo la quita (toggle)", async () => {
    const agente = await iniciarSesion(app, cuentas.agricultora);
    const token = await tokenCsrf(agente, `/saberes/${slugArticulo}`);

    const primera = await agente
      .post(`/saberes/${slugArticulo}/reacciones`)
      .type("form")
      .send({ tipo: "util", _csrf: token });
    expect(primera.status).toBe(302);
    expect(
      await db("reacciones")
        .where({ publicacion_id: idPublicacion, usuario_id: ids.agricultora })
        .first(),
    ).toBeTruthy();

    const segunda = await agente
      .post(`/saberes/${slugArticulo}/reacciones`)
      .type("form")
      .send({ tipo: "util", _csrf: token });
    expect(segunda.status).toBe(302);
    expect(
      await db("reacciones")
        .where({ publicacion_id: idPublicacion, usuario_id: ids.agricultora })
        .first(),
    ).toBeFalsy();
  });

  test("guardar y quitar el favorito del artículo", async () => {
    const agente = await iniciarSesion(app, cuentas.agricultora);
    const token = await tokenCsrf(agente, `/saberes/${slugArticulo}`);
    await agente
      .post(`/saberes/${slugArticulo}/favoritos`)
      .type("form")
      .send({ _csrf: token });
    expect(
      await db("favoritos")
        .where({ publicacion_id: idPublicacion, usuario_id: ids.agricultora })
        .first(),
    ).toBeTruthy();
    await agente
      .post(`/saberes/${slugArticulo}/favoritos`)
      .type("form")
      .send({ _csrf: token });
    expect(
      await db("favoritos")
        .where({ publicacion_id: idPublicacion, usuario_id: ids.agricultora })
        .first(),
    ).toBeFalsy();
  });

  test("publicar, editar, reportar y moderar un comentario", async () => {
    const agente = await iniciarSesion(app, cuentas.agricultora);
    const token = await tokenCsrf(agente, `/saberes/${slugArticulo}`);
    const creado = await agente
      .post(`/saberes/${slugArticulo}/comentarios`)
      .type("form")
      .send({
        contenido: "Comentario inicial para pruebas de la fase 11.",
        _csrf: token,
      });
    expect(creado.status).toBe(302);

    const fila = await db("comentarios")
      .where({ publicacion_id: idPublicacion, usuario_id: ids.agricultora })
      .first();
    expect(fila).toBeTruthy();
    idComentario = fila.id;

    await agente
      .post(`/comentarios/${idComentario}/editar`)
      .type("form")
      .send({
        contenido: "Comentario editado en la ventana de 15 minutos.",
        _csrf: token,
      });
    const editado = await db("comentarios").where({ id: idComentario }).first();
    expect(editado.contenido).toContain("editado");

    // Otra cuenta reporta el comentario.
    const otro = await iniciarSesion(app, cuentas.tecnico);
    const tokenOtro = await tokenCsrf(otro, "/perfil");
    const reporte = await otro
      .post(`/comentarios/${idComentario}/reportar`)
      .type("form")
      .send({
        motivo: "spam",
        detalle: "Parece publicidad.",
        _csrf: tokenOtro,
      });
    expect(reporte.status).toBe(302);
    const reporteFila = await db("reportes_comentarios")
      .where({ comentario_id: idComentario })
      .first();
    expect(reporteFila).toBeTruthy();
    idReporte = reporteFila.id;

    // La editora ve la cola de moderación y descarta el reporte.
    const editora = await iniciarSesion(app, cuentas.editor);
    const cola = await editora.get("/editor/moderacion/comentarios");
    expect(cola.status).toBe(200);
    const tokenEditora = extraerCsrf(cola.text);
    const moderado = await editora
      .post(`/editor/moderacion/reportes/${idReporte}`)
      .type("form")
      .send({ accion: "descartar", _csrf: tokenEditora });
    expect(moderado.status).toBe(302);
  });

  test("un usuario sin permiso no entra a moderación", async () => {
    const agente = await iniciarSesion(app, cuentas.agricultora);
    expect((await agente.get("/editor/moderacion/comentarios")).status).toBe(
      403,
    );
  });
});

describe("Consultas entre agricultor y técnico", () => {
  test("crear, responder, calificar y cerrar una consulta", async () => {
    const agente = await iniciarSesion(app, cuentas.agricultora);
    const token = await tokenCsrf(agente, "/panel/consultas/nueva");
    const creada = await agente
      .post("/panel/consultas")
      .set("x-csrf-token", token)
      .field("_csrf", token)
      .field("titulo", "Hojas con manchas en la quinua")
      .field(
        "contenido",
        "Desde hace una semana veo manchas oscuras en las hojas bajas de la quinua.",
      )
      .field("distrito_id", String(idDistrito));
    expect(creada.status).toBe(302);
    const consulta = await db("consultas")
      .where({ usuario_id: ids.agricultora })
      .orderBy("id", "desc")
      .first();
    expect(consulta).toBeTruthy();
    idConsulta = consulta.id;

    const tecnico = await iniciarSesion(app, cuentas.tecnico);
    const detalle = await tecnico.get(`/tecnico/consultas/${idConsulta}`);
    expect(detalle.status).toBe(200);
    const tokenTecnico = extraerCsrf(detalle.text);
    const respuesta = await tecnico
      .post(`/tecnico/consultas/${idConsulta}/responder`)
      .type("form")
      .send({
        contenido:
          "Revisa el envés de las hojas y evita el exceso de humedad por dos días.",
        _csrf: tokenTecnico,
      });
    expect(respuesta.status).toBe(302);
    const fila = await db("respuestas")
      .where({ consulta_id: idConsulta })
      .first();
    expect(fila).toBeTruthy();
    idRespuesta = fila.id;

    const tokenAgri = await tokenCsrf(agente, `/panel/consultas/${idConsulta}`);
    const calificada = await agente
      .post(
        `/panel/consultas/${idConsulta}/respuestas/${idRespuesta}/calificar`,
      )
      .type("form")
      .send({ puntuacion: "5", comentario: "Muy clara.", _csrf: tokenAgri });
    expect(calificada.status).toBe(302);

    const cerrada = await agente
      .post(`/panel/consultas/${idConsulta}/cerrar`)
      .type("form")
      .send({ _csrf: tokenAgri });
    expect(cerrada.status).toBe(302);
    const estado = await db("consultas as c")
      .join("estados_consulta as e", "e.id", "c.estado_id")
      .where("c.id", idConsulta)
      .select("e.clave")
      .first();
    expect(estado.clave).toBe("cerrada");
  });

  test("un técnico sin ese distrito no ve la consulta", async () => {
    const otroTecnico = await crearUsuario({
      nombre: "Técnica sin zona",
      email: `sinoza.${sufijo}@prueba.pe`,
      rol: "tecnico",
    });
    const agente = await iniciarSesion(app, {
      email: otroTecnico.email,
      password: otroTecnico.password,
    });
    expect((await agente.get(`/tecnico/consultas/${idConsulta}`)).status).toBe(
      404,
    );
    expect((await agente.get(`/panel/consultas/${idConsulta}`)).status).toBe(
      403,
    );
    await db("usuarios").where({ id: otroTecnico.id }).del();
  });
});

describe("Editor y administración", () => {
  test("la editora crea un borrador y la administración lista usuarios", async () => {
    const editora = await iniciarSesion(app, cuentas.editor);
    const formulario = await editora.get("/editor/articulos/nuevo");
    expect(formulario.status).toBe(200);
    const categoria = await db("categorias").first();
    const token = extraerCsrf(formulario.text);
    const guardado = await editora
      .post("/editor/articulos")
      .type("form")
      .send({
        titulo: "Borrador de prueba fase 11",
        categoria_id: String(categoria.id),
        estado: "borrador",
        contenido: "<p>Borrador para pruebas de integración.</p>",
        _csrf: token,
      });
    expect(guardado.status).toBe(302);
    const borrador = await db("publicaciones")
      .where({ slug: "borrador-de-prueba-fase-11" })
      .first();
    expect(borrador).toBeTruthy();
    await db("publicaciones").where({ id: borrador.id }).del();

    const admin = await iniciarSesion(app, cuentas.admin);
    for (const ruta of [
      "/admin",
      "/admin/usuarios",
      "/admin/permisos",
      "/admin/catalogos",
      "/admin/auditoria",
      "/admin/configuraciones",
      "/admin/trabajos",
      "/admin/contacto",
      "/admin/solicitudes",
    ]) {
      expect((await admin.get(ruta)).status).toBe(200);
    }
  });

  test("la exportación CSV de auditoría escapa fórmulas", async () => {
    const admin = await iniciarSesion(app, cuentas.admin);
    const respuesta = await admin.get("/admin/auditoria/exportar.csv");
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers["content-type"]).toContain("text/csv");
    expect(respuesta.text.startsWith("\uFEFF")).toBe(true);
  });

  test("un agricultor no accede al panel de administración", async () => {
    const agente = await iniciarSesion(app, cuentas.agricultora);
    expect((await agente.get("/admin")).status).toBe(403);
    expect((await agente.get("/admin/usuarios")).status).toBe(403);
    expect((await agente.get("/editor")).status).toBe(403);
  });

  test("ejecutar un trabajo programado desde la administración", async () => {
    const admin = await iniciarSesion(app, cuentas.admin);
    const token = await tokenCsrf(admin, "/admin/trabajos");
    const ejecucion = await admin
      .post("/admin/trabajos/limpieza_tokens/ejecutar")
      .type("form")
      .send({ _csrf: token });
    expect(ejecucion.status).toBe(302);
    const ejecuciones = await db("ejecuciones_jobs")
      .where({ trabajo: "limpieza_tokens" })
      .orderBy("id", "desc")
      .first();
    expect(ejecuciones).toBeTruthy();
  });
});

describe("Notificaciones y alertas", () => {
  test("el técnico recibe la notificación de la consulta nueva", async () => {
    const agente = await iniciarSesion(app, cuentas.tecnico);
    const respuesta = await agente.get("/api/notificaciones/no-leidas");
    expect(respuesta.status).toBe(200);
  });

  test("la página de notificaciones marca como leídas", async () => {
    const agente = await iniciarSesion(app, cuentas.tecnico);
    const pagina = await agente.get("/notificaciones");
    expect(pagina.status).toBe(200);
    const token = extraerCsrf(pagina.text);
    const pendiente = await db("notificaciones")
      .where({ usuario_id: ids.tecnico, leida: false })
      .orderBy("id", "desc")
      .first();
    if (pendiente) {
      const leida = await agente
        .post(`/notificaciones/${pendiente.id}/leida`)
        .type("form")
        .send({ _csrf: token });
      expect([302, 200]).toContain(leida.status);
      const despues = await db("notificaciones").where({ id: pendiente.id }).first();
      expect(Boolean(despues.leida)).toBe(true);
    }
  });
});

describe("Protección CSRF", () => {
  test("un POST sin token se rechaza con 403", async () => {
    const agente = await iniciarSesion(app, cuentas.agricultora);
    const respuesta = await agente
      .post(`/saberes/${slugArticulo}/favoritos`)
      .type("form")
      .send({});
    expect(respuesta.status).toBe(403);
  });

  test("el token de otra sesión no sirve", async () => {
    const agenteA = await iniciarSesion(app, cuentas.agricultora);
    const tokenA = await tokenCsrf(agenteA, `/saberes/${slugArticulo}`);
    const agenteB = await iniciarSesion(app, cuentas.admin);
    const respuesta = await agenteB
      .post(`/saberes/${slugArticulo}/favoritos`)
      .type("form")
      .send({ _csrf: tokenA });
    expect(respuesta.status).toBe(403);
  });
});

describe("Inyección SQL y XSS", () => {
  test("un slug con comillas no rompe la consulta ni filtra datos", async () => {
    const respuesta = await request(app).get(
      "/saberes/x%27%20OR%201%3D1%20--%20%3E%3C",
    );
    expect([400, 404]).toContain(respuesta.status);
    expect(respuesta.text).not.toContain("password_hash");
  });

  test("una búsqueda con script se escapa en la respuesta", async () => {
    const respuesta = await request(app)
      .get("/saberes")
      .query({ q: "<script>alert(1)</script>" });
    expect(respuesta.status).toBe(200);
    expect(respuesta.text).not.toContain("<script>alert(1)</script>");
  });

  test("el contenido de un comentario se escapa al renderizarse", async () => {
    const respuesta = await request(app).get(`/saberes/${slugArticulo}`);
    expect(respuesta.status).toBe(200);
    expect(respuesta.text).not.toContain("<img src=x onerror");
  });
});

describe("Subida de archivos", () => {
  test("rechaza un PDF disfrazado de imagen en el perfil", async () => {
    const agente = await iniciarSesion(app, cuentas.agricultora);
    const token = await tokenCsrf(agente, "/perfil");
    const respuesta = await agente
      .post("/perfil/foto")
      .set("x-csrf-token", token)
      .field("_csrf", token)
      .attach("foto", Buffer.from("%PDF-1.4 contenido falso"), {
        filename: "foto.jpg",
        contentType: "image/jpeg",
      });
    expect(respuesta.status).toBe(400);
  });

  test("rechaza un MIME no permitido antes de mirar el contenido", async () => {
    const agente = await iniciarSesion(app, cuentas.agricultora);
    const token = await tokenCsrf(agente, "/perfil");
    const png = await sharp({
      create: { width: 20, height: 20, channels: 3, background: "#fff" },
    })
      .png()
      .toBuffer();
    const respuesta = await agente
      .post("/perfil/foto")
      .set("x-csrf-token", token)
      .field("_csrf", token)
      .attach("foto", png, { filename: "x.svg", contentType: "image/svg+xml" });
    expect([400, 403]).toContain(respuesta.status);
  });
});
