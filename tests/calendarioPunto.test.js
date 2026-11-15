// Calendario público con punto elegido: NASA POWER, Open-Meteo (geocodificación)
// y la IA están simulados. No se toca la base de datos ni la red.
jest.mock("../src/services/fuentesDatos/nasaPower", () => ({
  nasaPower: { obtener: jest.fn() },
}));
jest.mock("../src/services/fuentesDatos/openMeteo", () => ({
  openMeteo: { obtener: jest.fn() },
  obtenerSuelo: jest.fn(),
  obtenerElevacion: jest.fn(),
}));
jest.mock("../src/modules/publico/calendario.ia", () => ({
  ...jest.requireActual("../src/modules/publico/calendario.ia"),
  estimarRangosCultivo: jest.fn(),
  redactarExplicacion: jest.fn(),
}));
jest.mock("../src/modules/publico/publico.repository", () => ({
  listarDepartamentos: jest.fn(),
  listarProvincias: jest.fn(),
  buscarProvincia: jest.fn(),
  listarDistritos: jest.fn(),
  buscarDistrito: jest.fn(),
  comunidadConCoordenadas: jest.fn(),
  listarComunidadesConCoordenadas: jest.fn(),
  listarCultivos: jest.fn(),
  buscarCultivo: jest.fn(),
  listarRequerimientos: jest.fn(),
  listarCalendario: jest.fn(),
}));

const { nasaPower } = require("../src/services/fuentesDatos/nasaPower");
const geocodificacion = require("../src/services/fuentesDatos/geocodificacion");
const ia = require("../src/modules/publico/calendario.ia");
const repositorio = require("../src/modules/publico/publico.repository");
const servicio = require("../src/modules/publico/publico.service");
const { limpiarCache } = require("../src/services/fuentesDatos/clienteHttp");

// En la base real la papa no tiene días de ciclo; la quinua sí (180 días).
const CULTIVOS = [
  {
    id: 1,
    nombre: "Papa",
    slug: "papa",
    descripcion: "Tubérculo andino.",
    dias_ciclo: null,
  },
  {
    id: 2,
    nombre: "Maíz",
    slug: "maiz",
    descripcion: "Grano básico.",
    dias_ciclo: 270,
  },
  {
    id: 3,
    nombre: "Quinua",
    slug: "quinua",
    descripcion: "Grano andino.",
    dias_ciclo: 180,
  },
];

const REQUERIMIENTOS_PAPA = [
  {
    zona_id: 1,
    zona_clave: "valle",
    zona_nombre: "Valle",
    hum_min: 20,
    hum_max: 35,
    temp_min: 9,
    temp_max: 18,
    validado: false,
  },
];

const CALENDARIO_PAPA = [
  {
    zona_id: 1,
    zona_clave: "valle",
    zona_nombre: "Valle",
    mes_inicio: 9,
    mes_fin: 11,
    validado: false,
  },
];

/**
 * Historial diario de NASA POWER simulado: 400 días (cubre todas las dekadas)
 * y los últimos 10 días, que son la "lectura reciente" del aviso.
 */
function historialSimulado() {
  const dias = [];
  const inicio = new Date(Date.now() - 400 * 86400000);
  for (let indice = 0; indice <= 400; indice += 1) {
    const fecha = new Date(inicio.getTime() + indice * 86400000);
    dias.push({
      fecha: fecha.toISOString().slice(0, 10),
      humedad: 28,
      temperatura: 14,
      precipitacionMm: null,
      temperaturaMinima: null,
    });
  }
  return dias;
}

const RESULTADO = {
  cultivo: { nombre: "Papa" },
  confianza: "media",
  fuente: "NASA POWER",
  fechaDatos: "2025-11-20",
  ventanas: [
    {
      inicio: "2026-12-01",
      fin: "2026-12-10",
      puntaje: 95,
      cosecha: { inicio: "2027-01-20", fin: "2027-01-29", diasCiclo: 150 },
      riesgos: { helada: false, humedadBaja: false },
    },
  ],
  rangos: { humedadMin: 20, humedadMax: 35, tempMin: 9, tempMax: 18 },
};

const TEXTO_IA =
  "Según NASA POWER, la mejor ventana va del 2026-12-01 al 2026-12-10. La cosecha estimada iría del 2027-01-20 al 2027-01-29. Consulta a un técnico de tu zona y regístrate para guardar tus parcelas. " +
  "Son fechas de referencia para esa zona.";

