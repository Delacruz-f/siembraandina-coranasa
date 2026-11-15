const solicitudesRepositorio = require("../usuarios/solicitudes.repository");
const solicitudesServicio = require("../usuarios/solicitudes.service");
const usuariosRepositorio = require("../usuarios/usuarios.repository");
const usuariosServicio = require("../usuarios/usuarios.service");
const rolesRepositorio = require("../usuarios/roles.repository");
const gestionRepositorio = require("./gestion.repository");
const auditoria = require("./auditoria.repository");
const trabajosServicio = require("../../jobs/trabajos.service");
const { noEncontrado, solicitudInvalida } = require("../../utils/errores");

const PAGINA_TAMANO = 20;
const CLAVES_CONFIGURACION = new Set([
  "sitio.nombre",
  "sitio.descripcion",
  "contacto.email",
  "soporte.telefono",
]);
const TIPOS_CATALOGO = new Set([
  "cultivo",
  "variedad",
  "zona",
  "requerimiento",
  "calendario",
  "departamento",
  "provincia",
  "distrito",
  "comunidad",
]);
const CAMPOS_CATALOGO = {
  cultivo: [
    ["nombre", "Nombre"],
    ["slug", "Slug"],
    ["descripcion", "Descripción"],
    ["activo", "Activo (1/0)"],
  ],
  variedad: [
    ["nombre", "Nombre"],
    ["slug", "Slug"],
    ["descripcion", "Descripción"],
    ["activa", "Activa (1/0)"],
  ],
  zona: [
    ["clave", "Clave"],
    ["nombre", "Nombre"],
    ["orden", "Orden"],
    ["altitud_min_m", "Altitud mínima"],
    ["altitud_max_m", "Altitud máxima"],
  ],
  requerimiento: [
    ["cultivo_id", "ID del cultivo"],
    ["zona_id", "ID de zona"],
    ["hum_min", "Humedad mínima"],
    ["hum_max", "Humedad máxima"],
    ["temp_min", "Temperatura mínima"],
    ["temp_max", "Temperatura máxima"],
    ["fuente", "Fuente"],
    ["validado", "Validado (1/0)"],
  ],
  calendario: [
    ["cultivo_id", "ID del cultivo"],
    ["zona_id", "ID de zona"],
    ["mes_inicio", "Mes inicial"],
    ["mes_fin", "Mes final"],
    ["fuente", "Fuente"],
    ["validado", "Validado (1/0)"],
  ],
  departamento: [
    ["codigo", "Código UBIGEO (2 dígitos)"],
    ["nombre", "Nombre"],
  ],
  provincia: [
    ["departamento_id", "ID de departamento"],
    ["nombre", "Nombre"],
  ],
  distrito: [
    ["provincia_id", "ID de provincia"],
    ["nombre", "Nombre"],
  ],
  comunidad: [
    ["distrito_id", "ID de distrito"],
    ["nombre", "Nombre"],
    ["latitud", "Latitud"],
    ["longitud", "Longitud"],
  ],
};

async function resumen() {
  const [pendientes, indicadores, totalRoles] = await Promise.all([
    solicitudesRepositorio.listar({ estado: "pendiente" }),
    gestionRepositorio.indicadores(),
    rolesRepositorio.listarRoles(),
  ]);
  return { pendientes, indicadores, roles: totalRoles };
}

function listarSolicitudes(estado) {
  return solicitudesRepositorio.listar({ estado });
}

function aprobarSolicitud(id, revisorId, datos, contexto) {
  return solicitudesServicio.aprobar(id, revisorId, datos, contexto);
}

function rechazarSolicitud(id, revisorId, datos, contexto) {
  return solicitudesServicio.rechazar(id, revisorId, datos, contexto);
}

async function listarUsuarios(filtros = {}) {
  const pagina = Math.max(1, Number(filtros.pagina) || 1);
  const resultado = await gestionRepositorio.listarUsuarios({
    ...filtros,
    pagina,
    limite: PAGINA_TAMANO,
  });
  return {
    ...resultado,
    pagina,
    paginas: Math.max(1, Math.ceil(resultado.total / PAGINA_TAMANO)),
  };
}

