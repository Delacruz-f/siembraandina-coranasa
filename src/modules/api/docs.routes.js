// Documentación interactiva de la API (Fase 12).
// GET /api/docs      -> página con Swagger UI
// GET /api/docs/*    -> archivos de Swagger UI servidos desde node_modules
// La CSP se ajusta solo en esta ruta: Swagger UI necesita inline styles/scripts.
const path = require("path");
const express = require("express");
const helmet = require("helmet");

const router = express.Router();
const DIRECTORIO = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "node_modules",
  "swagger-ui-dist",
);

const cspDocs = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'", "'unsafe-inline'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "data:"],
      "font-src": ["'self'", "data:"],
      "connect-src": ["'self'"],
      "object-src": ["'none'"],
      "frame-ancestors": ["'none'"],
      "base-uri": ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
});

function pagina(req, res) {
  const base = req.baseUrl || "";
  res.type("html").send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>API de Siembra Andina · Documentación</title>
  <link rel="stylesheet" href="${base}/swagger-ui.css">
  <link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="${base}/swagger-ui-bundle.js"></script>
  <script src="${base}/swagger-ui-standalone-preset.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: "/api/v1/openapi.json",
      dom_id: "#swagger-ui",
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
      layout: "BaseLayout",
      defaultModelsExpandDepth: -1
    });
  </script>
</body>
</html>`);
}

router.get("/api/docs", cspDocs, pagina);
router.get("/api/docs/swagger-ui.css", cspDocs, (req, res) =>
  res.sendFile(path.join(DIRECTORIO, "swagger-ui.css")),
);
router.get("/api/docs/swagger-ui-bundle.js", cspDocs, (req, res) =>
  res.sendFile(path.join(DIRECTORIO, "swagger-ui-bundle.js")),
);
router.get("/api/docs/swagger-ui-standalone-preset.js", cspDocs, (req, res) =>
  res.sendFile(path.join(DIRECTORIO, "swagger-ui-standalone-preset.js")),
);

module.exports = router;
