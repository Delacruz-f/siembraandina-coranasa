// Servicio de parcelas: reglas de negocio del agricultor y de los accesos
// que concede a los técnicos.
const repositorio = require("./parcelas.repository");
const cultivosRepositorio = require("../cultivos/cultivos.repository");
const ubicacionesRepositorio = require("../publico/publico.repository");
const usuariosRepositorio = require("../usuarios/usuarios.repository");
const archivosServicio = require("../usuarios/archivos.service");
const auditoria = require("../admin/auditoria.repository");
const logger = require("../../config/logger");
const {
  noEncontrado,
  solicitudInvalida,
} = require("../../utils/errores");

/** Datos para los formularios (cultivos y zonas). */
async function catalogos(distritoId) {
  const [cultivos, zonas, departamentos] = await Promise.all([
    cultivosRepositorio.listarCultivos(),
    cultivosRepositorio.listarZonas(),
    ubicacionesRepositorio.listarDepartamentos(),
  ]);
  let distrito = null;
  let provincia = null;
  let departamento = null;
  let provincias = [];
  let distritos = [];
  if (distritoId) {
    distrito = await ubicacionesRepositorio.buscarDistrito(Number(distritoId));
    if (distrito) {
      provincia = { id: distrito.provincia_id, nombre: distrito.provincia };
      departamento = {
        id: distrito.departamento_id,
        nombre: distrito.departamento,
      };
      [provincias, distritos] = await Promise.all([
        ubicacionesRepositorio.listarProvincias(departamento.id),
        ubicacionesRepositorio.listarDistritos(provincia.id),
      ]);
    }
  }
  return {
    cultivos,
    zonas,
    departamentos,
    provincias,
    distritos,
    distrito,
    provincia,
    departamento,
  };
}

function zonaSugerida(altitud, zonas) {
  const metros = Number(altitud);
  if (!Number.isFinite(metros)) return null;
  return (
    zonas.find((zona, indice) => {
      const minimo = Number(zona.altitud_min_m);
      const maximo = Number(zona.altitud_max_m);
      const esUltima = indice === zonas.length - 1;
      return metros >= minimo && (metros < maximo || (esUltima && metros <= maximo));
    }) || null
  );
}

function listar(usuarioId) {
  return repositorio.listarDeUsuario(usuarioId);
}

/** Parcela del usuario o error 404 (no se revela que existe si es de otro). */
async function obtenerDelUsuario(id, usuarioId) {
  const parcela = await repositorio.buscarDeUsuario(id, usuarioId);
  if (!parcela) throw noEncontrado("No encontramos esa parcela.");
  return parcela;
}

/** Valida y normaliza los datos de una parcela. */
async function validarDatos(datos) {
  const cultivo = await cultivosRepositorio.buscarCultivo(
    Number(datos.cultivo_id),
  );
  if (!cultivo) throw solicitudInvalida("Elige un cultivo válido.");
  const ubicacion = await ubicacionesRepositorio.buscarDistrito(
    Number(datos.distrito_id),
  );
  if (!ubicacion) throw solicitudInvalida("Elige un distrito válido.");

  const zonas = await cultivosRepositorio.listarZonas();
  const altitud = datos.altitud_m ? Number(datos.altitud_m) : null;
  const zona =
    (altitud !== null && zonaSugerida(altitud, zonas)) ||
    zonas.find((fila) => fila.id === Number(datos.zona_id));
  if (!zona) throw solicitudInvalida("Elige una zona válida.");

  const latitud = Number(datos.latitud);
  const longitud = Number(datos.longitud);
  if (!Number.isFinite(latitud) || latitud < -90 || latitud > 90)
    throw solicitudInvalida("La latitud debe estar entre -90 y 90.");
  if (!Number.isFinite(longitud) || longitud < -180 || longitud > 180)
    throw solicitudInvalida("La longitud debe estar entre -180 y 180.");

  return {
    cultivo_id: cultivo.id,
    zona_id: zona.id,
    distrito_id: ubicacion.id,
    nombre: datos.nombre.trim(),
    latitud,
    longitud,
    altitud_m: altitud,
    area_hectareas: datos.area_hectareas ? Number(datos.area_hectareas) : null,
    notas: datos.notas ? datos.notas.trim() : null,
  };
}

