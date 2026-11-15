jest.mock("../src/config/db", () => ({
  db: jest.fn(),
}));
jest.mock("../src/utils/baseDatos", () => ({
  insertarYDevolverId: jest.fn(),
}));

const { db } = require("../src/config/db");
const repositorio = require("../src/modules/alertas/alertas.repository");

describe("deduplicación diaria de alertas", () => {
  test("consulta si ya existe una alerta de la misma regla en la fecha de Perú", async () => {
    const consulta = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue({ id: 8 }),
    };
    db.mockReturnValue(consulta);

    const existe = await repositorio.existeAlertaDelDia(
      3,
      12,
      new Date("2025-02-05T12:00:00.000Z"),
    );

    expect(existe).toBe(true);
    expect(consulta.where).toHaveBeenCalledWith({
      regla_id: 3,
      parcela_id: 12,
    });
    expect(consulta.andWhere).toHaveBeenNthCalledWith(
      1,
      "fecha",
      ">=",
      new Date("2025-02-05T05:00:00.000Z"),
    );
    expect(consulta.andWhere).toHaveBeenNthCalledWith(
      2,
      "fecha",
      "<",
      new Date("2025-02-06T05:00:00.000Z"),
    );
  });
});
