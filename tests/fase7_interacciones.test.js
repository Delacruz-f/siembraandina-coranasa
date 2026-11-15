jest.mock("../src/modules/comunidad/interacciones.repository", () => ({
  buscarComentario: jest.fn(),
  buscarTipoReaccion: jest.fn(),
  cambiarReaccion: jest.fn(),
  crearComentario: jest.fn(),
  obtenerPublicacionPorId: jest.fn(),
  actualizarComentarioPropio: jest.fn(),
}));

jest.mock("../src/modules/publico/publico.repository", () => ({
  buscarPublicacion: jest.fn(),
}));

const repositorio = require("../src/modules/comunidad/interacciones.repository");
const publicoRepositorio = require("../src/modules/publico/publico.repository");
const servicio = require("../src/modules/comunidad/interacciones.service");

describe("Interacciones comunitarias", () => {
  beforeEach(() => {
    publicoRepositorio.buscarPublicacion.mockResolvedValue({
      id: 8,
      slug: "cuidado-de-la-papa",
    });
  });

  test("oculta con 404 un comentario que pertenece a otra persona", async () => {
    repositorio.buscarComentario.mockResolvedValue({
      id: 4,
      usuario_id: 21,
      deleted_at: null,
    });

    await expect(servicio.editarComentario(4, 22, "texto corregido"))
      .rejects.toMatchObject({ estado: 404 });
    expect(repositorio.actualizarComentarioPropio).not.toHaveBeenCalled();
  });

  test("rechaza la edición después de los 15 minutos", async () => {
    repositorio.buscarComentario.mockResolvedValue({
      id: 4,
      usuario_id: 21,
      publicacion_id: 8,
      created_at: new Date(Date.now() - 16 * 60 * 1000),
      deleted_at: null,
    });

    await expect(servicio.editarComentario(4, 21, "texto corregido"))
      .rejects.toMatchObject({ estado: 400 });
    expect(repositorio.actualizarComentarioPropio).not.toHaveBeenCalled();
  });

  test("no permite responder a una respuesta ni fuera del mismo artículo", async () => {
    repositorio.buscarComentario.mockResolvedValue({
      id: 4,
      publicacion_id: 8,
      comentario_padre_id: 3,
      deleted_at: null,
    });

    await expect(servicio.crearComentario("cuidado-de-la-papa", 22, "respuesta", 4))
      .rejects.toMatchObject({ estado: 400 });
    expect(repositorio.crearComentario).not.toHaveBeenCalled();
  });

  test("acepta solo reacciones del catálogo previsto", async () => {
    repositorio.buscarTipoReaccion.mockResolvedValue({
      id: 1,
      clave: "me_gusta",
    });

    await expect(
      servicio.reaccionArticulo("cuidado-de-la-papa", 22, "me_gusta"),
    ).rejects.toMatchObject({ estado: 400 });
    expect(repositorio.cambiarReaccion).not.toHaveBeenCalled();
  });
});
