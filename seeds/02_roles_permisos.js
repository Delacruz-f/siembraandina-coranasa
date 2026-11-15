// Datos base de la Fase 2: roles, permisos y su relación.
// Idempotente: se puede ejecutar varias veces sin duplicar.
const ROLES = [
  {
    clave: "agricultor",
    nombre: "Agricultor",
    descripcion:
      "Dueño de parcelas; registra lecturas y concede acceso a técnicos.",
  },
  {
    clave: "tecnico",
    nombre: "Técnico",
    descripcion:
      "Valida requerimientos y calendario; accede a parcelas con permiso.",
  },
  {
    clave: "editor",
    nombre: "Editor",
    descripcion: "Publica contenido de la comunidad.",
  },
  {
    clave: "administrador",
    nombre: "Administrador",
    descripcion: "Gestiona usuarios, roles y solicitudes.",
  },
];

const PERMISOS = [
  { clave: "panel.ver", descripcion: "Ver el panel principal." },
  { clave: "perfil.editar", descripcion: "Editar su perfil personal." },
  { clave: "parcelas.ver", descripcion: "Ver sus propias parcelas." },
  { clave: "parcelas.crear", descripcion: "Crear parcelas." },
  { clave: "parcelas.editar", descripcion: "Editar sus propias parcelas." },
  { clave: "parcelas.eliminar", descripcion: "Eliminar sus propias parcelas." },
  {
    clave: "accesos.gestionar",
    descripcion: "Conceder y revocar acceso de técnicos a sus parcelas.",
  },
  { clave: "lecturas.ver", descripcion: "Ver lecturas de sus parcelas." },
  { clave: "lecturas.crear", descripcion: "Registrar lecturas manuales." },
  { clave: "campanias.gestionar", descripcion: "Gestionar campañas agrícolas." },
  {
    clave: "lecturas.escribir_asignadas",
    descripcion:
      "Registrar lecturas en parcelas donde tiene acceso con escritura.",
  },
  { clave: "solicitudes.crear", descripcion: "Solicitar el rol de técnico." },
  {
    clave: "solicitudes.revisar",
    descripcion: "Aprobar o rechazar solicitudes de rol.",
  },
  {
    clave: "usuarios.gestionar",
    descripcion: "Gestionar usuarios y asignar roles.",
  },
  {
    clave: "usuarios.verificar",
    descripcion: "Reenviar verificación y marcar correos como verificados.",
  },
  {
    clave: "roles.gestionar",
    descripcion: "Crear roles y editar sus permisos.",
  },
  {
    clave: "cultivos.ver",
    descripcion: "Ver cultivos, requerimientos y calendario.",
  },
  {
    clave: "cultivos.validar",
    descripcion: "Corregir y validar requerimientos y calendario.",
  },
  {
    clave: "comunidad.publicar",
    descripcion: "Publicar contenido en la comunidad.",
  },
  {
    clave: "publicaciones.publicar",
    descripcion: "Publicar contenido en la comunidad.",
  },
  {
    clave: "publicaciones.moderar",
    descripcion: "Moderar publicaciones y comentarios.",
  },
  {
    clave: "publicaciones.gestionar",
    descripcion: "Crear, editar y programar artículos.",
  },
  {
    clave: "consultas.responder",
    descripcion: "Responder consultas de la comunidad.",
  },
  {
    clave: "consultas.crear",
    descripcion: "Crear consultas agrícolas para técnicos de la zona.",
  },
  {
    clave: "consultas.calificar",
    descripcion: "Calificar la respuesta recibida a una consulta.",
  },
  {
    clave: "comentarios.reportar",
    descripcion: "Reportar comentarios para revisión de moderación.",
  },
  {
    clave: "notificaciones.ver",
    descripcion: "Ver y administrar sus notificaciones.",
  },
  {
    clave: "alertas.gestionar",
    descripcion: "Crear y administrar reglas de alertas.",
  },
  {
    clave: "archivos.gestionar",
    descripcion: "Administrar archivos e imágenes.",
  },
  {
    clave: "auditoria.ver",
    descripcion: "Consultar el registro de auditoría.",
  },
  {
    clave: "avisos.crear",
    descripcion: "Publicar avisos para distritos atendidos.",
  },
  {
    clave: "catalogos.gestionar",
    descripcion: "Administrar catálogos del sistema.",
  },
  {
    clave: "configuraciones.gestionar",
    descripcion: "Editar configuración general.",
  },
  {
    clave: "contacto.gestionar",
    descripcion: "Revisar y gestionar mensajes de contacto.",
  },
  {
    clave: "trabajos.gestionar",
    descripcion: "Consultar y ejecutar trabajos programados.",
  },
];

const PERMISOS_POR_ROL = {
  agricultor: [
    "panel.ver",
    "perfil.editar",
    "parcelas.ver",
    "parcelas.crear",
    "parcelas.editar",
    "parcelas.eliminar",
    "accesos.gestionar",
    "lecturas.ver",
    "lecturas.crear",
    "campanias.gestionar",
    "solicitudes.crear",
    "cultivos.ver",
    "consultas.crear",
    "consultas.calificar",
    "comentarios.reportar",
    "notificaciones.ver",
  ],
  tecnico: [
    "panel.ver",
    "cultivos.ver",
    "cultivos.validar",
    "lecturas.ver",
    "lecturas.escribir_asignadas",
    "consultas.responder",
    "avisos.crear",
    "notificaciones.ver",
  ],
  editor: [
    "panel.ver",
    "comunidad.publicar",
    "publicaciones.publicar",
    "publicaciones.moderar",
    "publicaciones.gestionar",
    "consultas.responder",
    "notificaciones.ver",
    "cultivos.ver",
  ],
  administrador: PERMISOS.map((p) => p.clave),
};

exports.seed = async function seed(knex) {
  // Roles
  for (const rol of ROLES) {
    const existente = await knex("roles").where({ clave: rol.clave }).first();
    if (existente)
      await knex("roles")
        .where({ id: existente.id })
        .update({ ...rol, es_sistema: true, updated_at: knex.fn.now() });
    else await knex("roles").insert({ ...rol, es_sistema: true });
  }

  // Permisos
  for (const permiso of PERMISOS) {
    const existente = await knex("permisos")
      .where({ clave: permiso.clave })
      .first();
    if (existente)
      await knex("permisos")
        .where({ id: existente.id })
        .update({ ...permiso, updated_at: knex.fn.now() });
    else await knex("permisos").insert(permiso);
  }

  // Relación rol → permisos
  const roles = await knex("roles").select("id", "clave");
  const permisos = await knex("permisos").select("id", "clave");
  const idRol = Object.fromEntries(roles.map((r) => [r.clave, r.id]));
  const idPermiso = Object.fromEntries(permisos.map((p) => [p.clave, p.id]));

  for (const [claveRol, claves] of Object.entries(PERMISOS_POR_ROL)) {
    for (const clavePermiso of claves) {
      const fila = {
        rol_id: idRol[claveRol],
        permiso_id: idPermiso[clavePermiso],
      };
      const existente = await knex("rol_permisos").where(fila).first();
      if (!existente) await knex("rol_permisos").insert(fila);
    }
  }
};
