function cargarOperadorBusqueda(cliente) {
  jest.resetModules();
  jest.doMock("../src/config/env", () => ({
    db: { client: cliente },
  }));
  jest.doMock("../src/config/db", () => ({
    db: jest.fn(),
  }));
  return require("../src/utils/baseDatos").operadorBusqueda;
}

afterEach(() => {
  jest.dontMock("../src/config/env");
  jest.dontMock("../src/config/db");
  jest.resetModules();
});

describe("operadorBusqueda", () => {
  test("usa ilike en PostgreSQL", () => {
    expect(cargarOperadorBusqueda("pg")()).toBe("ilike");
  });

  test("usa like en MySQL", () => {
    expect(cargarOperadorBusqueda("mysql2")()).toBe("like");
  });
});

describe("insertarYDevolverId", () => {
  async function insertarConCliente(cliente) {
    jest.resetModules();
    const devolverId = jest.fn().mockResolvedValue([{ id: 22 }]);
    const consulta = {
      insert: jest.fn(),
      returning: devolverId,
    };
    const resultadoMySQL = [22];
    consulta.insert.mockReturnValue(
      cliente === "pg" ? consulta : Promise.resolve(resultadoMySQL),
    );
    const conexion = jest.fn().mockReturnValue(consulta);
    jest.doMock("../src/config/env", () => ({
      db: { client: cliente },
    }));
    jest.doMock("../src/config/db", () => ({
      db: jest.fn(),
    }));
    const { insertarYDevolverId } = require("../src/utils/baseDatos");

    return {
      id: await insertarYDevolverId("variedades", { nombre: "Ejemplo" }, conexion),
      consulta,
      devolverId,
    };
  }

  test("solicita y obtiene el ID con RETURNING en PostgreSQL", async () => {
    const resultado = await insertarConCliente("pg");

    expect(resultado.id).toBe(22);
    expect(resultado.devolverId).toHaveBeenCalledWith("id");
  });

  test("conserva el resultado insertId de MySQL", async () => {
    const resultado = await insertarConCliente("mysql2");

    expect(resultado.id).toBe(22);
    expect(resultado.devolverId).not.toHaveBeenCalled();
  });
});
