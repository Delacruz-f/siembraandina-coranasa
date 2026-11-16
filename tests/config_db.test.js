jest.mock("dotenv", () => ({
  config: jest.fn(),
}));

const VARIABLES_DB = [
  "NODE_ENV",
  "SESSION_SECRET",
  "DATABASE_URL",
  "DB_CLIENT",
  "DB_HOST",
  "DB_PORT",
  "DB_USER",
  "DB_PASSWORD",
  "DB_NAME",
  "DB_SSL",
  "DB_POOL_MAX",
  "VERCEL",
  "UPLOADS_DIR",
];
const valoresOriginales = new Map(
  VARIABLES_DB.map((nombre) => [nombre, process.env[nombre]]),
);

function cargarConfiguracion() {
  jest.resetModules();
  return require("../src/config/env");
}

beforeEach(() => {
  VARIABLES_DB.forEach((nombre) => delete process.env[nombre]);
  process.env.NODE_ENV = "test";
  process.env.SESSION_SECRET = "secreto-de-prueba-con-mas-de-32-caracteres";
});

afterAll(() => {
  VARIABLES_DB.forEach((nombre) => {
    const valor = valoresOriginales.get(nombre);
    if (valor === undefined) delete process.env[nombre];
    else process.env[nombre] = valor;
  });
});

describe("configuración de la base de datos", () => {
  test("interpreta DATABASE_URL y decodifica credenciales especiales", () => {
    process.env.DATABASE_URL =
      "postgresql://agricultor:p%40ss%3Aword@db.example.test:6543/siembra";
    process.env.DB_CLIENT = "mysql2";
    process.env.DB_HOST = "ignorado";
    process.env.DB_PORT = "no-es-un-puerto";
    process.env.DB_USER = "ignorado";
    process.env.DB_PASSWORD = "ignorada";
    process.env.DB_NAME = "ignorada";
    process.env.DB_POOL_MAX = "7";

    const configuracion = cargarConfiguracion();

    expect(configuracion.db.client).toBe("pg");
    expect(configuracion.db.connection).toMatchObject({
      host: "db.example.test",
      port: 6543,
      user: "agricultor",
      password: "p@ss:word",
      database: "siembra",
    });
    expect(configuracion.db.connection).not.toHaveProperty("ssl");
    expect(configuracion.db.poolMax).toBe(7);

    jest.resetModules();
    const configuracionCli = require("../knexfile").test;
    expect(configuracionCli.connection).toEqual(configuracion.db.connection);
    expect(configuracionCli.pool).toEqual({
      min: 0,
      max: configuracion.db.poolMax,
    });
  });

  test("activa SSL si DATABASE_URL especifica sslmode=require", () => {
    process.env.DATABASE_URL =
      "postgres://agricultor:clave%21@db.example.test/siembra?sslmode=require";
    process.env.DB_SSL = "false";

    const configuracion = cargarConfiguracion();

    expect(configuracion.db.connection.port).toBe(5432);
    expect(configuracion.db.connection.ssl).toEqual({
      rejectUnauthorized: false,
    });
  });

  test("activa SSL con DB_SSL=true aunque no haya DATABASE_URL", () => {
    process.env.DB_SSL = "true";

    const configuracion = cargarConfiguracion();

    expect(configuracion.db.connection.ssl).toEqual({
      rejectUnauthorized: false,
    });
  });

  test("usa /tmp/uploads en Vercel solo si UPLOADS_DIR no está configurada", () => {
    process.env.VERCEL = "1";

    expect(cargarConfiguracion().subidas.directorio).toBe("/tmp/uploads");

    process.env.UPLOADS_DIR = "/tmp/archivos-personalizados";
    expect(cargarConfiguracion().subidas.directorio).toBe(
      "/tmp/archivos-personalizados",
    );
  });

  test("rechaza DATABASE_URL inválida sin incluir la contraseña en el error", () => {
    process.env.DATABASE_URL =
      "postgresql://agricultor:secreto-de-prueba@[";

    let mensaje = "";
    try {
      cargarConfiguracion();
    } catch (error) {
      mensaje = error.message;
    }

    expect(mensaje).toContain("DATABASE_URL");
    expect(mensaje).not.toContain("secreto-de-prueba");
  });
});
