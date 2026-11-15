function crearTabla(knex, nombre, definir) {
  return knex.schema.createTable(nombre, (tabla) => {
    if (["mysql2", "mysql"].includes(knex.client.config.client)) {
      tabla.charset("utf8mb4");
    }
    definir(tabla);
  });
}

async function renombrarTimestamp(knex, tabla, origen, destino) {
  await knex.schema.alterTable(tabla, (t) => {
    t.timestamp(destino).notNullable().defaultTo(knex.fn.now());
  });
  await knex(tabla).update({ [destino]: knex.ref(origen) });
  await knex.schema.alterTable(tabla, (t) => t.dropColumn(origen));
}

module.exports = { crearTabla, renombrarTimestamp };