beforeEach(() => {
  jest.clearAllMocks();
  limpiarCache();
  servicio.limpiarCacheCalendario();
  repositorio.listarDepartamentos.mockResolvedValue([]);
  repositorio.listarProvincias.mockResolvedValue([]);
  repositorio.listarDistritos.mockResolvedValue([]);
  repositorio.listarCultivos.mockResolvedValue(CULTIVOS);
  repositorio.listarComunidadesConCoordenadas.mockResolvedValue([]);
  repositorio.comunidadConCoordenadas.mockResolvedValue(null);
  repositorio.buscarCultivo.mockImplementation(async (slug) =>
    CULTIVOS.find((cultivo) => cultivo.slug === slug),
  );
  // La papa y la quinua comparten estos rangos simulados.
  repositorio.listarRequerimientos.mockImplementation(async (cultivoId) =>
    [1, 3].includes(Number(cultivoId)) ? REQUERIMIENTOS_PAPA : [],
  );
  repositorio.listarCalendario.mockImplementation(async (cultivoId) =>
    [1, 3].includes(Number(cultivoId)) ? CALENDARIO_PAPA : [],
  );
  nasaPower.obtener.mockResolvedValue(historialSimulado());
  ia.estimarRangosCultivo.mockResolvedValue(null);
  ia.redactarExplicacion.mockResolvedValue(null);
});

describe("orden para obtener el punto", () => {
  test("acepta ?lat=&lon= dentro del Perú y lo redondea a dos decimales", async () => {
    const datos = await servicio.datosCalendario({
      cultivo: "papa",
      lat: "-13.5261",
      lon: "-71.9767",
      idioma: "es",
    });

    expect(datos.punto).toEqual({ latitud: -13.53, longitud: -71.98 });
    expect(datos.origenPunto).toBe("url");
    expect(datos.estadoDatos).toBe("disponible");
    expect(nasaPower.obtener.mock.calls[0].slice(0, 2)).toEqual([
      -13.53, -71.98,
    ]);
    // La URL compartible conserva el punto redondeado.
    expect(datos.urlCompartirPunto).toContain("lat=-13.53");
    expect(datos.urlCompartirPunto).toContain("lon=-71.98");
    expect(repositorio.comunidadConCoordenadas).not.toHaveBeenCalled();
  });

  test("rechaza un punto fuera del Perú y no consulta NASA POWER", async () => {
    await expect(
      servicio.datosCalendario({
        cultivo: "papa",
        lat: "-33.45",
        lon: "-70.66",
        idioma: "es",
      }),
    ).rejects.toMatchObject({ estado: 400 });

    expect(nasaPower.obtener).not.toHaveBeenCalled();
  });

  test("rechaza coordenadas incompletas o no numéricas", async () => {
    await expect(
      servicio.datosCalendario({ cultivo: "papa", lat: "-13.5", idioma: "es" }),
    ).rejects.toMatchObject({ estado: 400 });
    await expect(
      servicio.datosCalendario({
        cultivo: "papa",
        lat: "abc",
        lon: "-71.98",
        idioma: "es",
      }),
    ).rejects.toMatchObject({ estado: 400 });
  });

  test("usa la comunidad del distrito cuando no hay punto en la URL", async () => {
    repositorio.buscarDistrito.mockResolvedValue({
      id: 12,
      nombre: "Yungay",
      provincia_id: 4,
      provincia: "Yungay",
      departamento_id: 2,
      departamento: "Áncash",
    });
    repositorio.comunidadConCoordenadas.mockResolvedValue({
      id: 7,
      nombre: "Comunidad de prueba",
      latitud: "-9.1381",
      longitud: "-77.7436",
    });

    const datos = await servicio.datosCalendario({
      cultivo: "papa",
      distrito: 12,
      idioma: "es",
    });

    expect(datos.origenPunto).toBe("comunidad");
    expect(datos.punto).toEqual({ latitud: -9.14, longitud: -77.74 });
    expect(nasaPower.obtener).toHaveBeenCalled();
  });

  test("sin punto ni coordenadas de comunidad devuelve 'sin_punto' (tarjeta)", async () => {
    const datos = await servicio.datosCalendario({
      cultivo: "papa",
      idioma: "es",
    });

    expect(datos.punto).toBeNull();
    expect(datos.estadoDatos).toBe("sin_punto");
    expect(datos.resultado).toBeNull();
    expect(nasaPower.obtener).not.toHaveBeenCalled();
  });
});

