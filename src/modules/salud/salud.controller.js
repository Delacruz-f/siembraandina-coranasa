// Controlador de salud: responde JSON con el estado del servicio.
const servicio = require("./salud.service");

async function comprobar(req, res) {
  const resultado = await servicio.estadoDelSistema();
  // 200 si todo está bien; 503 si la base de datos no responde
  // (así lo entienden los balanceadores y monitores de despliegue).
  res.status(resultado.ok ? 200 : 503).json({
    ok: resultado.ok,
    estado: resultado.estado,
    ...resultado.datos,
  });
}

module.exports = { comprobar };
