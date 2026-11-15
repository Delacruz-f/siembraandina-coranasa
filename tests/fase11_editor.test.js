// Pruebas de ramas del servicio editorial (Fase 11).
// Cubren las validaciones de estado, contenido, categoría, programación,
// etiquetas e imágenes, además de la publicación programada.
jest.mock("../src/modules/editor/editor.repository", () => ({
  listar: jest.fn(),
  listarCategorias: jest.fn(),
  listarEtiquetas: jest.fn(),
  estados: jest.fn(),
  buscarParaEdicion: jest.fn(),
  listarBiblioteca: jest.fn(),
  guardar: jest.fn(),
  asegurarEtiquetas: jest.fn(),
  slugArticulo: jest.fn(),
  estadoId: jest.fn(),
  eliminar: jest.fn(),
  publicarProgramados: jest.fn(),
}));
jest.mock("../src/modules/imagenes/imagenes.repository", () => ({
  listarVariantes: jest.fn().mockResolvedValue([]),
}));
jest.mock("../src/modules/admin/auditoria.repository", () => ({
  registrar: jest.fn().mockResolvedValue(undefined),
}));

const repo = require("../src/modules/editor/editor.repository");
const auditoria = require("../src/modules/admin/auditoria.repository");
const editor = require("../src/modules/editor/editor.service");

const ENTRADA = {
  titulo: "Cómo cuidar la papa nativa",
  categoria_id: "2",
  estado: "borrador",
  contenido: "<p>Contenido con texto suficiente.</p>",
  etiquetas: "papa, suelo",
};

beforeEach(() => {
  jest.clearAllMocks();
  repo.listarCategorias.mockResolvedValue([{ id: 2, nombre: "Agricultura" }]);
  repo.asegurarEtiquetas.mockResolvedValue([1, 2]);
  repo.estadoId.mockResolvedValue(1);
  repo.slugArticulo.mockResolvedValue("como-cuidar-la-papa-nativa");
  repo.guardar.mockResolvedValue(55);
});

describe("Guardar artículo", () => {
  test("crea un borrador válido y audita", async () => {
    await expect(editor.guardar(null, 3, ENTRADA)).resolves.toBe(55);
    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ accion: "publicacion.creada" }),
    );
  });

  test("rechaza un estado no editable", async () => {
    await expect(
      editor.guardar(null, 3, { ...ENTRADA, estado: "inventado" }),
    ).rejects.toMatchObject({ estado: 400 });
  });

  test("rechaza contenido vacío después de sanitizar", async () => {
    await expect(
      editor.guardar(null, 3, {
        ...ENTRADA,
        contenido: "<script>alert(1)</script>",
      }),
    ).rejects.toMatchObject({ estado: 400 });
  });

  test("rechaza una categoría inexistente", async () => {
    await expect(
      editor.guardar(null, 3, { ...ENTRADA, categoria_id: "99" }),
    ).rejects.toMatchObject({ estado: 400 });
  });

  test("rechaza una fecha de programación en el pasado", async () => {
    await expect(
      editor.guardar(null, 3, {
        ...ENTRADA,
        estado: "programada",
        publicada_en: "2020-01-01T10:00",
      }),
    ).rejects.toMatchObject({ estado: 400 });
  });

  test("acepta una programación futura", async () => {
    const futura = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await expect(
      editor.guardar(null, 3, {
        ...ENTRADA,
        estado: "programada",
        publicada_en: futura,
      }),
    ).resolves.toBe(55);
  });

  test("rechaza más de 10 etiquetas", async () => {
    const muchas = Array.from({ length: 11 }, (_, i) => `etiqueta${i}`).join(
      ",",
    );
    await expect(
      editor.guardar(null, 3, { ...ENTRADA, etiquetas: muchas }),
    ).rejects.toMatchObject({ estado: 400 });
  });

  test("rechaza imágenes con identificadores inválidos", async () => {
    await expect(
      editor.guardar(null, 3, { ...ENTRADA, archivo_ids: ["0"] }),
    ).rejects.toMatchObject({ estado: 400 });
  });

  test("traduce el error de imagen ajena a un 400 claro", async () => {
    repo.guardar.mockRejectedValue(
      Object.assign(new Error("ajena"), { code: "ARCHIVO_NO_PROPIO" }),
    );
    await expect(
      editor.guardar(null, 3, { ...ENTRADA, archivo_ids: ["4"] }),
    ).rejects.toMatchObject({ estado: 400 });
  });

  test("actualizar un artículo existente audita la actualización", async () => {
    await editor.guardar(55, 3, { ...ENTRADA, estado: "publicada" });
    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ accion: "publicacion.actualizada" }),
    );
  });
});

describe("Formulario y eliminación", () => {
  test("un artículo inexistente devuelve 404", async () => {
    repo.buscarParaEdicion.mockResolvedValue(null);
    repo.listarBiblioteca.mockResolvedValue([]);
    await expect(editor.formulario(9, 3)).rejects.toMatchObject({
      estado: 404,
    });
  });

  test("eliminar un artículo inexistente devuelve 404", async () => {
    repo.buscarParaEdicion.mockResolvedValue(null);
    await expect(editor.eliminar(9, 3)).rejects.toMatchObject({ estado: 404 });
  });

  test("eliminar un artículo existente lo archiva y audita", async () => {
    repo.buscarParaEdicion.mockResolvedValue({ id: 9 });
    repo.eliminar.mockResolvedValue(true);
    await editor.eliminar(9, 3);
    expect(auditoria.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ accion: "publicacion.eliminada" }),
    );
  });

  test("publicarProgramados audita cada artículo publicado", async () => {
    repo.publicarProgramados.mockResolvedValue([
      { id: 1, usuario_id: 3, titulo: "Uno" },
      { id: 2, usuario_id: 4, titulo: "Dos" },
    ]);
    await expect(editor.publicarProgramados()).resolves.toBe(2);
    expect(auditoria.registrar).toHaveBeenCalledTimes(2);
  });
});

describe("Sanitización", () => {
  test("elimina enlaces con esquemas peligrosos", () => {
    const seguro = editor.sanitizar(
      '<p><a href="javascript:alert(1)">malo</a> <a href="https://ok.pe">bueno</a></p>',
    );
    expect(seguro).not.toContain("javascript:");
    expect(seguro).toContain("https://ok.pe");
  });

  test("fuerza rel y target seguros en los enlaces", () => {
    const seguro = editor.sanitizar('<p><a href="https://ok.pe">x</a></p>');
    expect(seguro).toContain('rel="noopener noreferrer"');
    expect(seguro).toContain('target="_blank"');
  });

  test("elimina etiquetas no permitidas como iframe", () => {
    const seguro = editor.sanitizar(
      '<iframe src="https://malo.pe"></iframe><p>ok</p>',
    );
    expect(seguro).not.toContain("iframe");
    expect(seguro).toContain("<p>ok</p>");
  });
});
