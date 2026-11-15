// Pruebas de ramas del servicio de comunidad (Fase 11).
// Verifican las guardas: edición fuera de plazo, respuestas anidadas,
// reportes duplicados, permisos de moderación, etc.
jest.mock("../src/modules/comunidad/interacciones.repository", () => ({
  obtenerCultivoPorSlug: jest.fn(),
  resumenInteracciones: jest.fn(),
  buscarTipoReaccion: jest.fn(),
  cambiarReaccion: jest.fn(),
  alternarFavorito: jest.fn(),
  crearComentario: jest.fn(),
  buscarComentario: jest.fn(),
  obtenerPublicacionPorId: jest.fn(),
  actualizarComentarioPropio: jest.fn(),
  eliminarComentario: jest.fn(),
  buscarReporte: jest.fn(),
  crearReporte: jest.fn(),
  buscarEstadoReporte: jest.fn(),
  listarReportesPendientes: jest.fn(),
  resolverReporte: jest.fn(),
  contarReportesPendientes: jest.fn(),
}));
jest.mock("../src/modules/publico/publico.repository", () => ({
  buscarPublicacion: jest.fn(),
}));
jest.mock("../src/modules/admin/auditoria.repository", () => ({
  registrar: jest.fn().mockResolvedValue(undefined),
}));

const repo = require("../src/modules/comunidad/interacciones.repository");
const publico = require("../src/modules/publico/publico.repository");
const servicio = require("../src/modules/comunidad/interacciones.service");

const ARTICULO = { id: 30, slug: "articulo-demo" };
const CULTIVO = { id: 2, slug: "papa" };

beforeEach(() => {
  jest.clearAllMocks();
  publico.buscarPublicacion.mockResolvedValue(ARTICULO);
  repo.obtenerCultivoPorSlug.mockResolvedValue(CULTIVO);
  repo.buscarTipoReaccion.mockResolvedValue({ id: 1, clave: "util" });
  repo.buscarEstadoReporte.mockResolvedValue({ id: 1, clave: "pendiente" });
});

describe("Reacciones y favoritos", () => {
  test("rechaza una reacción con tipo desconocido", async () => {
    repo.buscarTipoReaccion.mockResolvedValue(null);
    await expect(
      servicio.reaccionArticulo("articulo-demo", 5, "inventada"),
    ).rejects.toMatchObject({ estado: 400 });
  });

  test("un artículo no publicado devuelve 404", async () => {
    publico.buscarPublicacion.mockResolvedValue(null);
    await expect(
      servicio.reaccionArticulo("nope", 5, "util"),
    ).rejects.toMatchObject({
      estado: 404,
    });
  });

  test("reacciona a un cultivo y alterna su favorito", async () => {
    repo.alternarFavorito.mockResolvedValue(true);
    await servicio.reaccionCultivo("papa", 5, "util");
    expect(repo.cambiarReaccion).toHaveBeenCalledWith(
      "reacciones_cultivos",
      "cultivo_id",
      2,
      5,
      1,
    );
    await expect(servicio.favoritoCultivo("papa", 5)).resolves.toBe(true);
  });

  test("un cultivo inexistente devuelve 404", async () => {
    repo.obtenerCultivoPorSlug.mockResolvedValue(null);
    await expect(servicio.favoritoCultivo("nope", 5)).rejects.toMatchObject({
      estado: 404,
    });
  });
});

