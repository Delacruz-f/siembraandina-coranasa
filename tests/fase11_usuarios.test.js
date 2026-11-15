// Pruebas de ramas del servicio de usuarios (Fase 11).
// Cubren registro, autenticación (bloqueo, cuenta inactiva, correo sin verificar),
// recuperación de contraseña y verificación de correo.
jest.mock("../src/modules/usuarios/usuarios.repository", () => ({
  buscarPorEmail: jest.fn(),
  buscarPorId: jest.fn(),
  crear: jest.fn(),
  actualizar: jest.fn(),
  actualizarFoto: jest.fn(),
  obtenerPreferencias: jest.fn(),
  actualizarPreferencias: jest.fn(),
  registrarAcceso: jest.fn(),
  registrarFalloIngreso: jest.fn(),
  crearTokenRecuperacion: jest.fn(),
  tokenRecuperacionValido: jest.fn(),
  restablecerPassword: jest.fn(),
  crearTokenVerificacion: jest.fn(),
  tokenVerificacionValido: jest.fn(),
  marcarCorreoVerificado: jest.fn(),
  marcarCorreoVerificadoPorId: jest.fn(),
  invalidarTokensVerificacion: jest.fn(),
  cambiarCorreo: jest.fn(),
  listarCuentasSinVerificarInactivas: jest.fn(),
  desactivarCuenta: jest.fn(),
  limpiarTokensVencidos: jest.fn(),
  permisosDeUsuario: jest.fn(),
  rolesDeUsuario: jest.fn(),
}));
jest.mock("../src/modules/usuarios/roles.repository", () => ({
  buscarRolPorClave: jest.fn(),
}));
jest.mock("../src/modules/auth/correo.service", () => ({
  enviar: jest.fn().mockResolvedValue({ messageId: "x" }),
  validarConfiguracion: jest.fn(),
}));
jest.mock("../src/modules/admin/auditoria.repository", () => ({
  registrar: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../src/modules/usuarios/archivos.service", () => ({
  guardarImagen: jest.fn(),
  eliminarPropio: jest.fn(),
}));

const bcrypt = require("bcryptjs");
const repo = require("../src/modules/usuarios/usuarios.repository");
const rolesRepo = require("../src/modules/usuarios/roles.repository");
const correo = require("../src/modules/auth/correo.service");
const usuarios = require("../src/modules/usuarios/usuarios.service");

const CLAVE = "clave-segura-123";

function usuarioBase(extra = {}) {
  return {
    id: 1,
    nombre: "Rosa",
    email: "rosa@ejemplo.pe",
    activo: true,
    email_verificado_en: new Date(),
    rol_clave: "agricultor",
    password_hash: bcrypt.hashSync(CLAVE, 4),
    ...extra,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  repo.permisosDeUsuario.mockResolvedValue(["panel.ver"]);
  repo.rolesDeUsuario.mockResolvedValue(["agricultor"]);
  repo.buscarPorId.mockResolvedValue(usuarioBase());
});

describe("Registro", () => {
  test("rechaza un correo ya registrado", async () => {
    repo.buscarPorEmail.mockResolvedValue({ id: 1 });
    await expect(
      usuarios.registrar({
        nombre: "Rosa",
        email: "rosa@ejemplo.pe",
        password: CLAVE,
      }),
    ).rejects.toMatchObject({ estado: 409 });
  });

  test("falla claro si falta el rol de agricultor", async () => {
    repo.buscarPorEmail.mockResolvedValue(null);
    rolesRepo.buscarRolPorClave.mockResolvedValue(null);
    await expect(
      usuarios.registrar({
        nombre: "Rosa",
        email: "nueva@ejemplo.pe",
        password: CLAVE,
      }),
    ).rejects.toMatchObject({ estado: 500 });
  });

  test("normaliza el correo y envía la verificación", async () => {
    repo.buscarPorEmail.mockResolvedValue(null);
    rolesRepo.buscarRolPorClave.mockResolvedValue({ id: 1 });
    repo.crear.mockResolvedValue(10);
    await expect(
      usuarios.registrar({
        nombre: "  Rosa  ",
        email: "ROSA@Ejemplo.PE",
        password: CLAVE,
      }),
    ).resolves.toEqual({ id: 10, email: "rosa@ejemplo.pe", verificacionEnviada: true });
    expect(repo.crear).toHaveBeenCalledWith(
      expect.objectContaining({ email: "rosa@ejemplo.pe" }),
      expect.objectContaining({ nombre: "Rosa" }),
      1,
    );
    expect(correo.enviar).toHaveBeenCalled();
  });

  test("si falla el envío mantiene la cuenta y reporta verificación no enviada", async () => {
    repo.buscarPorEmail.mockResolvedValue(null);
    rolesRepo.buscarRolPorClave.mockResolvedValue({ id: 1 });
    repo.crear.mockResolvedValue(11);
    correo.enviar.mockRejectedValueOnce(new Error("smtp caído"));
    await expect(
      usuarios.registrar({
        nombre: "Rosa",
        email: "rosa2@ejemplo.pe",
        password: CLAVE,
      }),
    ).resolves.toEqual({ id: 11, email: "rosa2@ejemplo.pe", verificacionEnviada: false });
    const auditoria = require("../src/modules/admin/auditoria.repository");
    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ accion: "correo.fallo_envio", entidadId: 11 }),
    );
  });
});

