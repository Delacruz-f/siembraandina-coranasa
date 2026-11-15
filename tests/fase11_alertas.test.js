// Pruebas unitarias de los servicios de alerta y de la lectura de CSV (Fase 11).
// Los servicios se prueban con sus repositorios simulados: no tocan la base.
jest.mock("../src/modules/alertas/alertas.repository", () => ({
  buscarRequerimiento: jest.fn(),
  lecturasDesde: jest.fn(),
  existeAlertaDelDia: jest.fn(),
  listarParcelasConCampania: jest.fn(),
  listarParcelasGeolocalizadas: jest.fn(),
  listarReglasActivas: jest.fn(),
  crearAlerta: jest.fn(),
  resolverAlerta: jest.fn(),
}));
jest.mock("../src/openMeteo", () => ({
  pronosticoHorario: jest.fn(),
}));
jest.mock("../src/modules/auth/correo.service", () => ({
  enviar: jest.fn().mockResolvedValue({ messageId: "x" }),
}));
jest.mock("../src/modules/parcelas/condiciones.service", () => ({
  obtenerUmbrales: jest.fn().mockResolvedValue({ riesgoHelada: 2 }),
}));

const repositorio = require("../src/modules/alertas/alertas.repository");
const openMeteo = require("../src/openMeteo");
const alertas = require("../src/modules/alertas/alertas.service");
const { analizarCsv } = require("../src/modules/lecturas/csv");

function diaAtras(dias) {
  const fecha = new Date();
  fecha.setUTCHours(0, 0, 0, 0);
  fecha.setUTCDate(fecha.getUTCDate() - dias);
  return fecha.toISOString().slice(0, 10);
}

