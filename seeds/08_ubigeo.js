// Provincias y distritos basados en el dataset UBIGEO de INEI (2019),
// distribuido bajo MIT; se cargan solo departamentos presentes en el seed Sierra.
const departamentosFuente = require("./data/departamentos.json");
const provinciasFuente = require("./data/provincias.json");
const distritosFuente = require("./data/distritos.json");

const TAMANO_BLOQUE = 300;

async function insertarPorBloques(knex, tabla, filas, clave) {
  for (let inicio = 0; inicio < filas.length; inicio += TAMANO_BLOQUE) {
    const bloque = filas.slice(inicio, inicio + TAMANO_BLOQUE);
    await knex(tabla).insert(bloque).onConflict(clave).ignore();
  }
}

exports.seed = async function seed(knex) {
  const departamentos = await knex("departamentos").select("id", "codigo");
  const departamentoPorCodigo = new Map(
    departamentos.map((fila) => [fila.codigo, fila.id]),
  );
  const departamentoPorUbigeo = new Map();

  for (const fila of departamentosFuente) {
    const departamentoId = departamentoPorCodigo.get(fila.codigo_ubigeo);
    if (departamentoId) {
      departamentoPorUbigeo.set(fila.id_ubigeo, departamentoId);
    }
  }

  const provincias = [];
  const provinciaPorUbigeo = new Map();
  for (const [padre, filas] of Object.entries(provinciasFuente)) {
    const departamentoId = departamentoPorUbigeo.get(padre);
    if (!departamentoId) continue;

    for (const fila of filas) {
      provincias.push({
        departamento_id: departamentoId,
        nombre: fila.nombre_ubigeo,
      });
      provinciaPorUbigeo.set(fila.id_ubigeo, {
        departamentoId,
        nombre: fila.nombre_ubigeo,
      });
    }
  }

  await insertarPorBloques(
    knex,
    "provincias",
    provincias,
    ["departamento_id", "nombre"],
  );

  const provinciasGuardadas = await knex("provincias").select(
    "id",
    "departamento_id",
    "nombre",
  );
  const provinciaIdPorClave = new Map(
    provinciasGuardadas.map((fila) => [
      `${fila.departamento_id}:${fila.nombre}`,
      fila.id,
    ]),
  );
  const provinciaIdPorUbigeo = new Map();
  for (const [ubigeo, provincia] of provinciaPorUbigeo) {
    const id = provinciaIdPorClave.get(
      `${provincia.departamentoId}:${provincia.nombre}`,
    );
    if (id) provinciaIdPorUbigeo.set(ubigeo, id);
  }

  const distritos = [];
  for (const [padre, filas] of Object.entries(distritosFuente)) {
    const provinciaId = provinciaIdPorUbigeo.get(padre);
    if (!provinciaId) continue;
    for (const fila of filas) {
      distritos.push({
        provincia_id: provinciaId,
        nombre: fila.nombre_ubigeo,
      });
    }
  }

  await insertarPorBloques(
    knex,
    "distritos",
    distritos,
    ["provincia_id", "nombre"],
  );
};