describe("cultivo fuera de la base", () => {
  test("marca los rangos como estimados por IA y baja la confianza", async () => {
    ia.estimarRangosCultivo.mockResolvedValue({
      humedadMin: 25,
      humedadMax: 45,
      tempMin: 8,
      tempMax: 20,
      diasCiclo: 120,
      estimado: true,
      etiqueta: "estimado_ia",
    });

    // El select solo ofrece cultivos de la base; "Otro cultivo" llega en ?otro=.
    const datos = await servicio.datosCalendario({
      cultivo: "papa",
      otroCultivo: "haba",
      lat: "-13.53",
      lon: "-71.98",
      idioma: "es",
    });

    expect(ia.estimarRangosCultivo).toHaveBeenCalledWith("haba");
    expect(datos.resultado).not.toBeNull();
    expect(datos.resultado.rangos.origen).toBe("ia");
    expect(datos.resultado.confianza).toBe("baja");
    expect(datos.resultado.rangos.humedadMin).toBe(25);
    expect(datos.resultado.ventanas.length).toBeGreaterThanOrEqual(1);
  });

  test("si la IA no da datos válidos, informa que no hay datos suficientes", async () => {
    ia.estimarRangosCultivo.mockResolvedValue(null);

    const datos = await servicio.datosCalendario({
      cultivo: "papa",
      otroCultivo: "maca",
      lat: "-13.53",
      lon: "-71.98",
      idioma: "es",
    });

    expect(datos.resultado).toBeNull();
    expect(datos.estadoDatos).toBe("sin_datos_cultivo");
    expect(datos.sinEstimacion).toBe(true);
  });
});

describe("redacción con IA", () => {
  // Primero se calcula sin IA para conocer las fechas reales del resultado,
  // así la prueba no depende de la fecha en que se ejecute.
  async function consultarConFechasReales() {
    // La quinua tiene ciclo (180 días) en la base, así que trae cosecha.
    const calculado = await servicio.datosCalendario({
      cultivo: "quinua",
      lat: "-13.53",
      lon: "-71.98",
      idioma: "es",
    });
    expect(calculado.resultado).not.toBeNull();
    const primera = calculado.resultado.ventanas[0];
    servicio.limpiarCacheCalendario();
    jest.clearAllMocks();
    return { calculado, primera };
  }

  test("usa el texto de la IA cuando sus fechas existen en el JSON", async () => {
    const { primera } = await consultarConFechasReales();
    const texto = `Según NASA POWER, la mejor ventana va del ${primera.inicio} al ${primera.fin}. La cosecha iría del ${primera.cosecha.inicio} al ${primera.cosecha.fin}. Consulta a un técnico y regístrate.`;
    ia.redactarExplicacion.mockResolvedValue(texto);

    const datos = await servicio.datosCalendario({
      cultivo: "quinua",
      lat: "-13.53",
      lon: "-71.98",
      idioma: "es",
    });

    expect(datos.redaccionGeneradaConIA).toBe(true);
    expect(datos.redaccion).toContain(primera.inicio);
  });

  test("si la IA inventa una fecha, se descarta y se usa la plantilla", async () => {
    const { primera } = await consultarConFechasReales();
    ia.redactarExplicacion.mockResolvedValue(
      `Según NASA POWER, la ventana va del 2031-01-01 al 2031-01-10. La cosecha iría del ${primera.cosecha.inicio} al ${primera.cosecha.fin}. Consulta a un técnico y regístrate.`,
    );

    const datos = await servicio.datosCalendario({
      cultivo: "quinua",
      lat: "-13.53",
      lon: "-71.98",
      idioma: "es",
    });

    expect(datos.redaccionGeneradaConIA).toBe(false);
    expect(datos.redaccion).not.toContain("2031-01-01");
    // La plantilla fija usa exactamente las fechas del cálculo.
    expect(datos.redaccion).toContain(primera.inicio);
    expect(datos.redaccion).toContain(primera.fin);
  });

  test("si la IA está caída, la plantilla fija mantiene las mismas fechas", async () => {
    const { primera } = await consultarConFechasReales();
    ia.redactarExplicacion.mockRejectedValue(new Error("IA caída"));

    const datos = await servicio.datosCalendario({
      cultivo: "quinua",
      lat: "-13.53",
      lon: "-71.98",
      idioma: "es",
    });

    expect(datos.redaccionGeneradaConIA).toBe(false);
    expect(datos.redaccion).toContain(primera.inicio);
    expect(datos.redaccion).toContain(primera.fin);
    expect(datos.redaccion).toMatch(/NASA POWER/);
    expect(datos.redaccion).toMatch(/t[eé]cnico/i);
  });
});

