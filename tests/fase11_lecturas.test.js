// Pruebas de ramas del servicio de lecturas (Fase 11).
// Validan reglas de fecha, rangos, permisos del técnico, duplicados e importación.
jest.mock("../src/modules/lecturas/lecturas.repository", () => ({
  listarDeParcela: jest.fn(),
  ultimaDeParcela: jest.fn(),
  ultimaDeParcelaPorFuente: jest.fn(),
  estadoSincronizacion: jest.fn(),
  listarPaginadasDeParcela: jest.fn(),
  listarParaGrafico: jest.fn(),
  fuentePorClave: jest.fn(),
  listarFechasExistentes: jest.fn(),
  crearVarias: jest.fn(),
  crear: jest.fn(),
  buscarPorId: jest.fn(),
  eliminar: jest.fn(),
}));
jest.mock("../src/modules/parcelas/parcelas.repository", () => ({
  buscarPorId: jest.fn(),
  buscarDeUsuario: jest.fn(),
  accesoVigente: jest.fn(),
}));
jest.mock("../src/modules/admin/auditoria.repository", () => ({
  registrar: jest.fn().mockResolvedValue(undefined),
}));

const repo = require("../src/modules/lecturas/lecturas.repository");
const parcelasRepo = require("../src/modules/parcelas/parcelas.repository");
const lecturas = require("../src/modules/lecturas/lecturas.service");

const HOY = new Date().toISOString().slice(0, 10);
const DUENO = { id: 5, roles: ["agricultor"], permisos: [] };
const TECNICO = {
  id: 7,
  roles: ["tecnico"],
  permisos: ["lecturas.escribir_asignadas"],
};

beforeEach(() => {
  jest.clearAllMocks();
  repo.fuentePorClave.mockResolvedValue({ id: 1, clave: "manual" });
  repo.listarFechasExistentes.mockResolvedValue([]);
  repo.crear.mockResolvedValue(44);
  repo.crearVarias.mockResolvedValue(1);
  parcelasRepo.buscarPorId.mockResolvedValue({ id: 3, usuario_id: 5 });
  parcelasRepo.buscarDeUsuario.mockResolvedValue({ id: 3 });
});

describe("Validación de fechas y rangos", () => {
  test("rechaza fechas con formato incorrecto", () => {
    expect(() =>
      lecturas.registrarManual(DUENO, 3, {
        fecha: "12/10/2025",
        humedad: 20,
        temperatura: 12,
      }),
    ).rejects.toMatchObject({ estado: 400 });
  });

  test("rechaza fechas en el futuro", async () => {
    const futura = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    await expect(
      lecturas.registrarManual(DUENO, 3, {
        fecha: futura,
        humedad: 20,
        temperatura: 12,
      }),
    ).rejects.toMatchObject({ estado: 400 });
  });

  test("rechaza humedad fuera de 0 a 100", async () => {
    await expect(
      lecturas.registrarManual(DUENO, 3, {
        fecha: HOY,
        humedad: 120,
        temperatura: 12,
      }),
    ).rejects.toMatchObject({ estado: 400 });
  });

  test("rechaza temperatura fuera de rango", async () => {
    await expect(
      lecturas.registrarManual(DUENO, 3, {
        fecha: HOY,
        humedad: 20,
        temperatura: 70,
      }),
    ).rejects.toMatchObject({ estado: 400 });
  });

  test("registra correctamente como dueño", async () => {
    await expect(
      lecturas.registrarManual(DUENO, 3, {
        fecha: HOY,
        humedad: 20,
        temperatura: 12,
        observacion: "  llovió  ",
      }),
    ).resolves.toBe(44);
    expect(repo.crear).toHaveBeenCalledWith(
      expect.objectContaining({ observacion: "llovió", parcela_id: 3 }),
    );
  });
});