describe("Inicio de sesión", () => {
  test("correo inexistente devuelve 401 sin revelar nada", async () => {
    repo.buscarPorEmail.mockResolvedValue(null);
    await expect(
      usuarios.autenticar({ email: "nadie@ejemplo.pe", password: CLAVE }),
    ).rejects.toMatchObject({ estado: 401 });
  });

  test("contraseña incorrecta registra el fallo", async () => {
    repo.buscarPorEmail.mockResolvedValue(usuarioBase());
    await expect(
      usuarios.autenticar({ email: "rosa@ejemplo.pe", password: "mala" }),
    ).rejects.toMatchObject({ estado: 401 });
    expect(repo.registrarFalloIngreso).toHaveBeenCalled();
  });

  test("una cuenta bloqueada no incrementa fallos", async () => {
    repo.buscarPorEmail.mockResolvedValue(
      usuarioBase({ bloqueado_hasta: new Date(Date.now() + 600000) }),
    );
    await expect(
      usuarios.autenticar({ email: "rosa@ejemplo.pe", password: CLAVE }),
    ).rejects.toMatchObject({ estado: 401 });
    expect(repo.registrarFalloIngreso).not.toHaveBeenCalled();
  });

  test("una cuenta desactivada no puede entrar", async () => {
    repo.buscarPorEmail.mockResolvedValue(usuarioBase({ activo: false }));
    await expect(
      usuarios.autenticar({ email: "rosa@ejemplo.pe", password: CLAVE }),
    ).rejects.toMatchObject({ estado: 403, codigo: "cuenta_inactiva" });
  });

  test("una cuenta sin correo verificado puede entrar al panel", async () => {
    repo.buscarPorEmail.mockResolvedValue(
      usuarioBase({ email_verificado_en: null }),
    );
    repo.buscarPorId.mockResolvedValue(
      usuarioBase({ email_verificado_en: null }),
    );
    const sesion = await usuarios.autenticar({ email: "rosa@ejemplo.pe", password: CLAVE });
    expect(sesion).toMatchObject({ id: 1, correoVerificado: false });
  });

  test("un hash antiguo se re-calcula al iniciar sesión", async () => {
    repo.buscarPorEmail.mockResolvedValue(usuarioBase());
    await usuarios.autenticar({ email: "rosa@ejemplo.pe", password: CLAVE });
    expect(repo.registrarAcceso).toHaveBeenCalledWith(
      1,
      expect.any(String),
    );
  });

  test("una cuenta inactiva no carga sesión", async () => {
    repo.buscarPorId.mockResolvedValue(usuarioBase({ activo: false }));
    await expect(usuarios.cargarSesion(1)).resolves.toBeNull();
  });

  test("una cuenta sin verificar activa sí carga sesión", async () => {
    repo.buscarPorId.mockResolvedValue(usuarioBase({ email_verificado_en: null }));
    await expect(usuarios.cargarSesion(1)).resolves.toMatchObject({
      id: 1,
      correoVerificado: false,
    });
  });

  test("propaga errores al cargar permisos en vez de crear una sesión sin permisos", async () => {
    repo.permisosDeUsuario.mockRejectedValue(new Error("falló la consulta"));

    await expect(usuarios.cargarSesion(1)).rejects.toThrow("falló la consulta");
  });
});

