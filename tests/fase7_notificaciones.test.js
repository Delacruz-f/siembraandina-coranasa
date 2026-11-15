jest.mock("../src/modules/notificaciones/notificaciones.service", () => ({
  ultimoId: jest.fn(),
  nuevasDesde: jest.fn(),
  contarNoLeidas: jest.fn(),
}));

const { EventEmitter } = require("node:events");
const servicio = require("../src/modules/notificaciones/notificaciones.service");
const controlador = require("../src/modules/notificaciones/notificaciones.controller");

function crearConexionSse() {
  const req = new EventEmitter();
  req.session = { usuario: { id: 7001, roles: ["agricultor"] } };
  req.query = {};
  req.get = jest.fn(() => undefined);

  const res = new EventEmitter();
  res.status = jest.fn().mockReturnThis();
  res.set = jest.fn().mockReturnThis();
  res.flushHeaders = jest.fn();
  res.write = jest.fn();
  res.flush = jest.fn();
  res.end = jest.fn();
  res.writableEnded = false;
  return { req, res };
}

describe("Conexiones SSE de notificaciones", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    servicio.ultimoId.mockResolvedValue(0);
    servicio.nuevasDesde.mockResolvedValue([]);
    servicio.contarNoLeidas.mockResolvedValue(0);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("limita a tres conexiones y libera el cupo al cerrar la respuesta", async () => {
    const conexiones = [];
    for (let indice = 0; indice < 3; indice += 1) {
      const conexion = crearConexionSse();
      conexiones.push(conexion);
      await controlador.eventos(conexion.req, conexion.res);
    }

    const excedente = crearConexionSse();
    await controlador.eventos(excedente.req, excedente.res);
    expect(excedente.res.status).toHaveBeenCalledWith(429);

    conexiones[0].res.emit("close");
    const reemplazo = crearConexionSse();
    await controlador.eventos(reemplazo.req, reemplazo.res);
    expect(reemplazo.res.flushHeaders).toHaveBeenCalled();

    for (const conexion of [...conexiones.slice(1), reemplazo]) {
      conexion.res.emit("close");
    }
  });
});
