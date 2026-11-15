jest.mock("../src/jobs/ejecuciones.repository", () => ({
  iniciar: jest.fn().mockResolvedValue(91),
  finalizar: jest.fn().mockResolvedValue(undefined),
  ultimasPorTrabajo: jest.fn().mockResolvedValue([]),
}));
jest.mock("../src/modules/lecturas/sincronizacion.service", () => ({
  sincronizarParcelas: jest.fn(),
}));
jest.mock("../src/modules/alertas/alertas.service", () => ({
  evaluarReglas: jest.fn(),
}));
jest.mock("../src/modules/usuarios/usuarios.repository", () => ({
  limpiarTokensVencidos: jest.fn(),
}));
jest.mock("../src/modules/editor/editor.service", () => ({
  publicarProgramados: jest.fn(),
}));
jest.mock("../src/modules/admin/auditoria.repository", () => ({
  registrar: jest.fn().mockResolvedValue(undefined),
}));

const ejecuciones = require("../src/jobs/ejecuciones.repository");
const sincronizacion = require("../src/modules/lecturas/sincronizacion.service");
const auditoria = require("../src/modules/admin/auditoria.repository");
const trabajos = require("../src/jobs/trabajos.service");

describe("Registro de ejecuciones de trabajos", () => {
  beforeEach(() => jest.clearAllMocks());

  test("registra una ejecución parcial de sincronización", async () => {
    sincronizacion.sincronizarParcelas.mockResolvedValue({
      parcelasProcesadas: 4,
      fallidas: 1,
      lecturasInsertadas: 2,
    });

    const resultado = await trabajos.ejecutar("sincronizacion_datos");

    expect(resultado.estado).toBe("parcial");
    expect(ejecuciones.iniciar).toHaveBeenCalledWith(expect.objectContaining({
      trabajo: "sincronizacion_datos",
      origen: "cron",
    }));
    expect(ejecuciones.finalizar).toHaveBeenCalledWith(91, expect.objectContaining({
      estado: "parcial",
    }));
  });

  test("registra actor y auditoría al ejecutar manualmente", async () => {
    sincronizacion.sincronizarParcelas.mockResolvedValue({ parcelasProcesadas: 0 });

    await trabajos.ejecutarManualmente("sincronizacion_datos", 7, { ip: "127.0.0.1" });

    expect(ejecuciones.iniciar).toHaveBeenCalledWith(expect.objectContaining({
      origen: "manual",
      ejecutadoPor: 7,
    }));
    expect(auditoria.registrar).toHaveBeenCalledWith(expect.objectContaining({
      usuarioId: 7,
      accion: "trabajo.ejecutado_manualmente",
    }));
  });
});