describe("Recuperación y verificación", () => {
  test("no revela si el correo existe", async () => {
    repo.buscarPorEmail.mockResolvedValue(null);
    await expect(
      usuarios.solicitarRecuperacion("nadie@ejemplo.pe"),
    ).resolves.toBeUndefined();
    expect(correo.enviar).not.toHaveBeenCalled();
  });

  test("envía el enlace de recuperación a una cuenta activa", async () => {
    repo.buscarPorEmail.mockResolvedValue(usuarioBase());
    await usuarios.solicitarRecuperacion("rosa@ejemplo.pe");
    expect(correo.enviar).toHaveBeenCalledWith(
      expect.objectContaining({ para: "rosa@ejemplo.pe" }),
    );
  });

  test("un token mal formado no es válido", async () => {
    await expect(usuarios.tokenRecuperacionValido("corto")).resolves.toBe(false);
    await expect(usuarios.tokenVerificacionValido("")).resolves.toBe(false);
  });

  test("restablecer con token inválido devuelve 410", async () => {
    await expect(
      usuarios.restablecerPassword("no-es-token", CLAVE),
    ).rejects.toMatchObject({ estado: 410 });
  });

  test("restablecer un token vencido devuelve 410", async () => {
    repo.restablecerPassword.mockResolvedValue(false);
    await expect(
      usuarios.restablecerPassword("a".repeat(64), CLAVE),
    ).rejects.toMatchObject({ estado: 410 });
  });

  test("restablece la contraseña con un token válido", async () => {
    repo.restablecerPassword.mockResolvedValue(true);
    await expect(
      usuarios.restablecerPassword("a".repeat(64), CLAVE),
    ).resolves.toBeUndefined();
  });

  test("verificar un correo con token vencido devuelve 410", async () => {
    repo.marcarCorreoVerificado.mockResolvedValue(false);
    await expect(
      usuarios.verificarCorreo("b".repeat(64)),
    ).rejects.toMatchObject({ estado: 410 });
  });

  test("reenvía la verificación solo a cuentas sin verificar", async () => {
    repo.buscarPorEmail.mockResolvedValue(usuarioBase());
    await usuarios.reenviarVerificacion("rosa@ejemplo.pe");
    expect(correo.enviar).not.toHaveBeenCalled();

    repo.buscarPorEmail.mockResolvedValue(usuarioBase({ email_verificado_en: null }));
    await usuarios.reenviarVerificacion("rosa@ejemplo.pe");
    expect(correo.enviar).toHaveBeenCalledTimes(1);
  });
});

describe("Perfil y preferencias", () => {
  test("actualizar perfil exige nombre", async () => {
    await expect(usuarios.actualizarPerfil(1, { nombre: "   " })).rejects.toMatchObject({
      estado: 400,
    });
  });

  test("cambiar contraseña exige que la actual coincida", async () => {
    repo.buscarPorId.mockResolvedValue(usuarioBase());
    repo.buscarPorEmail.mockResolvedValue(usuarioBase());
    await expect(
      usuarios.cambiarPassword(1, { actual: "mala", nueva: CLAVE }),
    ).rejects.toMatchObject({ estado: 400 });
  });

  test("cambiar contraseña con la actual correcta la actualiza", async () => {
    repo.buscarPorId.mockResolvedValue(usuarioBase());
    repo.buscarPorEmail.mockResolvedValue(usuarioBase());
    repo.actualizar.mockResolvedValue(1);
    await expect(
      usuarios.cambiarPassword(1, { actual: CLAVE, nueva: "otra-clave-larga" }),
    ).resolves.toBeUndefined();
    expect(repo.actualizar).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ password_hash: expect.any(String) }),
    );
  });

  test("actualizar preferencias convierte los valores del formulario", async () => {
    repo.actualizarPreferencias.mockResolvedValue(1);
    repo.obtenerPreferencias.mockResolvedValue({ avisos_panel: true });
    await usuarios.actualizarPreferencias(1, {
      correo_alertas: "on",
      avisos_panel: "0",
      resumen_semanal: "true",
    });
    expect(repo.actualizarPreferencias).toHaveBeenCalledWith(1, {
      correo_alertas: true,
      avisos_panel: false,
      resumen_semanal: true,
    });
  });

  test("sin preferencias guardadas se informa un error claro", async () => {
    repo.obtenerPreferencias.mockResolvedValue(null);
    await expect(usuarios.obtenerPreferencias(1)).rejects.toThrow(
      /preferencias/,
    );
  });

  test("publico oculta el hash de la contraseña", () => {
    expect(usuarios.publico(usuarioBase())).not.toHaveProperty("password_hash");
    expect(usuarios.publico(null)).toBeNull();
  });
});
