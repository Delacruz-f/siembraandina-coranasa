const repositorio = require("./consultas.repository");
const consultaPublicaRepositorio = require("../consultaPublica/consultaPublica.repository");
const publicoRepositorio = require("../publico/publico.repository");
const cultivosRepositorio = require("../cultivos/cultivos.repository");
const archivosServicio = require("../usuarios/archivos.service");
const logger = require("../../config/logger");
const { noEncontrado, solicitudInvalida } = require("../../utils/errores");

async function datosFormulario() {
  const [departamentos, cultivos] = await Promise.all([
    publicoRepositorio.listarDepartamentos(),
    publicoRepositorio.listarCultivos(),
  ]);
  return { departamentos, cultivos };
}

async function listaAgricultor(usuarioId) {
  return repositorio.listarDelAgricultor(usuarioId);
}

async function listaTecnico(tecnicoId) {
  const [consultas, distritos] = await Promise.all([
    repositorio.listarAbiertasDeTecnico(tecnicoId),
    repositorio.distritosDelTecnico(tecnicoId),
  ]);
  return { consultas, distritos };
}

async function crearConsulta(
  usuarioId,
  datos,
  archivos,
  consultaPublicaId = null,
) {
  if (!archivos || archivos.length > 3) {
    throw solicitudInvalida("Adjunta como máximo 3 fotos de tu cultivo.");
  }
  const distrito = await publicoRepositorio.buscarDistrito(
    Number(datos.distrito_id),
  );
  if (!distrito) throw solicitudInvalida("Elige un distrito válido.");
  if (
    consultaPublicaId &&
    !(await consultaPublicaRepositorio.existeConsultaPublica(consultaPublicaId))
  ) {
    throw solicitudInvalida(
      "La recomendación pública ya no está disponible. Vuelve a realizar la consulta.",
    );
  }
  let cultivo = null;
  if (datos.cultivo_id) {
    cultivo = await cultivosRepositorio.buscarCultivo(
      Number(datos.cultivo_id),
    );
    if (!cultivo || !cultivo.activo) {
      throw solicitudInvalida("Elige un cultivo disponible.");
    }
  }

  const textos = Array.isArray(datos.textos_alternativos)
    ? datos.textos_alternativos
    : datos.textos_alternativos
      ? [datos.textos_alternativos]
      : [];
  if (textos.length !== archivos.length) {
    throw solicitudInvalida(
      "Escribe un texto alternativo para cada foto que adjuntes.",
    );
  }
  const archivosGuardados = [];
  try {
    for (let indice = 0; indice < archivos.length; indice += 1) {
      archivosGuardados.push(
        await archivosServicio.guardarImagen(
          archivos[indice],
          usuarioId,
          textos[indice],
        ),
      );
    }
    const tecnicoIds = await repositorio.listarTecnicosDeDistrito(distrito.id);
    const consultaId = await repositorio.crear(
      {
        usuario_id: usuarioId,
        distrito_id: distrito.id,
        cultivo_id: cultivo ? cultivo.id : null,
        consulta_publica_id: consultaPublicaId || null,
        titulo: datos.titulo.trim(),
        contenido: datos.contenido.trim(),
        distrito_nombre: distrito.nombre,
      },
      archivosGuardados.map((archivo) => archivo.id),
      tecnicoIds,
    );
    return consultaId;
  } catch (error) {
    for (const archivo of archivosGuardados) {
      try {
        await archivosServicio.eliminarPropio(archivo.id, usuarioId);
      } catch (errorLimpieza) {
        logger.error(
          { err: errorLimpieza, archivoId: archivo.id },
          "No se pudo limpiar una foto de consulta tras un error",
        );
      }
    }
    throw error;
  }
}

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

