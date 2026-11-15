// Datos de demostración para presentar «Siembra Andina» (Fase 11).
// Uso:  npm run demo            (requiere npm run migrate && npm run seed)
//       npm run demo -- --limpiar   (borra solo los datos demo creados aquí)
//
// Qué crea (todo idempotente; se puede ejecutar varias veces):
//   - 5 cuentas, una por rol (agricultora, técnico, editor, administrador y
//     una segunda agricultora con parcela en otra zona).
//   - 3 parcelas con campañas en Cusco, con acceso del técnico a dos de ellas.
//   - ~90 lecturas de suelo de los últimos 30 días con una onda realista.
//   - 2 artículos publicados con imágenes generadas con sharp y un artículo
//     en borrador.
//   - Un aviso por zona y una consulta ya respondida para mostrar la comunidad.
//   - Imágenes del catálogo de cultivos (públicas, con autor y licencia).
//
// Contraseña común: Demo2026!siembra  (solo para entornos de demostración).
const bcrypt = require("bcryptjs");
const sharp = require("sharp");
const { db, cerrarConexion } = require("../src/config/db");
const { insertarYDevolverId } = require("../src/utils/baseDatos");
const archivosServicio = require("../src/modules/usuarios/archivos.service");
const logger = require("../src/config/logger");
const env = require("../src/config/env");

const CONTRASENA = "Demo2026!siembra";
const DOMINIO = "demo.siembraandina.pe";
const LICENCIA = {
  nombre: "CC BY-SA 4.0",
  url: "https://creativecommons.org/licenses/by-sa/4.0/",
};

const USUARIOS = [
  {
    clave: "agricultora",
    nombre: "Rosa Quispe Huamán",
    email: `rosa@${DOMINIO}`,
    rol: "agricultor",
    comunidad: "Comunidad de Chinchero",
    telefono: "+51 984 111 222",
  },
  {
    clave: "agricultor2",
    nombre: "Julio Ccahuana",
    email: `julio@${DOMINIO}`,
    rol: "agricultor",
    comunidad: "Comunidad de Maras",
    telefono: "+51 984 333 444",
  },
  {
    clave: "tecnico",
    nombre: "Ing. María Ttito",
    email: `maria@${DOMINIO}`,
    rol: "tecnico",
    comunidad: "Agencia Agraria Cusco",
    telefono: "+51 984 555 666",
  },
  {
    clave: "editor",
    nombre: "Editora Sumaq Willakuy",
    email: `editor@${DOMINIO}`,
    rol: "editor",
    comunidad: "Equipo editorial",
    telefono: null,
  },
  {
    clave: "admin",
    nombre: "Administración Siembra Andina",
    email: `admin@${DOMINIO}`,
    rol: "administrador",
    comunidad: "Equipo técnico",
    telefono: null,
  },
];

const PARCELAS = [
  {
    clave: "chinchero",
    dueno: "agricultora",
    nombre: "Parcela Chinchero – sector Pumaorqo",
    distrito: "Chinchero",
    cultivo: "papa",
    zonaClave: "quechua",
    latitud: -13.3847,
    longitud: -72.0621,
    altitud: 3760,
    area: 0.85,
    notas: "Suelo franco-arcilloso, riego por gravedad desde el manante.",
    humedadBase: 26,
    tempBase: 12.5,
  },
  {
    clave: "maras",
    dueno: "agricultor2",
    nombre: "Parcela Maras – andenes bajos",
    distrito: "Maras",
    cultivo: "maiz",
    zonaClave: "valle",
    latitud: -13.3356,
    longitud: -72.1567,
    altitud: 2910,
    area: 1.2,
    notas: "Andenes con buen drenaje; maíz blanco de ciclo corto.",
    humedadBase: 30,
    tempBase: 15.5,
  },
  {
    clave: "urubamba",
    dueno: "agricultora",
    nombre: "Parcela Urubamba – quinua experimental",
    distrito: "Urubamba",
    cultivo: "quinua",
    zonaClave: "quechua",
    latitud: -13.3056,
    longitud: -72.1158,
    altitud: 2870,
    area: 0.4,
    notas: "Prueba con quinua blanca de Junín junto al equipo técnico.",
    humedadBase: 22,
    tempBase: 14,
  },
];

