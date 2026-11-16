const { db } = require("../../config/db");
const {
  insertarYDevolverId,
  operadorBusqueda,
} = require("../../utils/baseDatos");

function entero(fila) {
  return Number(fila && fila.total ? fila.total : 0);
}

async function indicadores() {
  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);
  const [usuarios, parcelas, lecturas, consultas, porRol] = await Promise.all([
    db("usuarios").where({ activo: true }).whereNull("deleted_at").count({ total: "id" }).first(),
    db("parcelas").whereNull("deleted_at").count({ total: "id" }).first(),
    db("lecturas").where("fecha", ">=", inicioMes).count({ total: "id" }).first(),
    db("consultas as c")
      .join("estados_consulta as e", "e.id", "c.estado_id")
      .where("e.clave", "abierta")
      .count({ total: "c.id" })
      .first(),
    db("usuario_roles as ur")
      .join("roles as r", "r.id", "ur.rol_id")
      .join("usuarios as u", "u.id", "ur.usuario_id")
      .where({ "u.activo": true })
      .whereNull("u.deleted_at")
      .groupBy("r.clave", "r.nombre")
      .select("r.clave", "r.nombre")
      .countDistinct({ total: "u.id" }),
  ]);
  return {
    usuariosActivos: entero(usuarios),
    parcelas: entero(parcelas),
    lecturasMes: entero(lecturas),
    consultasPendientes: entero(consultas),
    usuariosPorRol: porRol.map((fila) => ({ ...fila, total: Number(fila.total) })),
  };
}

async function listarUsuarios({
  busqueda = "",
  rol = "",
  activo = "",
  orden = "creado_en",
  direccion = "desc",
  pagina = 1,
  limite = 20,
}) {
  const ordenes = {
    creado_en: "u.created_at",
    email: "u.email",
    nombre: "p.nombre",
    activo: "u.activo",
  };
  const consulta = db("usuarios as u")
    .leftJoin("perfiles as p", "p.usuario_id", "u.id")
    .whereNull("u.deleted_at");
  if (busqueda) {
    consulta.andWhere((q) =>
      q
        .where("p.nombre", operadorBusqueda(), `%${busqueda}%`)
        .orWhere("u.email", operadorBusqueda(), `%${busqueda}%`),
    );
  }
  if (activo !== "") consulta.andWhere("u.activo", activo === "1");
  if (rol) {
    consulta.whereExists(
      db("usuario_roles as ur")
        .join("roles as r", "r.id", "ur.rol_id")
        .select("ur.id")
        .whereColumn("ur.usuario_id", "u.id")
        .andWhere("r.clave", rol),
    );
  }
  const cuenta = await consulta.clone().countDistinct({ total: "u.id" }).first();
  const usuarios = await consulta
    .clone()
    .select(
      "u.id",
      "u.email",
      "u.activo",
      "u.email_verificado_en",
      "u.created_at as creado_en",
      "p.nombre",
    )
    .orderBy(ordenes[orden] || ordenes.creado_en, direccion === "asc" ? "asc" : "desc")
    .orderBy("u.id", "desc")
    .distinct()
    .limit(limite)
    .offset((pagina - 1) * limite);
  const ids = usuarios.map((usuario) => usuario.id);
  const asignaciones = ids.length
    ? await db("usuario_roles as ur")
        .join("roles as r", "r.id", "ur.rol_id")
        .select("ur.usuario_id", "ur.es_principal", "r.id as rol_id", "r.clave", "r.nombre")
        .whereIn("ur.usuario_id", ids)
        .orderBy("ur.es_principal", "desc")
        .orderBy("r.nombre")
    : [];
  const rolesPorUsuario = new Map();
  for (const asignacion of asignaciones) {
    const roles = rolesPorUsuario.get(Number(asignacion.usuario_id)) || [];
    roles.push(asignacion);
    rolesPorUsuario.set(Number(asignacion.usuario_id), roles);
  }
  return {
    usuarios: usuarios.map((usuario) => ({
      ...usuario,
      activo: Boolean(usuario.activo),
      email_verificado: Boolean(usuario.email_verificado_en),
      roles: rolesPorUsuario.get(Number(usuario.id)) || [],
    })),
    total: entero(cuenta),
  };
}

