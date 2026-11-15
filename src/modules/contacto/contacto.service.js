const repositorio = require("./contacto.repository");

async function recibir(datos) {
  return repositorio.guardar({
    nombre: datos.nombre.trim(),
    email: datos.email.trim().toLowerCase(),
    asunto: datos.asunto.trim(),
    mensaje: datos.mensaje.trim(),
  });
}

module.exports = { recibir };