async function asignarRol(usuarioId, rolClave, adminId, { ip } = {}) {
  const usuario = await usuariosRepositorio.buscarPorId(usuarioId);
  if (!usuario) throw noEncontrado("No encontramos ese usuario.");
  const rol = await rolesRepositorio.buscarRolPorClave(rolClave);
  if (!rol) throw solicitudInvalida("Ese rol no existe.");
  if (
    ["tecnico", "editor", "administrador"].includes(rol.clave) &&
    !usuario.email_verificado_en
  ) {
    throw solicitudInvalida(
      "El usuario debe verificar su correo antes de recibir este rol.",
    );
  }

  await usuariosRepositorio.cambiarRolPrincipal(usuario.id, rol.id, adminId);
  await auditoria.registrar({
    usuarioId: adminId,
    accion: "rol.asignado",
    entidad: "usuarios",
    entidadId: usuario.id,
    detalle: { rol: rolClave },
    ip,
  });
}

async function quitarRol(usuarioId, rolClave, adminId, { ip } = {}) {
  const usuario = await usuariosRepositorio.buscarPorId(usuarioId);
  if (!usuario) throw noEncontrado("No encontramos ese usuario.");
  const rol = await rolesRepositorio.buscarRolPorClave(rolClave);
  if (!rol) throw noEncontrado("No encontramos ese rol.");
  try {
    const quitado = await gestionRepositorio.quitarRol(
      usuario.id,
      rol.id,
      adminId,
    );
    if (!quitado) throw noEncontrado("El usuario no tiene ese rol asignado.");
  } catch (error) {
    if (error.code === "ULTIMO_ADMINISTRADOR") {
      throw solicitudInvalida(
        "No puedes quitar el rol del último administrador activo.",
      );
    }
    if (error.code === "ROL_REQUERIDO") {
      throw solicitudInvalida("Cada cuenta debe conservar al menos un rol.");
    }
    throw error;
  }
  await auditoria.registrar({
    usuarioId: adminId,
    accion: "rol.retirado",
    entidad: "usuarios",
    entidadId: usuario.id,
    detalle: { rol: rolClave },
    ip,
  });
}

async function cambiarEstado(usuarioId, activo, adminId, { ip } = {}) {
  if (Number(usuarioId) === Number(adminId))
    throw solicitudInvalida("No puedes suspender tu propia cuenta.");
  const usuario = await usuariosRepositorio.buscarPorId(usuarioId);
  if (!usuario) throw noEncontrado("No encontramos ese usuario.");
  await usuariosRepositorio.actualizar(usuario.id, { activo: Boolean(activo) });
  await auditoria.registrar({
    usuarioId: adminId,
    accion: activo ? "usuario.activado" : "usuario.suspendido",
    entidad: "usuarios",
    entidadId: usuario.id,
    ip,
  });
}

async function matrizPermisos() {
  const [roles, permisos, asignados] = await Promise.all([
    rolesRepositorio.listarRoles(),
    rolesRepositorio.listarPermisos(),
    rolesRepositorio.permisosPorRol(),
  ]);
  return { roles, permisos, asignados };
}

async function guardarPermisos(rolClave, claves, adminId, { ip } = {}) {
  const rol = await rolesRepositorio.buscarRolPorClave(rolClave);
  if (!rol) throw noEncontrado("No encontramos ese rol.");
  if (rol.clave === "administrador") {
    throw solicitudInvalida(
      "Los permisos del administrador no se pueden quitar.",
    );
  }
  const permitidos = new Set(
    (await rolesRepositorio.listarPermisos()).map((permiso) => permiso.clave),
  );
  const seleccionados = [...new Set(claves)];
  if (seleccionados.some((clave) => !permitidos.has(clave))) {
    throw solicitudInvalida("La matriz contiene un permiso que no existe.");
  }
  await rolesRepositorio.reemplazarPermisos(rol.id, seleccionados);
  await auditoria.registrar({
    usuarioId: adminId,
    accion: "permisos.actualizados",
    entidad: "roles",
    entidadId: rol.id,
    detalle: { rol: rol.clave, permisos: seleccionados },
    ip,
  });
}

