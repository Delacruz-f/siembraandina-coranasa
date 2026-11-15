// Interfaz común de almacenamiento de binarios.
// Cada adaptador (local, S3, Cloudinary...) implementa estas operaciones. El
// servicio de imágenes no sabe dónde viven los archivos: solo guarda y lee
// "claves" opacas. Para pasar a S3 o Cloudinary basta con implementar este
// contrato y elegir el adaptador con STORAGE_DRIVER.
//
// Contrato (todas las operaciones devuelven promesas):
//   guardar(clave, buffer) -> { clave, tamano }
//   leer(clave)            -> Buffer
//   existe(clave)          -> boolean
//   eliminar(clave)        -> void (ignora ENOENT)
//   listar(directorio)     -> [{ clave, tamano, modificadoEn }]
//   urlPublica(clave)      -> string | null  (solo si el adaptador sirve por URL)

class AdaptadorInvalido extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = "AdaptadorInvalido";
  }
}

/** Comprueba que un adaptador cumple el contrato completo. */
function validarAdaptador(adaptador) {
  const obligatorios = [
    "guardar",
    "leer",
    "existe",
    "eliminar",
    "listar",
    "urlPublica",
  ];
  const faltantes = obligatorios.filter(
    (metodo) => typeof adaptador[metodo] !== "function",
  );
  if (faltantes.length) {
    throw new AdaptadorInvalido(
      `Al adaptador de almacenamiento le faltan métodos: ${faltantes.join(", ")}.`,
    );
  }
  return adaptador;
}

module.exports = { validarAdaptador, AdaptadorInvalido };