describe("Servicio de alertas", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    repositorio.crearAlerta.mockResolvedValue(null);
    repositorio.resolverAlerta.mockResolvedValue(0);
    repositorio.existeAlertaDelDia.mockResolvedValue(false);
  });


  function reglaHumedad(extra = {}) {
    return {
      id: 1,
      clave: "humedad_baja",
      metrica_clave: "humedad",
      umbral_clave: "requerimiento_min",
      umbral: null,
      operador_clave: "lt",
      persistencia_dias: 3,
      cultivo_id: null,
      zona_id: null,
      critica: false,
      ...extra,
    };
  }

  function parcela(id, extra = {}) {
    return {
      id,
      nombre: `Parcela ${id}`,
      cultivo_id: 1,
      zona_id: 2,
      latitud: null,
      longitud: null,
      usuario_id: 5,
      ...extra,
    };
  }

  test("activa una alerta de humedad baja tras varios días consecutivos", async () => {
    repositorio.listarReglasActivas.mockResolvedValue([reglaHumedad()]);
    repositorio.listarParcelasConCampania.mockResolvedValue([parcela(10)]);
    repositorio.listarParcelasGeolocalizadas.mockResolvedValue([]);
    repositorio.lecturasDesde.mockResolvedValue([
      { id: 90, fecha: diaAtras(0), humedad: 15 },
      { id: 89, fecha: diaAtras(1), humedad: 14 },
      { id: 88, fecha: diaAtras(2), humedad: 13 },
    ]);
    repositorio.buscarRequerimiento.mockResolvedValue({
      hum_min: 22,
      hum_max: 32,
    });

    const resultado = await alertas.evaluarReglas();
    expect(resultado).toEqual({ creadas: 0, resueltas: 0 });
    expect(repositorio.crearAlerta).toHaveBeenCalledWith(
      expect.objectContaining({
        parcela: expect.objectContaining({ id: 10 }),
        lecturaId: 90,
      }),
    );
  });

  test("no activa la alerta si falta un día en la serie", async () => {
    repositorio.listarReglasActivas.mockResolvedValue([reglaHumedad({ id: 2 })]);
    repositorio.listarParcelasConCampania.mockResolvedValue([parcela(11)]);
    repositorio.listarParcelasGeolocalizadas.mockResolvedValue([]);
    repositorio.lecturasDesde.mockResolvedValue([
      { id: 90, fecha: diaAtras(0), humedad: 15 },
      { id: 88, fecha: diaAtras(2), humedad: 13 },
    ]);
    repositorio.buscarRequerimiento.mockResolvedValue({
      hum_min: 22,
      hum_max: 32,
    });

    await alertas.evaluarReglas();
    expect(repositorio.crearAlerta).not.toHaveBeenCalled();
  });

  test("no crea una segunda alerta de la misma regla en la parcela durante el día", async () => {
    repositorio.listarReglasActivas.mockResolvedValue([reglaHumedad()]);
    repositorio.listarParcelasConCampania.mockResolvedValue([parcela(15)]);
    repositorio.listarParcelasGeolocalizadas.mockResolvedValue([]);
    repositorio.lecturasDesde.mockResolvedValue([
      { id: 95, fecha: diaAtras(0), humedad: 15 },
      { id: 94, fecha: diaAtras(1), humedad: 14 },
      { id: 93, fecha: diaAtras(2), humedad: 13 },
    ]);
    repositorio.buscarRequerimiento.mockResolvedValue({
      hum_min: 22,
      hum_max: 32,
    });
    repositorio.existeAlertaDelDia.mockResolvedValue(true);

    expect(await alertas.evaluarReglas()).toEqual({ creadas: 0, resueltas: 0 });
    expect(repositorio.existeAlertaDelDia).toHaveBeenCalledWith(1, 15);
    expect(repositorio.crearAlerta).not.toHaveBeenCalled();
  });

  test("con umbral fijo activa cuando el valor cruza el límite", async () => {
    repositorio.listarReglasActivas.mockResolvedValue([
      reglaHumedad({
        id: 3,
        umbral_clave: null,
        umbral: 20,
        operador_clave: "lte",
        persistencia_dias: 1,
      }),
    ]);
    repositorio.listarParcelasConCampania.mockResolvedValue([parcela(12)]);
    repositorio.listarParcelasGeolocalizadas.mockResolvedValue([]);
    repositorio.lecturasDesde.mockResolvedValue([
      { id: 91, fecha: diaAtras(0), humedad: 20 },
    ]);

    await alertas.evaluarReglas();
    expect(repositorio.crearAlerta).toHaveBeenCalledWith(
      expect.objectContaining({ parcela: expect.objectContaining({ id: 12 }) }),
    );
  });

  test("resuelve la alerta cuando la humedad vuelve al rango", async () => {
    repositorio.listarReglasActivas.mockResolvedValue([
      reglaHumedad({ id: 6, persistencia_dias: 1 }),
    ]);
    repositorio.listarParcelasConCampania.mockResolvedValue([parcela(14)]);
    repositorio.listarParcelasGeolocalizadas.mockResolvedValue([]);
    repositorio.lecturasDesde.mockResolvedValue([
      { id: 92, fecha: diaAtras(0), humedad: 30 },
    ]);
    repositorio.buscarRequerimiento.mockResolvedValue({
      hum_min: 22,
      hum_max: 32,
    });
    repositorio.resolverAlerta.mockResolvedValue(1);

    const resultado = await alertas.evaluarReglas();
    expect(resultado.resueltas).toBe(1);
    expect(repositorio.resolverAlerta).toHaveBeenCalledWith(6, 14);
  });

  test("regla de temperatura usa el pronóstico horario", async () => {
    repositorio.listarReglasActivas.mockResolvedValue([
      {
        id: 4,
        clave: "helada",
        metrica_clave: "temperatura_aire",
        umbral: 2,
        operador_clave: "lt",
        persistencia_dias: 1,
        horizonte_horas: 24,
        cultivo_id: null,
        zona_id: null,
        critica: false,
      },
    ]);
    repositorio.listarParcelasGeolocalizadas.mockResolvedValue([
      parcela(13, { latitud: -13.5, longitud: -72 }),
    ]);
    openMeteo.pronosticoHorario.mockResolvedValue([
      { temperatura: 5 },
      { temperatura: -2.5 },
      { temperatura: 8 },
    ]);

    await alertas.evaluarReglas();
    expect(openMeteo.pronosticoHorario).toHaveBeenCalledWith(-13.5, -72, 24);
    expect(repositorio.existeAlertaDelDia).toHaveBeenCalledWith(4, 13);
    expect(repositorio.crearAlerta).toHaveBeenCalledWith(
      expect.objectContaining({ parcela: expect.objectContaining({ id: 13 }) }),
    );
  });

  test("sin parcelas geolocalizadas no consulta el pronóstico", async () => {
    repositorio.listarReglasActivas.mockResolvedValue([
      {
        id: 5,
        clave: "helada",
        metrica_clave: "temperatura_aire",
        umbral: 0,
        operador_clave: "lt",
        persistencia_dias: 1,
        horizonte_horas: 24,
      },
    ]);
    repositorio.listarParcelasGeolocalizadas.mockResolvedValue([]);
    await alertas.evaluarReglas();
    expect(openMeteo.pronosticoHorario).not.toHaveBeenCalled();
  });

  test("ignora temperaturas horarias nulas al evaluar riesgo de helada", async () => {
    repositorio.listarReglasActivas.mockResolvedValue([
      {
        id: 7,
        clave: "helada",
        metrica_clave: "temperatura_aire",
        umbral: 2,
        operador_clave: "lte",
        horizonte_horas: 48,
        cultivo_id: null,
        zona_id: null,
      },
    ]);
    repositorio.listarParcelasGeolocalizadas.mockResolvedValue([
      parcela(16, { latitud: -13.5, longitud: -72 }),
    ]);
    openMeteo.pronosticoHorario.mockResolvedValue([
      { temperatura: null },
      { temperatura: undefined },
    ]);

    const resultado = await alertas.evaluarReglas();

    expect(resultado.creadas).toBe(0);
    expect(repositorio.crearAlerta).not.toHaveBeenCalled();
  });

  test("sin reglas activas no hace nada", async () => {
    repositorio.listarReglasActivas.mockResolvedValue([]);
    expect(await alertas.evaluarReglas()).toEqual({
      creadas: 0,
      resueltas: 0,
    });
  });
});

