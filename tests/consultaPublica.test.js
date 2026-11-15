jest.mock("../src/services/fuentesDatos/nasaPower", () => ({
  nasaPower: { obtener: jest.fn() },
}));
jest.mock("../src/services/fuentesDatos/openMeteo", () => ({
  obtenerSuelo: jest.fn(),
  obtenerElevacion: jest.fn(),
  openMeteo: { obtener: jest.fn() },
}));
jest.mock("../src/services/fuentesDatos/geocodificacion", () => ({
  buscar: jest.fn(),
}));
jest.mock("../src/modules/consultaPublica/consultaPublica.repository", () => ({
  catalogoAgronomico: jest.fn(),
  guardarConsultaPublica: jest.fn(),
  listarTecnicosDeProvincia: jest.fn(),
}));
jest.mock("../src/modules/publico/publico.repository", () => ({
  buscarDistrito: jest.fn(),
  buscarProvincia: jest.fn(),
  comunidadConCoordenadas: jest.fn(),
}));
jest.mock("../src/modules/consultaPublica/consultaPublica.ia", () => ({
  ...jest.requireActual("../src/modules/consultaPublica/consultaPublica.ia"),
  generarExplicacion: jest.fn(),
}));

const { nasaPower } = require("../src/services/fuentesDatos/nasaPower");
const openMeteo = require("../src/services/fuentesDatos/openMeteo");
const geocodificacion = require("../src/services/fuentesDatos/geocodificacion");
const repositorio = require("../src/modules/consultaPublica/consultaPublica.repository");
const publicoRepositorio = require("../src/modules/publico/publico.repository");
const ia = require("../src/modules/consultaPublica/consultaPublica.ia");
const {
  calcularVentanas,
} = require("../src/modules/consultaPublica/consultaPublica.calculo");
const {
  validarFechasIA,
  validarConfianzaIA,
} = require("../src/modules/consultaPublica/consultaPublica.ia");
const {
  consultar,
  listarCultivosDisponibles,
  resolverUbicacion,
} = require("../src/modules/consultaPublica/consultaPublica.service");

const cultivo = {
  id: 1,
  slug: "papa",
  dias_ciclo: null,
  ciclo_referencial: false,
};
const requerimiento = {
  cultivo_id: 1,
  zona_id: 1,
  hum_min: 20,
  hum_max: 40,
  temp_min: 10,
  temp_max: 20,
};

describe("cálculo de ventanas de consulta pública", () => {
  const calcular = (datos = {}) =>
    calcularVentanas({
      cultivo,
      requerimientos: [requerimiento],
      fechaInicio: "2026-01-01",
      diasHorizonte: 10,
      limite: 1,
      ...datos,
    })[0];

  test("puntúa al máximo los datos históricos dentro de los rangos", () => {
    const ventana = calcular({
      historico: [
        { fecha: "2021-01-01", humedad: 30, temperatura: 15 },
        { fecha: "2022-01-02", humedad: 25, temperatura: 12 },
      ],
    });

    expect(ventana.puntaje).toBe(100);
    expect(ventana.componentes.historico).toBe(100);
  });

  test("no asigna coincidencia histórica a datos fuera de rango", () => {
    const ventana = calcular({
      historico: [{ fecha: "2021-01-01", humedad: 5, temperatura: 2 }],
    });

    expect(ventana.puntaje).toBe(0);
    expect(ventana.componentes.historico).toBe(0);
  });

  test("calcula con pronóstico cuando falta el historial NASA", () => {
    const ventana = calcular({
      pronostico: [{ fecha: "2026-01-02", humedad: 30, temperatura: 15 }],
    });

    expect(ventana.componentes).toEqual({ pronostico: 100 });
    expect(ventana.puntaje).toBe(100);
  });

  test("calcula con historial cuando falta el pronóstico", () => {
    const ventana = calcular({
      historico: [{ fecha: "2021-01-01", humedad: 30, temperatura: 15 }],
    });

    expect(ventana.componentes).toEqual({ historico: 100 });
    expect(ventana.puntaje).toBe(100);
  });
});

describe("validación de fechas de la explicación", () => {
  test("acepta solo fechas ISO presentes en el JSON", () => {
    expect(
      validarFechasIA(
        "Entre 2026-10-15 y 2026-10-30, con cosecha el 2027-03-15.",
        ["2026-10-15", "2026-10-30", "2027-03-15"],
      ),
    ).toBe(true);
  });

  test("rechaza fechas inventadas, meses escritos y fechas insuficientes", () => {
    expect(
      validarFechasIA("Entre 2026-10-15 y 2026-11-02.", [
        "2026-10-15",
        "2026-10-30",
      ]),
    ).toBe(false);
    expect(
      validarFechasIA("Entre 2026-10-15 y 30 de octubre.", [
        "2026-10-15",
        "2026-10-30",
      ]),
    ).toBe(false);
    expect(validarFechasIA("Desde 2026-10-15.", ["2026-10-15"])).toBe(false);
  });
});

describe("validación de confianza de la explicación", () => {
  test("rechaza un nivel de confianza contradictorio o ausente", () => {
    expect(validarConfianzaIA("La confianza es media.", "media")).toBe(true);
    expect(validarConfianzaIA("La confianza es alta.", "media")).toBe(false);
    expect(validarConfianzaIA("Los datos son útiles.", "media")).toBe(false);
  });
});

