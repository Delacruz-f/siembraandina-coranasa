const { limpiarCache } = require("../src/services/fuentesDatos/clienteHttp");
const {
  nasaPower,
  convertirHumedad,
} = require("../src/services/fuentesDatos/nasaPower");
const openMeteo = require("../src/services/fuentesDatos/openMeteo");

function respuestaJson(datos, estado = 200) {
  return {
    ok: estado >= 200 && estado < 300,
    status: estado,
    json: jest.fn().mockResolvedValue(datos),
  };
}

describe("Fuentes de datos externas con respuestas simuladas", () => {
  beforeEach(() => {
    limpiarCache();
    jest.spyOn(global, "fetch");
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  test("convierte GWETROOT a porcentaje y usa temperatura superficial NASA", async () => {
    global.fetch.mockResolvedValue(
      respuestaJson({
        properties: {
          parameter: {
            GWETROOT: { 20261101: 0.78 },
            TS: { 20261101: 19.26 },
          },
        },
      }),
    );

    const lecturas = await nasaPower.obtener(
      -13.511,
      -70.324,
      "2026-11-01",
      "2026-11-02",
    );

    expect(lecturas).toEqual([
      {
        fecha: "2026-11-01",
        humedad: 78,
        temperatura: 19.3,
        precipitacionMm: null,
        temperaturaMinima: null,
      },
    ]);
    const url = new URL(global.fetch.mock.calls[0][0]);
    expect(url.searchParams.get("parameters")).toBe("GWETROOT,TS");
    expect(url.searchParams.get("latitude")).toBe("-13.51");
    expect(convertirHumedad(0.5)).toBe(50);
    expect(convertirHumedad(null)).toBeNull();
    expect(convertirHumedad(1.2)).toBeNull();
  });

  test("comparte caché NASA entre coordenadas redondeadas al mismo centésimo", async () => {
    global.fetch.mockResolvedValue(
      respuestaJson({
        properties: { parameter: { GWETROOT: {}, TS: {} } },
      }),
    );
    const argumentos = ["2026-11-01", "2026-11-02"];

    await nasaPower.obtener(-13.511, -70.324, ...argumentos);
    await nasaPower.obtener(-13.514, -70.321, ...argumentos);

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("reintenta HTTP 503 y conserva el error explícito para HTTP 400", async () => {
    const {
      solicitarJson,
    } = require("../src/services/fuentesDatos/clienteHttp");
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(respuestaJson({}, 503))
      .mockResolvedValueOnce(respuestaJson({ correcto: true }));

    await expect(
      solicitarJson("https://fuente.test/datos", {
        reintentos: 1,
        pausaInicialMs: 0,
        fetchImpl,
      }),
    ).resolves.toEqual({ correcto: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    await expect(
      solicitarJson("https://fuente.test/datos", {
        reintentos: 3,
        pausaInicialMs: 0,
        fetchImpl: jest.fn().mockResolvedValue(respuestaJson({}, 400)),
      }),
    ).rejects.toMatchObject({ estado: 400 });
  });

  test("Open-Meteo entrega lluvia y mínima de los siete días", async () => {
    const dias = Array.from({ length: 7 }, (_, indice) =>
      new Date(Date.now() + indice * 86400000).toISOString().slice(0, 10),
    );
    global.fetch.mockResolvedValue(
      respuestaJson({
        daily: {
          time: dias,
          temperature_2m_min: dias.map(() => -2),
          temperature_2m_max: dias.map(() => 12),
          precipitation_probability_max: dias.map(() => 60),
          precipitation_sum: dias.map(() => 4.5),
          weather_code: dias.map(() => 3),
        },
      }),
    );

    const pronostico = await openMeteo.pronostico(-13.51, -70.32);

    expect(pronostico).toHaveLength(7);
    expect(pronostico[0]).toMatchObject({
      temperaturaMinima: -2,
      precipitacionMm: 4.5,
      probabilidadLluvia: 60,
    });
    expect(
      new URL(global.fetch.mock.calls[0][0]).searchParams.get("forecast_days"),
    ).toBe("7");
  });

  test("Open-Meteo promedia humedad y temperatura del suelo e informa porcentaje", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-11-14T12:00:00.000Z"));
    global.fetch.mockResolvedValue(
      respuestaJson({
        timezone: "America/Lima",
        hourly: {
          time: [
            "2026-11-13T22:00",
            "2026-11-14T00:00",
            "2026-11-14T01:00",
            "2026-11-14T02:00",
            "2026-11-15T00:00",
          ],
          soil_moisture_3_to_9cm: [0.2, 0.2, 0.4, null, 0.1],
          soil_moisture_9_to_27cm: [0.4, 0.4, 0.6, 0.8, 0.3],
          soil_temperature_6cm: [10, 10, 14, null, 9],
        },
      }),
    );

    const resultado = await openMeteo.obtenerSuelo(-13.51, -70.32);

    expect(resultado).toEqual({
      observadas: [
        { fecha: "2026-11-13", humedad: 30, temperatura: 10 },
        { fecha: "2026-11-14", humedad: 45, temperatura: 12 },
      ],
      pronostico: [{ fecha: "2026-11-15", humedad: 20, temperatura: 9 }],
    });
    const url = new URL(global.fetch.mock.calls[0][0]);
    expect(url.searchParams.get("timezone")).toBe("auto");
    expect(url.searchParams.get("past_days")).toBe("3");
    expect(url.searchParams.get("forecast_days")).toBe("7");
    expect(url.searchParams.get("hourly")).toBe(
      "soil_moisture_3_to_9cm,soil_moisture_9_to_27cm,soil_temperature_6cm",
    );
  });
});