describe("Permisos para registrar en parcelas ajenas", () => {
  test("una parcela inexistente devuelve 404", async () => {
    parcelasRepo.buscarPorId.mockResolvedValue(null);
    await expect(
      lecturas.registrarManual(DUENO, 3, {
        fecha: HOY,
        humedad: 20,
        temperatura: 12,
      }),
    ).rejects.toMatchObject({ estado: 404 });
  });

  test("un usuario sin rol de técnico no puede escribir en parcela ajena", async () => {
    await expect(
      lecturas.registrarManual(
        { id: 9, roles: ["agricultor"], permisos: [] },
        3,
        { fecha: HOY, humedad: 20, temperatura: 12 },
      ),
    ).rejects.toMatchObject({ estado: 404 });
  });

  test("un técnico sin permiso no puede escribir", async () => {
    await expect(
      lecturas.registrarManual({ id: 7, roles: ["tecnico"], permisos: [] }, 3, {
        fecha: HOY,
        humedad: 20,
        temperatura: 12,
      }),
    ).rejects.toMatchObject({ estado: 404 });
  });

  test("un técnico sin acceso vigente no puede escribir", async () => {
    parcelasRepo.accesoVigente.mockResolvedValue(null);
    await expect(
      lecturas.registrarManual(TECNICO, 3, {
        fecha: HOY,
        humedad: 20,
        temperatura: 12,
      }),
    ).rejects.toMatchObject({ estado: 404 });
  });

  test("un técnico con acceso solo de lectura no puede escribir", async () => {
    parcelasRepo.accesoVigente.mockResolvedValue({ puede_escribir: false });
    await expect(
      lecturas.registrarManual(TECNICO, 3, {
        fecha: HOY,
        humedad: 20,
        temperatura: 12,
      }),
    ).rejects.toMatchObject({ estado: 404 });
  });

  test("un técnico con acceso de escritura sí registra", async () => {
    parcelasRepo.accesoVigente.mockResolvedValue({ puede_escribir: true });
    await expect(
      lecturas.registrarManual(TECNICO, 3, {
        fecha: HOY,
        humedad: 20,
        temperatura: 12,
      }),
    ).resolves.toBe(44);
  });

  test("rechaza una lectura duplicada para la misma fecha", async () => {
    repo.listarFechasExistentes.mockResolvedValue([{ id: 1 }]);
    await expect(
      lecturas.registrarManual(DUENO, 3, {
        fecha: HOY,
        humedad: 20,
        temperatura: 12,
      }),
    ).rejects.toMatchObject({ estado: 400 });
  });
});

describe("Importación CSV", () => {
  test("importa filas válidas y audita", async () => {
    await expect(
      lecturas.importarManual(DUENO, 3, [
        { fecha: "2025-01-02", humedad: 20, temperatura: 12 },
        { fecha: "2025-01-03", humedad: 21, temperatura: 13 },
      ]),
    ).resolves.toBe(2);
    expect(repo.crearVarias).toHaveBeenCalledTimes(1);
  });

  test("rechaza un archivo sin lecturas válidas", async () => {
    await expect(lecturas.importarManual(DUENO, 3, [])).rejects.toMatchObject({
      estado: 400,
    });
  });

  test("rechaza fechas repetidas dentro del archivo", async () => {
    await expect(
      lecturas.importarManual(DUENO, 3, [
        { fecha: "2025-01-02", humedad: 20, temperatura: 12 },
        { fecha: "2025-01-02", humedad: 21, temperatura: 13 },
      ]),
    ).rejects.toMatchObject({ estado: 400 });
  });

  test("rechaza fechas que ya existen en la parcela", async () => {
    repo.listarFechasExistentes.mockResolvedValue([{ fecha: "2025-01-02" }]);
    await expect(
      lecturas.importarManual(DUENO, 3, [
        { fecha: "2025-01-02", humedad: 20, temperatura: 12 },
      ]),
    ).rejects.toMatchObject({ estado: 400 });
  });

  test("una parcela ajena no se puede importar", async () => {
    parcelasRepo.buscarDeUsuario.mockResolvedValue(null);
    await expect(
      lecturas.importarManual(DUENO, 3, [
        { fecha: "2025-01-02", humedad: 20, temperatura: 12 },
      ]),
    ).rejects.toMatchObject({ estado: 404 });
  });
});

describe("Eliminar lectura", () => {
  test("una lectura inexistente devuelve 404", async () => {
    repo.buscarPorId.mockResolvedValue(null);
    await expect(lecturas.eliminar(1, 5)).rejects.toMatchObject({
      estado: 404,
    });
  });

  test("solo el dueño de la parcela puede eliminar", async () => {
    repo.buscarPorId.mockResolvedValue({ id: 1, parcela_id: 3 });
    parcelasRepo.buscarPorId.mockResolvedValue({ id: 3, usuario_id: 9 });
    await expect(lecturas.eliminar(1, 5)).rejects.toMatchObject({
      estado: 404,
    });
  });

  test("el dueño elimina su lectura", async () => {
    repo.buscarPorId.mockResolvedValue({ id: 1, parcela_id: 3 });
    repo.eliminar.mockResolvedValue(1);
    await expect(lecturas.eliminar(1, 5)).resolves.toBeUndefined();
    expect(repo.eliminar).toHaveBeenCalledWith(1);
  });
});