describe("consulta pública con fuentes simuladas", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const hoy = new Date().toISOString().slice(0, 10);
    const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    publicoRepositorio.buscarDistrito.mockResolvedValue({
      id: 12,
      nombre: "Distrito",
      provincia_id: 4,
      provincia: "Provincia",
      departamento_id: 2,
      departamento: "Departamento",
    });
    publicoRepositorio.comunidadConCoordenadas.mockResolvedValue({
      latitud: -13.526,
      longitud: -71.976,
    });
    publicoRepositorio.buscarProvincia.mockResolvedValue({
      id: 4,
      nombre: "Provincia",
      departamento: "Departamento",
    });
    repositorio.catalogoAgronomico.mockResolvedValue({
      cultivos: [{ ...cultivo, nombre: "Papa" }],
      requerimientos: [requerimiento],
      calendarios: [],
      zonas: [{ id: 1, altitud_min_m: 0, altitud_max_m: 6000 }],
    });
    repositorio.listarTecnicosDeProvincia.mockResolvedValue([]);
    repositorio.guardarConsultaPublica.mockResolvedValue(51);
    nasaPower.obtener.mockResolvedValue([
      { fecha: hoy, humedad: 30, temperatura: 15 },
    ]);
    openMeteo.obtenerSuelo.mockResolvedValue({
      observadas: [],
      pronostico: [{ fecha: manana, humedad: 30, temperatura: 15 }],
    });
    openMeteo.openMeteo.obtener.mockResolvedValue([
      { fecha: manana, temperaturaMinima: 5 },
    ]);
    openMeteo.obtenerElevacion.mockResolvedValue(3400);
    ia.generarExplicacion.mockResolvedValue(null);
  });

  test("redondea coordenadas antes de consultar fuentes y no las persiste", async () => {
    const resultado = await consultar({
      distritoId: 12,
      cultivo: "papa",
    });

    expect(nasaPower.obtener.mock.calls[0][0]).toBe(-13.53);
    expect(nasaPower.obtener.mock.calls[0][1]).toBe(-71.98);
    expect(openMeteo.obtenerSuelo.mock.calls[0][0]).toBe(-13.53);
    expect(openMeteo.openMeteo.obtener.mock.calls[0][1]).toBe(-71.98);
    expect(repositorio.guardarConsultaPublica).toHaveBeenCalledWith(
      expect.objectContaining({ distritoId: 12, cultivoId: 1 }),
    );
    expect(
      repositorio.guardarConsultaPublica.mock.calls[0][0],
    ).not.toHaveProperty("latitud");
    expect(resultado.id).toBe(51);
    expect(resultado.generadoConIA).toBe(false);
  });

  test("geocodifica el distrito si no hay comunidad con coordenadas", async () => {
    publicoRepositorio.comunidadConCoordenadas.mockResolvedValue(null);
    geocodificacion.buscar.mockResolvedValue([
      {
        nombre: "Distrito",
        region: "Departamento",
        enPeru: true,
        latitud: -13.526,
        longitud: -71.976,
      },
    ]);

    const ubicacion = await resolverUbicacion({
      distritoId: 12,
      provinciaId: 4,
    });

    expect(ubicacion).toMatchObject({
      latitud: -13.53,
      longitud: -71.98,
    });

    expect(geocodificacion.buscar).toHaveBeenCalledWith(
      "Distrito, Departamento",
      { timeoutMs: 5000, reintentos: 0 },
    );
  });

  test("incluye cualquier cultivo del catálogo con requerimientos", async () => {
    const haba = {
      id: 2,
      slug: "haba",
      nombre: "Haba",
      dias_ciclo: null,
      ciclo_referencial: false,
    };
    repositorio.catalogoAgronomico.mockResolvedValue({
      cultivos: [{ ...cultivo, nombre: "Papa" }, haba],
      requerimientos: [requerimiento, { ...requerimiento, cultivo_id: 2 }],
      calendarios: [],
      zonas: [{ id: 1, altitud_min_m: 0, altitud_max_m: 6000 }],
    });

    await expect(listarCultivosDisponibles()).resolves.toEqual([
      { nombre: "Papa", slug: "papa" },
      { nombre: "Haba", slug: "haba" },
    ]);

    const resultado = await consultar({
      distritoId: 12,
      cultivo: "haba",
    });

    expect(resultado.cultivos.map((fila) => fila.slug)).toEqual(["haba"]);
    expect(repositorio.guardarConsultaPublica).toHaveBeenCalledWith(
      expect.objectContaining({ cultivoId: 2 }),
    );
  });

  test("No sé cuál calcula todos los cultivos configurados", async () => {
    repositorio.catalogoAgronomico.mockResolvedValue({
      cultivos: [
        { ...cultivo, nombre: "Papa" },
        {
          id: 2,
          slug: "haba",
          nombre: "Haba",
          dias_ciclo: null,
          ciclo_referencial: false,
        },
      ],
      requerimientos: [requerimiento, { ...requerimiento, cultivo_id: 2 }],
      calendarios: [],
      zonas: [{ id: 1, altitud_min_m: 0, altitud_max_m: 6000 }],
    });

    const resultado = await consultar({
      distritoId: 12,
      cultivo: "no-se",
    });

    expect(resultado.cultivos.map((fila) => fila.slug)).toEqual([
      "papa",
      "haba",
    ]);
    expect(repositorio.guardarConsultaPublica).toHaveBeenCalledWith(
      expect.objectContaining({ cultivoId: null }),
    );
  });
});