describe("Lectura de CSV de lecturas", () => {
  test("acepta la cabecera exacta y descarta filas inválidas", () => {
    const csv = [
      "fecha,humedad,temperatura,observacion",
      "2024-10-15,24.5,12.3,ok",
      "02/10/2024,10,10,fecha mala",
      "2024-10-17,101,10,fuera de rango",
      "2024-10-18,22,11,",
    ].join("\n");
    const resultado = analizarCsv(Buffer.from(csv, "utf8"));
    expect(resultado.validas).toHaveLength(2);
    expect(resultado.errores).toHaveLength(2);
    expect(resultado.errores[0].linea).toBe(3);
  });

  test("rechaza una cabecera incorrecta con un error explicativo", () => {
    expect(() =>
      analizarCsv(Buffer.from("nombre,valor\na,1", "utf8")),
    ).toThrow(/primera fila|fecha, humedad y temperatura/i);
  });

  test("elimina el BOM de Excel al inicio del archivo", () => {
    const csv = "\uFEFFfecha,humedad,temperatura\n2024-10-15,24.5,12.3";
    const resultado = analizarCsv(Buffer.from(csv, "utf8"));
    expect(resultado.validas).toHaveLength(1);
  });
});

describe("Utilidades del servicio de alertas", () => {
  test("comparar soporta los cuatro operadores", () => {
    expect(alertas.comparar(5, "lt", 10)).toBe(true);
    expect(alertas.comparar(10, "lt", 10)).toBe(false);
    expect(alertas.comparar(10, "lte", 10)).toBe(true);
    expect(alertas.comparar(15, "gt", 10)).toBe(true);
    expect(alertas.comparar(10, "gte", 10)).toBe(true);
    expect(alertas.comparar(9, "gte", 10)).toBe(false);
  });

  test("un operador desconocido falla con un mensaje claro", () => {
    expect(() => alertas.comparar(5, "distinto", 10)).toThrow(/Operador/);
  });

  test("diasConsecutivos exige la serie completa y contigua", () => {
    const serie = [
      { fecha: diaAtras(0), humedad: 10 },
      { fecha: diaAtras(1), humedad: 11 },
      { fecha: diaAtras(2), humedad: 12 },
    ];
    expect(alertas.diasConsecutivos(serie, 3, 20, "lt")).toBe(true);
    expect(alertas.diasConsecutivos(serie, 4, 20, "lt")).toBeNull();
    expect(alertas.diasConsecutivos(serie, 3, 5, "lt")).toBe(false);
    expect(alertas.diasConsecutivos([], 1, 20, "lt")).toBeNull();
  });

  test("diasConsecutivos acepta fechas tipo Date y descarta huecos", () => {
    const fechas = [0, 1, 3].map((dias) => {
      const fecha = new Date();
      fecha.setUTCHours(0, 0, 0, 0);
      fecha.setUTCDate(fecha.getUTCDate() - dias);
      return { fecha, humedad: 5 };
    });
    expect(alertas.diasConsecutivos(fechas, 3, 20, "lt")).toBeNull();
    expect(alertas.diasConsecutivos(fechas, 1, 20, "lt")).toBe(true);
  });
});

