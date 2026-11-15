// Error de aplicación con código HTTP y mensaje apto para el usuario.
// Los services y controllers lanzan estos errores; el manejador central
// decide qué página o JSON mostrar.
class ErrorHttp extends Error {
  /**
   * @param {number} estado Código HTTP (400, 403, 404, 500...).
   * @param {string} mensaje Mensaje en español para el usuario.
   * @param {object} [opciones] { codigo, detalles, causa }
   */
  constructor(estado, mensaje, { codigo, detalles, causa } = {}) {
    super(mensaje);
    this.name = "ErrorHttp";
    this.estado = estado;
    this.codigo = codigo || null;
    this.detalles = detalles || null;
    // Error original (por ejemplo, de la base de datos) para el log.
    this.causa = causa || null;
    // Marca para que el manejador central sepa que es un error "esperado".
    this.esOperacional = true;
  }
}

const noEncontrado = (mensaje = "No encontramos lo que buscabas.") =>
  new ErrorHttp(404, mensaje, { codigo: "no_encontrado" });
const prohibido = (mensaje = "No tienes permiso para realizar esta acción.") =>
  new ErrorHttp(403, mensaje, { codigo: "prohibido" });
const noAutorizado = (mensaje = "Debes iniciar sesión para continuar.") =>
  new ErrorHttp(401, mensaje, { codigo: "no_autorizado" });
const solicitudInvalida = (
  mensaje = "Los datos enviados no son válidos.",
  detalles,
) => new ErrorHttp(400, mensaje, { codigo: "solicitud_invalida", detalles });

module.exports = {
  ErrorHttp,
  noEncontrado,
  prohibido,
  noAutorizado,
  solicitudInvalida,
};
