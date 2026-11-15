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
  traducirErrorCorreo: jest.fn(() => "No se pudo enviar el correo. Inténtalo de nuevo en unos minutos."),
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
const auditoria = require("../src/modules/admin/auditoria.repository");
const usuarios = require("../src/modules/usuarios/usuarios.service");
const { requiereCorreoVerificado } = require("../src/middlewares/requiereCorreoVerificado");

const CLAVE = "clave-segura-123";

function usuarioBase(extra = {}) {
  return {
    id: 1,
    nombre: "Rosa",
    email: "rosa@ejemplo.pe",
    activo: true,
    email_verificado_en: null,
    rol_clave: "agricultor",
    password_hash: bcrypt.hashSync(CLAVE, 4),
    telefono: null,
    comunidad: null,
    foto_archivo_id: null,
    ...extra,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  repo.permisosDeUsuario.mockResolvedValue(["panel.ver"]);
  repo.rolesDeUsuario.mockResolvedValue(["agricultor"]);
});

describe("Registro diferido", () => {
  test("registro permite ingreso aunque falle el SMTP", async () => {
    repo.buscarPorEmail.mockResolvedValue(null);
    rolesRepo.buscarRolPorClave.mockResolvedValue({ id: 1 });
    repo.crear.mockResolvedValue(10);
    correo.enviar.mockRejectedValueOnce(new Error("smtp caído"));
    repo.buscarPorId.mockResolvedValue(usuarioBase({ id: 10, email: "nueva@ejemplo.pe" }));
    const res = await usuarios.registrar({
      nombre: "Nueva",
      email: "nueva@ejemplo.pe",
      password: CLAVE,
    });
    expect(res).toMatchObject({ id: 10, email: "nueva@ejemplo.pe", verificacionEnviada: false });
    const sesion = await usuarios.cargarSesion(10);
    expect(sesion).toMatchObject({ id: 10, correoVerificado: false });
  });
});

describe("Recuperación solo a cuentas verificadas", () => {
  test("no envía recuperación a cuenta sin verificar", async () => {
    repo.buscarPorEmail.mockResolvedValue(usuarioBase({ email_verificado_en: null }));
    await usuarios.solicitarRecuperacion("rosa@ejemplo.pe");
    expect(correo.enviar).not.toHaveBeenCalled();
  });

  test("envía recuperación a cuenta verificada", async () => {
    repo.buscarPorEmail.mockResolvedValue(usuarioBase({ email_verificado_en: new Date() }));
    await usuarios.solicitarRecuperacion("rosa@ejemplo.pe");
    expect(correo.enviar).toHaveBeenCalled();
  });
});

describe("Middleware requiereCorreoVerificado", () => {
  test("bloquea a usuario sin verificar con pantalla específica", () => {
    const req = { session: { usuario: { id: 1, correoVerificado: false } } };
    const next = jest.fn();
    requiereCorreoVerificado(req, {}, next);
    expect(next.mock.calls[0][0]).toMatchObject({ estado: 403, codigo: "correo_verificacion_requerida" });
  });

  test("permite a usuario verificado", () => {
    const req = { session: { usuario: { id: 1, correoVerificado: true } } };
    const next = jest.fn();
    requiereCorreoVerificado(req, {}, next);
    expect(next).toHaveBeenCalledWith();
  });
});

describe("Cambio de correo reinicia verificación", () => {
  test("cambiar correo pide contraseña, reinicia verificación e intenta enviar", async () => {
    const actual = usuarioBase({ email: "rosa@ejemplo.pe", email_verificado_en: new Date() });
    repo.buscarPorId.mockResolvedValue(actual);
    repo.buscarPorEmail
      .mockResolvedValueOnce(actual) // para validar contraseña actual
      .mockResolvedValueOnce(null) // correo nuevo no existe
      .mockResolvedValueOnce(null); // posible otro lookup
    repo.cambiarCorreo.mockResolvedValue(1);
    repo.actualizar.mockResolvedValue(1);
    repo.crearTokenVerificacion.mockResolvedValue(1);
    // tras cambio, cargarSesion lee usuario actualizado
    repo.buscarPorId.mockResolvedValueOnce(actual).mockResolvedValueOnce({ ...actual, email: "nueva@ejemplo.pe", email_verificado_en: null });

    const sesion = await usuarios.actualizarPerfil(1, {
      nombre: "Rosa",
      email: "nueva@ejemplo.pe",
      password_actual: CLAVE,
      telefono: "",
      comunidad: "",
    });
    expect(repo.cambiarCorreo).toHaveBeenCalledWith(1, "nueva@ejemplo.pe");
    expect(correo.enviar).toHaveBeenCalled();
  });

  test("cambiar correo sin contraseña actual falla", async () => {
    repo.buscarPorId.mockResolvedValue(usuarioBase({ email: "rosa@ejemplo.pe" }));
    await expect(
      usuarios.actualizarPerfil(1, { nombre: "Rosa", email: "nueva@ejemplo.pe" }),
    ).rejects.toMatchObject({ estado: 400 });
  });
});

describe("Límite de reenvíos de verificación", () => {
  test("rechaza envíos muy seguidos", async () => {
    // usar usuario distinto para no chocar con estado en memoria de otros tests
    repo.buscarPorId.mockResolvedValue(usuarioBase({ id: 77, email: "limite@ejemplo.pe", email_verificado_en: null }));
    repo.crearTokenVerificacion.mockResolvedValue(1);
    await usuarios.enviarVerificacionPerfil(77, { ip: "1.1.1.1" });
    await expect(
      usuarios.enviarVerificacionPerfil(77, { ip: "1.1.1.1" }),
    ).rejects.toMatchObject({ estado: 400 });
  });
});

describe("Job limpieza cuentas sin verificar", () => {
  test("desactiva cuentas candidatas y registra auditoría", async () => {
    repo.listarCuentasSinVerificarInactivas.mockResolvedValue([{ id: 5 }, { id: 6 }]);
    repo.desactivarCuenta.mockResolvedValue(1);
    const res = await usuarios.limpiarCuentasSinVerificar();
    expect(res.desactivadas).toBe(2);
    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ accion: "usuario.desactivado_sin_verificacion", entidadId: 5 }),
    );
  });
});
