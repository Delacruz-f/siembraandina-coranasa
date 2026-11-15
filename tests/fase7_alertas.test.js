const { diasConsecutivos, comparar } = require("../src/modules/alertas/alertas.service");

describe("Evaluación de reglas de alertas", () => {
  test("detecta la condición solo en tres días consecutivos bajo el umbral", () => {
    const hoy = new Date();
    const lecturas = [0, 1, 2].map((diasAtras, indice) => {
      const fecha = new Date(hoy);
      fecha.setUTCDate(fecha.getUTCDate() - diasAtras);
      return {
        fecha: fecha.toISOString().slice(0, 10),
        humedad: 10 + indice,
      };
    });

    expect(diasConsecutivos(lecturas, 3, 20, "lt")).toBe(true);
    expect(diasConsecutivos(lecturas.slice(0, 2), 3, 20, "lt")).toBeNull();
  });

  test("no interpreta como persistente un día faltante", () => {
    const hoy = new Date();
    const dias = [0, 2, 3].map((diasAtras) => {
      const fecha = new Date(hoy);
      fecha.setUTCDate(fecha.getUTCDate() - diasAtras);
      return {
        fecha: fecha.toISOString().slice(0, 10),
        humedad: 10,
      };
    });

    expect(diasConsecutivos(dias, 3, 20, "lt")).toBeNull();
  });

  test("compara límites estrictos e inclusivos", () => {
    expect(comparar(10, "lt", 10)).toBe(false);
    expect(comparar(10, "lte", 10)).toBe(true);
  });
});
