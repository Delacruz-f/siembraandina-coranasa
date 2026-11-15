jest.mock("../src/modules/parcelas/condiciones.repository", () => ({
  listarUltimasLecturasPorFuente: jest.fn(),
  listarConfiguraciones: jest.fn(),
}));
jest.mock("../src/openMeteo", () => ({
  pronostico: jest.fn(),
  obtenerSuelo: jest.fn(),
}));
jest.mock("../src/config/logger", () => ({
  warn: jest.fn(),
}));

const path = require("node:path");
const ejs = require("ejs");
const repositorio = require("../src/modules/parcelas/condiciones.repository");
const openMeteo = require("../src/openMeteo");
const condiciones = require("../src/modules/parcelas/condiciones.service");
const motor = require("../src/engine");
const { paraIdioma } = require("../src/i18n");

const CONFIGURACIONES = [
  ["condiciones.tolerancia_humedad_pct", "5"],
  ["condiciones.tolerancia_temperatura_c", "3"],
  ["condiciones.vigencia_manual_horas", "48"],
  ["pronostico.riesgo_helada_c", '{"valor":2,"validado":false}'],
  ["pronostico.helada_c", '{"valor":0,"validado":false}'],
  ["pronostico.lluvia_significativa_mm", '{"valor":5,"validado":false}'],
].map(([clave, valor]) => ({ clave, valor }));

const AHORA = Date.parse("2025-02-05T12:00:00.000Z");
const REQUERIMIENTO = {
  hum_min: 20,
  hum_max: 35,
  temp_min: 10,
  temp_max: 18,
};

function lectura(fuente, humedad, temperatura, fecha, extra = {}) {
  return {
    fuente,
    fuente_nombre: fuente,
    humedad,
    temperatura,
    fecha,
    created_at: `${fecha}T10:00:00.000Z`,
    ...extra,
  };
}

function condicionesBase(overrides = {}) {
  const sinDato = () => ({
    valor: null,
    rango: { minimo: null, maximo: null },
    confianza: "sin_datos",
    fuentes: [],
    actualizadaEn: null,
    coinciden: null,
    lecturaManualReciente: false,
  });
  return {
    humedad: sinDato(),
    temperatura: sinDato(),
    confianza: "sin_datos",
    actualizadaEn: null,
    lecturaManualReciente: false,
    umbrales: {
      riesgoHelada: 2,
      helada: 0,
      lluviaSignificativa: 5,
    },
    ...overrides,
  };
}

function pronosticoDe(dias = []) {
  return {
    dias: dias.map((dia, indice) => ({
      fecha: `2025-02-${String(6 + indice).padStart(2, "0")}`,
      temperaturaMinima: 8,
      precipitacionMm: 0,
      humedadSuelo: 25,
      riesgoHelada: false,
      lluviaSignificativa: false,
      ...dia,
    })),
    fuentes: ["open_meteo"],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  repositorio.listarConfiguraciones.mockResolvedValue(CONFIGURACIONES);
  repositorio.listarUltimasLecturasPorFuente.mockResolvedValue([]);
});

describe("consolidación de condiciones de parcela", () => {
  test("promedia fuentes automáticas coincidentes con fechas cercanas", async () => {
    repositorio.listarUltimasLecturasPorFuente.mockResolvedValue([
      lectura("open_meteo_suelo", 40, 12, "2025-02-05"),
      lectura("nasa_power", 43, 14, "2025-02-04"),
    ]);

    const resultado = await condiciones.consolidar(1, { ahora: AHORA });

    expect(resultado.humedad).toMatchObject({
      valor: 41.5,
      confianza: "alta",
      coinciden: true,
    });
    expect(resultado.temperatura).toMatchObject({
      valor: 13,
      confianza: "alta",
      coinciden: true,
    });
  });

  test("marca confianza baja y conserva el rango cuando las fuentes difieren", async () => {
    repositorio.listarUltimasLecturasPorFuente.mockResolvedValue([
      lectura("open_meteo_suelo", 30, 10, "2025-02-05"),
      lectura("nasa_power", 45, 15, "2025-02-05"),
    ]);

    const resultado = await condiciones.consolidar(2, { ahora: AHORA });

    expect(resultado.humedad).toMatchObject({
      valor: 37.5,
      rango: { minimo: 30, maximo: 45 },
      confianza: "baja",
      coinciden: false,
    });
  });

  test("da prioridad a una lectura manual reciente y presenta las automáticas como contraste", async () => {
    repositorio.listarUltimasLecturasPorFuente.mockResolvedValue([
      lectura("manual", 25, 14, "2025-02-05", {
        created_at: new Date(AHORA - 60 * 60 * 1000),
      }),
      lectura("open_meteo_suelo", 60, 25, "2025-02-05"),
    ]);

    const resultado = await condiciones.consolidar(3, { ahora: AHORA });

    expect(resultado.humedad.valor).toBe(25);
    expect(resultado.humedad.fuentes[0]).toMatchObject({
      clave: "manual",
      principal: true,
      tipo: "medicion_propia",
    });
    expect(resultado.humedad.fuentes[1].principal).toBe(false);
    expect(resultado.lecturaManualReciente).toBe(true);
  });

  test("asigna confianza media a una fuente y sin datos cuando no hay lecturas", async () => {
    repositorio.listarUltimasLecturasPorFuente.mockResolvedValue([
      lectura("open_meteo_suelo", 25, 12, "2025-02-05"),
    ]);
    const unaFuente = await condiciones.consolidar(4, { ahora: AHORA });
    expect(unaFuente.humedad.confianza).toBe("media");

    repositorio.listarUltimasLecturasPorFuente.mockResolvedValue([]);
    const vacia = await condiciones.consolidar(5, { ahora: AHORA });
    expect(vacia.humedad).toMatchObject({
      valor: null,
      confianza: "sin_datos",
      fuentes: [],
    });
  });

  test("combina temperatura mínima, lluvia y humedad del suelo del pronóstico", async () => {
    openMeteo.pronostico.mockResolvedValue([
      { fecha: "2025-02-06", temperaturaMinima: 1, precipitacionMm: 5 },
    ]);
    openMeteo.obtenerSuelo.mockResolvedValue({
      pronostico: [{ fecha: "2025-02-06", humedad: 24 }],
    });

    const resultado = await condiciones.obtenerPronostico({
      id: 8,
      latitud: -13.5,
      longitud: -72,
    });

    expect(resultado.dias[0]).toMatchObject({
      riesgoHelada: true,
      helada: false,
      lluviaSignificativa: true,
      humedadSuelo: 24,
      estado: "helada",
    });
  });
});

