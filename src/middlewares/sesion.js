// Sesión de usuario con express-session y almacenamiento en la base de datos
// (connect-session-knex), para que las sesiones sobrevivan a un reinicio.
const session = require("express-session");
const { ConnectSessionKnexStore } = require("connect-session-knex");
const env = require("../config/env");
const { db } = require("../config/db");
const logger = require("../config/logger");

function crearSesion() {
  const almacen = new ConnectSessionKnexStore({
    knex: db,
    // La tabla "sesiones" la crea la migración; el store no debe crearla solo.
    createTable: false,
    tableName: "sesiones",
    sidFieldName: "sid",
    cleanupInterval: 15 * 60 * 1000,
    onDbCleanupError: (error) =>
      logger.warn(
        { err: error },
        "No se pudieron limpiar las sesiones vencidas",
      ),
  });

  // Si la tabla no existe (falta `npm run migrate`), el store rechaza su
  // promesa interna. Se captura aquí para que no tumbe el proceso: el
  // servidor arranca y /salud indica que la base no está lista.
  if (almacen.ready && typeof almacen.ready.catch === "function") {
    almacen.ready.catch((error) => {
      logger.error(
        { err: error },
        'El almacén de sesiones no está listo. ¿Ejecutaste "npm run migrate"?',
      );
    });
  }

  return session({
    name: env.sesion.nombreCookie,
    secret: env.sesion.secreto,
    store: almacen,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: env.sesion.cookieSegura,
      maxAge: env.sesion.duracionMs,
    },
  });
}

module.exports = { crearSesion };
