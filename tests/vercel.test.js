jest.mock("../src/modules/notificaciones/notificaciones.service", () => ({
  nuevasDesde: jest.fn(),
  contarNoLeidas: jest.fn(),
  ultimoId: jest.fn(),
}));
jest.mock("../src/config/logger", () => ({
  error: jest.fn(),
}));
jest.mock("../src/utils/errores", () => ({
  noEncontrado: jest.fn(),
}));
jest.mock("../src/middlewares/vistas", () => ({
  agregarMensaje: jest.fn(),
}));
jest.mock("../src/modules/tecnico/avisos.repository", () => ({
  buscarAvisoParaUsuario: jest.fn(),
}));

const servicio = require("../src/modules/notificaciones/notificaciones.service");
const controlador = require("../src/modules/notificaciones/notificaciones.controller");
const vercelOriginal = process.env.VERCEL;

afterAll(() => {
  if (vercelOriginal === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = vercelOriginal;
});

describe("notificaciones SSE en Vercel", () => {
  test("responde 204 vacío sin iniciar consultas en vivo", async () => {
    process.env.VERCEL = "1";
    const respuesta = {
      status: jest.fn().mockReturnThis(),
      end: jest.fn().mockReturnThis(),
    };

    await controlador.eventos({}, respuesta);

    expect(respuesta.status).toHaveBeenCalledWith(204);
    expect(respuesta.end).toHaveBeenCalledWith();
    expect(servicio.ultimoId).not.toHaveBeenCalled();
    expect(servicio.nuevasDesde).not.toHaveBeenCalled();
    expect(servicio.contarNoLeidas).not.toHaveBeenCalled();
  });
});
