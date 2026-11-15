const { ErrorHttp } = require("../utils/errores");

function requiereCorreoVerificado(req, res, next) {
  const usuario = req.session && req.session.usuario;
  if (!usuario) {
    return next(new ErrorHttp(401, "Debes iniciar sesión para continuar."));
  }
  if (usuario.correoVerificado || usuario.email_verificado_en) {
    return next();
  }
  return next(
    new ErrorHttp(403, "Verifica tu correo para usar esta función.", {
      codigo: "correo_verificacion_requerida",
    }),
  );
}

module.exports = { requiereCorreoVerificado };
