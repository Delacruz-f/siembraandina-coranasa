jest.mock("../src/config/db", () => ({
  db: jest.fn(),
}));

jest.mock("../src/utils/baseDatos", () => ({
  insertarYDevolverId: jest.fn(),
}));

const { db } = require("../src/config/db");
const repositorio = require("../src/modules/lecturas/lecturas.repository");

describe("lecturas.repository.registrarAutomaticas", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.transaction = jest.fn();
  });

  test("ignora fechas existentes y repetidas antes de insertar", async () => {
    const consultaExistentes = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockResolvedValue([{ fecha: "2026-11-12" }]),
    };
    const consultaInsercion = {
      insert: jest.fn().mockReturnThis(),
      onConflict: jest.fn().mockReturnThis(),
      ignore: jest.fn().mockResolvedValue([]),
    };
    const trx = jest
      .fn()
      .mockReturnValueOnce(consultaExistentes)
      .mockReturnValueOnce(consultaInsercion);
    db.transaction.mockImplementation((operacion) => operacion(trx));

    const lecturas = [
      { fecha: "2026-11-11", humedad: 40, temperatura: 10 },
      { fecha: "2026-11-11", humedad: 42, temperatura: 11 },
      { fecha: "2026-11-12", humedad: 50, temperatura: 12 },
      { fecha: "2026-11-13", humedad: 60, temperatura: 13 },
    ];

    const insertadas = await repositorio.registrarAutomaticas(9, 1, lecturas);

    expect(insertadas).toBe(2);
    expect(consultaExistentes.where).toHaveBeenCalledWith({
      parcela_id: 9,
      fuente_id: 1,
    });
    expect(consultaInsercion.insert).toHaveBeenCalledWith([
      expect.objectContaining({ fecha: "2026-11-11", humedad: 40 }),
      expect.objectContaining({ fecha: "2026-11-13", humedad: 60 }),
    ]);
    expect(consultaInsercion.onConflict).toHaveBeenCalledWith([
      "parcela_id",
      "fuente_id",
      "fecha",
    ]);
    expect(consultaInsercion.ignore).toHaveBeenCalledTimes(1);
  });
});
