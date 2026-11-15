const express = require("express");
const request = require("supertest");
const { doubleCsrfProtection, exponerTokenCsrf, leerCookies } = require("../src/middlewares/csrf");
const {
  requiereSesion,
  requiereRol,
} = require("../src/middlewares/autorizacion");

const permisosPorRol = {
  agricultor: [
    "panel.ver",
    "perfil.editar",
    "parcelas.ver",
    "parcelas.crear",
    "parcelas.editar",
    "parcelas.eliminar",
    "accesos.gestionar",
    "lecturas.ver",
    "lecturas.crear",
    "campanias.gestionar",
    "solicitudes.crear",
    "cultivos.ver",
    "consultas.crear",
    "consultas.calificar",
    "comentarios.reportar",
    "notificaciones.ver",
  ],
  tecnico: [
    "panel.ver",
    "cultivos.ver",
    "cultivos.validar",
    "lecturas.ver",
    "lecturas.escribir_asignadas",
    "avisos.crear",
    "consultas.responder",
    "notificaciones.ver",
  ],
  editor: [
    "panel.ver",
    "comunidad.publicar",
    "publicaciones.publicar",
    "publicaciones.gestionar",
    "publicaciones.moderar",
    "consultas.responder",
    "cultivos.ver",
    "notificaciones.ver",
  ],
  administrador: [
    "panel.ver",
    "perfil.editar",
    "parcelas.ver",
    "parcelas.crear",
    "parcelas.editar",
    "parcelas.eliminar",
    "accesos.gestionar",
    "lecturas.ver",
    "lecturas.crear",
    "campanias.gestionar",
    "lecturas.escribir_asignadas",
    "solicitudes.crear",
    "solicitudes.revisar",
    "usuarios.gestionar",
    "roles.gestionar",
    "cultivos.ver",
    "cultivos.validar",
    "comunidad.publicar",
    "publicaciones.publicar",
    "publicaciones.moderar",
    "consultas.responder",
    "consultas.crear",
    "consultas.calificar",
    "comentarios.reportar",
    "notificaciones.ver",
    "alertas.gestionar",
    "archivos.gestionar",
    "auditoria.ver",
    "avisos.crear",
    "publicaciones.gestionar",
    "catalogos.gestionar",
    "configuraciones.gestionar",
    "contacto.gestionar",
    "trabajos.gestionar",
  ],
};

const routers = [
  require("../src/modules/panel/panel.routes"),
  require("../src/modules/usuarios/usuarios.routes"),
  require("../src/modules/parcelas/parcelas.routes"),
  require("../src/modules/lecturas/lecturas.routes"),
  require("../src/modules/campanias/campanias.routes"),
  require("../src/modules/comunidad/consultas.routes"),
  require("../src/modules/comunidad/interacciones.routes"),
  require("../src/modules/notificaciones/notificaciones.routes"),
  require("../src/modules/tecnico/tecnico.routes"),
  require("../src/modules/admin/admin.routes"),
  require("../src/modules/editor/editor.routes"),
];

const rutasPrivadas = routers.flatMap((router) =>
  router.stack
    .filter((capa) => capa.route)
    .flatMap((capa) => {
      const controles = capa.route.stack
        .map((item) => item.handle)
        .filter(
          (funcion) =>
            funcion.esAutenticacion ||
            funcion.permisoRequerido ||
            funcion.rolesRequeridos,
        );
      if (!controles.length) return [];
      const ruta = capa.route.path.replace(/:\w+/g, "1");
      const metodos = Object.keys(capa.route.methods).filter((metodo) =>
        ["get", "post", "put", "patch", "delete"].includes(metodo),
      );
      return metodos.map((metodo) => ({ metodo, ruta, controles }));
    }),
);

function crearAppDeRol(roles) {
  const app = express();
  const permisos = [
    ...new Set(roles.flatMap((rol) => permisosPorRol[rol] || [])),
  ];
  app.use((req, res, next) => {
    req.session = {
      usuario: { id: 1, roles, permisos },
    };
    next();
  });
  for (const ruta of rutasPrivadas) {
    app[ruta.metodo](
      ruta.ruta,
      ...ruta.controles,
      (req, res) => res.sendStatus(204),
    );
  }
  app.use((error, req, res, next) => {
    res.status(error.estado || error.status || 500).end();
  });
  return app;
}

function puedeAcceder(controles, roles) {
  const permisos = new Set(roles.flatMap((rol) => permisosPorRol[rol] || []));
  return controles.every((control) => {
    if (control.permisoRequerido) {
      return permisos.has(control.permisoRequerido);
    }
    if (control.rolesRequeridos) {
      return control.rolesRequeridos.some((rol) => roles.includes(rol));
    }
    return true;
  });
}

describe("Matriz RBAC de rutas privadas", () => {
  test.each(Object.keys(permisosPorRol))(
    "comprueba cada ruta privada para el rol %s",
    async (rol) => {
      const app = crearAppDeRol([rol]);
      for (const ruta of rutasPrivadas) {
        const respuesta = await request(app)[ruta.metodo](ruta.ruta);
        expect(respuesta.status).toBe(
          puedeAcceder(ruta.controles, [rol]) ? 204 : 403,
        );
      }
    },
  );

  test("permite combinar permisos de varios roles en la sesión", async () => {
    const app = crearAppDeRol(["agricultor", "editor"]);
    expect((await request(app).get("/panel")).status).toBe(204);
    expect((await request(app).get("/editor")).status).toBe(204);
  });
});

describe("Protección CSRF", () => {
  test("rechaza un POST sin token CSRF", async () => {
    const app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use(leerCookies);
    app.use(exponerTokenCsrf);
    app.use(doubleCsrfProtection);
    app.get("/", (req, res) => res.sendStatus(200));
    app.post("/accion", (req, res) => res.sendStatus(204));
    app.use((error, req, res, next) => {
      res.status(error.statusCode || error.status || 500).end();
    });

    const agente = request.agent(app);
    expect((await agente.get("/")).status).toBe(200);
    const respuesta = await agente.post("/accion").type("form").send({});
    expect(respuesta.status).toBe(403);
  });
});

test("requiereRol acepta más de un rol", async () => {
  const app = express();
  app.use((req, res, next) => {
    req.session = { usuario: { roles: ["agricultor", "tecnico"] } };
    next();
  });
  app.get(
    "/tecnico",
    requiereSesion,
    requiereRol("tecnico", "administrador"),
    (req, res) => res.sendStatus(204),
  );
  app.use((error, req, res, next) => {
    res.status(error.estado || 500).end();
  });
  expect((await request(app).get("/tecnico")).status).toBe(204);
});
