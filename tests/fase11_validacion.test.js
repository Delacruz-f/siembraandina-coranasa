// Pruebas de ramas de validación de los servicios (Fase 11).
// Cada caso comprueba que una entrada inválida se rechaza con un 400 en
// español y que no se escribe nada en la base (repositorios simulados).
jest.mock("../src/modules/parcelas/parcelas.repository", () => ({
  buscarDeUsuario: jest.fn(),
  crear: jest.fn(),
  actualizar: jest.fn(),
  eliminar: jest.fn(),
  listarDeUsuario: jest.fn(),
  listarImagenesDeUsuario: jest.fn(),
  asociarImagenes: jest.fn(),
  buscarImagenDeUsuario: jest.fn(),
  quitarImagen: jest.fn(),
  crearAcceso: jest.fn(),
  buscarAcceso: jest.fn(),
  revocarAcceso: jest.fn(),
  accesoVigente: jest.fn(),
  buscarPorId: jest.fn(),
  listarAccesos: jest.fn(),
}));
jest.mock("../src/modules/cultivos/cultivos.repository", () => ({
  buscarCultivo: jest.fn(),
  listarCultivos: jest.fn(),
  listarZonas: jest.fn(),
  buscarRequerimiento: jest.fn(),
  buscarCalendario: jest.fn(),
  actualizarRequerimiento: jest.fn(),
  actualizarCalendario: jest.fn(),
  listarRequerimientos: jest.fn(),
  listarCalendario: jest.fn(),
}));
jest.mock("../src/modules/publico/publico.repository", () => ({
  buscarDistrito: jest.fn(),
  listarDepartamentos: jest.fn(),
  listarProvincias: jest.fn(),
  listarDistritos: jest.fn(),
}));
jest.mock("../src/modules/usuarios/usuarios.repository", () => ({
  buscarPorId: jest.fn(),
  rolesDeUsuario: jest.fn(),
}));
jest.mock("../src/modules/admin/auditoria.repository", () => ({
  registrar: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../src/modules/usuarios/archivos.service", () => ({
  guardarImagen: jest.fn(),
  eliminarPropio: jest.fn(),
}));

const parcelasRepo = require("../src/modules/parcelas/parcelas.repository");
const cultivosRepo = require("../src/modules/cultivos/cultivos.repository");
const publicoRepo = require("../src/modules/publico/publico.repository");
const usuariosRepo = require("../src/modules/usuarios/usuarios.repository");
const parcelas = require("../src/modules/parcelas/parcelas.service");
const cultivos = require("../src/modules/cultivos/cultivos.service");

const ZONAS = [
  { id: 1, clave: "valle", altitud_min_m: 0, altitud_max_m: 3000 },
  { id: 2, clave: "quechua", altitud_min_m: 3000, altitud_max_m: 3800 },
  { id: 3, clave: "puna", altitud_min_m: 3800, altitud_max_m: 5000 },
];

const DATOS_VALIDOS = {
  nombre: "Parcela de prueba",
  cultivo_id: "1",
  distrito_id: "1",
  zona_id: "2",
  latitud: "-13.5",
  longitud: "-72.1",
  altitud_m: "3500",
  area_hectareas: "0.5",
  notas: "Notas",
};

beforeEach(() => {
  jest.clearAllMocks();
  cultivosRepo.buscarCultivo.mockResolvedValue({ id: 1, nombre: "Papa" });
  cultivosRepo.listarZonas.mockResolvedValue(ZONAS);
  publicoRepo.buscarDistrito.mockResolvedValue({ id: 1, nombre: "Chinchero" });
  parcelasRepo.crear.mockResolvedValue(77);
});