async function quitarRol(usuarioId, rolId, adminId) {
  return db.transaction(async (trx) => {
    const rol = await trx("roles").where({ id: rolId }).forUpdate().first();
    const asignacion = await trx("usuario_roles")
      .where({ usuario_id: usuarioId, rol_id: rolId })
      .forUpdate()
      .first();
    if (!asignacion) return false;
    if (rol && rol.clave === "administrador") {
      const activos = await trx("usuario_roles as ur")
        .join("usuarios as u", "u.id", "ur.usuario_id")
        .where("ur.rol_id", rolId)
        .andWhere("u.activo", true)
        .whereNull("u.deleted_at")
        .countDistinct({ total: "u.id" })
        .first();
      if (Number(activos.total) <= 1) {
        const error = new Error(
          Number(usuarioId) === Number(adminId)
            ? "No puedes quitarte el rol del último administrador."
            : "No puedes quitar el rol del último administrador activo.",
        );
        error.code = "ULTIMO_ADMINISTRADOR";
        throw error;
      }
    }

    await trx("usuario_roles").where({ id: asignacion.id }).del();
    const restantes = await trx("usuario_roles")
      .where({ usuario_id: usuarioId })
      .orderBy("es_principal", "desc")
      .orderBy("id")
      .select("id");
    if (!restantes.length) {
      const error = new Error("Cada cuenta debe conservar al menos un rol.");
      error.code = "ROL_REQUERIDO";
      throw error;
    }
    if (asignacion.es_principal) {
      await trx("usuario_roles").where({ usuario_id: usuarioId }).update({
        es_principal: false,
        updated_at: trx.fn.now(),
      });
      await trx("usuario_roles").where({ id: restantes[0].id }).update({
        es_principal: true,
        updated_at: trx.fn.now(),
      });
    }
    return true;
  });
}

async function panelCatalogos() {
  const [
    cultivos,
    variedades,
    relacionesVariedad,
    zonas,
    requerimientos,
    calendario,
    departamentos,
    provincias,
    distritos,
    comunidades,
  ] = await Promise.all([
    db("cultivos").select("id", "nombre", "slug", "descripcion", "activo").orderBy("nombre"),
    db("variedades").select("id", "nombre", "slug", "descripcion", "activa").orderBy("nombre"),
    db("cultivo_variedades as cv")
      .join("cultivos as c", "c.id", "cv.cultivo_id")
      .join("variedades as v", "v.id", "cv.variedad_id")
      .select("cv.id", "cv.cultivo_id", "cv.variedad_id", "c.nombre as cultivo", "v.nombre as variedad"),
    db("zonas_altitudinales").select("id", "clave", "nombre", "orden", "altitud_min_m", "altitud_max_m").orderBy("orden"),
    db("cultivo_requerimientos as cr")
      .join("cultivos as c", "c.id", "cr.cultivo_id")
      .join("zonas_altitudinales as z", "z.id", "cr.zona_id")
      .select("cr.*", "c.nombre as cultivo", "z.nombre as zona"),
    db("calendario_tradicional as ct")
      .join("cultivos as c", "c.id", "ct.cultivo_id")
      .join("zonas_altitudinales as z", "z.id", "ct.zona_id")
      .select("ct.*", "c.nombre as cultivo", "z.nombre as zona"),
    db("departamentos").select("id", "codigo", "nombre").orderBy("nombre"),
    db("provincias as p").join("departamentos as d", "d.id", "p.departamento_id").select("p.id", "p.departamento_id", "p.nombre", "d.nombre as departamento").orderBy("d.nombre").orderBy("p.nombre"),
    db("distritos as di").join("provincias as p", "p.id", "di.provincia_id").join("departamentos as d", "d.id", "p.departamento_id").select("di.id", "di.provincia_id", "di.nombre", "p.nombre as provincia", "d.nombre as departamento").orderBy("d.nombre").orderBy("p.nombre").orderBy("di.nombre"),
    db("comunidades as c").join("distritos as d", "d.id", "c.distrito_id").select("c.id", "c.distrito_id", "c.nombre", "c.latitud", "c.longitud", "d.nombre as distrito").orderBy("c.nombre"),
  ]);
  return {
    cultivos, variedades, relacionesVariedad, zonas, requerimientos, calendario,
    departamentos, provincias, distritos, comunidades,
  };
}

