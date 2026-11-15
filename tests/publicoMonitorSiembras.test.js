jest.mock("../src/modules/lecturas/lecturas.service", () => ({
  listarPublicasDeComunidades: jest.fn(),
}));
jest.mock("../src/modules/campanias/campanias.repository", () => ({
  listarSiembrasPublicas: jest.fn(),
}));
jest.mock("../src/modules/publico/publico.repository", () => ({
  buscarComunidadConCoordenadas: jest.fn(),
}));
jest.mock("../src/services/fuentesDatos/nasaPower", () => ({
  nasaPower: { obtener: jest.fn() },
}));
jest.mock("../src/services/fuentesDatos/openMeteo", () => ({
  obtenerSuelo: jest.fn(),
}));

const lecturasServicio = require("../src/modules/lecturas/lecturas.service");
const campaniasRepositorio = require("../src/modules/campanias/campanias.repository");
const publicoRepositorio = require("../src/modules/publico/publico.repository");
const { nasaPower } = require("../src/services/fuentesDatos/nasaPower");
const openMeteo = require("../src/services/fuentesDatos/openMeteo");
const monitorServicio = require("../src/modules/publico/monitor.service");
const siembrasServicio = require("../src/modules/publico/siembras.service");

const HOY = new Date("2026-03-20T12:00:00.000Z");

beforeEach(() => {
  jest.clearAllMocks();
  publicoRepositorio.buscarComunidadConCoordenadas.mockResolvedValue(null);
  nasaPower.obtener.mockResolvedValue([]);
  openMeteo.obtenerSuelo.mockResolvedValue({ observadas: [], pronostico: [] });
});

describe("monitor público", () => {
  test("prioriza una lectura reciente de técnico y usa NASA antes de Open-Meteo", async () => {
    lecturasServicio.listarPublicasDeComunidades.mockResolvedValue([
      {
        comunidad_id: 1,
        fecha: "2026-03-19",
        humedad: 37,
        temperatura: 8,
        fuente: "manual",
      },
      {
        comunidad_id: 1,
        fecha: "2026-03-20",
        humedad: 58,
        temperatura: 10,
        fuente: "nasa_power",
      },
      {
        comunidad_id: 2,
        fecha: "2026-02-01",
        humedad: 22,
        temperatura: 3,
        fuente: "manual",
      },
      {
        comunidad_id: 2,
        fecha: "2026-03-17",
        humedad: 48,
        temperatura: 9,
        fuente: "nasa_power",
      },
      {
        comunidad_id: 2,
        fecha: "2026-03-20",
        humedad: 68,
        temperatura: 11,
        fuente: "open_meteo_suelo",
      },
      {
        comunidad_id: 3,
        fecha: "2026-03-20",
        humedad: 82,
        temperatura: 12,
        fuente: "open_meteo_suelo",
      },
    ]);

    const resultado = await monitorServicio.datosActuales([1, 2, 3], {
      hoy: HOY,
    });

    expect(resultado[1]).toMatchObject({
      humedad: 37,
      fuente: "tecnico",
      diasDesde: 1,
    });
    expect(resultado[2]).toMatchObject({
      humedad: 48,
      fuente: "nasa_power",
    });
    expect(resultado[3]).toMatchObject({
      humedad: 82,
      fuente: "open_meteo_suelo",
    });
    expect(lecturasServicio.listarPublicasDeComunidades).toHaveBeenCalledWith(
      [1, 2, 3],
      "2026-02-03",
    );
  });

  test("prioriza la lectura técnica del mismo día en el historial y clasifica humedad sin datos", async () => {
    lecturasServicio.listarPublicasDeComunidades.mockResolvedValue([
      {
        comunidad_id: 4,
        fecha: "2026-03-15",
        humedad: 30,
        temperatura: 6,
        fuente: "nasa_power",
      },
      {
        comunidad_id: 4,
        fecha: "2026-03-15",
        humedad: 44,
        temperatura: 7,
        fuente: "manual",
      },
    ]);

    const historial = await monitorServicio.historialPublicoComunidad(4, 1, {
      hoy: HOY,
    });

    expect(historial).toEqual([
      {
        fecha: "2026-03-15",
        fuente: "tecnico",
        humedad: 44,
        temperatura: 7,
      },
    ]);
    expect(monitorServicio.clasificarHumedad(null)).toBe("sin_datos");
    expect(monitorServicio.clasificarHumedad(79)).toBe("humeda");
    expect(monitorServicio.clasificarHumedad(80)).toBe("saturada");
  });

  test("consulta NASA para comunidades con coordenadas sin lecturas guardadas", async () => {
    lecturasServicio.listarPublicasDeComunidades.mockResolvedValue([]);
    nasaPower.obtener.mockResolvedValue([
      { fecha: "2026-03-19", humedad: 42, temperatura: 7 },
    ]);

    const resultado = await monitorServicio.datosActuales(
      [{ id: 8, latitud: -13.5, longitud: -71.9 }],
      { hoy: HOY },
    );

    expect(resultado[8]).toMatchObject({
      fecha: "2026-03-19",
      humedad: 42,
      temperatura: 7,
      fuente: "nasa_power",
      diasDesde: 1,
    });
  });

  test("usa Open-Meteo si NASA no devuelve una lectura", async () => {
    lecturasServicio.listarPublicasDeComunidades.mockResolvedValue([]);
    nasaPower.obtener.mockRejectedValue(new Error("sin respuesta"));
    openMeteo.obtenerSuelo.mockResolvedValue({
      observadas: [{ fecha: "2026-03-20", humedad: 51, temperatura: 9 }],
    });

    const resultado = await monitorServicio.datosActuales(
      [{ id: 9, latitud: -13.5, longitud: -71.9 }],
      { hoy: HOY },
    );

    expect(resultado[9]).toMatchObject({
      humedad: 51,
      fuente: "open_meteo_suelo",
      diasDesde: 0,
    });
  });

  test("obtiene la serie NASA cuando el historial local está vacío", async () => {
    lecturasServicio.listarPublicasDeComunidades.mockResolvedValue([]);
    publicoRepositorio.buscarComunidadConCoordenadas.mockResolvedValue({
      id: 10,
      latitud: -13.5,
      longitud: -71.9,
    });
    nasaPower.obtener.mockResolvedValue([
      { fecha: "2026-03-10", humedad: 43, temperatura: 8 },
    ]);

    const resultado = await monitorServicio.historialPublicoComunidad(10, 1, {
      hoy: HOY,
    });

    expect(resultado).toEqual([
      {
        fecha: "2026-03-10",
        fuente: "nasa_power",
        humedad: 43,
        temperatura: 8,
      },
    ]);
  });
});

