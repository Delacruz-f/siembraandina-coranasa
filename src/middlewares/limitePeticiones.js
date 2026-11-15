// Límite de peticiones por IP (express-rate-limit).
// Se aplica a rutas sensibles (login, registro, recuperación) para frenar
// ataques de fuerza bruta. En las pruebas se desactiva.
const rateLimit = require("express-rate-limit");
const env = require("../config/env");

function crearLimitador({
  ventanaMs = env.limitePeticiones.ventanaMs,
  maximo = env.limitePeticiones.maximo,
  mensaje,
} = {}) {
  return rateLimit({
    windowMs: ventanaMs,
    limit: maximo,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    // En pruebas no se limita para que Supertest pueda repetir peticiones.
    skip: () => env.entorno === "test",
    handler: (req, res) => {
      res.status(429).render("errores/429", {
        titulo: "Demasiados intentos",
        mensaje:
          mensaje ||
          "Hiciste demasiadas peticiones seguidas. Espera unos minutos e inténtalo de nuevo.",
      });
    },
  });
}

module.exports = { crearLimitador };
