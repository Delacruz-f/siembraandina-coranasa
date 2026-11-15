const env = require("../../config/env");
const { validarImplementacion } = require("./fuenteDatos");

const smap = validarImplementacion({
  clave: "smap",
  async obtener() {
    if (!env.fuentesDatos.earthdata.usuario || !env.fuentesDatos.earthdata.token) {
      throw new Error("Configura EARTHDATA_USER y EARTHDATA_TOKEN para habilitar SMAP.");
    }
    throw new Error(
      "El adaptador SMAP implementa el contrato común, pero requiere definir el producto y endpoint de descarga NASA Earthdata antes de activarse.",
    );
  },
});

module.exports = { smap };