describe("volatilidad, caché y límites", () => {
  test("usa la caché en memoria por coordenada redondeada (6 h)", async () => {
    await servicio.datosCalendario({
      cultivo: "papa",
      lat: "-13.531",
      lon: "-71.981",
      idioma: "es",
    });
    await servicio.datosCalendario({
      cultivo: "papa",
      lat: "-13.534",
      lon: "-71.984",
      idioma: "es",
    });

    // Misma coordenada redondeada: NASA POWER solo se consulta una vez.
    expect(nasaPower.obtener).toHaveBeenCalledTimes(1);
  });

  test("los resultados deterministas no se guardan en la base", async () => {
    await servicio.datosCalendario({
      cultivo: "papa",
      lat: "-13.53",
      lon: "-71.98",
      idioma: "es",
    });

    // Solo se consultan datos de catálogo; ningún método de escritura.
    const escrituras = Object.keys(repositorio).filter((nombre) =>
      /guardar|insertar|crear|actualizar|borrar|registrar/i.test(nombre),
    );
    expect(escrituras).toEqual([]);
  });
});

describe("geocodificación con Open-Meteo (solo Perú, caché 24 h)", () => {
  function respuestaJson(datos, estado = 200) {
    return {
      ok: estado >= 200 && estado < 300,
      status: estado,
      json: jest.fn().mockResolvedValue(datos),
    };
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("filtra con countryCode=PE y descarta resultados de otros países", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(
      respuestaJson({
        results: [
          {
            id: 1,
            name: "Coracora",
            admin1: "Ayacucho",
            country: "Perú",
            country_code: "PE",
            latitude: -15.0359,
            longitude: -73.7834,
          },
          {
            id: 2,
            name: "Coracora",
            admin1: "Lima",
            country: "Estados Unidos",
            country_code: "US",
            latitude: 40.1,
            longitude: -75.2,
          },
        ],
      }),
    );

    const resultados = await geocodificacion.buscar("Coracora");

    const url = new URL(global.fetch.mock.calls[0][0]);
    expect(url.hostname).toBe("geocoding-api.open-meteo.com");
    expect(url.searchParams.get("name")).toBe("Coracora");
    expect(url.searchParams.get("countryCode")).toBe("PE");
    expect(url.searchParams.has("country")).toBe(false);
    expect(url.searchParams.get("count")).toBe("8");
    expect(resultados).toHaveLength(1);
    expect(resultados[0]).toMatchObject({
      nombre: "Coracora",
      latitud: -15.04,
      longitud: -73.78,
      enPeru: true,
    });
  });

  test("cachea 24 h: dos búsquedas iguales hacen una sola petición", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(respuestaJson({ results: [] }));

    await geocodificacion.buscar("Yungay");
    await geocodificacion.buscar("yungay");

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("rechaza entradas inválidas sin llamar a la fuente", async () => {
    const fetchImpl = jest.spyOn(global, "fetch");

    expect(await geocodificacion.buscar("C")).toEqual([]);
    expect(await geocodificacion.buscar("<script>")).toEqual([]);
    expect(geocodificacion.normalizarConsulta("  Coracora  ")).toBe("Coracora");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("validación de la respuesta de IA", () => {
  const { validarEsquemaRangos, validarRedaccion } = ia;

  test("acepta un JSON válido de rangos", () => {
    expect(
      validarEsquemaRangos(
        {
          nombre: "Haba",
          humedadMin: 25,
          humedadMax: 45,
          tempMin: 8,
          tempMax: 20,
          diasCiclo: 120,
        },
        "haba",
      ),
    ).toMatchObject({ humedadMin: 25, diasCiclo: 120, estimado: true });
  });

  test("rechaza JSON inválido: mínimo mayor que máximo, fuera de rango o texto", () => {
    expect(
      validarEsquemaRangos({
        nombre: "Haba",
        humedadMin: 50,
        humedadMax: 30,
        tempMin: 8,
        tempMax: 20,
        diasCiclo: 120,
      }),
    ).toBeNull();
    expect(
      validarEsquemaRangos({
        nombre: "Haba",
        humedadMin: 25,
        humedadMax: 400,
        tempMin: 8,
        tempMax: 20,
        diasCiclo: 120,
      }),
    ).toBeNull();
    expect(validarEsquemaRangos("no es json")).toBeNull();
  });

  test("rechaza una redacción con fechas que no están en el JSON", () => {
    const json = RESULTADO;
    expect(validarRedaccion(TEXTO_IA, json)).toBe(true);
    expect(
      validarRedaccion(TEXTO_IA.replace("2026-12-01", "2026-11-15"), json),
    ).toBe(false);
  });
});