function consultaCatalogo(tipo) {
  const consultas = {
    cultivo: db("cultivos").select("id", "nombre", "slug", "descripcion", "activo"),
    variedad: db("variedades").select("id", "nombre", "slug", "descripcion", "activa"),
    zona: db("zonas_altitudinales").select("id", "clave", "nombre", "orden", "altitud_min_m", "altitud_max_m"),
    requerimiento: db("cultivo_requerimientos as cr")
      .join("cultivos as c", "c.id", "cr.cultivo_id")
      .join("zonas_altitudinales as z", "z.id", "cr.zona_id")
      .select("cr.id", "cr.cultivo_id", "cr.zona_id", "cr.hum_min", "cr.hum_max", "cr.temp_min", "cr.temp_max", "cr.fuente", "cr.validado", "c.nombre as cultivo", "z.nombre as zona"),
    calendario: db("calendario_tradicional as ct")
      .join("cultivos as c", "c.id", "ct.cultivo_id")
      .join("zonas_altitudinales as z", "z.id", "ct.zona_id")
      .select("ct.id", "ct.cultivo_id", "ct.zona_id", "ct.mes_inicio", "ct.mes_fin", "ct.fuente", "ct.validado", "c.nombre as cultivo", "z.nombre as zona"),
    departamento: db("departamentos").select("id", "codigo", "nombre"),
    provincia: db("provincias as p").join("departamentos as d", "d.id", "p.departamento_id").select("p.id", "p.departamento_id", "p.nombre", "d.nombre as departamento"),
    distrito: db("distritos as di").join("provincias as p", "p.id", "di.provincia_id").join("departamentos as d", "d.id", "p.departamento_id").select("di.id", "di.provincia_id", "di.nombre", "p.nombre as provincia", "d.nombre as departamento"),
    comunidad: db("comunidades as c").join("distritos as d", "d.id", "c.distrito_id").select("c.id", "c.distrito_id", "c.nombre", "c.latitud", "c.longitud", "d.nombre as distrito"),
  };
  return consultas[tipo] || null;
}

