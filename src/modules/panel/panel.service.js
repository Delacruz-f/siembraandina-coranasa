// Compone recomendaciones, alertas y pronósticos para las parcelas propias.
const parcelasServicio = require("../parcelas/parcelas.service");
const lecturasServicio = require("../lecturas/lecturas.service");
const cultivosRepositorio = require("../cultivos/cultivos.repository");
const repositorio = require("./panel.repository");
const motor = require("../../engine");
const condicionesServicio = require("../parcelas/condiciones.service");

function evitarNASAObsoleta(condiciones, ocultar) {
  if (!ocultar) return condiciones;
  const resultado = { ...condiciones };
  for (const metrica of ["humedad", "temperatura"]) {
    const lectura = condiciones[metrica];
    if (
      lectura.fuentes.length === 1 &&
      lectura.fuentes[0].clave === "nasa_power"
    ) {
      resultado[metrica] = {
        ...lectura,
        valor: null,
        confianza: "sin_datos",
      };
    }
  }
  return resultado;
}

async function resumen(usuarioId) {
  const [parcelas, alertas] = await Promise.all([
    parcelasServicio.listar(usuarioId),
    repositorio.listarAlertasProximas(usuarioId),
  ]);
  const tarjetas = await Promise.all(
    parcelas.map(async (parcela) => {
      const [
        ultima,
        ultimaNASA,
        sincronizacionNASA,
        requerimiento,
        condiciones,
        pronostico,
      ] = await Promise.all([
        lecturasServicio.ultima(parcela.id),
        lecturasServicio.ultimaDeFuente(parcela.id, "nasa_power"),
        lecturasServicio.estadoSincronizacion(parcela.id, "nasa_power"),
        cultivosRepositorio.buscarRequerimientoPorCultivoZona(
          parcela.cultivo_id,
          parcela.zona_id,
        ),
        condicionesServicio.consolidar(parcela.id),
        condicionesServicio.obtenerPronostico(parcela),
      ]);
      const datosExternos = {
        disponibles: Boolean(
          sincronizacionNASA &&
          sincronizacionNASA.exitosa &&
          sincronizacionNASA.fecha_ultimo_dato,
        ),
        consultadoEn: sincronizacionNASA ? sincronizacionNASA.consultado_en : null,
        fechaUltimoDato: ultimaNASA ? ultimaNASA.fecha : null,
      };
      const recomendacionUsaLecturaAntigua =
        ultima &&
        ultima.fuente === "nasa_power" &&
        sincronizacionNASA &&
        !sincronizacionNASA.exitosa;
      const condicionesParaRecomendacion = evitarNASAObsoleta(
        condiciones,
        Boolean(recomendacionUsaLecturaAntigua),
      );
      return {
        ...parcela,
        ultima,
        condiciones,
        datosExternos,
        recomendacion: motor.evaluarV2({
          condiciones: condicionesParaRecomendacion,
          requerimiento,
          pronostico,
        }),
        pronostico,
      };
    }),
  );
  return { parcelas: tarjetas, alertas };
}

module.exports = { resumen };