describe("Validación de parcelas", () => {
  test("crea una parcela con datos válidos y audita", async () => {
    await expect(parcelas.crear(5, DATOS_VALIDOS)).resolves.toBe(77);
    expect(parcelasRepo.crear).toHaveBeenCalledWith(
      expect.objectContaining({ usuario_id: 5, zona_id: 2, latitud: -13.5 }),
    );
  });

  test("rechaza un cultivo inexistente", async () => {
    cultivosRepo.buscarCultivo.mockResolvedValue(null);
    await expect(parcelas.crear(5, DATOS_VALIDOS)).rejects.toMatchObject({
      estado: 400,
    });
    expect(parcelasRepo.crear).not.toHaveBeenCalled();
  });

  test("rechaza un distrito inexistente", async () => {
    publicoRepo.buscarDistrito.mockResolvedValue(null);
    await expect(parcelas.crear(5, DATOS_VALIDOS)).rejects.toMatchObject({
      estado: 400,
    });
  });

  test("rechaza una zona que no existe", async () => {
    await expect(
      parcelas.crear(5, { ...DATOS_VALIDOS, zona_id: "99", altitud_m: "" }),
    ).rejects.toMatchObject({ estado: 400 });
  });

  test("rechaza latitud y longitud fuera de rango", async () => {
    await expect(
      parcelas.crear(5, { ...DATOS_VALIDOS, latitud: "95" }),
    ).rejects.toMatchObject({ estado: 400 });
    await expect(
      parcelas.crear(5, { ...DATOS_VALIDOS, longitud: "-200" }),
    ).rejects.toMatchObject({ estado: 400 });
  });

  test("sugiere la zona por altitud aunque llegue otra zona", async () => {
    await parcelas.crear(5, {
      ...DATOS_VALIDOS,
      zona_id: "1",
      altitud_m: "4000",
    });
    expect(parcelasRepo.crear).toHaveBeenCalledWith(
      expect.objectContaining({ zona_id: 3 }),
    );
  });

  test("obtenerDelUsuario lanza 404 si la parcela es de otra persona", async () => {
    parcelasRepo.buscarDeUsuario.mockResolvedValue(null);
    await expect(parcelas.obtenerDelUsuario(9, 5)).rejects.toMatchObject({
      estado: 404,
    });
  });

  test("actualizar y eliminar exigen ser dueño", async () => {
    parcelasRepo.buscarDeUsuario.mockResolvedValue(null);
    await expect(
      parcelas.actualizar(9, 5, DATOS_VALIDOS),
    ).rejects.toMatchObject({
      estado: 404,
    });
    await expect(parcelas.eliminar(9, 5)).rejects.toMatchObject({
      estado: 404,
    });
  });

  test("conceder acceso exige un técnico con ese rol", async () => {
    parcelasRepo.buscarDeUsuario.mockResolvedValue({ id: 9 });
    usuariosRepo.buscarPorId.mockResolvedValue({ id: 3, nombre: "Técnico" });
    usuariosRepo.rolesDeUsuario.mockResolvedValue(["agricultor"]);
    await expect(
      parcelas.concederAcceso(9, 5, { tecnico_id: 3 }),
    ).rejects.toMatchObject({ estado: 400 });
  });

  test("conceder acceso rechaza un técnico inexistente", async () => {
    parcelasRepo.buscarDeUsuario.mockResolvedValue({ id: 9 });
    usuariosRepo.buscarPorId.mockResolvedValue(null);
    await expect(
      parcelas.concederAcceso(9, 5, { tecnico_id: 3 }),
    ).rejects.toMatchObject({ estado: 400 });
  });

  test("conceder acceso rechaza un acceso ya vigente", async () => {
    parcelasRepo.buscarDeUsuario.mockResolvedValue({ id: 9 });
    usuariosRepo.buscarPorId.mockResolvedValue({ id: 3 });
    usuariosRepo.rolesDeUsuario.mockResolvedValue(["tecnico"]);
    parcelasRepo.accesoVigente.mockResolvedValue({ id: 1 });
    await expect(
      parcelas.concederAcceso(9, 5, { tecnico_id: 3 }),
    ).rejects.toMatchObject({ estado: 400 });
  });

  test("conceder acceso crea el registro cuando todo es válido", async () => {
    parcelasRepo.buscarDeUsuario.mockResolvedValue({ id: 9 });
    usuariosRepo.buscarPorId.mockResolvedValue({ id: 3 });
    usuariosRepo.rolesDeUsuario.mockResolvedValue(["tecnico"]);
    parcelasRepo.accesoVigente.mockResolvedValue(null);
    parcelasRepo.crearAcceso.mockResolvedValue(12);
    await parcelas.concederAcceso(9, 5, {
      tecnico_id: 3,
      puede_escribir: true,
    });
    expect(parcelasRepo.crearAcceso).toHaveBeenCalledWith(
      expect.objectContaining({
        parcela_id: 9,
        tecnico_id: 3,
        puede_escribir: true,
      }),
    );
  });

  test("revocar un acceso inexistente o ya revocado falla", async () => {
    parcelasRepo.buscarAcceso.mockResolvedValue(null);
    await expect(parcelas.revocarAcceso(1, 5)).rejects.toMatchObject({
      estado: 404,
    });
    parcelasRepo.buscarAcceso.mockResolvedValue({
      id: 1,
      parcela_id: 9,
      revocado_en: new Date(),
    });
    parcelasRepo.buscarDeUsuario.mockResolvedValue({ id: 9 });
    await expect(parcelas.revocarAcceso(1, 5)).rejects.toMatchObject({
      estado: 400,
    });
  });

  test("obtenerParaTecnico exige acceso vigente", async () => {
    parcelasRepo.buscarPorId.mockResolvedValue({ id: 9 });
    parcelasRepo.accesoVigente.mockResolvedValue(null);
    await expect(parcelas.obtenerParaTecnico(9, 3)).rejects.toMatchObject({
      estado: 404,
    });
  });

  test("guardarImagenes exige un texto alternativo por imagen", async () => {
    parcelasRepo.buscarDeUsuario.mockResolvedValue({ id: 9 });
    await expect(
      parcelas.guardarImagenes(9, 5, [{ buffer: Buffer.from("x") }], []),
    ).rejects.toMatchObject({ estado: 400 });
    await expect(parcelas.guardarImagenes(9, 5, [], [])).rejects.toMatchObject({
      estado: 400,
    });
  });
});

