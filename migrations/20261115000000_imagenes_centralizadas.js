// Fase 10 — Imágenes centralizadas.
// - archivos: se agregan los metadatos de publicación obligatorios
//   (autor de la imagen y su licencia) y la bandera de borrado lógico que usa
//   la tarea de limpieza de huérfanos. `texto_alternativo`, `ancho`, `alto` y
//   `licencia` ya existen desde la migración 20260306000000.
// - imagen_variantes: un registro por cada tamaño/formatos generados con sharp
//   (400, 800 y 1600 px en WebP con respaldo JPG).
// - cultivo_imagenes: imágenes públicas del catálogo de cultivos.
const { crearTabla } = require("../src/utils/migraciones");

exports.up = async function up(knex) {
  await knex.schema.alterTable("archivos", (t) => {
    // Autor humano de la fotografía (distinto del usuario que la sube).
    t.string("autor_imagen", 160).nullable();
    // URL de atribución o perfil del autor (opcional).
    t.string("autor_url", 255).nullable();
    // URL de la licencia (p. ej. creativecommons.org/licenses/by-sa/4.0/).
    t.string("licencia_url", 255).nullable();
    // true = imagen de un artículo o del catálogo de cultivos (acceso público).
    t.boolean("es_publica").notNullable().defaultTo(false);
    // Marca de borrado: el registro sigue para que las lecturas no se rompan,
    // pero la tarea de limpieza elimina sus binarios.
    t.timestamp("eliminado_en").nullable();
    t.index(["es_publica"], "idx_archivos_es_publica");
    t.index(["eliminado_en"], "idx_archivos_eliminado_en");
  });

  await crearTabla(knex, "imagen_variantes", (t) => {
    t.increments("id").primary();
    t.integer("archivo_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("archivos")
      .onDelete("CASCADE");
    // Ancho máximo de la variante: 400, 800 o 1600.
    t.integer("ancho").unsigned().notNullable();
    // Ancho y alto reales de la variante (con el recorte aplicado).
    t.integer("ancho_px").unsigned().notNullable();
    t.integer("alto_px").unsigned().notNullable();
    // Clave del almacenamiento (ruta relativa en local; key en S3).
    t.string("ruta_webp", 255).notNullable();
    t.string("ruta_jpg", 255).notNullable();
    t.integer("tamano_webp").unsigned().notNullable();
    t.integer("tamano_jpg").unsigned().notNullable();
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    t.unique(["archivo_id", "ancho"]);
    t.index(["archivo_id"], "idx_imagen_variantes_archivo");
  });

  await crearTabla(knex, "cultivo_imagenes", (t) => {
    t.increments("id").primary();
    t.integer("cultivo_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("cultivos")
      .onDelete("CASCADE");
    t.integer("archivo_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("archivos")
      .onDelete("CASCADE");
    t.integer("orden").notNullable().defaultTo(0);
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    t.unique(["cultivo_id", "archivo_id"]);
    t.index(["archivo_id"], "idx_cultivo_imagenes_archivo");
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("cultivo_imagenes");
  await knex.schema.dropTableIfExists("imagen_variantes");
  await knex.schema.alterTable("archivos", (t) => {
    t.dropIndex(["eliminado_en"], "idx_archivos_eliminado_en");
    t.dropIndex(["es_publica"], "idx_archivos_es_publica");
    t.dropColumn("eliminado_en");
    t.dropColumn("es_publica");
    t.dropColumn("licencia_url");
    t.dropColumn("autor_url");
    t.dropColumn("autor_imagen");
  });
};
