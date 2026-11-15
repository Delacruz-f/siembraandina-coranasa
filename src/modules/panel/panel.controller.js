// Controlador del panel principal: muestra el resumen según el rol.
const panelServicio = require("./panel.service");
const solicitudesRepositorio = require("../usuarios/solicitudes.repository");

async function panel(req, res) {
  const usuario = req.session.usuario;
  const destinosPorRol = {
    administrador: "/admin",
    tecnico: "/tecnico",
    editor: "/editor",
  };
  if (destinosPorRol[usuario.rol])
    return res.redirect(destinosPorRol[usuario.rol]);
  if (usuario.rol !== "agricultor") return res.redirect("/");

  const [resumen, solicitud] = await Promise.all([
    panelServicio.resumen(usuario.id),
    solicitudesRepositorio.ultimaDe(usuario.id),
  ]);
  res.render("panel/inicio", {
    titulo: "Mi panel",
    ...resumen,
    solicitud,
  });
}

module.exports = { panel };
