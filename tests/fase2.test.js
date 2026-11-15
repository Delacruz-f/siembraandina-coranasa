// Pruebas de la Fase 2: autenticación, roles, parcelas, lecturas y accesos.
// Requieren la base de datos migrada y con seeds (npm run migrate && npm run seed).
jest.mock("../src/modules/auth/correo.service", () => ({
  enviar: jest.fn().mockResolvedValue({ messageId: "correo-de-prueba" }),
  validarConfiguracion: jest.fn(),
}));
jest.mock("../src/openMeteo", () => ({
  pronostico: jest.fn().mockResolvedValue([
    ...Array.from({ length: 7 }, (_, indice) => {
      const fecha = new Date();
      fecha.setUTCDate(fecha.getUTCDate() + indice);
      return {
        fecha: fecha.toISOString().slice(0, 10),
        temperaturaMinima: 6,
        precipitacionMm: 0,
      };
    }),
  ]),
  obtenerSuelo: jest.fn().mockResolvedValue({
    observadas: [],
    pronostico: Array.from({ length: 7 }, (_, indice) => {
      const fecha = new Date();
      fecha.setUTCDate(fecha.getUTCDate() + indice);
      return { fecha: fecha.toISOString().slice(0, 10), humedad: 25 };
    }),
  }),
  obtenerElevacion: jest.fn().mockResolvedValue(3500),
}));

const request = require("supertest");
const fs = require("fs/promises");
const path = require("path");
const sharp = require("sharp");
const { crearApp } = require("../src/app");
const { db, cerrarConexion } = require("../src/config/db");
const seedCondiciones = require("../seeds/12_condiciones_parcela");
const env = require("../src/config/env");
const { insertarYDevolverId } = require("../src/utils/baseDatos");
const correoServicio = require("../src/modules/auth/correo.service");
const {
  crearUsuario,
  iniciarSesion,
  extraerCsrf,
  tokenCsrf,
} = require("./ayudas");

const app = crearApp();
const sufijo = Date.now();
// Varias pruebas procesan imágenes con sharp (3 tamaños × 2 formatos) y superan
// los 5 s por defecto de Jest.
jest.setTimeout(30000);

const agricultor = {
  nombre: "Rosa Quispe",
  email: `rosa.${sufijo}@prueba.pe`,
  password: "clave-segura-123",
};
const tecnico = {
  nombre: "María Técnica",
  email: `maria.${sufijo}@prueba.pe`,
  password: "clave-segura-123",
};
const admin = {
  nombre: "Admin Prueba",
  email: `admin.${sufijo}@prueba.pe`,
  password: "clave-segura-123",
};

let idAgricultor;
let idTecnico;
let idAdmin;
let idParcela;
let idCampania;

beforeAll(async () => {
  await seedCondiciones.seed(db);
  idAgricultor = (await crearUsuario({ ...agricultor, rol: "agricultor" })).id;
  idTecnico = (await crearUsuario({ ...tecnico, rol: "tecnico" })).id;
  idAdmin = (await crearUsuario({ ...admin, rol: "administrador" })).id;
});

afterAll(async () => {
  // Limpieza: las claves foráneas en cascada borran parcelas, lecturas y accesos.
  await db("usuarios").whereIn("id", [idAgricultor, idTecnico, idAdmin]).del();
  await cerrarConexion();
});