describe("Validación de requerimientos y calendario", () => {
  test("actualiza un requerimiento válido y lo marca como validado", async () => {
    cultivosRepo.buscarRequerimiento.mockResolvedValue({
      id: 4,
      fuente: "antigua",
    });
    await cultivos.actualizarRequerimiento(4, 3, {
      humedad_min: "20",
      humedad_max: "30",
      temperatura_min: "8",
      temperatura_max: "15",
    });
    expect(cultivosRepo.actualizarRequerimiento).toHaveBeenCalledWith(
      4,
      expect.objectContaining({ hum_min: 20, hum_max: 30, validado: true }),
    );
  });

  test("rechaza un requerimiento inexistente", async () => {
    cultivosRepo.buscarRequerimiento.mockResolvedValue(null);
    await expect(
      cultivos.actualizarRequerimiento(4, 3, {}),
    ).rejects.toMatchObject({ estado: 404 });
  });

  test("rechaza valores no numéricos o fuera de rango", async () => {
    cultivosRepo.buscarRequerimiento.mockResolvedValue({ id: 4 });
    await expect(
      cultivos.actualizarRequerimiento(4, 3, {
        humedad_min: "abc",
        humedad_max: "30",
        temperatura_min: "8",
        temperatura_max: "15",
      }),
    ).rejects.toMatchObject({ estado: 400 });
    await expect(
      cultivos.actualizarRequerimiento(4, 3, {
        humedad_min: "20",
        humedad_max: "30",
        temperatura_min: "8",
        temperatura_max: "80",
      }),
    ).rejects.toMatchObject({ estado: 400 });
  });

  test("rechaza temperatura mínima mayor que la máxima", async () => {
    cultivosRepo.buscarRequerimiento.mockResolvedValue({ id: 4 });
    await expect(
      cultivos.actualizarRequerimiento(4, 3, {
        humedad_min: "20",
        humedad_max: "30",
        temperatura_min: "20",
        temperatura_max: "10",
      }),
    ).rejects.toMatchObject({ estado: 400 });
  });

  test("actualiza el calendario y rechaza meses inválidos", async () => {
    cultivosRepo.buscarCalendario.mockResolvedValue({ id: 7, fuente: "x" });
    await cultivos.actualizarCalendario(7, 3, {
      mes_inicio: "9",
      mes_fin: "12",
    });
    expect(cultivosRepo.actualizarCalendario).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ mes_inicio: 9, mes_fin: 12, validado: true }),
    );
    await expect(
      cultivos.actualizarCalendario(7, 3, { mes_inicio: "0", mes_fin: "12" }),
    ).rejects.toMatchObject({ estado: 400 });
  });

  test("rechaza un calendario inexistente", async () => {
    cultivosRepo.buscarCalendario.mockResolvedValue(null);
    await expect(
      cultivos.actualizarCalendario(7, 3, { mes_inicio: "1", mes_fin: "2" }),
    ).rejects.toMatchObject({ estado: 404 });
  });
});
