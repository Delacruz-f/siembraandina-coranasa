jest.mock("../src/modules/usuarios/usuarios.repository", () => ({
  buscarPorId: jest.fn(),
  crearTokenVerificacion: jest.fn(),
  marcarCorreoVerificadoPorId: jest.fn(),
}));
jest.mock("../src/modules/auth/correo.service", () => ({
  enviar: jest.fn().mockResolvedValue({ messageId: "x" }),
  validarConfiguracion: jest.fn(),
}));
jest.mock("../src/modules/admin/auditoria.repository", () => ({
  registrar: jest.fn().mockResolvedValue(undefined),
}));

const repo = require("../src/modules/usuarios/usuarios.repository");
const correo = require("../src/modules/auth/correo.service");
const auditoria = require("../src/modules/admin/auditoria.repository");
const usuarios = require("../src/modules/usuarios/usuarios.service");

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Acciones administrativas de verificación", () => {
  test("reenviar verificación envía correo y registra auditoría", async () => {
    repo.buscarPorId.mockResolvedValue({ id: 7, email: "ana@ejemplo.pe", activo: true, email_verificado_en: null });
    await expect(
      usuarios.reenviarVerificacionAdmin(7, { ip: "127.0.0.1", actorId: 1 }),
    ).resolves.toMatchObject({ enviado: true });
    expect(correo.enviar).toHaveBeenCalledWith(
      expect.objectContaining({ para: "ana@ejemplo.pe", tipo: "verificacion" }),
    );
    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ accion: "usuario.verificacion_reenviada", usuarioId: 1, entidadId: 7 }),
    );
  });

  test("reenviar verificación falla si ya está verificado", async () => {
    repo.buscarPorId.mockResolvedValue({ id: 7, email: "ana@ejemplo.pe", activo: true, email_verificado_en: new Date() });
    await expect(
      usuarios.reenviarVerificacionAdmin(7, { actorId: 1 }),
    ).rejects.toMatchObject({ estado: 400 });
    expect(correo.enviar).not.toHaveBeenCalled();
  });

  test("marcar correo como verificado actualiza y registra auditoría", async () => {
    repo.buscarPorId.mockResolvedValue({ id: 7, email: "ana@ejemplo.pe", activo: true, email_verificado_en: null });
    repo.marcarCorreoVerificadoPorId.mockResolvedValue(true);
    await expect(
      usuarios.marcarCorreoVerificadoAdmin(7, { ip: "127.0.0.1", actorId: 1 }),
    ).resolves.toMatchObject({ verificado: true });
    expect(repo.marcarCorreoVerificadoPorId).toHaveBeenCalledWith(7, expect.any(Date));
    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ accion: "usuario.correo_verificado", usuarioId: 1, entidadId: 7 }),
    );
  });

  test("marcar correo como verificado falla si ya está verificado", async () => {
    repo.buscarPorId.mockResolvedValue({ id: 7, email: "ana@ejemplo.pe", activo: true, email_verificado_en: new Date() });
    await expect(
      usuarios.marcarCorreoVerificadoAdmin(7, { actorId: 1 }),
    ).rejects.toMatchObject({ estado: 400 });
    expect(repo.marcarCorreoVerificadoPorId).not.toHaveBeenCalled();
  });
});