describe("recomendación de siembra v2", () => {
  const lecturasEnRango = {
    humedad: { valor: 25, confianza: "media" },
    temperatura: { valor: 14, confianza: "media" },
    confianza: "media",
  };

  test("recomienda esperar la lluvia si el suelo está seco y lloverá en 48 horas", () => {
    const resultado = motor.evaluarV2({
      condiciones: {
        ...lecturasEnRango,
        humedad: { valor: 15, confianza: "media" },
      },
      requerimiento: REQUERIMIENTO,
      pronostico: pronosticoDe([{
        precipitacionMm: 5,
        lluviaSignificativa: true,
      }]),
    });

    expect(resultado.veredicto).toBe("espera");
    expect(resultado.motivos).toContain("condiciones.motivo.esperaLluvia");
  });

  test("recomienda esperar ante riesgo de helada en los siguientes tres días", () => {
    const resultado = motor.evaluarV2({
      condiciones: lecturasEnRango,
      requerimiento: REQUERIMIENTO,
      pronostico: pronosticoDe([
        {},
        {},
        { temperaturaMinima: 2, riesgoHelada: true },
      ]),
    });

    expect(resultado.veredicto).toBe("espera");
    expect(resultado.motivos).toContain("condiciones.motivo.riesgoHelada");
  });

  test("recomienda sembrar con suelo dentro del rango, pronóstico suficiente y confianza alta", () => {
    const resultado = motor.evaluarV2({
      condiciones: {
        ...lecturasEnRango,
        confianza: "alta",
      },
      requerimiento: REQUERIMIENTO,
      pronostico: pronosticoDe([{}, {}, {}]),
    });

    expect(resultado.veredicto).toBe("siembra_ahora");
    expect(resultado.motivos).toContain("condiciones.motivo.sueloEnRango");
    expect(resultado.mejorVentana).toMatchObject({ cantidadDias: 3 });
  });

  test("limita a con_cuidado una confianza baja y reporta pronóstico insuficiente", () => {
    const resultado = motor.evaluarV2({
      condiciones: {
        ...lecturasEnRango,
        confianza: "baja",
      },
      requerimiento: REQUERIMIENTO,
      pronostico: pronosticoDe([{ precipitacionMm: 0 }]),
    });

    expect(resultado.veredicto).toBe("con_cuidado");
    expect(resultado.motivos).toContain("condiciones.motivo.confianzaBaja");
    expect(resultado.motivos).toContain("condiciones.motivo.sinPronostico");
  });

  test("no interpreta temperaturas nulas como riesgo de helada", () => {
    const resultado = motor.evaluarV2({
      condiciones: lecturasEnRango,
      requerimiento: REQUERIMIENTO,
      pronostico: {
        dias: [
          { fecha: "2025-02-06", temperaturaMinima: null, humedadSuelo: 25 },
          { fecha: "2025-02-07", temperaturaMinima: null, humedadSuelo: 25 },
          { fecha: "2025-02-08", temperaturaMinima: null, humedadSuelo: 25 },
        ],
        umbrales: { riesgoHelada: 2, lluviaSignificativa: 5 },
      },
    });

    expect(resultado.veredicto).toBe("con_cuidado");
    expect(resultado.motivos).not.toContain("condiciones.motivo.riesgoHelada");
    expect(resultado.motivos).toContain("condiciones.motivo.sinPronostico");
  });
});

describe("render de la tarjeta de condiciones", () => {
  const rutaParcial = path.join(
    __dirname,
    "..",
    "views",
    "partials",
    "condiciones-parcela.ejs",
  );

  test("renderiza valores nulos sin fuentes activas ni errores de plantilla", async () => {
    const resultado = await ejs.renderFile(rutaParcial, {
      t: paraIdioma("es"),
      fecha: (valor) => valor,
      condiciones: condicionesBase(),
      pronosticoCondiciones: { dias: [], fuentes: [] },
      recomendacion: {
        cls: "mid",
        titulo: "condiciones.veredicto.conCuidado",
        frase: "condiciones.frase.sinPronostico",
        motivos: ["condiciones.motivo.sinDatos"],
        mejorVentana: null,
        hr: [20, 35],
        tr: [10, 18],
      },
    });

    expect(resultado).toContain("Condiciones de tu parcela");
    expect(resultado).toContain("Sin datos");
    expect(resultado).toContain('href="#lectura-manual"');
    expect(resultado).not.toContain("undefined");
    expect(resultado).not.toContain("Open-Meteo.com");
  });
});
