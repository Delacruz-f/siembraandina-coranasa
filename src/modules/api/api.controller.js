// Controlador de la API v1 (Fase 12). Solo responde JSON.
const servicio = require("./api.service");

function ok(res, datos, extra = {}) {
  return res.json({ ok: true, datos, ...extra });
}

/** GET /api/v1 — metadatos de versión. */
function version(req, res) {
  return ok(res, {
    api: "1",
    nombre: "Siembra Andina API",
    documentacion: "/api/docs",
  });
}

async function cultivos(req, res) {
  return ok(res, await servicio.cultivos());
}

async function cultivo(req, res) {
  return ok(res, await servicio.cultivo(req.params.slug));
}

async function calendario(req, res) {
  const datos = await servicio.calendario(req.query);
  return ok(res, datos);
}

async function articulos(req, res) {
  const datos = await servicio.articulos({
    pagina: Number(req.query.pagina || 1),
    categoria: req.query.categoria,
    etiqueta: req.query.etiqueta,
    busqueda: req.query.q,
  });
  return ok(res, datos.articulos, {
    pagina: datos.pagina,
    paginas: datos.paginas,
    total: datos.total,
  });
}

async function articulo(req, res) {
  return ok(res, await servicio.articulo(req.params.slug));
}

async function comunidades(req, res) {
  return ok(res, await servicio.comunidades());
}

async function recomendacion(req, res) {
  return ok(
    res,
    await servicio.recomendacion(req.params.id, req.usuarioApi.id, req.query),
  );
}



module.exports = {
  version,
  cultivos,
  cultivo,
  calendario,
  articulos,
  articulo,
  comunidades,
  recomendacion,
};