async function crear(usuarioId, datos, { ip } = {}) {
  const limpios = await validarDatos(datos);
  const id = await repositorio.crear({ ...limpios, usuario_id: usuarioId });
  await auditoria.registrar({
    usuarioId,
    accion: "parcela.creada",
    entidad: "parcelas",
    entidadId: id,
    detalle: { nombre: limpios.nombre },
    ip,
  });
  return id;
}

async function actualizar(id, usuarioId, datos, { ip } = {}) {
  await obtenerDelUsuario(id, usuarioId);
  const limpios = await validarDatos(datos);
  await repositorio.actualizar(id, limpios);
  await auditoria.registrar({
    usuarioId,
    accion: "parcela.actualizada",
    entidad: "parcelas",
    entidadId: id,
    ip,
  });
}

async function eliminar(id, usuarioId, { ip } = {}) {
  await obtenerDelUsuario(id, usuarioId);
  await repositorio.eliminar(id);
  await auditoria.registrar({
    usuarioId,
    accion: "parcela.eliminada",
    entidad: "parcelas",
    entidadId: id,
    ip,
  });
}

async function listarImagenes(parcelaId, usuarioId) {
  await obtenerDelUsuario(parcelaId, usuarioId);
  const filas = await repositorio.listarImagenesDeUsuario(parcelaId, usuarioId);
  return agruparImagenes(filas);
}

/** Agrupa las filas (una por variante) en imágenes para las galerías. */
function agruparImagenes(filas) {
  const porArchivo = new Map();
  for (const fila of filas) {
    const id = Number(fila.id);
    if (!porArchivo.has(id)) {
      const ancho = fila.ancho === null ? null : Number(fila.ancho);
      const alto = fila.alto === null ? null : Number(fila.alto);
      porArchivo.set(id, {
        id,
        alt: fila.texto_alternativo || "",
        ancho,
        alto,
        variantes: [],
        bajaResolucion: false,
        proporcion: ancho && alto ? `${ancho} / ${alto}` : "3 / 2",
      });
    }
    if (fila.variante_ancho === null || fila.variante_ancho === undefined) continue;
    porArchivo.get(id).variantes.push({
      ancho: Number(fila.variante_ancho),
      anchoPx: Number(fila.ancho_px),
      altoPx: Number(fila.alto_px),
      ruta_webp: fila.ruta_webp,
      ruta_jpg: fila.ruta_jpg,
    });
  }
  for (const imagen of porArchivo.values()) {
    imagen.bajaResolucion =
      imagen.variantes.length > 0 && imagen.variantes[0].anchoPx < 800;
  }
  return [...porArchivo.values()];
}

async function guardarImagenes(
  parcelaId,
  usuarioId,
  archivos,
  textosAlternativos,
  { ip } = {},
) {
  await obtenerDelUsuario(parcelaId, usuarioId);
  if (!archivos || !archivos.length || archivos.length > 5) {
    throw solicitudInvalida("Selecciona entre 1 y 5 imágenes por envío.");
  }
  const textos = Array.isArray(textosAlternativos)
    ? textosAlternativos
    : [textosAlternativos];
  if (
    textos.length !== archivos.length ||
    textos.some(
      (texto) =>
        typeof texto !== "string" ||
        !texto.trim() ||
        texto.trim().length > 255,
    )
  ) {
    throw solicitudInvalida(
      "Escribe un texto alternativo de hasta 255 caracteres para cada imagen.",
    );
  }

  const guardados = [];
  try {
    for (let indice = 0; indice < archivos.length; indice += 1) {
      const archivo = await archivosServicio.guardarImagen(
        archivos[indice],
        usuarioId,
        textos[indice],
      );
      guardados.push(archivo.id);
    }
    await repositorio.asociarImagenes(parcelaId, guardados);
  } catch (error) {
    for (const archivoId of guardados) {
      try {
        await archivosServicio.eliminarPropio(archivoId, usuarioId);
      } catch (errorLimpieza) {
        logger.error(
          { err: errorLimpieza, archivoId, parcelaId },
          "No se pudo limpiar una imagen tras fallar su asociación",
        );
      }
    }
    throw error;
  }
  await auditoria.registrar({
    usuarioId,
    accion: "imagenes_parcela.subidas",
    entidad: "parcelas",
    entidadId: Number(parcelaId),
    detalle: { cantidad: guardados.length },
    ip,
  });
}