describe("siembras públicas", () => {
  const registros = [
    { distrito_id: 1, cultivo_id: 1, fecha: "2026-01-03" },
    { distrito_id: 1, cultivo_id: 1, fecha: "2026-01-08" },
    {
      distrito_id: 2,
      distrito: "Distrito agregado",
      provincia: "Provincia",
      departamento: "Departamento",
      departamento_id: 8,
      cultivo_id: 1,
      cultivo: "Papa",
      cultivo_slug: "papa",
      fecha: "2026-02-01",
      cosechas_registradas: 1,
      latitud_distrito: "-13.526",
      longitud_distrito: "-71.976",
    },
    {
      distrito_id: 2,
      distrito: "Distrito agregado",
      provincia: "Provincia",
      departamento: "Departamento",
      departamento_id: 8,
      cultivo_id: 1,
      cultivo: "Papa",
      cultivo_slug: "papa",
      fecha: "2026-02-08",
      cosechas_registradas: 0,
      latitud_distrito: "-13.526",
      longitud_distrito: "-71.976",
    },
    {
      distrito_id: 2,
      distrito: "Distrito agregado",
      provincia: "Provincia",
      departamento: "Departamento",
      departamento_id: 8,
      cultivo_id: 1,
      cultivo: "Papa",
      cultivo_slug: "papa",
      fecha: "2026-02-15",
      cosechas_registradas: 0,
      latitud_distrito: "-13.526",
      longitud_distrito: "-71.976",
    },
  ];

  test("oculta grupos menores a tres y solo devuelve datos agregados con ubicación redondeada", async () => {
    campaniasRepositorio.listarSiembrasPublicas.mockResolvedValue(registros);

    const resultado = await siembrasServicio.datosPublicos();

    expect(resultado.reales).toHaveLength(1);
    expect(resultado.reales[0]).toMatchObject({
      distrito: "Distrito agregado",
      cantidadSiembras: 3,
      fechaMediana: "2026-02-08",
      fechaDesde: "2026-02-01",
      fechaHasta: "2026-02-15",
      sembradas: 2,
      cosechadas: 1,
      estado: "mixto",
      latitud: -13.53,
      longitud: -71.98,
    });
    expect(resultado.reales[0]).not.toHaveProperty("parcela");
    expect(resultado.reales[0]).not.toHaveProperty("parcelaId");
    expect(resultado.reales[0]).not.toHaveProperty("usuarioId");
  });

  test("separa la demostración, la etiqueta y los filtros de datos reales", async () => {
    campaniasRepositorio.listarSiembrasPublicas.mockResolvedValue([]);

    const sinFiltros = await siembrasServicio.datosPublicos(
      {},
      { demoActivada: true },
    );
    const conFiltro = await siembrasServicio.datosPublicos(
      { cultivo: "papa" },
      { demoActivada: true },
    );
    const demosOcultas = await siembrasServicio.datosPublicos(
      {},
      { demoActivada: false },
    );

    expect(sinFiltros.reales).toEqual([]);
    expect(sinFiltros.demo).toHaveLength(6);
    expect(sinFiltros.demo.every((fila) => fila.demo)).toBe(true);
    expect(demosOcultas.demo).toEqual([]);
    expect(conFiltro.demo).toHaveLength(2);
    expect(conFiltro.demo.every((fila) => fila.cultivoSlug === "papa")).toBe(
      true,
    );
    expect(campaniasRepositorio.listarSiembrasPublicas).toHaveBeenNthCalledWith(
      2,
      {
        cultivo: "papa",
      },
    );
  });
});
