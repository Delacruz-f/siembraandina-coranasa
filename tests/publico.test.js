// Rutas del sitio público: requieren migraciones y seeds de la base de pruebas.
const request = require("supertest");
const { crearApp } = require("../src/app");
const { db, cerrarConexion } = require("../src/config/db");
const { extraerCsrf } = require("./ayudas");

const app = crearApp();

afterAll(async () => {
  await cerrarConexion();
});

describe("Páginas públicas", () => {
  test.each([
    ["/", "¿Cuándo siembro?"],
    ["/calendario", "Calendario agrícola"],
    ["/calendario?cultivo=papa", "Ventana tradicional por zona"],
    ["/cultivos", "Cultivos andinos"],
    ["/cultivos/papa", "Yungay"],
    ["/saberes", "Saberes agrícolas"],
    ["/saberes/leer-el-calendario-con-la-comunidad", "Conversación"],
    ["/comunidades", "Comunidades agrícolas"],
    ["/sobre", "Conócenos"],
    ["/contacto", "Envíanos un mensaje"],
  ])("%s responde sin iniciar sesión", async (ruta, contenido) => {
    const respuesta = await request(app).get(ruta);
    expect(respuesta.status).toBe(200);
    expect(respuesta.text).toContain(contenido);
    expect(respuesta.text).toContain('name="robots" content="index,follow"');
  });

  test("ofrece distritos con coordenadas cuando el seleccionado no tiene", async () => {
    const distritos = await db("distritos as di")
      .join("provincias as pr", "pr.id", "di.provincia_id")
      .join("departamentos as de", "de.id", "pr.departamento_id")
      .select(
        "di.id as distrito_id",
        "pr.id as provincia_id",
        "de.id as departamento_id",
      )
      .orderBy("di.id");
    const distritosConCoordenadas = await db("comunidades")
      .whereNotNull("latitud")
      .whereNotNull("longitud")
      .distinct("distrito_id")
      .pluck("distrito_id");
    const idsConCoordenadas = new Set(distritosConCoordenadas.map(Number));
    const sinCoordenadas = distritos
      .filter(
        (distrito) => !idsConCoordenadas.has(Number(distrito.distrito_id)),
      )
      .slice(0, 2);
    expect(sinCoordenadas).toHaveLength(2);
    const [seleccionado, disponible] = sinCoordenadas;
    const nombreDemo = `Punto de prueba NASA ${Date.now()}`;
    await db("comunidades").insert({
      distrito_id: disponible.distrito_id,
      nombre: nombreDemo,
      latitud: -13.5,
      longitud: -72.1,
    });

    try {
      const parametros = new URLSearchParams({
        cultivo: "papa",
        departamento: String(seleccionado.departamento_id),
        provincia: String(seleccionado.provincia_id),
        distrito: String(seleccionado.distrito_id),
      });
      const respuesta = await request(app).get(
        `/calendario?${parametros.toString()}`,
      );

      expect(respuesta.status).toBe(200);
      expect(respuesta.text).toContain("No hay coordenadas de una comunidad");
      expect(respuesta.text).toContain(
        "Distritos con coordenadas disponibles para consultar NASA POWER",
      );
      expect(respuesta.text).toContain(nombreDemo);
      expect(respuesta.text).toContain(`distrito=${disponible.distrito_id}`);
    } finally {
      await db("comunidades")
        .where({ distrito_id: disponible.distrito_id, nombre: nombreDemo })
        .del();
    }
  });

  test("el inicio muestra los artículos recientes", async () => {
    const respuesta = await request(app).get("/");
    expect(respuesta.status).toBe(200);
    // La portada muestra las publicaciones más recientes (incluye las demo).
    expect(respuesta.text).toMatch(/tarjeta-articulo/);
    expect(respuesta.text).toContain("Saberes");
  });

  test("Conócenos muestra el origen y los contactos del equipo", async () => {
    const respuesta = await request(app).get("/sobre");

    expect(respuesta.status).toBe(200);
    expect(respuesta.text).toContain(
      "Coracora, provincia de Parinacochas, Ayacucho",
    );
    expect(respuesta.text).toContain("ISTP César Augusto G. M.");
    expect(respuesta.text).toContain(
      'href="https://www.linkedin.com/in/david-delacruz-466b4644b"',
    );
    expect(respuesta.text).toContain('href="tel:+51904436962"');
    expect(respuesta.text).toContain("GitHub del proyecto");
    expect(respuesta.text).toContain("pie-publico__contacto-enlace");
  });

  test.each(["/", "/cultivos"])(
    "%s define texto alternativo en todas las imágenes",
    async (ruta) => {
      const respuesta = await request(app).get(ruta);
      const imagenes = respuesta.text.match(/<img\b[^>]*>/g) || [];
      expect(imagenes.length).toBeGreaterThan(0);
      expect(imagenes.every((imagen) => /\balt=/.test(imagen))).toBe(true);
    },
  );

  test("la ficha de cultivo usa <picture> con srcset y alt", async () => {
    const respuesta = await request(app).get("/cultivos/papa");
    expect(respuesta.status).toBe(200);
    // Con imágenes del catálogo se usa <picture>+srcset; sin ellas, un aviso.
    const conGaleria = respuesta.text.includes("<picture>");
    const conAviso = respuesta.text.includes(
      "Aún no hay fotografías de este cultivo",
    );
    expect(conGaleria || conAviso).toBe(true);
    if (conGaleria) expect(respuesta.text).toContain("srcset=");
    const imagenes = respuesta.text.match(/<img\b[^>]*>/g) || [];
    expect(imagenes.every((imagen) => /\balt=/.test(imagen))).toBe(true);
  });

  test("las páginas de autenticación solicitan no indexación", async () => {
    const respuesta = await request(app).get("/ingresar");
    expect(respuesta.status).toBe(200);
    expect(respuesta.text).toContain(
      'name="robots" content="noindex,nofollow"',
    );
  });

  test("el sitemap incluye solo páginas públicas", async () => {
    const respuesta = await request(app).get("/sitemap.xml");
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers["content-type"]).toContain("application/xml");
    expect(respuesta.text).toContain(
      "/saberes/leer-el-calendario-con-la-comunidad",
    );
    expect(respuesta.text).not.toMatch(
      /\/(admin|panel|parcelas|lecturas)(\/|<)/,
    );
  });

  test("las rutas privadas no aparecen en robots ni sitemap", async () => {
    const [robots, sitemap] = await Promise.all([
      request(app).get("/robots.txt"),
      request(app).get("/sitemap.xml"),
    ]);
    expect(robots.text).toContain("Disallow: /admin");
    expect(robots.text).toContain("Sitemap:");
    expect(sitemap.text).not.toContain("/ingresar");
    expect(sitemap.text).not.toContain("/perfil");
  });

  test("rechaza comentarios sin token CSRF", async () => {
    const respuesta = await request(app)
      .post("/saberes/leer-el-calendario-con-la-comunidad/comentarios")
      .type("form")
      .send({ contenido: "Comentario sin token" });
    expect(respuesta.status).toBe(403);
  });

  test("guarda un mensaje de contacto con CSRF válido", async () => {
    const agente = request.agent(app);
    const pagina = await agente.get("/contacto");
    const email = `contacto-${Date.now()}@prueba.pe`;
    try {
      const respuesta = await agente
        .post("/contacto")
        .type("form")
        .send({
          nombre: "Persona de prueba",
          email,
          asunto: "Consulta de prueba",
          mensaje: "Este mensaje verifica el formulario público de contacto.",
          _csrf: extraerCsrf(pagina.text),
        });
      expect(respuesta.status).toBe(302);
      expect(respuesta.headers.location).toBe("/contacto#formulario");
      const guardado = await db("mensajes_contacto").where({ email }).first();
      expect(guardado).toBeDefined();
      expect(guardado.nombre).toBe("Persona de prueba");
    } finally {
      await db("mensajes_contacto").where({ email }).del();
    }
  });
});