async function listarCatalogo(tipo, {
  busqueda = "",
  pagina = 1,
  limite = 20,
  orden = "nombre",
  direccion = "asc",
} = {}) {
  const consulta = consultaCatalogo(tipo);
  if (!consulta) return null;
  const campos = {
    cultivo: ["nombre", "slug"],
    variedad: ["nombre", "slug"],
    zona: ["clave", "nombre"],
    requerimiento: ["c.nombre", "z.nombre"],
    calendario: ["c.nombre", "z.nombre"],
    departamento: ["codigo", "nombre"],
    provincia: ["p.nombre", "d.nombre"],
    distrito: ["di.nombre", "p.nombre", "d.nombre"],
    comunidad: ["c.nombre", "d.nombre"],
  }[tipo];
  if (busqueda) {
    consulta.andWhere((q) => {
      campos.forEach((campo, indice) => {
        if (indice === 0)
          q.where(campo, operadorBusqueda(), `%${busqueda}%`);
        else q.orWhere(campo, operadorBusqueda(), `%${busqueda}%`);
      });
    });
  }
  const clavePrimaria = {
    cultivo: "cultivos.id",
    variedad: "variedades.id",
    zona: "zonas_altitudinales.id",
    requerimiento: "cr.id",
    calendario: "ct.id",
    departamento: "departamentos.id",
    provincia: "p.id",
    distrito: "di.id",
    comunidad: "c.id",
  }[tipo];
  const cuenta = await consulta
    .clone()
    .clearSelect()
    .clearOrder()
    .countDistinct({ total: clavePrimaria })
    .first();
  const ordenes = {
    cultivo: { id: "cultivos.id", nombre: "cultivos.nombre" },
    variedad: { id: "variedades.id", nombre: "variedades.nombre" },
    zona: { id: "zonas_altitudinales.id", nombre: "zonas_altitudinales.nombre" },
    requerimiento: { id: "cr.id", nombre: "c.nombre" },
    calendario: { id: "ct.id", nombre: "c.nombre" },
    departamento: { id: "departamentos.id", nombre: "departamentos.nombre" },
    provincia: { id: "p.id", nombre: "p.nombre" },
    distrito: { id: "di.id", nombre: "di.nombre" },
    comunidad: { id: "c.id", nombre: "c.nombre" },
  }[tipo];
  const rows = await consulta
    .orderBy(ordenes[orden] || ordenes.nombre, direccion === "desc" ? "desc" : "asc")
    .orderBy(clavePrimaria, "asc")
    .limit(limite)
    .offset((pagina - 1) * limite);
  return { rows, total: entero(cuenta) };
}

function opcionesCatalogo() {
  return Promise.all([
    db("cultivos").select("id", "nombre").orderBy("nombre"),
    db("zonas_altitudinales").select("id", "nombre").orderBy("orden"),
    db("departamentos").select("id", "nombre").orderBy("nombre"),
  ]).then(([cultivos, zonas, departamentos]) => ({
    cultivos,
    zonas,
    departamentos,
  }));
}

async function guardarCatalogo(tipo, id, entrada) {
  const fecha = { updated_at: db.fn.now() };
  const tablas = {
    cultivo: {
      tabla: "cultivos",
      valores: {
        nombre: entrada.nombre,
        slug: entrada.slug,
        descripcion: entrada.descripcion || null,
        activo: entrada.activo !== "0",
      },
    },
    variedad: {
      tabla: "variedades",
      valores: {
        nombre: entrada.nombre,
        slug: entrada.slug,
        descripcion: entrada.descripcion || null,
        activa: entrada.activa !== "0",
      },
    },
    zona: {
      tabla: "zonas_altitudinales",
      valores: {
        clave: entrada.clave,
        nombre: entrada.nombre,
        orden: Number(entrada.orden),
        altitud_min_m: Number(entrada.altitud_min_m),
        altitud_max_m: Number(entrada.altitud_max_m),
      },
    },
    requerimiento: {
      tabla: "cultivo_requerimientos",
      valores: {
        cultivo_id: Number(entrada.cultivo_id),
        zona_id: Number(entrada.zona_id),
        hum_min: Number(entrada.hum_min),
        hum_max: Number(entrada.hum_max),
        temp_min: Number(entrada.temp_min),
        temp_max: Number(entrada.temp_max),
        fuente: entrada.fuente || null,
        validado: entrada.validado === "1",
        validado_por: entrada.validado === "1" ? Number(entrada.validado_por) || null : null,
        validado_en: entrada.validado === "1" ? db.fn.now() : null,
      },
    },
    calendario: {
      tabla: "calendario_tradicional",
      valores: {
        cultivo_id: Number(entrada.cultivo_id),
        zona_id: Number(entrada.zona_id),
        mes_inicio: Number(entrada.mes_inicio),
        mes_fin: Number(entrada.mes_fin),
        fuente: entrada.fuente || null,
        validado: entrada.validado === "1",
        validado_por: entrada.validado === "1" ? Number(entrada.validado_por) || null : null,
        validado_en: entrada.validado === "1" ? db.fn.now() : null,
      },
    },
    departamento: {
      tabla: "departamentos",
      valores: { codigo: entrada.codigo, nombre: entrada.nombre },
    },
    provincia: {
      tabla: "provincias",
      valores: { departamento_id: Number(entrada.departamento_id), nombre: entrada.nombre },
    },
    distrito: {
      tabla: "distritos",
      valores: { provincia_id: Number(entrada.provincia_id), nombre: entrada.nombre },
    },
    comunidad: {
      tabla: "comunidades",
      valores: {
        distrito_id: Number(entrada.distrito_id),
        nombre: entrada.nombre,
        latitud: entrada.latitud || null,
        longitud: entrada.longitud || null,
      },
    },
  };
  const definicion = tablas[tipo];
  if (!definicion) throw new Error("Tipo de catálogo no permitido.");
  if (id) {
    const filas = await db(definicion.tabla)
      .where({ id: Number(id) })
      .update({ ...definicion.valores, ...fecha });
    if (!filas) return null;
    return Number(id);
  }
  if (tipo === "requerimiento" || tipo === "calendario") {
    const clave = { cultivo_id: definicion.valores.cultivo_id, zona_id: definicion.valores.zona_id };
    const existente = await db(definicion.tabla).where(clave).first();
    if (existente) {
      await db(definicion.tabla).where({ id: existente.id }).update({
        ...definicion.valores,
        ...fecha,
      });
      return existente.id;
    }
  }
  return insertarYDevolverId(definicion.tabla, definicion.valores);
}

