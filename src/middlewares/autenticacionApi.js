// Autenticación de la API v1 con tokens personales (Fase 12).
// El cliente envía `Authorization: Bearer saa_...`.
// Las respuestas son siempre JSON y nunca redirigen al login.
const tokensService = require("../modules/api/tokens.service");
const { ErrorHttp } = require("../utils/errores");

/** Exige un token válido y deja el usuario en req.usuarioApi. */
async function requiereTokenApi(req, res, next) {
  const usuario = await tokensService.autenticar(req.get("authorization"));
  if (!usuario) {
    return next(
      new ErrorHttp(401, "Token de API ausente, vencido o revocado.", {
        codigo: "token_api_invalido",
        detalles: { cabecera: "Authorization: Bearer <token>" },
      }),
    );
  }
  req.usuarioApi = usuario;
  return next();
}

module.exports = { requiereTokenApi };
