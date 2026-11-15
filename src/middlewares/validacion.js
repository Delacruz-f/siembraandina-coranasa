// Middleware de validación con express-validator.
// Uso: router.post('/', validar([body('email').isEmail()]), controlador)
// Si hay errores, se lanza un 400 con el detalle por campo (en español).
const { validationResult } = require("express-validator");
const { solicitudInvalida } = require("../utils/errores");

function validar(cadena) {
  return async function ejecutarValidacion(req, res, next) {
    await Promise.all(cadena.map((validador) => validador.run(req)));
    const resultado = validationResult(req);
    if (resultado.isEmpty()) return next();
    const detalles = resultado
      .array()
      .map((e) => ({ campo: e.path, mensaje: e.msg }));
    return next(
      solicitudInvalida("Revisa los datos del formulario.", detalles),
    );
  };
}

module.exports = { validar };
