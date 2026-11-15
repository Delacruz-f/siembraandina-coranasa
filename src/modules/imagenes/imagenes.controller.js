// Controlador de las rutas controladas de imágenes.
// Las imágenes nunca se sirven como estáticos: pasan por aquí para aplicar
// permisos, cabeceras de caché y tipos MIME seguros.
const servicio = require("./imagenes.service");
const acceso = require("./imagenes.acceso");

function enviar(res, binario, { cacheable }) {
  res
    .type(binario.mime)
    .set("X-Content-Type-Options", "nosniff")
    .set("Content-Security-Policy", "default-src 'none'; sandbox")
    .set(
      "Cache-Control",
      cacheable
        ? "public, max-age=31536000, immutable"
        : "private, max-age=300, must-revalidate",
    );
  return res.send(binario.buffer);
}

/** GET /media/imagenes/:id/:ancho? — imágenes públicas (artículos, cultivos). */
async function publica(req, res) {
  const archivo = await acceso.obtenerPublica(req.params.id);
  const binario = await acceso.resolverBinario(archivo, {
    ancho: req.params.ancho,
    formato: req.query.formato,
  });
  return enviar(res, binario, { cacheable: true });
}

/** GET /media/privadas/:id/:ancho? — imágenes privadas con permisos. */
async function privada(req, res) {
  const archivo = await acceso.obtenerPrivada(
    req.params.id,
    req.session && req.session.usuario,
  );
  const binario = await acceso.resolverBinario(archivo, {
    ancho: req.params.ancho,
    formato: req.query.formato,
  });
  return enviar(res, binario, { cacheable: false });
}

/** GET /media/imagenes/:id — redirige a la variante de 800 px. */
function redirigir(req, res) {
  return res.redirect(302, `/media/imagenes/${req.params.id}/800`);
}

/** GET /media/privadas/:id — redirige a la variante de 800 px. */
function redirigirPrivada(req, res) {
  return res.redirect(302, `/media/privadas/${req.params.id}/800`);
}

/** Datos de presentación (srcset, proporción, atribución) para las vistas. */
async function presentacion(id, { publica: esPublica = false } = {}) {
  const archivo = await servicio.obtenerDetalle(id);
  if (!archivo) return null;
  return servicio.describe(archivo, { publica: esPublica });
}

module.exports = {
  publica,
  privada,
  redirigir,
  redirigirPrivada,
  presentacion,
};
