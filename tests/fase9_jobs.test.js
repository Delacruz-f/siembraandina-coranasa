jest.mock("../src/modules/lecturas/lecturas.repository", () => ({
  listarParcelasActivasParaSincronizar: jest.fn(),
}));

jest.mock("../src/services/fuentesDatos/orquestador", () => ({
  obtenerLecturas: jest.fn(),
}));

const repositorio = require("../src/modules/lecturas/lecturas.repository");
const orquestador = require("../src/services/fuentesDatos/orquestador");
const {
  sincronizarParcelas,
} = require("../src/modules/lecturas/sincronizacion.service");

describe("sincronizacion.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("orquesta todas las parcelas y resume lecturas y fallos por fuente", async () => {
    repositorio.listarParcelasActivasParaSincronizar.mockResolvedValue([
      { id: 10 },
      { id: 11 },
    ]);
    orquestador.obtenerLecturas
      .mockResolvedValueOnce({
        fuentesConsultadas: ["open_meteo_suelo", "nasa_power"],
        fuentesFallidas: [],
        lecturasInsertadas: 3,
      })
      .mockResolvedValueOnce({
        fuentesConsultadas: ["nasa_power"],
        fuentesFallidas: [
          { clave: "open_meteo_suelo", motivo: "tiempo agotado" },
        ],
        lecturasInsertadas: 1,
      });

    const fecha = new Date("2026-11-14T00:00:00.000Z");
    const resumen = await sincronizarParcelas({ fecha });

    expect(orquestador.obtenerLecturas).toHaveBeenNthCalledWith(
      1,
      { id: 10 },
      { fecha },
    );
    expect(orquestador.obtenerLecturas).toHaveBeenNthCalledWith(
      2,
      { id: 11 },
      { fecha },
    );
    expect(resumen).toEqual({
      parcelasProcesadas: 2,
      lecturasInsertadas: 4,
      fallidas: 1,
      sinDatos: 0,
      fuentesFallidas: [
        {
          parcelaId: 11,
          fuentes: [{ clave: "open_meteo_suelo", motivo: "tiempo agotado" }],
        },
      ],
    });
  });
});
