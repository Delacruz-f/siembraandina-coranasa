const env = require("../../config/env");

function metadatos(req, { titulo, descripcion, tipo = "website" }) {
  const base = env.correo.urlBase;
  return {
    titulo,
    descripcion,
    ogTitulo: titulo,
    ogDescripcion: descripcion,
    ogTipo: tipo,
    ogUrl: new URL(req.path, base).href,
    ogImagen: new URL("/img/andenes-sucsumarka.webp", base).href,
  };
}

module.exports = { metadatos };
