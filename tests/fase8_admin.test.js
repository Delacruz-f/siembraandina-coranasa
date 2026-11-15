jest.mock("../src/modules/usuarios/roles.repository", () => ({
  buscarRolPorClave: jest.fn(),
  listarPermisos: jest.fn(),
  crearRolConPermisos: jest.fn(),
  reemplazarPermisos: jest.fn(),
}));
jest.mock("../src/modules/usuarios/usuarios.repository", () => ({
  buscarPorId: jest.fn(),
  rolesDeUsuario: jest.fn(),
  asignarRol: jest.fn(),
  cambiarRolPrincipal: jest.fn(),
  actualizar: jest.fn(),
}));
jest.mock("../src/modules/admin/gestion.repository", () => ({
  quitarRol: jest.fn(),
  guardarCatalogo: jest.fn(),
}));
jest.mock("../src/modules/admin/auditoria.repository", () => ({
  registrar: jest.fn().mockResolvedValue(undefined),
  exportar: jest.fn(),
}));

const roles = require("../src/modules/usuarios/roles.repository");
const usuarios = require("../src/modules/usuarios/usuarios.repository");
const gestion = require("../src/modules/admin/gestion.repository");
const auditoria = require("../src/modules/admin/auditoria.repository");
const servicio = require("../src/modules/admin/admin.service");

describe("Administración de roles", () => {
  beforeEach(() => {
    usuarios.buscarPorId.mockResolvedValue({ id: 8, rol_clave: "agricultor" });
    roles.buscarRolPorClave.mockResolvedValue({
      id: 5,
      clave: "administrador",
    });
  });

  test("impide retirar el rol del último administrador activo", async () => {
    gestion.quitarRol.mockRejectedValue(
      Object.assign(new Error("último administrador"), {
        code: "ULTIMO_ADMINISTRADOR",
      }),
    );

    await expect(
      servicio.quitarRol(8, "administrador", 8),
    ).rejects.toMatchObject({ estado: 400 });
    expect(auditoria.registrar).not.toHaveBeenCalled();
  });

  test("hace principal el rol elegido por administración", async () => {
    usuarios.buscarPorId.mockResolvedValue({
      id: 8,
      email_verificado_en: new Date(),
    });
    roles.buscarRolPorClave.mockResolvedValue({ id: 5, clave: "tecnico" });

    await servicio.asignarRol(8, "tecnico", 3);

    expect(usuarios.cambiarRolPrincipal).toHaveBeenCalledWith(8, 5, 3);
    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ accion: "rol.asignado", entidadId: 8 }),
    );
  });

  test("crea un rol personalizado con permisos de catálogo y registra auditoría", async () => {
    roles.buscarRolPorClave.mockResolvedValue(null);
    roles.listarPermisos.mockResolvedValue([
      { clave: "publicaciones.gestionar" },
      { clave: "catalogos.gestionar" },
    ]);
    roles.crearRolConPermisos.mockResolvedValue(71);

    await expect(
      servicio.crearRol(
        {
          clave: "revisor_comunidad",
          nombre: "Revisor de comunidad",
          descripcion: "Revisa contenido agrícola.",
          permisos: ["publicaciones.gestionar", "catalogos.gestionar"],
        },
        3,
      ),
    ).resolves.toBe(71);
    expect(roles.crearRolConPermisos).toHaveBeenCalledWith(
      expect.objectContaining({
        clave: "revisor_comunidad",
        clavesPermisos: ["publicaciones.gestionar", "catalogos.gestionar"],
      }),
    );
    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ accion: "rol.creado", entidadId: 71 }),
    );
  });

  test("rechaza permisos que no existen antes de cambiar la matriz", async () => {
    roles.buscarRolPorClave.mockResolvedValue({
      id: 6,
      clave: "revisor",
    });
    roles.listarPermisos.mockResolvedValue([
      { clave: "publicaciones.gestionar" },
    ]);

    await expect(
      servicio.guardarPermisos("revisor", ["permisos.inventados"], 3),
    ).rejects.toMatchObject({ estado: 400 });
    expect(roles.reemplazarPermisos).not.toHaveBeenCalled();
  });

  test("rechaza nombres de cultivo mayores que el límite de almacenamiento", async () => {
    await expect(
      servicio.guardarCatalogo(
        "cultivo",
        null,
        { nombre: "p".repeat(101), slug: "papa" },
        3,
      ),
    ).rejects.toMatchObject({ estado: 400 });
    expect(gestion.guardarCatalogo).not.toHaveBeenCalled();
  });
});

describe("Exportación de auditoría", () => {
  test("neutraliza fórmulas CSV provenientes de datos registrados", async () => {
    auditoria.exportar.mockResolvedValue([
      {
        fecha: "2026-11-12",
        usuario_nombre: ' \t=HYPERLINK("https://ejemplo.pe")',
        accion: "test",
        entidad: "usuarios",
        entidad_id: 1,
        detalle: null,
        ip: null,
      },
    ]);

    const csv = await servicio.exportarAuditoria();
    expect(csv).toContain("' \t=HYPERLINK");
  });
});