async function eliminarImagen(parcelaId, archivoId, usuarioId, { ip } = {}) {
  await obtenerDelUsuario(parcelaId, usuarioId);
  const archivo = await repositorio.buscarImagenDeUsuario(
    parcelaId,
    archivoId,
    usuarioId,
  );
  if (!archivo) throw noEncontrado("No encontramos esa imagen.");
  if (Number(archivo.autor_id) !== Number(usuarioId)) {
    throw noEncontrado("No encontramos esa imagen.");
  }
  await repositorio.quitarImagen(parcelaId, archivoId);
  await archivosServicio.eliminarPropio(archivoId, usuarioId);
  await auditoria.registrar({
    usuarioId,
    accion: "imagen_parcela.eliminada",
    entidad: "parcelas",
    entidadId: Number(parcelaId),
    detalle: { archivo_id: Number(archivoId) },
    ip,
  });
}

/** Concede acceso a un técnico (solo el dueño de la parcela). */
async function concederAcceso(
  parcelaId,
  usuarioId,
  { tecnico_id: tecnicoId, puede_escribir: puedeEscribir },
  { ip } = {},
) {
  await obtenerDelUsuario(parcelaId, usuarioId);
  const tecnico = await usuariosRepositorio.buscarPorId(Number(tecnicoId));
  if (!tecnico) throw solicitudInvalida("Elige un técnico válido.");
  const roles = await usuariosRepositorio.rolesDeUsuario(tecnico.id);
  if (!roles.includes("tecnico"))
    throw solicitudInvalida("Ese usuario no tiene el rol de técnico.");

  const vigente = await repositorio.accesoVigente(parcelaId, tecnico.id);
  if (vigente)
    throw solicitudInvalida("Ese técnico ya tiene acceso a esta parcela.");

  const id = await repositorio.crearAcceso({
    parcela_id: parcelaId,
    tecnico_id: tecnico.id,
    puede_escribir: Boolean(puedeEscribir),
    otorgado_por: usuarioId,
  });
  await auditoria.registrar({
    usuarioId,
    accion: "acceso.otorgado",
    entidad: "accesos_parcela",
    entidadId: id,
    detalle: {
      parcela_id: parcelaId,
      tecnico_id: tecnico.id,
      puede_escribir: Boolean(puedeEscribir),
    },
    ip,
  });
}

/** Revoca un acceso (solo el dueño de la parcela). */
async function revocarAcceso(accesoId, usuarioId, { ip } = {}) {
  const acceso = await repositorio.buscarAcceso(accesoId);
  if (!acceso) throw noEncontrado("No encontramos ese acceso.");
  await obtenerDelUsuario(acceso.parcela_id, usuarioId);
  if (acceso.revocado_en)
    throw solicitudInvalida("Ese acceso ya fue revocado.");
  await repositorio.revocarAcceso(accesoId);
  await auditoria.registrar({
    usuarioId,
    accion: "acceso.revocado",
    entidad: "accesos_parcela",
    entidadId: accesoId,
    ip,
  });
}

/** Parcelas asignadas al técnico (solo lectura o con escritura). */
function asignadasATecnico(tecnicoId) {
  return repositorio.listarAsignadasATecnico(tecnicoId);
}

/** Parcela que el técnico puede ver; lanza 403 si no tiene acceso. */
async function obtenerParaTecnico(parcelaId, tecnicoId) {
  const parcela = await repositorio.buscarPorId(parcelaId);
  if (!parcela) throw noEncontrado("No encontramos esa parcela.");
  const acceso = await repositorio.accesoVigente(parcelaId, tecnicoId);
  if (!acceso)
    throw noEncontrado("No encontramos esa parcela o no tienes acceso.");
  return { parcela, acceso };
}

module.exports = {
  catalogos,
  zonaSugerida,
  listar,
  obtenerDelUsuario,
  crear,
  actualizar,
  eliminar,
  listarImagenes,
  guardarImagenes,
  eliminarImagen,
  concederAcceso,
  revocarAcceso,
  asignadasATecnico,
  obtenerParaTecnico,
  listarAccesos: repositorio.listarAccesos,
};