describe("Alertas críticas y casos límite", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    repositorio.crearAlerta.mockResolvedValue(null);
    repositorio.resolverAlerta.mockResolvedValue(0);
  });

  test("una regla con métrica desconocida se omite sin romper", async () => {
    repositorio.listarReglasActivas.mockResolvedValue([
      { id: 9, metrica_clave: "viento", operador_clave: "gt", umbral: 30 },
    ]);
    repositorio.listarParcelasConCampania.mockResolvedValue([{ id: 1 }]);
    repositorio.listarParcelasGeolocalizadas.mockResolvedValue([]);
    await expect(alertas.evaluarReglas()).resolves.toEqual({
      creadas: 0,
      resueltas: 0,
    });
  });

  test("respeta el filtro por cultivo de la regla", async () => {
    repositorio.listarReglasActivas.mockResolvedValue([
      {
        id: 10,
        metrica_clave: "humedad",
        umbral: 20,
        operador_clave: "lt",
        persistencia_dias: 1,
        cultivo_id: 99,
        zona_id: null,
      },
    ]);
    repositorio.listarParcelasConCampania.mockResolvedValue([
      { id: 1, cultivo_id: 1, zona_id: 2 },
    ]);
    repositorio.listarParcelasGeolocalizadas.mockResolvedValue([]);
    await alertas.evaluarReglas();
    expect(repositorio.lecturasDesde).not.toHaveBeenCalled();
  });

  test("un requerimiento sin mínimos no es evaluable", async () => {
    repositorio.listarReglasActivas.mockResolvedValue([
      {
        id: 11,
        metrica_clave: "humedad",
        umbral_clave: "requerimiento_min",
        operador_clave: "lt",
        persistencia_dias: 1,
        cultivo_id: null,
        zona_id: null,
      },
    ]);
    repositorio.listarParcelasConCampania.mockResolvedValue([
      { id: 2, cultivo_id: 1, zona_id: 2 },
    ]);
    repositorio.listarParcelasGeolocalizadas.mockResolvedValue([]);
    repositorio.buscarRequerimiento.mockResolvedValue(null);
    await alertas.evaluarReglas();
    expect(repositorio.crearAlerta).not.toHaveBeenCalled();
    expect(repositorio.resolverAlerta).not.toHaveBeenCalled();
  });

  test("una alerta crítica con correo envía el aviso", async () => {
    repositorio.listarReglasActivas.mockResolvedValue([
      {
        id: 12,
        metrica_clave: "humedad",
        umbral: 20,
        operador_clave: "lt",
        persistencia_dias: 1,
        cultivo_id: null,
        zona_id: null,
        critica: true,
      },
    ]);
    repositorio.listarParcelasConCampania.mockResolvedValue([
      { id: 3, nombre: "Parcela crítica", cultivo_id: 1, zona_id: 2, usuario_id: 5 },
    ]);
    repositorio.listarParcelasGeolocalizadas.mockResolvedValue([]);
    repositorio.lecturasDesde.mockResolvedValue([
      { id: 1, fecha: diaAtras(0), humedad: 5 },
    ]);
    repositorio.crearAlerta.mockResolvedValue({
      id: 77,
      email: "duena@ejemplo.pe",
    });
    const resultado = await alertas.evaluarReglas();
    expect(resultado.creadas).toBe(1);
  });

  test("si el correo falla, la alerta igual queda creada", async () => {
    const correo = require("../src/modules/auth/correo.service");
    correo.enviar.mockRejectedValueOnce(new Error("SMTP caído"));
    repositorio.listarReglasActivas.mockResolvedValue([
      {
        id: 13,
        metrica_clave: "humedad",
        umbral: 20,
        operador_clave: "lt",
        persistencia_dias: 1,
        critica: true,
      },
    ]);
    repositorio.listarParcelasConCampania.mockResolvedValue([
      { id: 4, nombre: "Parcela", cultivo_id: 1, zona_id: 2, usuario_id: 5 },
    ]);
    repositorio.listarParcelasGeolocalizadas.mockResolvedValue([]);
    repositorio.lecturasDesde.mockResolvedValue([
      { id: 1, fecha: diaAtras(0), humedad: 5 },
    ]);
    repositorio.crearAlerta.mockResolvedValue({ id: 78, email: "x@ejemplo.pe" });
    await expect(alertas.evaluarReglas()).resolves.toMatchObject({ creadas: 1 });
  });

  test("una temperatura no numérica no activa la alerta", async () => {
    repositorio.listarReglasActivas.mockResolvedValue([
      {
        id: 14,
        metrica_clave: "temperatura_aire",
        umbral: 0,
        operador_clave: "lt",
        persistencia_dias: 1,
        horizonte_horas: 12,
      },
    ]);
    repositorio.listarParcelasConCampania.mockResolvedValue([]);
    repositorio.listarParcelasGeolocalizadas.mockResolvedValue([
      { id: 5, nombre: "P", latitud: -13, longitud: -72 },
    ]);
    openMeteo.pronosticoHorario.mockResolvedValue([
      { temperatura: "n/d" },
      { temperatura: 4 },
    ]);
    await alertas.evaluarReglas();
    expect(repositorio.crearAlerta).not.toHaveBeenCalled();
  });
});
