// Pruebas de ramas de las campañas agrícolas (Fase 11).
// Cubren fechas, variedades, siembras, cosechas y la comparación con la
// ventana tradicional del calendario comunitario.
jest.mock("../src/modules/campanias/campanias.repository", () => ({
  buscarDeUsuario: jest.fn(),
  buscarEstado: jest.fn(),
  buscarUnidad: jest.fn(),
  crear: jest.fn(),
  actualizar: jest.fn(),
  registrarSiembra: jest.fn(),
  registrarCosecha: jest.fn(),
  listarSiembras: jest.fn(),
  listarCosechas: jest.fn(),
  buscarVentana: jest.fn(),
  listarUnidades: jest.fn(),
  listarDeParcela: jest.fn(),
  listarEstados: jest.fn(),
}));
jest.mock("../src/modules/parcelas/parcelas.service", () => ({
  obtenerDelUsuario: jest.fn(),
}));
jest.mock("../src/modules/cultivos/cultivos.repository", () => ({
  buscarCultivo: jest.fn(),
  listarVariedadesDeCultivo: jest.fn(),
}));
jest.mock("../src/modules/admin/auditoria.repository", () => ({
  registrar: jest.fn().mockResolvedValue(undefined),
}));

const repo = require("../src/modules/campanias/campanias.repository");
const parcelas = require("../src/modules/parcelas/parcelas.service");
const cultivosRepo = require("../src/modules/cultivos/cultivos.repository");
const campanias = require("../src/modules/campanias/campanias.service");

const DATOS = {
  cultivo_id: "1",
  estado_id: "1",
  variedad_id: "",
  fecha_inicio: "2025-10-01",
  fecha_fin: "2026-03-31",
};

beforeEach(() => {
  jest.clearAllMocks();
  parcelas.obtenerDelUsuario.mockResolvedValue({ id: 3 });
  cultivosRepo.buscarCultivo.mockResolvedValue({ id: 1 });
  cultivosRepo.listarVariedadesDeCultivo.mockResolvedValue([{ id: 7 }]);
  repo.buscarEstado.mockResolvedValue({ id: 1 });
  repo.crear.mockResolvedValue(21);
  repo.buscarUnidad.mockResolvedValue({ id: 2 });
  repo.buscarDeUsuario.mockResolvedValue({
    id: 21,
    parcela_id: 3,
    cultivo_id: 1,
    zona_id: 2,
  });
});

describe("Crear campaña", () => {
  test("crea una campaña válida", async () => {
    await expect(campanias.crear(3, 5, DATOS)).resolves.toBe(21);
  });

  test("rechaza un cultivo inexistente", async () => {
    cultivosRepo.buscarCultivo.mockResolvedValue(null);
    await expect(campanias.crear(3, 5, DATOS)).rejects.toMatchObject({
      estado: 400,
    });
  });

  test("rechaza un estado inexistente", async () => {
    repo.buscarEstado.mockResolvedValue(null);
    await expect(campanias.crear(3, 5, DATOS)).rejects.toMatchObject({
      estado: 400,
    });
  });

  test("rechaza una variedad que no pertenece al cultivo", async () => {
    await expect(
      campanias.crear(3, 5, { ...DATOS, variedad_id: "99" }),
    ).rejects.toMatchObject({ estado: 400 });
  });

  test("acepta una variedad registrada para el cultivo", async () => {
    await expect(
      campanias.crear(3, 5, { ...DATOS, variedad_id: "7" }),
    ).resolves.toBe(21);
  });

  test("rechaza fechas con formato inválido", async () => {
    await expect(
      campanias.crear(3, 5, { ...DATOS, fecha_inicio: "01/10/2025" }),
    ).rejects.toMatchObject({ estado: 400 });
    await expect(
      campanias.crear(3, 5, { ...DATOS, fecha_inicio: "2025-02-31" }),
    ).rejects.toMatchObject({ estado: 400 });
  });

  test("rechaza una fecha final anterior a la inicial", async () => {
    await expect(
      campanias.crear(3, 5, {
        ...DATOS,
        fecha_inicio: "2026-03-01",
        fecha_fin: "2025-01-01",
      }),
    ).rejects.toMatchObject({ estado: 400 });
  });

  test("una campaña ajena devuelve 404", async () => {
    repo.buscarDeUsuario.mockResolvedValue(null);
    await expect(campanias.actualizar(21, 9, DATOS)).rejects.toMatchObject({
      estado: 404,
    });
  });
});

