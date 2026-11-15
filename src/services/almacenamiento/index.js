// Punto único de acceso al almacenamiento de imágenes.
// El resto de la aplicación solo conoce estas funciones; cambiar de disco
// local a S3 o Cloudinary se hace con la variable STORAGE_DRIVER.
const env = require("../../config/env");
const { validarAdaptador } = require("./almacenamiento");
const local = require("./adaptadorLocal");
const remotos = require("./adaptadoresRemotos");

let adaptador = null;

/** Devuelve el adaptador configurado (se crea una sola vez). */
function obtenerAdaptador() {
  if (adaptador) return adaptador;
  switch (env.almacenamiento.adaptador) {
    case "s3":
      adaptador = remotos.crearAdaptadorS3(env.almacenamiento.s3);
      break;
    case "cloudinary":
      adaptador = remotos.crearAdaptadorCloudinary(
        env.almacenamiento.cloudinary,
      );
      break;
    case "local":
    default:
      adaptador = local.crearAdaptador({ directorio: env.subidas.directorio });
      break;
  }
  return validarAdaptador(adaptador);
}

// Interfaz pública: se delega siempre al adaptador vigente.
const almacenamiento = {
  get nombre() {
    return obtenerAdaptador().nombre;
  },
  guardar: (...args) => obtenerAdaptador().guardar(...args),
  leer: (...args) => obtenerAdaptador().leer(...args),
  existe: (...args) => obtenerAdaptador().existe(...args),
  eliminar: (...args) => obtenerAdaptador().eliminar(...args),
  listar: (...args) => obtenerAdaptador().listar(...args),
  urlPublica: (...args) => obtenerAdaptador().urlPublica(...args),
};

module.exports = almacenamiento;