describe("Registro e ingreso", () => {
  test("el registro público crea agricultor, inicia sesión y permite verificar después", async () => {
    const agente = request.agent(app);
    const pagina = await agente.get("/registro");
    const email = `nuevo.${sufijo}@prueba.pe`;
    const respuesta = await agente
      .post("/registro")
      .type("form")
      .send({
        nombre: "Nuevo Agricultor",
        email,
        password: "clave-segura-123",
        _csrf: extraerCsrf(pagina.text),
      });

    expect(respuesta.status).toBe(302);
    expect(respuesta.headers.location).toBe("/panel");

    const fila = await db("usuarios as u")
      .join("usuario_roles as ur", "ur.usuario_id", "u.id")
      .join("roles as r", "r.id", "ur.rol_id")
      .join("perfiles as p", "p.usuario_id", "u.id")
      .select("u.id", "r.clave", "p.nombre", "u.email_verificado_en")
      .where("u.email", email)
      .andWhere("ur.es_principal", true)
      .first();
    expect(fila.clave).toBe("agricultor");
    expect(fila.nombre).toBe("Nuevo Agricultor");
    expect(fila.email_verificado_en).toBeNull();

    // Ya tiene sesión activa y puede usar el panel sin verificar.
    const panel = await agente.get("/panel");
    expect(panel.status).toBe(200);

    const correo = correoServicio.enviar.mock.calls.at(-1)[0];
    const enlace = /https?:\/\/\S+/.exec(correo.texto)[0];
    const rutaVerificacion = new URL(enlace).pathname;
    const verificacion = await agente.get(rutaVerificacion);
    expect(verificacion.status).toBe(200);
    const verificado = await agente
      .post(rutaVerificacion)
      .type("form")
      .send({ _csrf: extraerCsrf(verificacion.text) });
    expect(verificado.status).toBe(302);
    expect(verificado.headers.location).toBe("/perfil");

    const actualizado = await db("usuarios").where({ id: fila.id }).first();
    expect(actualizado.email_verificado_en).not.toBeNull();
    await db("usuarios").where({ id: fila.id }).del();
  });

  test("rechaza un registro con contraseña corta", async () => {
    const agente = request.agent(app);
    const pagina = await agente.get("/registro");
    const respuesta = await agente
      .post("/registro")
      .type("form")
      .send({
        nombre: "Corto",
        email: `corto.${sufijo}@prueba.pe`,
        password: "123",
        _csrf: extraerCsrf(pagina.text),
      });
    expect(respuesta.status).toBe(400);
  });

  test("rechaza credenciales incorrectas", async () => {
    const agente = request.agent(app);
    const pagina = await agente.get("/ingresar");
    const respuesta = await agente
      .post("/ingresar")
      .type("form")
      .send({
        email: agricultor.email,
        password: "incorrecta",
        _csrf: extraerCsrf(pagina.text),
      });
    expect(respuesta.status).toBe(401);
  });

  test("el agricultor entra a su panel", async () => {
    const agente = await iniciarSesion(app, agricultor);
    const respuesta = await agente.get("/panel");
    expect(respuesta.status).toBe(200);
    expect(respuesta.text).toContain("Mi resumen");
  });
});

describe("Guía de estilo", () => {
  test("solo el administrador puede abrir la guía de componentes", async () => {
    const agenteAdmin = await iniciarSesion(app, admin);
    const respuestaAdmin = await agenteAdmin.get("/guia-estilo");
    expect(respuestaAdmin.status).toBe(200);
    expect(respuestaAdmin.text).toContain("Tema claro");
    expect(respuestaAdmin.text).toContain("Tema oscuro");
    expect(respuestaAdmin.text).toContain("Modal accesible");

    const agenteAgricultor = await iniciarSesion(app, agricultor);
    const respuestaAgricultor = await agenteAgricultor.get("/guia-estilo");
    expect(respuestaAgricultor.status).toBe(403);
  });
});