const ARTICULOS = [
  {
    titulo: "Demo: cómo leer el calendario de siembra comunitario",
    slug: "demo-como-leer-el-calendario-comunitario",
    categoria: "agricultura",
    etiquetas: ["calendario", "papa"],
    resumenArticulo: true,
  },
  {
    titulo: "Demo: medir la humedad del suelo con lo que tenemos a mano",
    slug: "demo-medir-la-humedad-del-suelo",
    categoria: "clima-y-suelo",
    etiquetas: ["suelo", "calendario"],
    resumenArticulo: true,
  },
];

function hoyMenosDias(dias) {
  const fecha = new Date();
  fecha.setHours(12, 0, 0, 0);
  fecha.setDate(fecha.getDate() - dias);
  return fecha;
}

function fechaIso(fecha) {
  return fecha.toISOString().slice(0, 10);
}

function redondear(valor) {
  return Math.round(valor * 10) / 10;
}

/** Imagen de demostración (siembra, suelo o paisaje) dibujada con sharp. */
async function imagenDemo({ ancho, alto, titulo, semilla }) {
  const tonalidades = [
    ["#6f8f5a", "#d9a52b"],
    ["#4c594e", "#b8c2b4"],
    ["#8a7a3f", "#e8ece4"],
  ];
  const [fondo, acento] = tonalidades[semilla % tonalidades.length];
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}">
      <rect width="100%" height="100%" fill="${fondo}"/>
      <circle cx="${ancho * 0.7}" cy="${alto * 0.3}" r="${alto * 0.22}" fill="${acento}" opacity="0.9"/>
      <path d="M0 ${alto * 0.75} Q ${ancho * 0.3} ${alto * 0.6} ${ancho * 0.55} ${alto * 0.78}
               T ${ancho} ${alto * 0.7} V ${alto} H 0 Z" fill="${acento}" opacity="0.45"/>
      <text x="${ancho * 0.05}" y="${alto * 0.92}" font-family="sans-serif"
            font-size="${Math.round(alto * 0.06)}" fill="#ffffff" opacity="0.85">${titulo}</text>
    </svg>`;
  return sharp({
    create: { width: ancho, height: alto, channels: 3, background: fondo },
  })
    .composite([{ input: Buffer.from(svg) }])
    .jpeg({ quality: 88 })
    .toBuffer();
}

async function asegurarUsuario(usuario) {
  const existente = await db("usuarios")
    .where({ email: usuario.email })
    .first();
  if (existente) return existente.id;
  const rol = await db("roles").where({ clave: usuario.rol }).first();
  if (!rol) {
    throw new Error(
      `Falta el rol "${usuario.rol}". Ejecuta primero: npm run seed`,
    );
  }
  return db.transaction(async (trx) => {
    const id = await insertarYDevolverId(
      "usuarios",
      {
        email: usuario.email,
        password_hash: await bcrypt.hash(CONTRASENA, 10),
        activo: true,
        email_verificado_en: trx.fn.now(),
      },
      trx,
    );
    await trx("perfiles").where({ usuario_id: id }).del();
    await trx("preferencias_notificacion")
      .where({ usuario_id: id })
      .del();
    await trx("perfiles").insert({
      usuario_id: id,
      nombre: usuario.nombre,
      telefono: usuario.telefono || null,
      comunidad: usuario.comunidad || null,
    });
    await trx("preferencias_notificacion").insert({ usuario_id: id });
    await trx("usuario_roles").insert({
      usuario_id: id,
      rol_id: rol.id,
      es_principal: true,
    });
    return id;
  });
}

async function catalogoDemo() {
  const cultivos = await db("cultivos").select("id", "slug");
  const zonas = await db("zonas_altitudinales").select("id", "clave");
  const provincias = await db("provincias as p")
    .join("departamentos as d", "d.id", "p.departamento_id")
    .where("d.nombre", "like", "Cusco%")
    .select("p.id", "p.nombre", "d.id as departamento_id");
  return { cultivos, zonas, provincias };
}

async function asegurarParcela(parcela, ids, catalogo) {
  const existente = await db("parcelas")
    .where({ nombre: parcela.nombre, usuario_id: ids[parcela.dueno] })
    .first();
  if (existente) {
    const campania = await db("campanias")
      .where({ parcela_id: existente.id })
      .first();
    if (campania) return existente.id;
    await db('parcelas').where({ id: existente.id }).del();
  }

  const cultivo = catalogo.cultivos.find((f) => f.slug === parcela.cultivo);
  const zona = catalogo.zonas.find((z) => z.clave === parcela.zonaClave);
  const distrito = await db("distritos as di")
    .join("provincias as p", "p.id", "di.provincia_id")
    .where("di.nombre", parcela.distrito)
    .andWhere("p.nombre", "Urubamba")
    .select("di.id")
    .first();
  if (!cultivo || !zona || !distrito) {
    throw new Error(
      `No se encontró catálogo para la parcela demo "${parcela.nombre}".`,
    );
  }
  return db.transaction(async (trx) => {
    const estado = await trx("estados_campania")
      .where({ clave: "activa" })
      .first();
    const id = await insertarYDevolverId(
      "parcelas",
      {
        usuario_id: ids[parcela.dueno],
        comunidad_id: null,
        zona_id: zona.id,
        distrito_id: distrito.id,
        nombre: parcela.nombre,
        latitud: parcela.latitud,
        longitud: parcela.longitud,
        altitud_m: parcela.altitud,
        area_hectareas: parcela.area,
        notas: parcela.notas,
        activa: true,
      },
      trx,
    );
    await trx("campanias").insert({
      parcela_id: id,
      cultivo_id: cultivo.id,
      estado_id: estado.id,
      fecha_inicio: fechaIso(hoyMenosDias(36)),
    });
    return id;
  });
}

/** 30 lecturas con una onda suave para que los gráficos se vean naturales. */
async function asegurarLecturas(
  parcelaId,
  { humedadBase, tempBase },
  fuenteId,
) {
  const existentes = await db("lecturas")
    .where({ parcela_id: parcelaId })
    .count({ total: "id" })
    .first();
  if (Number(existentes.total) > 0) return 0;
  const filas = [];
  for (let dia = 29; dia >= 0; dia -= 1) {
    const onda = Math.sin((29 - dia) / 3.4);
    const deriva = (29 - dia) * 0.06;
    filas.push({
      parcela_id: parcelaId,
      fecha: fechaIso(hoyMenosDias(dia)),
      humedad: redondear(humedadBase + onda * 4 - deriva),
      temperatura: redondear(tempBase + onda * 1.6 - deriva * 0.4),
      fuente_id: fuenteId,
      observacion: dia % 10 === 0 ? "Riego ligero por la mañana" : null,
    });
  }
  await db("lecturas").insert(filas);
  return filas.length;
}

async function asegurarAcceso(
  parcelaId,
  tecnicoId,
  otorgadoPor,
  puedeEscribir,
) {
  const existente = await db("accesos_parcela")
    .where({ parcela_id: parcelaId, tecnico_id: tecnicoId })
    .whereNull("revocado_en")
    .first();
  if (existente) return;
  await db("accesos_parcela").insert({
    parcela_id: parcelaId,
    tecnico_id: tecnicoId,
    puede_escribir: puedeEscribir,
    otorgado_por: otorgadoPor,
  });
}

async function asegurarDistritoTecnico(tecnicoId, distritos) {
  const filas = await db("distritos as d")
    .whereIn("d.nombre", distritos)
    .select("d.id");
  for (const fila of filas) {
    const existente = await db("tecnico_distritos")
      .where({ tecnico_id: tecnicoId, distrito_id: fila.id })
      .first();
    if (!existente) {
      await db("tecnico_distritos").insert({
        tecnico_id: tecnicoId,
        distrito_id: fila.id,
      });
    }
  }
}

async function asegurarImagen({ buffer, alt, usuarioId, semilla }) {
  return archivosServicio.guardarImagen(
    { buffer, mimetype: "image/jpeg", originalname: `demo-${semilla}.jpg` },
    usuarioId,
    alt,
    {
      publica: true,
      autor: { nombre: "Equipo Siembra Andina", url: null },
      licencia: LICENCIA,
    },
  );
}

async function asegurarArticulo(articulo, editorId, imagenes) {
  const existente = await db("publicaciones")
    .where({ slug: articulo.slug })
    .first();
  const creado = !existente;
  const [categoria, estado, etiquetas] = await Promise.all([
    db("categorias").where({ slug: articulo.categoria }).first(),
    db("estados_publicacion").where({ clave: "publicada" }).first(),
    db("etiquetas").whereIn("slug", articulo.etiquetas).select("id"),
  ]);
  if (!categoria || !estado) {
    throw new Error("Faltan catálogos base. Ejecuta primero: npm run seed");
  }
  const id = await db.transaction(async (trx) => {
    const publicacionId = existente
      ? existente.id
      : await insertarYDevolverId(
          "publicaciones",
          {
            usuario_id: editorId,
            categoria_id: categoria.id,
            estado_id: estado.id,
            titulo: articulo.titulo,
            slug: articulo.slug,
            contenido: [
              `<h2>Contexto</h2>`,
              `<p>Esta nota forma parte de los datos de demostración de Siembra Andina. Su objetivo es mostrar cómo se presenta el conocimiento local junto con las mediciones del suelo.</p>`,
              `<p>El calendario tradicional, validado por la comunidad, se contrasta con la humedad y la temperatura registradas por la propia familia agricultora.</p>`,
              `<h2>Qué observar</h2>`,
              `<ul><li>La humedad a una profundidad constante.</li><li>La temperatura del suelo al mediodía.</li><li>Los cambios después de una lluvia fuerte.</li></ul>`,
              `<p><img src="/media/imagenes/${imagenes[0]}/800" alt="Vista de la parcela de demostración con surcos preparados"></p>`,
              `<blockquote>La recomendación es una orientación: la decisión final se conversa en la comunidad.</blockquote>`,
            ].join(""),
            publicada_en: trx.fn.now(),
          },
          trx,
        );
    if (etiquetas.length) {
      const existentes = await trx("publicacion_etiquetas")
        .where({ publicacion_id: publicacionId })
        .select("etiqueta_id");
      const yaTienen = new Set(existentes.map((fila) => Number(fila.etiqueta_id)));
      const nuevas = etiquetas.filter(
        (etiqueta) => !yaTienen.has(Number(etiqueta.id)),
      );
      if (nuevas.length) {
        await trx("publicacion_etiquetas").insert(
          nuevas.map((etiqueta) => ({
            publicacion_id: publicacionId,
            etiqueta_id: etiqueta.id,
          })),
        );
      }
    }
    for (const archivoId of imagenes) {
      const yaAsociada = await trx("publicacion_archivos")
        .where({ publicacion_id: publicacionId, archivo_id: archivoId })
        .first();
      if (yaAsociada) continue;
      await trx("publicacion_archivos").insert({
        publicacion_id: publicacionId,
        archivo_id: archivoId,
      });
    }
    return publicacionId;
  });
  return { id, creado };
}

async function asegurarConsulta(
  agricultoraId,
  tecnicoId,
  distritoId,
  cultivoId,
) {
  const existente = await db("consultas")
    .where({
      usuario_id: agricultoraId,
      titulo: "Manchas amarillas en la papa",
    })
    .first();
  if (existente) return existente.id;
  return db.transaction(async (trx) => {
    const abierta = await trx("estados_consulta")
      .where({ clave: "abierta" })
      .first();
    const respondida = await trx("estados_consulta")
      .where({ clave: "respondida" })
      .first();
    const consultaId = await insertarYDevolverId(
      "consultas",
      {
        usuario_id: agricultoraId,
        distrito_id: distritoId,
        cultivo_id: cultivoId,
        estado_id: abierta.id,
        titulo: "Manchas amarillas en la papa",
        contenido:
          "Desde la última lluvia, varias plantas de papa muestran manchas amarillas en las hojas bajas. La humedad del suelo está en 32 % y la temperatura en 11 °C.",
      },
      trx,
    );
    await trx("respuestas").insert({
      consulta_id: consultaId,
      usuario_id: tecnicoId,
      contenido:
        "Revisa el drenaje del surco y evita regar durante dos días. Con 32 % de humedad el suelo sigue húmedo; toma una nueva lectura y comparte una foto de las hojas para descartar exceso de agua.",
    });
    await trx("consultas").where({ id: consultaId }).update({
      estado_id: respondida.id,
      updated_at: trx.fn.now(),
    });
    return consultaId;
  });
}

async function asegurarAviso(tecnicoId, zonaId) {
  const tabla = await db.schema.hasTable("avisos");
  if (!tabla) return;
  const existente = await db("avisos").where({ creado_por: tecnicoId }).first();
  if (existente) return;
  await db("avisos").insert({
    creado_por: tecnicoId,
    zona_id: zonaId,
    titulo: "Semana de heladas en la puna",
    contenido:
      "Se esperan temperaturas bajo cero en la madrugada. Protege los almacenes de semilla y adelanta el riego.",
    nivel: "aviso",
  });
}

async function limpiarDemo() {
  // 1) Artículos de demostración (se identifican por el prefijo demo- del slug).
  const publicaciones = await db("publicaciones")
    .where("slug", "like", "demo-%")
    .select("id");
  if (publicaciones.length) {
    await db("publicaciones")
      .whereIn(
        "id",
        publicaciones.map((p) => p.id),
      )
      .del();
  }
  // 2) Cuentas demo: el borrado en cascada elimina parcelas, lecturas,
  //    accesos, consultas e imágenes asociadas a ellas.
  const usuarios = await db("usuarios")
    .where("email", "like", `%@${DOMINIO}`)
    .select("id");
  if (!usuarios.length) return 0;
  const lista = usuarios.map((u) => u.id);
  const archivos = await db("archivos").whereIn("autor_id", lista).select("id");
  await db("usuarios").whereIn("id", lista).del();
  if (archivos.length) {
    await db("archivos")
      .whereIn(
        "id",
        archivos.map((a) => a.id),
      )
      .del();
  }
  return lista.length;
}

async function principal() {
  if (env.esProduccion) {
    throw new Error(
      "El seed de demostración no se ejecuta en producción. Usa NODE_ENV=development.",
    );
  }
  const limpiar = process.argv.includes("--limpiar");
  const ids = {};
  for (const usuario of USUARIOS) {
    ids[usuario.clave] = await asegurarUsuario(usuario);
  }
  if (limpiar) {
    const borrados = await limpiarDemo();
    console.log(`Datos demo eliminados (${borrados} cuentas).`);
    return;
  }

  const catalogo = await catalogoDemo();
  const fuente = await db("fuentes_datos").where({ clave: "manual" }).first();
  const zonas = Object.fromEntries(catalogo.zonas.map((z) => [z.clave, z.id]));

  let lecturas = 0;
  const parcelaIds = {};
  for (const parcela of PARCELAS) {
    const parcelaId = await asegurarParcela(parcela, ids, catalogo);
    parcelaIds[parcela.clave] = parcelaId;
    lecturas += await asegurarLecturas(parcelaId, parcela, fuente.id);
  }

  await asegurarAcceso(parcelaIds.chinchero, ids.tecnico, ids.agricultora, true);
  await asegurarAcceso(parcelaIds.maras, ids.tecnico, ids.agricultor2, false);
  await asegurarDistritoTecnico(ids.tecnico, [
    "Chinchero",
    "Maras",
    "Urubamba",
  ]);

  // Imágenes públicas del catálogo de cultivos (con autor y licencia).
  let imagenesCultivo = 0;
  for (const [indice, semilla] of ["papa", "maiz", "quinua"].entries()) {
    const cultivo = catalogo.cultivos.find((c) => c.slug === semilla);
    if (!cultivo) continue;
    const yaTiene = await db("cultivo_imagenes")
      .where({ cultivo_id: cultivo.id })
      .first();
    if (yaTiene) continue;
    const buffer = await imagenDemo({
      ancho: 1600,
      alto: 1000,
      titulo: cultivo.slug.toUpperCase(),
      semilla: indice,
    });
    const imagen = await asegurarImagen({
      buffer,
      alt: `Cultivo de ${semilla} en la sierra del Perú`,
      usuarioId: ids.editor,
      semilla: indice,
    });
    await db("cultivo_imagenes").insert({
      cultivo_id: cultivo.id,
      archivo_id: imagen.id,
      orden: 0,
    });
    imagenesCultivo += 1;
  }

  // Imágenes de los artículos. Si el archivo ya existe (ejecución repetida),
  // se reutiliza en lugar de generar otro binario.
  const imagenesArticulo = [];
  for (const [indice, articulo] of ARTICULOS.entries()) {
    const alt = `Ilustración para el artículo «${articulo.titulo}»`;
    const yaExiste = await db("archivos")
      .where({ autor_id: ids.editor, texto_alternativo: alt })
      .first();
    if (yaExiste) {
      imagenesArticulo.push({ id: Number(yaExiste.id) });
      continue;
    }
    const buffer = await imagenDemo({
      ancho: 1400,
      alto: 933,
      titulo: "SIEMBRA ANDINA",
      semilla: indice + 1,
    });
    const imagen = await asegurarImagen({
      buffer,
      alt,
      usuarioId: ids.editor,
      semilla: indice,
    });
    imagenesArticulo.push(imagen);
  }

  let articulosCreados = 0;
  for (const [indice, articulo] of ARTICULOS.entries()) {
    const resultado = await asegurarArticulo(articulo, ids.editor, [
      imagenesArticulo[indice].id,
    ]);
    if (resultado.creado) articulosCreados += 1;
  }

  const distritoChinchero = await db("distritos")
    .where({ nombre: "Chinchero" })
    .first();
  const cultivoPapa = catalogo.cultivos.find((c) => c.slug === "papa");
  if (distritoChinchero && cultivoPapa) {
    await asegurarConsulta(
      ids.agricultora,
      ids.tecnico,
      distritoChinchero.id,
      cultivoPapa.id,
    );
  }
  await asegurarAviso(ids.tecnico, zonas.puna);

  const resumen = {
    usuarios: USUARIOS.length,
    parcelas: PARCELAS.length,
    lecturas,
    articulos: articulosCreados,
    imagenesCultivo,
  };
  console.log("Demo lista para presentar:", resumen);
  console.log("Cuentas (contraseña: Demo2026!siembra):");
  for (const usuario of USUARIOS) {
    console.log(`  ${usuario.rol.padEnd(14)} ${usuario.email}`);
  }
}

principal()
  .catch((error) => {
    logger.error({ err: error }, "No se pudo preparar la demo");
    process.exitCode = 1;
  })
  .finally(() => cerrarConexion());
