const repositorio = require("./lecturas.repository");
const orquestador = require("../../services/fuentesDatos/orquestador");

async function sincronizarParcelas({ fecha = new Date() } = {}) {
  const parcelas = await repositorio.listarParcelasActivasParaSincronizar();
  const resumen = {
    parcelasProcesadas: 0,
    lecturasInsertadas: 0,
    fallidas: 0,
    sinDatos: 0,
    fuentesFallidas: [],
  };

  for (const parcela of parcelas) {
    resumen.parcelasProcesadas += 1;
    const resultado = await orquestador.obtenerLecturas(parcela, { fecha });
    const fallidas = resultado.fuentesFallidas;
    resumen.lecturasInsertadas += resultado.lecturasInsertadas;
    resumen.fallidas += fallidas.length;
    if (!resultado.fuentesConsultadas.length) resumen.sinDatos += 1;
    if (fallidas.length) {
      resumen.fuentesFallidas.push({
        parcelaId: parcela.id,
        fuentes: fallidas,
      });
    }
  }
  return resumen;
}

module.exports = { sincronizarParcelas };
