// Variables de entorno para las pruebas (se cargan antes que cualquier módulo).
// No se usa el .env real: las pruebas no deben tocar la base de datos de desarrollo.
process.env.NODE_ENV = "test";
process.env.SESSION_SECRET =
  "secreto-solo-para-pruebas-con-mas-de-32-caracteres";
process.env.LOG_LEVEL = "silent";
process.env.DB_CLIENT = process.env.DB_CLIENT || "mysql2";
process.env.DB_HOST = process.env.DB_HOST || "127.0.0.1";
process.env.DB_PORT = process.env.DB_PORT || "3306";
process.env.DB_USER = process.env.DB_USER || "root";
process.env.DB_PASSWORD = process.env.DB_PASSWORD || "";
process.env.DB_NAME = process.env.DB_NAME || "siembra_andina_pruebas";