async function vincularVariedad(cultivoId, variedadId) {
  const existe = await db("cultivo_variedades")
    .where({ cultivo_id: cultivoId, variedad_id: variedadId })
    .first();
  if (existe) return existe.id;
  return insertarYDevolverId("cultivo_variedades", {
    cultivo_id: cultivoId,
    variedad_id: variedadId,
  });
}

function listarMensajes({
  busqueda = "",
  leido = "",
  pagina = 1,
  limite = 20,
  orden = "fecha",
  direccion = "desc",
}) {
  const consulta = db("mensajes_contacto");
  if (busqueda) {
    consulta.andWhere((q) =>
      q
        .where("nombre", operadorBusqueda(), `%${busqueda}%`)
        .orWhere("email", operadorBusqueda(), `%${busqueda}%`)
        .orWhere("asunto", operadorBusqueda(), `%${busqueda}%`),
    );
  }
  if (leido !== "") consulta.andWhere("leido", leido === "1");
  return consulta.clone().count({ total: "id" }).first().then(async (cuenta) => ({
    mensajes: await consulta
      .select("*")
      .orderBy({
        fecha: "created_at",
        nombre: "nombre",
        asunto: "asunto",
        estado: "leido",
      }[orden] || "created_at", direccion === "asc" ? "asc" : "desc")
      .orderBy("id", "desc")
      .limit(limite)
      .offset((pagina - 1) * limite),
    total: entero(cuenta),
  }));
}

function marcarMensaje(id, adminId, leido) {
  return db("mensajes_contacto").where({ id }).update({
    leido: Boolean(leido),
    atendido_por: leido ? adminId : null,
    updated_at: db.fn.now(),
  });
}

async function configuraciones() {
  return db("configuraciones").select("id", "clave", "valor", "updated_at").orderBy("clave");
}

function guardarConfiguracion(clave, valor) {
  return db("configuraciones")
    .insert({ clave, valor })
    .onConflict("clave")
    .merge({ valor, updated_at: db.fn.now() });
}

module.exports = {
  indicadores,
  listarUsuarios,
  quitarRol,
  panelCatalogos,
  listarCatalogo,
  opcionesCatalogo,
  guardarCatalogo,
  vincularVariedad,
  listarMensajes,
  marcarMensaje,
  configuraciones,
  guardarConfiguracion,
};
