jest.mock("../src/modules/lecturas/lecturas.repository", () => ({
  listarFuentesAutomaticas: jest.fn(),
  registrarAutomaticas: jest.fn(),
  guardarEstadoSincronizacion: jest.fn(),
}));

jest.mock("../src/config/logger", () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
}));

const repositorio = require("../src/modules/lecturas/lecturas.repository");
const logger = require("../src/config/logger");
const { limpiarCache } = require("../src/services/fuentesDatos/clienteHttp");
const { obtenerLecturas } = require("../src/services/fuentesDatos/orquestador");

const PARCELA = { id: 20, latitud: -13.51, longitud: -70.32 };
const FUENTES = [
  { id: 2, clave: "nasa_power", prioridad: 3 },
  { id: 1, clave: "open_meteo_suelo", prioridad: 1 },
];

function fechaLima(dias = 0) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const porTipo = Object.fromEntries(
    partes.map((parte) => [parte.type, parte.value]),
  );
  const fecha = new Date(
    `${porTipo.year}-${porTipo.month}-${porTipo.day}T12:00:00.000Z`,
  );
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

function fechaDeSincronizacion() {
  return new Date(`${fechaLima()}T12:00:00.000Z`);
}

function respuestaJson(datos, estado = 200) {
  return {
    ok: estado >= 200 && estado < 300,
    status: estado,
    json: jest.fn().mockResolvedValue(datos),
  };
}

function respuestaOpenMeteoError() {
  return respuestaJson({
    error: true,
    reason: "Invalid variable requested",
  });
}

function respuestaOpenMeteoSuelo() {
  const ayer = fechaLima(-1);
  const hoy = fechaLima();
  const manana = fechaLima(1);
  return respuestaJson({
    timezone: "America/Lima",
    hourly: {
      time: [
        `${ayer}T12:00`,
        `${hoy}T00:00`,
        `${hoy}T01:00`,
        `${hoy}T02:00`,
        `${manana}T00:00`,
      ],
      soil_moisture_3_to_9cm: [0.2, 0.2, 0.4, null, 0.1],
      soil_moisture_9_to_27cm: [0.4, 0.4, 0.6, 0.8, 0.3],
      soil_temperature_6cm: [10, 10, 14, null, 9],
    },
  });
}

function respuestaNasa() {
  const ayer = fechaLima(-1).replace(/-/g, "");
  return respuestaJson({
    properties: {
      parameter: {
        GWETROOT: { [ayer]: 0.6 },
        TS: { [ayer]: 13 },
      },
    },
  });
}

describe("orquestador de fuentes de suelo", () => {
  beforeEach(() => {
    limpiarCache();
    jest.clearAllMocks();
    repositorio.listarFuentesAutomaticas.mockResolvedValue(FUENTES);
    repositorio.registrarAutomaticas.mockResolvedValue(1);
    repositorio.guardarEstadoSincronizacion.mockResolvedValue();
    jest.spyOn(global, "fetch");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("prioriza Open-Meteo, persiste también NASA y aplica sus IDs de fuente", async () => {
    global.fetch
      .mockResolvedValueOnce(respuestaOpenMeteoSuelo())
      .mockResolvedValueOnce(respuestaNasa());

    const resultado = await obtenerLecturas(PARCELA, {
      fecha: fechaDeSincronizacion(),
    });

    expect(resultado.fuentesConsultadas).toEqual([
      "open_meteo_suelo",
      "nasa_power",
    ]);
    expect(resultado.fuentesFallidas).toEqual([]);
    expect(repositorio.registrarAutomaticas).toHaveBeenNthCalledWith(
      1,
      PARCELA.id,
      1,
      [
        { fecha: fechaLima(-1), humedad: 30, temperatura: 10 },
        { fecha: fechaLima(), humedad: 45, temperatura: 12 },
      ],
      expect.stringContaining("Open-Meteo"),
    );
    expect(repositorio.registrarAutomaticas).toHaveBeenNthCalledWith(
      2,
      PARCELA.id,
      2,
      [expect.objectContaining({ fecha: fechaLima(-1), humedad: 60 })],
      expect.stringContaining("NASA POWER"),
    );
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test("continúa con NASA si Open-Meteo devuelve error", async () => {
    global.fetch
      .mockResolvedValueOnce(respuestaOpenMeteoError())
      .mockResolvedValueOnce(respuestaNasa());

    const resultado = await obtenerLecturas(PARCELA, {
      fecha: fechaDeSincronizacion(),
    });

    expect(resultado.fuentesFallidas).toEqual([
      { clave: "open_meteo_suelo", motivo: "error de fuente externa" },
    ]);
    expect(resultado.fuentesConsultadas).toEqual(["nasa_power"]);
    expect(repositorio.registrarAutomaticas).toHaveBeenCalledTimes(1);
    expect(repositorio.registrarAutomaticas).toHaveBeenCalledWith(
      PARCELA.id,
      2,
      expect.any(Array),
      expect.stringContaining("NASA POWER"),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      { reason: "Invalid variable requested" },
      "Open-Meteo rechazó la consulta de datos del suelo",
    );
  });

  test("registra fallos sin borrar lecturas existentes si todas las fuentes fallan", async () => {
    const lecturasExistentes = [
      { fecha: fechaLima(-2), humedad: 55, temperatura: 11 },
    ];
    global.fetch
      .mockResolvedValueOnce(respuestaOpenMeteoError())
      .mockResolvedValue(respuestaJson({}, 503));

    const resultado = await obtenerLecturas(PARCELA, {
      fecha: fechaDeSincronizacion(),
    });

    expect(resultado.fuentesFallidas).toEqual([
      { clave: "open_meteo_suelo", motivo: "error de fuente externa" },
      { clave: "nasa_power", motivo: "error HTTP 503" },
    ]);
    expect(repositorio.registrarAutomaticas).not.toHaveBeenCalled();
    expect(lecturasExistentes).toEqual([
      { fecha: fechaLima(-2), humedad: 55, temperatura: 11 },
    ]);
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(resultado)).not.toContain(String(PARCELA.latitud));
  });

  test("repetir la sincronización ignora lecturas ya registradas", async () => {
    global.fetch
      .mockResolvedValueOnce(respuestaOpenMeteoSuelo())
      .mockResolvedValueOnce(respuestaNasa());
    repositorio.registrarAutomaticas
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    const opciones = { fecha: fechaDeSincronizacion() };
    const primera = await obtenerLecturas(PARCELA, opciones);
    const segunda = await obtenerLecturas(PARCELA, opciones);

    expect(primera.lecturasInsertadas).toBe(3);
    expect(segunda.lecturasInsertadas).toBe(0);
    expect(repositorio.registrarAutomaticas).toHaveBeenCalledTimes(4);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test("informa explícitamente cuando no hay fuentes automáticas configuradas", async () => {
    repositorio.listarFuentesAutomaticas.mockResolvedValue([]);

    await expect(obtenerLecturas(PARCELA)).rejects.toThrow(
      "No hay fuentes automáticas de suelo configuradas.",
    );
    expect(repositorio.registrarAutomaticas).not.toHaveBeenCalled();
  });
});