async function crearRol(datos, adminId, { ip } = {}) {
  const clave = String(datos.clave || "")
    .trim()
    .toLowerCase();
  const nombre = String(datos.nombre || "").trim();
  const descripcion = String(datos.descripcion || "").trim();
  if (!/^[a-z][a-z0-9_]{1,39}$/.test(clave)) {
    throw solicitudInvalida(
      "La clave debe tener 2 a 40 caracteres: minúsculas, números o guion bajo.",
    );
  }
  if (nombre.length < 2 || nombre.length > 80 || descripcion.length > 500) {
    throw solicitudInvalida(
      "Revisa el nombre (2–80) y la descripción (máximo 500 caracteres).",
    );
  }
  if (await rolesRepositorio.buscarRolPorClave(clave)) {
    throw solicitudInvalida("Ya existe un rol con esa clave.");
  }
  const permisos = [...new Set([].concat(datos.permisos || []))];
  const permitidos = new Set(
    (await rolesRepositorio.listarPermisos()).map((permiso) => permiso.clave),
  );
  if (permisos.some((permiso) => !permitidos.has(permiso))) {
    throw solicitudInvalida("El rol incluye un permiso desconocido.");
  }
  const rolId = await rolesRepositorio.crearRolConPermisos({
    clave,
    nombre,
    descripcion,
    clavesPermisos: permisos,
  });
  await auditoria.registrar({
    usuarioId: adminId,
    accion: "rol.creado",
    entidad: "roles",
    entidadId: rolId,
    detalle: { clave, permisos },
    ip,
  });
  return rolId;
}

async function listarAuditoria(filtros = {}) {
  const pagina = Math.max(1, Number(filtros.pagina) || 1);
  const resultado = await auditoria.listar({
    ...filtros,
    pagina,
    limite: PAGINA_TAMANO,
  });
  return {
    ...resultado,
    pagina,
    paginas: Math.max(1, Math.ceil(resultado.total / PAGINA_TAMANO)),
  };
}

function valorCsv(valor) {
  let texto = String(valor == null ? "" : valor).replace(/[\r\n]+/g, " ");
  if (/^\s*[=+\-@]/.test(texto)) texto = `'${texto}`;
  return `"${texto.replace(/"/g, '""')}"`;
}

async function exportarAuditoria(filtros = {}) {
  const filas = await auditoria.exportar(filtros);
  const cabeceras = [
    "fecha",
    "usuario",
    "accion",
    "entidad",
    "entidad_id",
    "detalle",
    "ip",
  ];
  const lineas = [cabeceras.join(",")];
  for (const fila of filas) {
    lineas.push(
      [
        fila.fecha,
        fila.usuario_nombre,
        fila.accion,
        fila.entidad,
        fila.entidad_id,
        fila.detalle,
        fila.ip,
      ]
        .map(valorCsv)
        .join(","),
    );
  }
  return `\uFEFF${lineas.join("\r\n")}`;
}

async function catalogos({
  tipo = "cultivo",
  busqueda = "",
  pagina = 1,
  orden = "nombre",
  direccion = "asc",
} = {}) {
  if (!TIPOS_CATALOGO.has(tipo)) tipo = "cultivo";
  const numeroPagina = Math.max(1, Number(pagina) || 1);
  const [resultado, opciones] = await Promise.all([
    gestionRepositorio.listarCatalogo(tipo, {
      busqueda,
      pagina: numeroPagina,
      limite: PAGINA_TAMANO,
      orden,
      direccion,
    }),
    gestionRepositorio.opcionesCatalogo(),
  ]);
  return {
    ...opciones,
    tipo,
    busqueda,
    orden,
    direccion,
    ...resultado,
    campos: CAMPOS_CATALOGO[tipo].map(([clave, nombre]) => ({ clave, nombre })),
    pagina: numeroPagina,
    paginas: Math.max(1, Math.ceil(resultado.total / PAGINA_TAMANO)),
  };
}

