jest.mock("../src/modules/usuarios/usuarios.repository", () => ({
  buscarPorEmail: jest.fn(),
  buscarPorId: jest.fn(),
  crear: jest.fn(),
  registrarAcceso: jest.fn(),
  registrarFalloIngreso: jest.fn(),
  permisosDeUsuario: jest.fn(),
  rolesDeUsuario: jest.fn(),
  crearTokenRecuperacion: jest.fn(),
  restablecerPassword: jest.fn(),
  crearTokenVerificacion: jest.fn(),
}));
jest.mock("../src/modules/usuarios/roles.repository", () => ({
  buscarRolPorClave: jest.fn(),
}));
jest.mock("../src/modules/admin/auditoria.repository", () => ({
  registrar: jest.fn(),
}));
jest.mock("../src/modules/auth/correo.service", () => ({
  enviar: jest.fn().mockResolvedValue({ messageId: "correo-de-prueba" }),
  validarConfiguracion: jest.fn(),
}));

const bcrypt = require("bcryptjs");
const repositorio = require("../src/modules/usuarios/usuarios.repository");
const rolesRepositorio = require("../src/modules/usuarios/roles.repository");
const correoServicio = require("../src/modules/auth/correo.service");
const servicio = require("../src/modules/usuarios/usuarios.service");

describe("Servicio de autenticación de usuarios", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("registra siempre agricultor y envía token de verificación hasheado", async () => {
    repositorio.buscarPorEmail.mockResolvedValue(null);
    repositorio.crear.mockResolvedValue(31);
    rolesRepositorio.buscarRolPorClave.mockResolvedValue({ id: 8 });

    const resultado = await servicio.registrar({
      nombre: "Productora Andina",
      email: "PRODUCTORA@PRUEBA.PE",
      password: "clave-segura-123",
    });

    expect(resultado).toEqual({ id: 31, email: "productora@prueba.pe", verificacionEnviada: true });
    expect(correoServicio.validarConfiguracion).toHaveBeenCalled();
    const [datos, perfil, rolId] = repositorio.crear.mock.calls[0];
    expect(datos.email_verificado_en).toBeNull();
    expect(bcrypt.getRounds(datos.password_hash)).toBe(12);
    expect(perfil.nombre).toBe("Productora Andina");
    expect(rolId).toBe(8);

    const [usuarioId, hash, expiracion] =
      repositorio.crearTokenVerificacion.mock.calls[0];
    expect(usuarioId).toBe(31);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(expiracion.getTime()).toBeGreaterThan(Date.now());
    const enlace = /https?:\/\/\S+/.exec(
      correoServicio.enviar.mock.calls[0][0].texto,
    )[0];
    expect(new URL(enlace).pathname).toMatch(/^\/verificar-correo\/[a-f0-9]{64}$/);
  });

  test("usa token de recuperación de un solo uso con vencimiento de una hora", async () => {
    repositorio.buscarPorEmail.mockResolvedValue({
      id: 22,
      email: "persona@prueba.pe",
      activo: true,
      email_verificado_en: new Date(),
    });
    const ahora = Date.now();

    await servicio.solicitarRecuperacion("persona@prueba.pe");

    const [, hash, expiracion] =
      repositorio.crearTokenRecuperacion.mock.calls[0];
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(expiracion.getTime()).toBeGreaterThanOrEqual(
      ahora + 60 * 60 * 1000 - 1000,
    );
    expect(expiracion.getTime()).toBeLessThanOrEqual(
      ahora + 60 * 60 * 1000 + 1000,
    );

    const token = "a".repeat(64);
    repositorio.restablecerPassword.mockResolvedValue(true);
    await servicio.restablecerPassword(token, "nueva-clave-segura");
    const [, passwordHash] = repositorio.restablecerPassword.mock.calls[0];
    expect(bcrypt.getRounds(passwordHash)).toBe(12);
  });

  test("registra errores de ingreso y aplica el bloqueo acordado", async () => {
    const passwordHash = await bcrypt.hash("clave-correcta", 4);
    repositorio.buscarPorEmail.mockResolvedValue({
      id: 4,
      email: "persona@prueba.pe",
      password_hash: passwordHash,
      activo: true,
      email_verificado_en: new Date(),
      bloqueado_hasta: null,
    });
    repositorio.registrarFalloIngreso.mockResolvedValue(false);

    await expect(
      servicio.autenticar({
        email: "persona@prueba.pe",
        password: "clave-incorrecta",
      }),
    ).rejects.toMatchObject({ estado: 401 });

    expect(repositorio.registrarFalloIngreso).toHaveBeenCalledWith(
      4,
      5,
      15 * 60 * 1000,
    );
  });

  test("sube hashes antiguos a costo 12 sin cambiar la contraseña del usuario", async () => {
    const password = "conservar-esta-clave";
    repositorio.buscarPorEmail.mockResolvedValue({
      id: 16,
      nombre: "Usuaria",
      email: "usuaria@prueba.pe",
      password_hash: await bcrypt.hash(password, 4),
      activo: true,
      email_verificado_en: new Date(),
      bloqueado_hasta: null,
    });
    repositorio.buscarPorId.mockResolvedValue({
      id: 16,
      nombre: "Usuaria",
      email: "usuaria@prueba.pe",
      activo: true,
      email_verificado_en: new Date(),
      rol_clave: "agricultor",
    });
    repositorio.permisosDeUsuario.mockResolvedValue(["parcelas.ver"]);
    repositorio.rolesDeUsuario.mockResolvedValue(["agricultor"]);

    const usuario = await servicio.autenticar({
      email: "usuaria@prueba.pe",
      password,
    });

    expect(usuario.roles).toEqual(["agricultor"]);
    expect(usuario.permisos).toEqual(["parcelas.ver"]);
    const hashActualizado = repositorio.registrarAcceso.mock.calls[0][1];
    expect(bcrypt.getRounds(hashActualizado)).toBe(12);
    expect(await bcrypt.compare(password, hashActualizado)).toBe(true);
  });
});
