// Envuelve un controlador async para que cualquier promesa rechazada
// llegue al manejador central de errores de Express 4 (que no lo hace solo).
function asyncHandler(fn) {
  return function manejadorEnvuelto(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