async function consultaAgricultor(id, usuarioId) {
  const consulta = await repositorio.buscarDelAgricultor(id, usuarioId);
  if (!consulta) throw noEncontrado("No encontramos esa consulta.");
  const [archivos, calificacion] = await Promise.all([
    repositorio.listarArchivos(consulta.id),
    consulta.respuesta_id
      ? repositorio.buscarCalificacionRespuesta(consulta.respuesta_id)
      : Promise.resolve(null),
  ]);
  const consultaPublica = consulta.consulta_publica_id
    ? await consultaPublicaRepositorio.obtenerConsultaPublica(
        consulta.consulta_publica_id,
      )
    : null;
  return {
    ...consulta,
    archivos: agruparImagenes(archivos),
    calificacion,
    consultaPublica,
  };
}

async function consultaTecnico(id, usuario) {
  const esAdministrador = usuario.roles.includes("administrador");
  const consulta = esAdministrador
    ? await repositorio.buscarParaAdministrador(id)
    : await repositorio.buscarParaTecnico(id, usuario.id);
  if (!consulta) throw noEncontrado("No encontramos esa consulta.");
  const [archivos, consultaPublica] = await Promise.all([
    repositorio.listarArchivos(consulta.id),
    consulta.consulta_publica_id
      ? consultaPublicaRepositorio.obtenerConsultaPublica(
          consulta.consulta_publica_id,
        )
      : Promise.resolve(null),
  ]);
  return { ...consulta, archivos: agruparImagenes(archivos), consultaPublica };
}

async function distritosTecnico(tecnicoId) {
  return repositorio.distritosDelTecnico(tecnicoId);
}

async function agregarDistritoTecnico(tecnicoId, distritoId) {
  const distrito = await repositorio.existeDistrito(Number(distritoId));
  if (!distrito) throw solicitudInvalida("Elige un distrito válido.");
  const actuales = await repositorio.distritosDelTecnico(tecnicoId);
  if (
    actuales.length >= 20 &&
    !actuales.some((fila) => Number(fila.id) === Number(distritoId))
  ) {
    throw solicitudInvalida("Puedes ofrecer atención en un máximo de 20 distritos.");
  }
  await repositorio.agregarDistrito(tecnicoId, Number(distritoId));
}

function quitarDistritoTecnico(tecnicoId, distritoId) {
  return repositorio.quitarDistrito(tecnicoId, Number(distritoId));
}

async function responder(id, tecnico, contenido) {
  const esAdministrador = tecnico.roles.includes("administrador");
  const respuesta = await repositorio.responder(
    Number(id),
    tecnico.id,
    contenido.trim(),
    esAdministrador,
  );
  if (!respuesta) {
    throw noEncontrado(
      "La consulta no está disponible en tus distritos o ya fue respondida.",
    );
  }
  return respuesta;
}

async function cerrar(id, usuarioId) {
  const actualizada = await repositorio.cerrar(Number(id), usuarioId);
  if (!actualizada) throw noEncontrado("No encontramos esa consulta abierta.");
}

async function calificar(
  consultaId,
  respuestaId,
  usuarioId,
  puntuacion,
  comentario,
) {
  const respuesta = await repositorio.buscarRespuestaDelPropietario(
    respuestaId,
    usuarioId,
  );
  if (!respuesta || Number(respuesta.consulta_id) !== Number(consultaId)) {
    throw noEncontrado("No encontramos esa respuesta.");
  }
  if (!["respondida", "cerrada"].includes(respuesta.estado)) {
    throw solicitudInvalida("Espera a que el técnico responda antes de calificar.");
  }
  if (await repositorio.buscarCalificacion(respuestaId, usuarioId)) {
    throw solicitudInvalida("Ya calificaste esta respuesta.");
  }
  await repositorio.calificar(
    respuestaId,
    usuarioId,
    Number(puntuacion),
    comentario ? comentario.trim() : null,
  );
}

module.exports = {
  datosFormulario,
  listaAgricultor,
  listaTecnico,
  crearConsulta,
  consultaAgricultor,
  consultaTecnico,
  distritosTecnico,
  agregarDistritoTecnico,
  quitarDistritoTecnico,
  responder,
  cerrar,
  calificar,
};