describe("Comentarios", () => {
  test("crea un comentario principal", async () => {
    repo.crearComentario.mockResolvedValue(100);
    await expect(
      servicio.crearComentario("articulo-demo", 5, "Hola", null),
    ).resolves.toBe(100);
    expect(repo.crearComentario).toHaveBeenCalledWith(
      expect.objectContaining({
        publicacion_id: 30,
        comentario_padre_id: null,
      }),
    );
  });

  test("responde solo a un comentario principal activo del mismo artículo", async () => {
    repo.buscarComentario.mockResolvedValue({
      id: 8,
      publicacion_id: 30,
      comentario_padre_id: null,
      deleted_at: null,
    });
    repo.crearComentario.mockResolvedValue(101);
    await expect(
      servicio.crearComentario("articulo-demo", 5, "Respuesta", 8),
    ).resolves.toBe(101);

    repo.buscarComentario.mockResolvedValue({
      id: 9,
      publicacion_id: 30,
      comentario_padre_id: 8,
      deleted_at: null,
    });
    await expect(
      servicio.crearComentario("articulo-demo", 5, "Nieto", 9),
    ).rejects.toMatchObject({ estado: 400 });
  });

  test("no se puede responder a un comentario de otro artículo", async () => {
    repo.buscarComentario.mockResolvedValue({
      id: 8,
      publicacion_id: 99,
      comentario_padre_id: null,
      deleted_at: null,
    });
    await expect(
      servicio.crearComentario("articulo-demo", 5, "Hola", 8),
    ).rejects.toMatchObject({ estado: 400 });
  });

  test("editar fuera de los 15 minutos se rechaza", async () => {
    repo.buscarComentario.mockResolvedValue({
      id: 8,
      usuario_id: 5,
      publicacion_id: 30,
      deleted_at: null,
      created_at: new Date(Date.now() - 60 * 60 * 1000),
    });
    await expect(
      servicio.editarComentario(8, 5, "Nuevo"),
    ).rejects.toMatchObject({ estado: 400 });
  });

  test("editar un comentario ajeno devuelve 404", async () => {
    repo.buscarComentario.mockResolvedValue({
      id: 8,
      usuario_id: 9,
      publicacion_id: 30,
      deleted_at: null,
      created_at: new Date(),
    });
    await expect(
      servicio.editarComentario(8, 5, "Nuevo"),
    ).rejects.toMatchObject({
      estado: 404,
    });
  });

  test("editar dentro del plazo devuelve el slug del artículo", async () => {
    repo.buscarComentario.mockResolvedValue({
      id: 8,
      usuario_id: 5,
      publicacion_id: 30,
      deleted_at: null,
      created_at: new Date(),
    });
    repo.obtenerPublicacionPorId.mockResolvedValue(ARTICULO);
    repo.actualizarComentarioPropio.mockResolvedValue(1);
    await expect(servicio.editarComentario(8, 5, "Nuevo")).resolves.toBe(
      "articulo-demo",
    );
  });

  test("si el plazo vence entre la lectura y la escritura se avisa", async () => {
    repo.buscarComentario.mockResolvedValue({
      id: 8,
      usuario_id: 5,
      publicacion_id: 30,
      deleted_at: null,
      created_at: new Date(),
    });
    repo.obtenerPublicacionPorId.mockResolvedValue(ARTICULO);
    repo.actualizarComentarioPropio.mockResolvedValue(0);
    await expect(
      servicio.editarComentario(8, 5, "Nuevo"),
    ).rejects.toMatchObject({ estado: 400 });
  });

  test("borrar un comentario propio lo marca como eliminado", async () => {
    repo.buscarComentario.mockResolvedValue({
      id: 8,
      usuario_id: 5,
      publicacion_id: 30,
      deleted_at: null,
    });
    repo.obtenerPublicacionPorId.mockResolvedValue(ARTICULO);
    repo.eliminarComentario.mockResolvedValue(1);
    await expect(servicio.borrarComentario(8, 5)).resolves.toBe(
      "articulo-demo",
    );
  });
});

describe("Reportes y moderación", () => {
  test("no se puede reportar el propio comentario", async () => {
    repo.buscarComentario.mockResolvedValue({
      id: 8,
      usuario_id: 5,
      publicacion_id: 30,
      deleted_at: null,
    });
    await expect(
      servicio.reportarComentario(8, 5, "spam"),
    ).rejects.toMatchObject({ estado: 400 });
  });

  test("no se puede reportar dos veces el mismo comentario", async () => {
    repo.buscarComentario.mockResolvedValue({
      id: 8,
      usuario_id: 9,
      publicacion_id: 30,
      deleted_at: null,
    });
    repo.buscarReporte.mockResolvedValue({ id: 1 });
    await expect(
      servicio.reportarComentario(8, 5, "spam"),
    ).rejects.toMatchObject({ estado: 400 });
  });

  test("reportar un comentario eliminado devuelve 404", async () => {
    repo.buscarComentario.mockResolvedValue(null);
    await expect(
      servicio.reportarComentario(8, 5, "spam"),
    ).rejects.toMatchObject({ estado: 404 });
  });

  test("reportar correctamente crea el reporte pendiente", async () => {
    repo.buscarComentario.mockResolvedValue({
      id: 8,
      usuario_id: 9,
      publicacion_id: 30,
      deleted_at: null,
    });
    repo.buscarReporte.mockResolvedValue(null);
    repo.obtenerPublicacionPorId.mockResolvedValue(ARTICULO);
    repo.crearReporte.mockResolvedValue(1);
    await expect(
      servicio.reportarComentario(8, 5, "spam", "parece publicidad"),
    ).resolves.toBe("articulo-demo");
    expect(repo.crearReporte).toHaveBeenCalledWith(
      expect.objectContaining({ comentario_id: 8, motivo: "spam" }),
    );
  });

  test("moderar un reporte que ya no está pendiente devuelve 404", async () => {
    repo.resolverReporte.mockResolvedValue(false);
    await expect(
      servicio.moderarReporte(1, 3, "ocultar"),
    ).rejects.toMatchObject({ estado: 404 });
  });

  test("ocultar un reporte lo marca como resuelto", async () => {
    repo.resolverReporte.mockResolvedValue({ ocultado: true });
    await servicio.moderarReporte(1, 3, "ocultar");
    expect(repo.resolverReporte).toHaveBeenCalledWith(1, "revisado", 3, true);
  });

  test("descartar un reporte no oculta el comentario", async () => {
    repo.resolverReporte.mockResolvedValue({ ocultado: false });
    await servicio.moderarReporte(2, 3, "descartar");
    expect(repo.resolverReporte).toHaveBeenCalledWith(
      2,
      "descartado",
      3,
      false,
    );
  });
});