async function guardarCatalogo(tipo, id, entrada, adminId, { ip } = {}) {
  if (!TIPOS_CATALOGO.has(tipo))
    throw solicitudInvalida("Catálogo no permitido.");
  const texto = String(entrada.nombre || "").trim();
  if (tipo !== "requerimiento" && tipo !== "calendario" && texto.length < 2) {
    throw solicitudInvalida("El nombre debe tener al menos 2 caracteres.");
  }
  if (["cultivo", "variedad"].includes(tipo)) {
    if (texto.length > 100) {
      throw solicitudInvalida("El nombre no debe superar 100 caracteres.");
    }
    if (String(entrada.descripcion || "").length > 5000) {
      throw solicitudInvalida(
        "La descripción no debe superar 5 000 caracteres.",
      );
    }
  }
  if (["cultivo", "variedad"].includes(tipo)) {
    const slug = String(entrada.slug || "")
      .trim()
      .toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) {
      throw solicitudInvalida(
        "El slug debe usar minúsculas, números y guiones.",
      );
    }
  }
  if (tipo === "zona") {
    if (!/^[a-z0-9_-]{2,40}$/.test(entrada.clave || "")) {
      throw solicitudInvalida("La clave de zona no es válida.");
    }
    const minimo = Number(entrada.altitud_min_m);
    const maximo = Number(entrada.altitud_max_m);
    if (
      !Number.isInteger(minimo) ||
      !Number.isInteger(maximo) ||
      minimo < 0 ||
      maximo <= minimo
    ) {
      throw solicitudInvalida(
        "El rango de altitud debe ser entero y creciente.",
      );
    }
  }
  if (tipo === "requerimiento") {
    const rangos = [
      [Number(entrada.hum_min), 0, 100],
      [Number(entrada.hum_max), 0, 100],
      [Number(entrada.temp_min), -30, 60],
      [Number(entrada.temp_max), -30, 60],
    ];
    if (
      rangos.some(
        ([valor, min, max]) =>
          !Number.isFinite(valor) || valor < min || valor > max,
      ) ||
      Number(entrada.hum_min) > Number(entrada.hum_max) ||
      Number(entrada.temp_min) > Number(entrada.temp_max)
    ) {
      throw solicitudInvalida(
        "Los rangos de humedad o temperatura no son válidos.",
      );
    }
  }
  if (
    tipo === "calendario" &&
    [entrada.mes_inicio, entrada.mes_fin].some(
      (mes) =>
        !Number.isInteger(Number(mes)) || Number(mes) < 1 || Number(mes) > 12,
    )
  ) {
    throw solicitudInvalida(
      "Los meses deben estar entre enero (1) y diciembre (12).",
    );
  }
  if (tipo === "departamento" && !/^[0-9]{2}$/.test(entrada.codigo || "")) {
    throw solicitudInvalida(
      "El código del departamento debe tener dos dígitos.",
    );
  }
  if (
    [
      "provincia",
      "distrito",
      "comunidad",
      "requerimiento",
      "calendario",
    ].includes(tipo)
  ) {
    const camposNumericos = {
      provincia: ["departamento_id"],
      distrito: ["provincia_id"],
      comunidad: ["distrito_id"],
      requerimiento: ["cultivo_id", "zona_id"],
      calendario: ["cultivo_id", "zona_id"],
    }[tipo];
    if (
      camposNumericos.some(
        (campo) =>
          !Number.isInteger(Number(entrada[campo])) ||
          Number(entrada[campo]) < 1,
      )
    ) {
      throw solicitudInvalida(
        "Completa los identificadores relacionados con valores enteros válidos.",
      );
    }
  }
  if (
    tipo === "zona" &&
    (!Number.isInteger(Number(entrada.orden)) || Number(entrada.orden) < 1)
  ) {
    throw solicitudInvalida("El orden de la zona debe ser un entero positivo.");
  }
  if (tipo === "comunidad") {
    for (const campo of ["latitud", "longitud"]) {
      if (entrada[campo] && !Number.isFinite(Number(entrada[campo]))) {
        throw solicitudInvalida("Las coordenadas deben ser valores numéricos.");
      }
    }
    if (
      entrada.latitud &&
      (Number(entrada.latitud) < -90 || Number(entrada.latitud) > 90)
    ) {
      throw solicitudInvalida("La latitud debe estar entre -90 y 90.");
    }
    if (
      entrada.longitud &&
      (Number(entrada.longitud) < -180 || Number(entrada.longitud) > 180)
    ) {
      throw solicitudInvalida("La longitud debe estar entre -180 y 180.");
    }
  }
  if (
    ["comunidad", "departamento", "provincia", "distrito"].includes(tipo) &&
    texto.length > 120
  ) {
    throw solicitudInvalida("El nombre no debe superar 120 caracteres.");
  }

  const idGuardado = await gestionRepositorio.guardarCatalogo(
    tipo,
    id ? Number(id) : null,
    { ...entrada, nombre: texto },
  );
  if (!idGuardado)
    throw noEncontrado("No encontramos ese registro de catálogo.");
  await auditoria.registrar({
    usuarioId: adminId,
    accion: id ? "catalogo.actualizado" : "catalogo.creado",
    entidad: tipo,
    entidadId: idGuardado,
    detalle: { nombre: texto },
    ip,
  });
}