describe("Siembras y cosechas", () => {
  test("rechaza una siembra con fecha inválida o futura", async () => {
    await expect(
      campanias.registrarSiembra(21, 5, { fecha: "no-fecha" }),
    ).rejects.toMatchObject({ estado: 400 });
    const futura = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    await expect(
      campanias.registrarSiembra(21, 5, { fecha: futura }),
    ).rejects.toMatchObject({ estado: 400 });
  });

  test("rechaza método u observaciones demasiado largos", async () => {
    await expect(
      campanias.registrarSiembra(21, 5, {
        fecha: "2025-10-01",
        metodo: "x".repeat(101),
      }),
    ).rejects.toMatchObject({ estado: 400 });
  });

  test("rechaza una cosecha con cantidad no positiva", async () => {
    await expect(
      campanias.registrarCosecha(21, 5, {
        fecha: "2025-10-01",
        cantidad: "0",
        unidad_id: "2",
      }),
    ).rejects.toMatchObject({ estado: 400 });
  });

  test("rechaza una unidad de medida inexistente", async () => {
    repo.buscarUnidad.mockResolvedValue(null);
    await expect(
      campanias.registrarCosecha(21, 5, {
        fecha: "2025-10-01",
        cantidad: "10",
        unidad_id: "9",
      }),
    ).rejects.toMatchObject({ estado: 400 });
  });

  test("rechaza observaciones de cosecha demasiado largas", async () => {
    await expect(
      campanias.registrarCosecha(21, 5, {
        fecha: "2025-10-01",
        cantidad: "10",
        unidad_id: "2",
        observaciones: "x".repeat(2001),
      }),
    ).rejects.toMatchObject({ estado: 400 });
  });

  test("registra cosecha válida", async () => {
    repo.registrarCosecha.mockResolvedValue(5);
    await expect(
      campanias.registrarCosecha(21, 5, {
        fecha: "2025-10-01",
        cantidad: "12.5",
        unidad_id: "2",
      }),
    ).resolves.toBeUndefined();
    expect(repo.registrarCosecha).toHaveBeenCalledWith(
      expect.objectContaining({ cantidad: 12.5, observaciones: null }),
    );
  });
});

describe("Comparación con la ventana tradicional", () => {
  function prepararVentana(ventana, fecha) {
    repo.listarSiembras.mockResolvedValue([{ id: 1, fecha }]);
    repo.listarCosechas.mockResolvedValue([]);
    repo.buscarVentana.mockResolvedValue(ventana);
    repo.listarUnidades.mockResolvedValue([]);
  }

  test("sin ventana registrada lo indica con claridad", async () => {
    prepararVentana(null, "2025-10-15");
    const datos = await campanias.detalle(21, 5);
    expect(datos.siembras[0].comparacion.dentroDeVentana).toBe(false);
    expect(datos.siembras[0].comparacion.texto).toMatch(
      /No hay una ventana tradicional/,
    );
  });

  test("siembra dentro de la ventana (mismo año)", async () => {
    prepararVentana({ mes_inicio: 9, mes_fin: 12 }, "2025-10-15");
    const datos = await campanias.detalle(21, 5);
    expect(datos.siembras[0].comparacion.dentroDeVentana).toBe(true);
    expect(datos.siembras[0].comparacion.texto).toMatch(/dentro de la ventana/);
  });

  test("siembra antes de la ventana informa los días de diferencia", async () => {
    prepararVentana({ mes_inicio: 9, mes_fin: 12 }, "2025-07-01");
    const datos = await campanias.detalle(21, 5);
    const comparacion = datos.siembras[0].comparacion;
    expect(comparacion.dentroDeVentana).toBe(false);
    expect(comparacion.texto).toMatch(/antes/);
  });

  test("ventana que cruza el año (noviembre a febrero)", async () => {
    prepararVentana({ mes_inicio: 11, mes_fin: 2 }, "2026-01-15");
    const datos = await campanias.detalle(21, 5);
    expect(datos.siembras[0].comparacion.dentroDeVentana).toBe(true);
  });

  test("siembra fuera de una ventana que cruza el año informa la diferencia", async () => {
    prepararVentana({ mes_inicio: 11, mes_fin: 2 }, "2025-06-01");
    const datos = await campanias.detalle(21, 5);
    const comparacion = datos.siembras[0].comparacion;
    expect(comparacion.dentroDeVentana).toBe(false);
    expect(comparacion.texto).toMatch(/días (antes|después)/);
  });

  test("siembra después del cierre de la ventana", async () => {
    prepararVentana({ mes_inicio: 1, mes_fin: 2 }, "2025-12-01");
    const datos = await campanias.detalle(21, 5);
    const comparacion = datos.siembras[0].comparacion;
    expect(comparacion.dentroDeVentana).toBe(false);
    expect(comparacion.texto).toMatch(/días (antes|después) del inicio/);
  });
});
