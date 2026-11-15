// Especificación OpenAPI 3.0 de la API v1 (Fase 12).
// Se sirve en /api/v1/openapi.json y se renderiza con Swagger UI en /api/docs.
// Las rutas de Swagger UI se sirven localmente desde node_modules (sin CDN),
// igual que el resto de las dependencias del frontend.
const env = require("../../config/env");

function especificacion() {
  const base = env.correo.urlBase;
  return {
    openapi: "3.0.3",
    info: {
      title: "Siembra Andina API",
      version: "1.0.0",
      description:
        "API pública y personal de Siembra Andina. Recomendaciones de siembra " +
        "para papa, maíz y quinua combinando el calendario tradicional con la " +
        "humedad y la temperatura del suelo.",
      contact: { name: "Equipo Siembra Andina" },
      license: { name: "Uso comunitario" },
    },
    servers: [
      { url: `${base}/api/v1`, description: "Servidor de esta instalación" },
    ],
    tags: [
      {
        name: "Catálogo",
        description: "Cultivos, variedades y requerimientos",
      },
      {
        name: "Calendario",
        description: "Ventanas de siembra y recomendaciones por ubicación",
      },
      { name: "Comunidad", description: "Artículos y comunidades registradas" },
      {
        name: "Consulta pública",
        description: "Ventanas orientativas de siembra sin autenticación",
      },
      {
        name: "Personal",
        description: "Datos del usuario autenticado con token",
      },
    ],
    components: {
      securitySchemes: {
        tokenPersonal: {
          type: "http",
          scheme: "bearer",
          description:
            "Token personal (saa_...). Se genera en el perfil web y solo se muestra una vez.",
        },
      },
      schemas: {
        Respuesta: {
          type: "object",
          properties: {
            ok: { type: "boolean", example: true },
            datos: { type: "object" },
          },
        },
        Error: {
          type: "object",
          properties: {
            ok: { type: "boolean", example: false },
            error: {
              type: "object",
              properties: {
                codigo: { type: "string", example: "no_encontrado" },
                mensaje: { type: "string" },
                detalles: { type: "array", items: { type: "object" } },
              },
            },
          },
        },
        Cultivo: {
          type: "object",
          properties: {
            id: { type: "integer" },
            slug: { type: "string", example: "papa" },
            nombre: { type: "string" },
            descripcion: { type: "string", nullable: true },
            resumen: { type: "string" },
          },
        },
        Recomendacion: {
          type: "object",
          properties: {
            parcela: {
              type: "object",
              properties: {
                id: { type: "integer" },
                nombre: { type: "string" },
                cultivo: { type: "string" },
              },
            },
            lectura: {
              type: "object",
              properties: {
                fecha: { type: "string", format: "date" },
                humedad: { type: "number", example: 26.4 },
                temperatura: { type: "number", example: 12.1 },
              },
            },
            requerimiento: {
              type: "object",
              nullable: true,
              properties: {
                humedad_min: { type: "number" },
                humedad_max: { type: "number" },
                temperatura_min: { type: "number" },
                temperatura_max: { type: "number" },
              },
            },
            recomendacion: {
              type: "object",
              properties: {
                codigo: { type: "string", enum: ["ok", "mid", "bad", "none"] },
                titulo: { type: "string", example: "Siembra ahora" },
                motivos: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
      },
    },
    paths: {
      "/api/publico/consulta": {
        post: {
          servers: [
            {
              url: base,
              description: "Rutas públicas fuera de /api/v1",
            },
          ],
          tags: ["Consulta pública"],
          summary: "Calcula ventanas orientativas de siembra",
          description:
            "Usa NASA POWER (historial de cinco años), Open-Meteo (pronóstico de 16 días) y el calendario tradicional. No guarda IP ni coordenadas; requiere un token CSRF obtenido al cargar /consulta. Límite: 10 solicitudes por 15 minutos e IP.",
          requestBody: {
            required: true,
            content: {
              "application/x-www-form-urlencoded": {
                schema: {
                  type: "object",
                  required: ["_csrf", "cultivo"],
                  properties: {
                    _csrf: { type: "string" },
                    distrito_id: { type: "integer", minimum: 1 },
                    provincia_id: { type: "integer", minimum: 1 },
                    latitud: { type: "number", minimum: -90, maximum: 90 },
                    longitud: { type: "number", minimum: -180, maximum: 180 },
                    cultivo: {
                      type: "string",
                      enum: ["papa", "maiz", "quinua", "no-se"],
                    },
                  },
                },
                example: {
                  _csrf: "token-obtenido-al-cargar-la-pagina",
                  latitud: -13.52,
                  longitud: -71.97,
                  cultivo: "papa",
                },
              },
            },
          },
          responses: {
            200: {
              description:
                "Ventanas calculadas; la respuesta omite las coordenadas enviadas.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean", example: true },
                      resultado: {
                        type: "object",
                        properties: {
                          lugar: { type: "string" },
                          confianza: {
                            type: "string",
                            enum: ["alta", "media", "baja"],
                          },
                          cultivos: {
                            type: "array",
                            items: { type: "object" },
                          },
                          explicacion: { type: "string" },
                          generadoConIA: { type: "boolean" },
                        },
                      },
                    },
                  },
                },
              },
            },
            400: { description: "Ubicación o cultivo no válido" },
            403: { description: "Token CSRF inválido" },
            429: { description: "Límite de peticiones excedido" },
          },
        },
      },
      "/": {
        get: {
          tags: ["Catálogo"],
          summary: "Metadatos de la versión",
          responses: { 200: { description: "Versión y documentación" } },
        },
      },
      "/cultivos": {
        get: {
          tags: ["Catálogo"],
          summary: "Lista los cultivos activos",
          responses: {
            200: {
              description: "Catálogo de cultivos",
              content: {
                "application/json": {
                  schema: {
                    allOf: [
                      { $ref: "#/components/schemas/Respuesta" },
                      {
                        type: "object",
                        properties: {
                          datos: {
                            type: "array",
                            items: { $ref: "#/components/schemas/Cultivo" },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        },
      },
      "/cultivos/{slug}": {
        get: {
          tags: ["Catálogo"],
          summary:
            "Ficha de un cultivo: variedades, requerimientos y calendario",
          parameters: [
            {
              name: "slug",
              in: "path",
              required: true,
              schema: { type: "string" },
              example: "papa",
            },
          ],
          responses: {
            200: { description: "Ficha del cultivo" },
            404: {
              description: "Cultivo no encontrado",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
          },
        },
      },
      "/calendario": {
        get: {
          tags: ["Calendario"],
          summary: "Ventanas de siembra y recomendación por ubicación",
          parameters: [
            {
              name: "cultivo",
              in: "query",
              schema: { type: "string" },
              example: "papa",
            },
            {
              name: "departamento",
              in: "query",
              schema: { type: "integer" },
              example: 8,
            },
            { name: "provincia", in: "query", schema: { type: "integer" } },
            { name: "distrito", in: "query", schema: { type: "integer" } },
          ],
          responses: { 200: { description: "Calendario y recomendaciones" } },
        },
      },
      "/articulos": {
        get: {
          tags: ["Comunidad"],
          summary: "Artículos publicados",
          parameters: [
            {
              name: "pagina",
              in: "query",
              schema: { type: "integer", minimum: 1 },
            },
            { name: "categoria", in: "query", schema: { type: "string" } },
            { name: "etiqueta", in: "query", schema: { type: "string" } },
            {
              name: "q",
              in: "query",
              schema: { type: "string", maxLength: 120 },
            },
          ],
          responses: { 200: { description: "Listado paginado" } },
        },
      },
      "/articulos/{slug}": {
        get: {
          tags: ["Comunidad"],
          summary: "Detalle de un artículo",
          parameters: [
            {
              name: "slug",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: { description: "Artículo" },
            404: { description: "No encontrado" },
          },
        },
      },
      "/comunidades": {
        get: {
          tags: ["Comunidad"],
          summary: "Comunidades registradas con su ubicación",
          responses: { 200: { description: "Lista de comunidades" } },
        },
      },
      "/parcelas/{id}/recomendacion": {
        get: {
          tags: ["Personal"],
          summary: "Recomendación de siembra para una parcela propia",
          security: [{ tokenPersonal: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "integer" },
            },
            {
              name: "fecha",
              in: "query",
              schema: { type: "string", format: "date" },
            },
          ],
          responses: {
            200: {
              description: "Recomendación calculada",
              content: {
                "application/json": {
                  schema: {
                    allOf: [
                      { $ref: "#/components/schemas/Respuesta" },
                      {
                        type: "object",
                        properties: {
                          datos: { $ref: "#/components/schemas/Recomendacion" },
                        },
                      },
                    ],
                  },
                },
              },
            },
            401: { description: "Token ausente, vencido o revocado" },
            404: { description: "Parcela no encontrada o sin lecturas" },
          },
        },
      },
    },
  };
}

module.exports = { especificacion };
