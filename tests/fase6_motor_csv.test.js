const motor = require("../src/engine");
const { analizarCsv } = require("../src/modules/lecturas/csv");
const parcelasServicio = require("../src/modules/parcelas/parcelas.service");

describe("Motor con rangos almacenados", () => {
  const requerimiento = {
    hum_min: 20,
    hum_max: 35,
    temp_min: 10,
    temp_max: 18,
  };

  test("recomienda siembra cuando ambas lecturas cumplen el requerimiento", () => {
    expect(
      motor.evaluar(requerimiento, { humedad: 25, temperatura: 14 }).cls,
    ).toBe("ok");
  });

  test("no aplica ajustes fijos por zona y usa los límites recibidos", () => {
    expect(
      motor.evaluar(requerimiento, { humedad: 25, temperatura: 19 }).cls,
    ).toBe("mid");
    expect(
      motor.evaluar(requerimiento, { humedad: 36, temperatura: 19 }).cls,
    ).toBe("bad");
  });

  test("no recomienda con un requerimiento ausente", () => {
    expect(motor.evaluar(null, { humedad: 25, temperatura: 14 }).cls).toBe(
      "none",
    );
  });
});

describe("Vista previa de CSV", () => {
  test("conserva comas entre comillas e informa el número de la fila inválida", () => {
    const csv = [
      "fecha,humedad,temperatura,observacion",
      '2024-10-15,24.5,12.3,"llovió, fuerte"',
      "2024-10-16,150,12,",
    ].join("\n");
    const resultado = analizarCsv(Buffer.from(csv, "utf8"));
    expect(resultado.validas).toHaveLength(1);
    expect(resultado.validas[0].observacion).toBe("llovió, fuerte");
    expect(resultado.errores).toEqual([
      { linea: 3, mensaje: "humedad debe estar entre 0 y 100" },
    ]);
  });

  test("sugiere zona altitudinal usando los límites registrados en el catálogo", () => {
    const zonas = [
      { id: 1, altitud_min_m: 0, altitud_max_m: 3000 },
      { id: 2, altitud_min_m: 3000, altitud_max_m: 3800 },
      { id: 3, altitud_min_m: 3800, altitud_max_m: 5000 },
    ];
    expect(parcelasServicio.zonaSugerida(2999, zonas).id).toBe(1);
    expect(parcelasServicio.zonaSugerida(3000, zonas).id).toBe(2);
    expect(parcelasServicio.zonaSugerida(3800, zonas).id).toBe(3);
    expect(parcelasServicio.zonaSugerida(6000, zonas)).toBeNull();
  });
});
