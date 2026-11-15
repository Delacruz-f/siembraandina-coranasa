// Pruebas unitarias del motor de recomendación (Fase 11).
// El motor no toca la base de datos: recibe el requerimiento agroagronómico
// y la última lectura, y devuelve una clasificación con motivos en español.
const motor = require("../src/engine");

const REQUERIMIENTO = {
  hum_min: 20,
  hum_max: 35,
  temp_min: 10,
  temp_max: 18,
};

describe("Motor de recomendación", () => {
  describe("casos sin datos suficientes", () => {
    test("sin lectura devuelve 'Sin datos' y pide registrar una lectura", () => {
      const resultado = motor.evaluar(REQUERIMIENTO, null);
      expect(resultado.cls).toBe("none");
      expect(resultado.titulo).toBe("Sin datos");
      expect(resultado.motivos.join(" ")).toMatch(/Registra una lectura/);
    });

    test("sin requerimiento avisa que falta el rango del cultivo y zona", () => {
      const resultado = motor.evaluar(null, { humedad: 25, temperatura: 14 });
      expect(resultado.cls).toBe("none");
      expect(resultado.titulo).toBe("Sin requerimiento");
      expect(resultado.motivos.join(" ")).toMatch(/rango agronómico/);
    });

    test("con texto no numérico devuelve 'Datos incompletos'", () => {
      const resultado = motor.evaluar(REQUERIMIENTO, {
        humedad: "muy húmedo",
        temperatura: 14,
      });
      expect(resultado.cls).toBe("none");
      expect(resultado.titulo).toBe("Datos incompletos");
    });

    test("rechaza rangos invertidos (mínimo mayor que máximo)", () => {
      const invertido = { ...REQUERIMIENTO, hum_min: 40, hum_max: 20 };
      expect(
        motor.evaluar(invertido, { humedad: 25, temperatura: 14 }).titulo,
      ).toBe("Datos incompletos");
    });

    test("acepta lecturas y rangos enviados como texto", () => {
      const resultado = motor.evaluar(
        { hum_min: "20", hum_max: "35", temp_min: "10", temp_max: "18" },
        { humedad: "25.5", temperatura: "14.2" },
      );
      expect(resultado.cls).toBe("ok");
    });
  });

  describe("clasificación", () => {
    test("siembra ahora cuando humedad y temperatura están en rango", () => {
      const resultado = motor.evaluar(REQUERIMIENTO, {
        humedad: 25,
        temperatura: 14,
      });
      expect(resultado).toMatchObject({ cls: "ok", titulo: "Siembra ahora" });
      expect(resultado.hr).toEqual([20, 35]);
      expect(resultado.tr).toEqual([10, 18]);
    });

    test("incluye los extremos del rango", () => {
      expect(
        motor.evaluar(REQUERIMIENTO, { humedad: 20, temperatura: 10 }).cls,
      ).toBe("ok");
      expect(
        motor.evaluar(REQUERIMIENTO, { humedad: 35, temperatura: 18 }).cls,
      ).toBe("ok");
    });

    test("siembra con cuidado si solo falla la humedad (baja)", () => {
      const resultado = motor.evaluar(REQUERIMIENTO, {
        humedad: 10,
        temperatura: 14,
      });
      expect(resultado.cls).toBe("mid");
      expect(resultado.motivos[0]).toMatch(/por debajo del rango/);
    });

    test("siembra con cuidado si solo falla la humedad (alta)", () => {
      const resultado = motor.evaluar(REQUERIMIENTO, {
        humedad: 50,
        temperatura: 14,
      });
      expect(resultado.cls).toBe("mid");
      expect(resultado.motivos[0]).toMatch(/supera el rango/);
    });

    test("siembra con cuidado si solo falla la temperatura", () => {
      expect(
        motor.evaluar(REQUERIMIENTO, { humedad: 25, temperatura: 5 }).cls,
      ).toBe("mid");
      expect(
        motor.evaluar(REQUERIMIENTO, { humedad: 25, temperatura: 25 }).cls,
      ).toBe("mid");
    });

    test("espera cuando fallan humedad y temperatura, con dos motivos", () => {
      const resultado = motor.evaluar(REQUERIMIENTO, {
        humedad: 5,
        temperatura: 30,
      });
      expect(resultado.cls).toBe("bad");
      expect(resultado.titulo).toBe("Espera");
      expect(resultado.motivos).toHaveLength(2);
      expect(resultado.motivos[0]).toMatch(/humedad/);
      expect(resultado.motivos[1]).toMatch(/temperatura/);
    });
  });

  describe("coherencia con los tres cultivos del proyecto", () => {
    const casos = [
      {
        cultivo: "papa",
        req: { hum_min: 22, hum_max: 32, temp_min: 9, temp_max: 15 },
      },
      {
        cultivo: "maíz",
        req: { hum_min: 25, hum_max: 38, temp_min: 13, temp_max: 20 },
      },
      {
        cultivo: "quinua",
        req: { hum_min: 15, hum_max: 28, temp_min: 8, temp_max: 16 },
      },
    ];

    test.each(casos)(
      "recomienda siembra para $cultivo en el centro del rango",
      ({ req }) => {
        const centro = {
          humedad: (req.hum_min + req.hum_max) / 2,
          temperatura: (req.temp_min + req.temp_max) / 2,
        };
        expect(motor.evaluar(req, centro).cls).toBe("ok");
      },
    );

    test.each(casos)(
      "descarta la siembra para $cultivo con suelo seco y frío",
      ({ req }) => {
        expect(
          motor.evaluar(req, {
            humedad: req.hum_min - 10,
            temperatura: req.temp_min - 5,
          }).cls,
        ).toBe("bad");
      },
    );
  });
});
