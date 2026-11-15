// Middlewares de autenticación y autorización.
// - requiereSesion: exige usuario autenticado.
// - requierePermiso(clave): exige un permiso concreto (tabla rol_permisos).
// - requiereRol(clave): exige un rol concreto.
const { noAutorizado, prohibido } = require("../utils/errores");
const usuariosServicio = require("../modules/usuarios/usuarios.service");

function sincronizarSesion(req, res, next) {
  const usuarioActual = req.session && req.session.usuario;
  if (!usuarioActual) return next();

  usuariosServicio
    .cargarSesion(usuarioActual.id)
    .then((usuario) => {
      if (usuario) {
        req.session.usuario = usuario;
        return next();
      }
      req.session.destroy((error) => {
        if (error) return next(error);
        return next();
      });
    })
    .catch(next);
}

function requiereSesion(req, res, next) {
  if (req.session && req.session.usuario) return next();
  // Se recuerda a dónde quería ir para volver después del login.
  if (req.method === "GET") req.session.destino = req.originalUrl;
  return next(noAutorizado());
}

function tienePermiso(usuario, clave) {
  return Boolean(
    usuario &&
    Array.isArray(usuario.permisos) &&
    usuario.permisos.includes(clave),
  );
}

function requierePermiso(clave) {
  const middleware = function verificarPermiso(req, res, next) {
    const usuario = req.session && req.session.usuario;
    if (!usuario) return next(noAutorizado());
    if (!tienePermiso(usuario, clave)) return next(prohibido());
    return next();
  };
  middleware.permisoRequerido = clave;
  return middleware;
}

function requiereRol(...claves) {
  if (!claves.length || claves.some((clave) => typeof clave !== "string")) {
    throw new TypeError("requiereRol necesita al menos una clave de rol.");
  }
  const middleware = function verificarRol(req, res, next) {
    const usuario = req.session && req.session.usuario;
    if (!usuario) return next(noAutorizado());
    if (!usuario.roles || !claves.some((clave) => usuario.roles.includes(clave)))
      return next(prohibido());
    return next();
  };
  middleware.rolesRequeridos = claves;
  return middleware;
}

requiereSesion.esAutenticacion = true;

module.exports = {
  sincronizarSesion,
  requiereSesion,
  requierePermiso,
  requiereRol,
  tienePermiso,
};