describe("Parcelas y lecturas del agricultor", () => {
  test("crea una parcela", async () => {
    const agente = await iniciarSesion(app, agricultor);
    const pagina = await agente.get("/panel/parcelas/nueva");
    const cultivo = await db("cultivos").where({ slug: "papa" }).first();
    const zona = await db("zonas_altitudinales")
      .where({ clave: "quechua" })
      .first();
    const distrito = await db("distritos").first();

    const respuesta = await agente
      .post("/panel/parcelas")
      .type("form")
      .send({
        nombre: "Chacra de prueba",
        cultivo_id: cultivo.id,
        zona_id: zona.id,
        distrito_id: distrito.id,
        latitud: "-13.5170",
        longitud: "-71.9785",
        _csrf: extraerCsrf(pagina.text),
      });
    expect(respuesta.status).toBe(302);
    idParcela = Number(respuesta.headers.location.split("/").pop());
    expect(idParcela).toBeGreaterThan(0);
    const campania = await db("campanias")
      .where({ parcela_id: idParcela })
      .first();
    const filaParcela = await db("parcelas").where({ id: idParcela }).first();
    expect(campania.cultivo_id).toBe(cultivo.id);
    expect(filaParcela).not.toHaveProperty("cultivo_id");
  });

  test("crea una campaña con siembra real y cosecha", async () => {
    const agente = await iniciarSesion(app, agricultor);
    const pagina = await agente.get(
      `/panel/parcelas/${idParcela}/campanias/nueva`,
    );
    const cultivo = await db("cultivos").where({ slug: "papa" }).first();
    const estado = await db("estados_campania")
      .where({ clave: "planificada" })
      .first();
    const hoy = new Date().toISOString().slice(0, 10);
    const crear = await agente
      .post(`/panel/parcelas/${idParcela}/campanias`)
      .type("form")
      .send({
        cultivo_id: cultivo.id,
        estado_id: estado.id,
        fecha_inicio: hoy,
        _csrf: extraerCsrf(pagina.text),
      });
    expect(crear.status).toBe(302);
    idCampania = Number(crear.headers.location.split("/").pop());

    const detalle = await agente.get(`/panel/campanias/${idCampania}`);
    expect(detalle.status).toBe(200);
    expect(detalle.text).toContain("Registrar siembra real");
    const csrf = extraerCsrf(detalle.text);
    const siembra = await agente
      .post(`/panel/campanias/${idCampania}/siembras`)
      .type("form")
      .send({ fecha: hoy, metodo: "Surcos", _csrf: csrf });
    expect(siembra.status).toBe(302);
    const unidad = await db("unidades_medida").first();
    const tokenCosecha = await tokenCsrf(
      agente,
      `/panel/campanias/${idCampania}`,
    );
    const registrarCosecha = await agente
      .post(`/panel/campanias/${idCampania}/cosechas`)
      .type("form")
      .send({
        fecha: hoy,
        cantidad: "12.5",
        unidad_id: unidad.id,
        observaciones: "Cosecha de prueba",
        _csrf: tokenCosecha,
      });
    expect(registrarCosecha.status).toBe(302);
    expect(
      await db("siembras").where({ campania_id: idCampania }).first(),
    ).toBeDefined();
    expect(
      await db("cosechas").where({ campania_id: idCampania }).first(),
    ).toBeDefined();

    const otro = await crearUsuario({
      nombre: "Otra agricultora",
      email: `otra-campania.${sufijo}@prueba.pe`,
    });
    const agenteAjeno = await iniciarSesion(app, otro);
    expect(
      (await agenteAjeno.get(`/panel/campanias/${idCampania}`)).status,
    ).toBe(404);
    await db("usuarios").where({ id: otro.id }).del();
  });

  test("previsualiza CSV e importa solo las filas válidas", async () => {
    const agente = await iniciarSesion(app, agricultor);
    const pagina = await agente.get(
      `/panel/parcelas/${idParcela}/lecturas/importar`,
    );
    const csrf = extraerCsrf(pagina.text);
    const archivo = [
      "fecha,humedad,temperatura,observacion",
      '2024-10-15,24.5,12.3,"llovió, fuerte"',
      "2024-10-16,150,12,",
    ].join("\n");
    const previa = await agente
      .post(`/panel/parcelas/${idParcela}/lecturas/importar/previsualizar`)
      .set("x-csrf-token", csrf)
      .field("_csrf", csrf)
      .attach("archivo", Buffer.from(archivo), {
        filename: "lecturas.csv",
        contentType: "text/csv",
      });
    expect(previa.status).toBe(200);
    const revision = await agente.get(previa.body.url);
    expect(revision.text).toContain("1 lecturas válidas");
    expect(revision.text).toContain("Fila 3");
    const token = /name="token" value="([a-f0-9]{48})"/.exec(revision.text)[1];
    const confirmar = await agente
      .post(`/panel/parcelas/${idParcela}/lecturas/importar/confirmar`)
      .type("form")
      .send({ token, _csrf: extraerCsrf(revision.text) });
    expect(confirmar.status).toBe(302);
    const lectura = await db("lecturas")
      .where({ parcela_id: idParcela, humedad: 24.5 })
      .first();
    expect(lectura).toBeDefined();
    expect(lectura.observacion).toBe("llovió, fuerte");
  });

  test("resume la recomendación y el pronóstico de sus parcelas", async () => {
    const fuenteManual = await db("fuentes_datos")
      .where({ clave: "manual" })
      .first();
    await db("lecturas").insert({
      parcela_id: idParcela,
      fuente_id: fuenteManual.id,
      registrado_por: idAgricultor,
      fecha: new Date().toISOString().slice(0, 10),
      humedad: 25,
      temperatura: 14,
    });
    const agente = await iniciarSesion(app, agricultor);
    const respuesta = await agente.get("/panel");
    expect(respuesta.status).toBe(200);
    expect(respuesta.text).toContain("Siembra ahora");
    expect(respuesta.text).toContain("Pronóstico de los próximos 7 días");
    expect(respuesta.text).toContain("Lluvia: 0 mm");
  });

  test("sube fotos múltiples, protege su acceso y guarda preferencias", async () => {
    const agente = await iniciarSesion(app, agricultor);
    const perfil = await agente.get(`/panel/parcelas/${idParcela}/editar`);
    const csrfPerfil = extraerCsrf(perfil.text);
    const imagen = await sharp({
      create: {
        width: 900,
        height: 600,
        channels: 3,
        background: { r: 180, g: 120, b: 60 },
      },
    })
      .png()
      .toBuffer();

    const fotoPerfil = await agente
      .post("/perfil/foto")
      .set("x-csrf-token", csrfPerfil)
      .field("_csrf", csrfPerfil)
      .attach("foto", imagen, {
        filename: "perfil.png",
        contentType: "image/png",
      });
    expect(fotoPerfil.status).toBe(302);
    const perfilGuardado = await db("perfiles")
      .where({ usuario_id: idAgricultor })
      .first();
    expect(perfilGuardado.foto_archivo_id).toBeTruthy();

    const detalle = await agente.get(`/panel/parcelas/${idParcela}`);
    const csrfParcela = extraerCsrf(detalle.text);
    const galeria = await agente
      .post(`/panel/parcelas/${idParcela}/imagenes`)
      .set("x-csrf-token", csrfParcela)
      .field("_csrf", csrfParcela)
      .field("textos_alternativos", "Vista de la parcela desde el sur")
      .field("textos_alternativos", "Surcos recién preparados")
      .attach("imagenes", imagen, {
        filename: "parcela-1.png",
        contentType: "image/png",
      })
      .attach("imagenes", imagen, {
        filename: "parcela-2.png",
        contentType: "image/png",
      });
    expect(galeria.status).toBe(302);

    const relaciones = await db("parcela_archivos")
      .where({ parcela_id: idParcela })
      .select("archivo_id");
    expect(relaciones).toHaveLength(2);
    const ids = [
      perfilGuardado.foto_archivo_id,
      ...relaciones.map((fila) => fila.archivo_id),
    ];
    const propietario = await iniciarSesion(app, agricultor);
    // Las imágenes privadas se sirven por la ruta controlada /media/privadas.
    expect(
      (await propietario.get(`/media/privadas/${ids[0]}/400`)).status,
    ).toBe(200);
    expect((await propietario.get(`/archivos/${ids[0]}/vista`)).status).toBe(
      302,
    );
    const otro = await crearUsuario({
      nombre: "Cuenta sin imágenes",
      email: `sin-imagenes.${sufijo}@prueba.pe`,
    });
    const agenteAjeno = await iniciarSesion(app, otro);
    expect(
      (await agenteAjeno.get(`/media/privadas/${ids[1]}/400`)).status,
    ).toBe(404);
    expect((await agenteAjeno.get(`/archivos/${ids[1]}/vista`)).status).toBe(
      404,
    );

    const preferenciasPagina = await agente.get("/perfil");
    const preferenciasRespuesta = await agente
      .post("/perfil/preferencias")
      .type("form")
      .send({
        avisos_panel: "on",
        _csrf: extraerCsrf(preferenciasPagina.text),
      });
    expect(preferenciasRespuesta.status).toBe(302);
    const preferencias = await db("preferencias_notificacion")
      .where({ usuario_id: idAgricultor })
      .first();
    expect(Boolean(preferencias.correo_alertas)).toBe(false);
    expect(Boolean(preferencias.avisos_panel)).toBe(true);
    expect(Boolean(preferencias.resumen_semanal)).toBe(false);
    await db("preferencias_notificacion")
      .where({ usuario_id: idAgricultor })
      .update({
        correo_alertas: true,
        avisos_panel: true,
        resumen_semanal: false,
      });

    const archivos = await db("archivos").whereIn("id", ids).select("ruta");
    await db("archivos").whereIn("id", ids).del();
    await Promise.all(
      archivos.map((archivo) =>
        fs.rm(path.resolve(__dirname, "..", archivo.ruta), { force: true }),
      ),
    );
    await db("usuarios").where({ id: otro.id }).del();
  });

  test("registra una lectura manual con registrado_por y fuente manual", async () => {
    const agente = await iniciarSesion(app, agricultor);
    const token = await tokenCsrf(agente, `/panel/parcelas/${idParcela}`);
    const respuesta = await agente
      .post(`/parcelas/${idParcela}/lecturas`)
      .type("form")
      .send({
        fecha: "2024-10-17",
        humedad: "24.5",
        temperatura: "12.3",
        _csrf: token,
      });
    expect(respuesta.status).toBe(302);

    const lectura = await db("lecturas as l")
      .join("fuentes_datos as f", "f.id", "l.fuente_id")
      .select("l.*", "f.clave")
      .where("l.parcela_id", idParcela)
      .first();
    expect(lectura.clave).toBe("manual");
    expect(lectura.registrado_por).toBe(idAgricultor);
  });

  test("rechaza una humedad fuera de rango", async () => {
    const agente = await iniciarSesion(app, agricultor);
    const token = await tokenCsrf(agente, `/panel/parcelas/${idParcela}`);
    const respuesta = await agente
      .post(`/parcelas/${idParcela}/lecturas`)
      .type("form")
      .send({
        fecha: new Date().toISOString().slice(0, 10),
        humedad: "150",
        temperatura: "12",
        _csrf: token,
      });
    expect(respuesta.status).toBe(400);
  });

  test("otro agricultor no puede ver la parcela (404)", async () => {
    const otro = await crearUsuario({
      nombre: "Otro",
      email: `otro.${sufijo}@prueba.pe`,
      rol: "agricultor",
    });
    const agente = await iniciarSesion(app, otro);
    const respuesta = await agente.get(`/panel/parcelas/${idParcela}`);
    expect(respuesta.status).toBe(404);
    await db("usuarios").where({ id: otro.id }).del();
  });

  test("un agricultor no puede leer lecturas ni descargar archivos ajenos", async () => {
    const otro = await crearUsuario({
      nombre: "Cuenta ajena",
      email: `cuentaajena.${sufijo}@prueba.pe`,
    });
    const raiz = path.resolve(__dirname, "..");
    const carpetaPrueba = path.join(
      raiz,
      env.subidas.directorio,
      `prueba-${sufijo}`,
    );
    const rutaArchivo = path.join(carpetaPrueba, "respaldo.pdf");
    let archivoId;
    await fs.mkdir(carpetaPrueba, { recursive: true });
    await fs.writeFile(rutaArchivo, "%PDF-1.4 archivo de prueba");
    try {
      archivoId = await insertarYDevolverId("archivos", {
        autor_id: idAgricultor,
        nombre_original: "respaldo.pdf",
        ruta: path
          .relative(path.resolve(raiz, env.subidas.directorio), rutaArchivo)
          .split(path.sep)
          .join("/"),
        mime: "application/pdf",
        tamano: 26,
      });

      const dueño = await iniciarSesion(app, agricultor);
      expect((await dueño.get(`/archivos/${archivoId}`)).status).toBe(200);

      const agente = await iniciarSesion(app, otro);
      const token = await tokenCsrf(agente, "/panel");
      const lectura = await agente
        .post(`/parcelas/${idParcela}/lecturas`)
        .type("form")
        .send({
          fecha: new Date().toISOString().slice(0, 10),
          humedad: "20",
          temperatura: "10",
          _csrf: token,
        });
      expect(lectura.status).toBe(404);

      const archivo = await agente.get(`/archivos/${archivoId}`);
      expect(archivo.status).toBe(404);
    } finally {
      if (archivoId) await db("archivos").where({ id: archivoId }).del();
      await db("usuarios").where({ id: otro.id }).del();
      await fs.rm(carpetaPrueba, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
    }
  });
});

describe("Acceso de técnicos", () => {
  test("el técnico no ve la parcela sin acceso (404)", async () => {
    const agente = await iniciarSesion(app, tecnico);
    const respuesta = await agente.get(`/tecnico/parcelas/${idParcela}`);
    expect(respuesta.status).toBe(404);
  });

  test("el técnico no puede registrar lecturas sin acceso", async () => {
    const agente = await iniciarSesion(app, tecnico);
    const token = await tokenCsrf(agente, "/perfil");
    const respuesta = await agente
      .post(`/parcelas/${idParcela}/lecturas`)
      .type("form")
      .send({
        fecha: new Date().toISOString().slice(0, 10),
        humedad: "20",
        temperatura: "10",
        _csrf: token,
      });
    expect(respuesta.status).toBe(404);
  });

  test("el agricultor concede acceso con escritura y el técnico registra", async () => {
    const agenteAgricultor = await iniciarSesion(app, agricultor);
    const token = await tokenCsrf(
      agenteAgricultor,
      `/panel/parcelas/${idParcela}`,
    );
    const conceder = await agenteAgricultor
      .post(`/panel/parcelas/${idParcela}/accesos`)
      .type("form")
      .send({
        tecnico_id: String(idTecnico),
        puede_escribir: "true",
        _csrf: token,
      });
    expect(conceder.status).toBe(302);

    const agenteTecnico = await iniciarSesion(app, tecnico);
    const ver = await agenteTecnico.get(`/tecnico/parcelas/${idParcela}`);
    expect(ver.status).toBe(200);

    const tokenTecnico = await tokenCsrf(
      agenteTecnico,
      `/tecnico/parcelas/${idParcela}`,
    );
    const registrar = await agenteTecnico
      .post(`/parcelas/${idParcela}/lecturas`)
      .type("form")
      .send({
        fecha: "2024-10-18",
        humedad: "22",
        temperatura: "11",
        _csrf: tokenTecnico,
      });
    expect(registrar.status).toBe(302);

    const lectura = await db("lecturas")
      .where({ parcela_id: idParcela, registrado_por: idTecnico })
      .first();
    expect(lectura).toBeDefined();
  });

  test("al revocar el acceso el técnico deja de ver la parcela", async () => {
    const agenteAgricultor = await iniciarSesion(app, agricultor);
    const acceso = await db("accesos_parcela")
      .where({ parcela_id: idParcela, tecnico_id: idTecnico })
      .whereNull("revocado_en")
      .first();
    const token = await tokenCsrf(
      agenteAgricultor,
      `/panel/parcelas/${idParcela}`,
    );
    const respuesta = await agenteAgricultor
      .post(`/panel/parcelas/${idParcela}/accesos/${acceso.id}/revocar`)
      .type("form")
      .send({ _csrf: token });
    expect(respuesta.status).toBe(302);

    const agenteTecnico = await iniciarSesion(app, tecnico);
    const ver = await agenteTecnico.get(`/tecnico/parcelas/${idParcela}`);
    expect(ver.status).toBe(404);
  });
});

describe("Solicitud de rol técnico y administración", () => {
  test("el agricultor solicita ser técnico y el administrador aprueba", async () => {
    const agenteAgricultor = await iniciarSesion(app, agricultor);
    const pagina = await agenteAgricultor.get("/perfil/solicitud-tecnico");
    const enviar = await agenteAgricultor
      .post("/perfil/solicitud-tecnico")
      .set("x-csrf-token", extraerCsrf(pagina.text))
      .field("institucion", "Agencia Agraria de prueba");
    expect(enviar.status).toBe(302);

    const solicitud = await db("solicitudes_rol as s")
      .join("estados_solicitud as e", "e.id", "s.estado_id")
      .select("s.id", "e.clave")
      .where("s.usuario_id", idAgricultor)
      .orderBy("s.id", "desc")
      .first();
    expect(solicitud.clave).toBe("pendiente");

    const agenteAdmin = await iniciarSesion(app, admin);
    const tipoNotificacion = await db("tipos_notificacion")
      .where({ clave: "solicitud" })
      .first();
    const notificacion = await db("notificaciones")
      .where({ usuario_id: idAdmin, tipo_id: tipoNotificacion.id })
      .where("mensaje", "like", `%#${solicitud.id}%`)
      .first();
    expect(notificacion).toBeTruthy();

    const paginaNotificaciones = await agenteAdmin.get("/notificaciones");
    expect(paginaNotificaciones.status).toBe(200);
    expect(paginaNotificaciones.text).toContain(`/admin/solicitudes`);

    const token = await tokenCsrf(agenteAdmin, "/admin/solicitudes");
    const aprobar = await agenteAdmin
      .post(`/admin/solicitudes/${solicitud.id}/aprobar`)
      .type("form")
      .send({ observacion: "Documentación correcta", _csrf: token });
    expect(aprobar.status).toBe(302);

    const rolTecnico = await db("roles").where({ clave: "tecnico" }).first();
    const asignado = await db("usuario_roles")
      .where({ usuario_id: idAgricultor, rol_id: rolTecnico.id })
      .first();
    expect(asignado).toBeDefined();
    expect(Boolean(asignado.es_principal)).toBe(true);

    const auditoria = await db("auditoria")
      .where({ accion: "solicitud.aprobada", entidad_id: solicitud.id })
      .first();
    expect(auditoria).toBeDefined();
  });

  test("un agricultor no puede entrar al panel de administración (403)", async () => {
    // Se usa un agricultor distinto: el anterior ya recibió el rol de técnico.
    const otro = await crearUsuario({
      nombre: "Sin permisos",
      email: `sinpermisos.${sufijo}@prueba.pe`,
      rol: "agricultor",
    });
    const agente = await iniciarSesion(app, otro);
    const respuesta = await agente.get("/admin");
    expect(respuesta.status).toBe(403);
    await db("usuarios").where({ id: otro.id }).del();
  });

  test("el administrador asigna el rol de editor directamente", async () => {
    const agenteAdmin = await iniciarSesion(app, admin);
    const token = await tokenCsrf(agenteAdmin, "/admin/usuarios");
    const respuesta = await agenteAdmin
      .post(`/admin/usuarios/${idTecnico}/rol`)
      .type("form")
      .send({ rol: "editor", _csrf: token });
    expect(respuesta.status).toBe(302);
    const rolEditor = await db("roles").where({ clave: "editor" }).first();
    const asignado = await db("usuario_roles")
      .where({ usuario_id: idTecnico, rol_id: rolEditor.id })
      .first();
    expect(asignado).toBeDefined();
    expect(Boolean(asignado.es_principal)).toBe(true);
  });
});

describe("Panel técnico", () => {
  test("el técnico valida un requerimiento y queda marcado", async () => {
    const agente = await iniciarSesion(app, tecnico);
    const pagina = await agente.get("/tecnico");
    expect(pagina.status).toBe(200);

    const requerimiento = await db("cultivo_requerimientos")
      .orderBy("id")
      .first();
    const token = extraerCsrf(pagina.text);
    const respuesta = await agente
      .post(`/tecnico/requerimientos/${requerimiento.id}`)
      .type("form")
      .send({
        humedad_min: "21",
        humedad_max: "34",
        temperatura_min: "8",
        temperatura_max: "17",
        fuente: "Validado en prueba automatizada",
        _csrf: token,
      });
    expect(respuesta.status).toBe(302);

    const actualizado = await db("cultivo_requerimientos")
      .where({ id: requerimiento.id })
      .first();
    expect(Boolean(actualizado.validado)).toBe(true);
    expect(actualizado.validado_por).toBe(idTecnico);

    // Se restaura el valor referencial para no alterar los datos de desarrollo.
    await db("cultivo_requerimientos").where({ id: requerimiento.id }).update({
      hum_min: requerimiento.hum_min,
      hum_max: requerimiento.hum_max,
      temp_min: requerimiento.temp_min,
      temp_max: requerimiento.temp_max,
      validado: false,
      validado_por: null,
      validado_en: null,
      fuente: requerimiento.fuente,
    });
  });

  test("rechaza un requerimiento con humedad mínima mayor que la máxima", async () => {
    const agente = await iniciarSesion(app, tecnico);
    const pagina = await agente.get("/tecnico");
    const requerimiento = await db("cultivo_requerimientos")
      .orderBy("id")
      .first();
    const respuesta = await agente
      .post(`/tecnico/requerimientos/${requerimiento.id}`)
      .type("form")
      .send({
        humedad_min: "40",
        humedad_max: "20",
        temperatura_min: "8",
        temperatura_max: "17",
        _csrf: extraerCsrf(pagina.text),
      });
    expect(respuesta.status).toBe(400);
  });
});
