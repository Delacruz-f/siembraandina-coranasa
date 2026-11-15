const nodemailer = require("nodemailer");

jest.mock("nodemailer", () => ({
  createTransport: jest.fn(),
}));

const mockLogger = {
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
};
jest.mock("../src/config/logger", () => mockLogger);

function cargar(envCorreo) {
  jest.resetModules();
  jest.doMock("nodemailer", () => nodemailer);
  jest.doMock("../src/config/logger", () => mockLogger);
  jest.doMock("../src/config/env", () => ({
    entorno: envCorreo.entorno || "development",
    esProduccion: envCorreo.entorno === "production",
    correo: envCorreo,
  }));
  // eslint-disable-next-line global-require
  return require("../src/modules/auth/correo.service");
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("correo.service", () => {
  test("éxito SMTP envía el mensaje", async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: "ok" });
    nodemailer.createTransport.mockReturnValue({ sendMail, verify: jest.fn() });
    const servicio = cargar({
      modo: "smtp",
      smtp: { host: "smtp.test", puerto: 587, seguro: false, usuario: "u", password: "p", remitente: "noreply@test" },
    });
    await expect(
      servicio.enviar({ para: "a@b.c", asunto: "Hola", texto: "t", html: "<p>t</p>", tipo: "verificacion" }),
    ).resolves.toMatchObject({ messageId: "ok" });
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 10000 }),
    );
    expect(sendMail).toHaveBeenCalled();
  });

  test("EAUTH se traduce a credenciales inválidas y se registra la causa", async () => {
    const error = Object.assign(new Error("Invalid login"), { code: "EAUTH", responseCode: 535 });
    const sendMail = jest.fn().mockRejectedValue(error);
    nodemailer.createTransport.mockReturnValue({ sendMail });
    const servicio = cargar({
      modo: "smtp",
      smtp: { host: "smtp.test", puerto: 587, seguro: false, usuario: "u", password: "p", remitente: "noreply@test" },
    });
    await expect(
      servicio.enviar({ para: "a@b.c", asunto: "Hola", texto: "t", tipo: "verificacion" }),
    ).rejects.toMatchObject({
      estado: 503,
      message: expect.stringMatching(/credenciales SMTP no son válidas/i),
    });
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ evento: "correo.fallo_envio", code: "EAUTH", responseCode: 535, mensaje: "Invalid login" }),
      expect.any(String),
    );
  });

  test("tiempo agotado se traduce a error de conexión", async () => {
    const error = Object.assign(new Error("Connection timeout"), { code: "ETIMEDOUT" });
    const sendMail = jest.fn().mockRejectedValue(error);
    nodemailer.createTransport.mockReturnValue({ sendMail });
    const servicio = cargar({
      modo: "smtp",
      smtp: { host: "smtp.test", puerto: 587, seguro: false, remitente: "noreply@test" },
    });
    await expect(
      servicio.enviar({ para: "a@b.c", asunto: "Hola", texto: "t" }),
    ).rejects.toMatchObject({
      estado: 503,
      message: expect.stringMatching(/no se pudo conectar|tardó demasiado/i),
    });
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ code: "ETIMEDOUT" }),
      expect.any(String),
    );
  });

  test("MAIL_MODE=consola en desarrollo imprime el enlace y no envía", async () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    nodemailer.createTransport.mockClear();
    const servicio = cargar({
      modo: "consola",
      entorno: "development",
      smtp: { remitente: "noreply@test" },
    });
    await expect(
      servicio.enviar({ para: "a@b.c", asunto: "Verifica", texto: "Enlace: http://x/verificar-correo/abc123", tipo: "verificacion" }),
    ).resolves.toMatchObject({ messageId: "consola" });
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
    const salida = log.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(salida).toMatch(/MAIL_MODE=consola/);
    expect(salida).toMatch(/abc123/);
    log.mockRestore();
  });
});
