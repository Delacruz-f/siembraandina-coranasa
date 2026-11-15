jest.mock("../src/modules/editor/editor.repository", () => ({
  listar: jest.fn(),
  listarCategorias: jest.fn().mockResolvedValue([]),
  listarEtiquetas: jest.fn().mockResolvedValue([]),
  estados: jest.fn().mockResolvedValue([]),
  buscarParaEdicion: jest.fn(),
  listarBiblioteca: jest.fn().mockResolvedValue([]),
}));

const editor = require("../src/modules/editor/editor.service");
const repositorio = require("../src/modules/editor/editor.repository");

describe("Contenido editorial sanitizado", () => {
  test("conserva formato permitido y elimina scripts y atributos ejecutables", () => {
    const seguro = editor.sanitizar(
      '<h2>Siembra</h2><p onclick="alert(1)">Papa</p><script>alert(2)</script>',
    );

    expect(seguro).toContain("<h2>Siembra</h2>");
    expect(seguro).toContain("<p>Papa</p>");
    expect(seguro).not.toContain("onclick");
    expect(seguro).not.toContain("<script");
  });

  test("solo conserva imágenes adjuntas de la biblioteca y con texto alternativo", () => {
    const seguro = editor.sanitizar(
      '<img src="https://rastreador.ejemplo/imagen.png" alt="externa"><img src="/media/publicaciones/12" alt="Papa en floración"><img src="/media/publicaciones/13">',
    );

    expect(seguro).toContain('/media/publicaciones/12');
    expect(seguro).toContain('alt="Papa en floración"');
    expect(seguro).not.toContain("rastreador");
    expect(seguro).not.toContain("/media/publicaciones/13");
  });

  test("sanitiza también el contenido existente antes de mostrarlo en el editor", async () => {
    repositorio.buscarParaEdicion.mockResolvedValue({
      id: 8,
      contenido: '<p>Texto seguro</p><img src=x onerror="alert(1)">',
    });

    const { articulo } = await editor.formulario(8, 3);

    expect(articulo.contenido).toContain("<p>Texto seguro</p>");
    expect(articulo.contenido).not.toContain("onerror");
  });
});