async function vincularVariedad(cultivoId, variedadId, adminId, { ip } = {}) {
  const relacionId = await gestionRepositorio.vincularVariedad(
    Number(cultivoId),
    Number(variedadId),
  );
  await auditoria.registrar({
    usuarioId: adminId,
    accion: "cultivo_variedad.vinculada",
    entidad: "cultivo_variedades",
    entidadId: relacionId,
    detalle: { cultivoId: Number(cultivoId), variedadId: Number(variedadId) },
    ip,
  });
}

async function listarMensajes(filtros = {}) {
  const pagina = Math.max(1, Number(filtros.pagina) || 1);
  const resultado = await gestionRepositorio.listarMensajes({
    ...filtros,
    pagina,
    limite: PAGINA_TAMANO,
  });
  return {
    ...resultado,
    pagina,
    paginas: Math.max(1, Math.ceil(resultado.total / PAGINA_TAMANO)),
  };
}

async function marcarMensaje(id, adminId, leido, { ip } = {}) {
  const actualizado = await gestionRepositorio.marcarMensaje(
    id,
    adminId,
    leido,
  );
  if (!actualizado)
    throw noEncontrado("No encontramos ese mensaje de contacto.");
  await auditoria.registrar({
    usuarioId: adminId,
    accion: leido ? "contacto.leido" : "contacto.reabierto",
    entidad: "mensajes_contacto",
    entidadId: id,
    ip,
  });
}

async function listarConfiguraciones() {
  return gestionRepositorio.configuraciones();
}

async function guardarConfiguracion(clave, valor, adminId, { ip } = {}) {
  if (!CLAVES_CONFIGURACION.has(clave)) {
    throw solicitudInvalida(
      "Esa clave de configuración no se puede modificar.",
    );
  }
  const contenido = String(valor || "").trim();
  if (!contenido || contenido.length > 1000) {
    throw solicitudInvalida("El valor debe tener entre 1 y 1 000 caracteres.");
  }
  if (
    clave === "contacto.email" &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contenido)
  ) {
    throw solicitudInvalida("Escribe un correo de contacto válido.");
  }
  await gestionRepositorio.guardarConfiguracion(clave, contenido);
  await auditoria.registrar({
    usuarioId: adminId,
    accion: "configuracion.actualizada",
    entidad: "configuraciones",
    detalle: { clave },
    ip,
  });
}

function listarTrabajos() {
  return trabajosServicio.listarEstados();
}

function ejecutarTrabajo(clave, adminId, { ip } = {}) {
  return trabajosServicio.ejecutarManualmente(clave, adminId, { ip });
}

function reenviarVerificacionUsuario(usuarioId, adminId, contexto = {}) {
  return usuariosServicio.reenviarVerificacionAdmin(usuarioId, {
    ...contexto,
    actorId: adminId,
  });
}

function marcarCorreoVerificadoUsuario(usuarioId, adminId, contexto = {}) {
  return usuariosServicio.marcarCorreoVerificadoAdmin(usuarioId, {
    ...contexto,
    actorId: adminId,
  });
}

module.exports = {
  resumen,
  listarSolicitudes,
  aprobarSolicitud,
  rechazarSolicitud,
  listarUsuarios,
  asignarRol,
  quitarRol,
  cambiarEstado,
  matrizPermisos,
  guardarPermisos,
  crearRol,
  listarAuditoria,
  exportarAuditoria,
  catalogos,
  guardarCatalogo,
  vincularVariedad,
  listarMensajes,
  marcarMensaje,
  listarConfiguraciones,
  guardarConfiguracion,
  listarTrabajos,
  ejecutarTrabajo,
  reenviarVerificacionUsuario,
  marcarCorreoVerificadoUsuario,
};
