// Servicio de la API v1 (Fase 12).
// Reutiliza los servicios de dominio (nunca el repositorio directo) y devuelve
// objetos planos aptos para JSON: fechas en ISO 8601 y sin datos internos.
const publicoService = require("../publico/publico.service");
const monitorPublicoService = require("../publico/monitor.service");

const parcelasServicio = require("../parcelas/parcelas.service");
const lecturasServicio = require("../lecturas/lecturas.service");
const cultivosRepositorio = require("../cultivos/cultivos.repository");
const motor = require("../../engine");
const { noEncontrado, solicitudInvalida } = require("../../utils/errores");

function fechaIso(valor) {
  if (!valor) return null;
  const fecha = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString();
}

async function cultivos() {
  const lista = await publicoService.datosCatalogoCultivos();
  return lista.map((cultivo) => ({
    id: cultivo.id,
    slug: cultivo.slug,
    nombre: cultivo.nombre,
    descripcion: cultivo.descripcion,
    resumen: cultivo.resumen,
  }));
}

async function cultivo(slug) {
  const datos = await publicoService.detalleCultivo(slug, null);
  return {
    id: datos.cultivo.id,
    slug: datos.cultivo.slug,
    nombre: datos.cultivo.nombre,
    descripcion: datos.cultivo.descripcion,
    variedades: datos.variedades.map((v) => ({
      id: v.id,
      nombre: v.nombre,
      slug: v.slug,
      descripcion: v.descripcion,
    })),
    requerimientos: datos.requerimientos.map((fila) => ({
      zona_id: fila.zona_id,
      zona: fila.zona_nombre,
      humedad_min: Number(fila.hum_min),
      humedad_max: Number(fila.hum_max),
      temperatura_min: Number(fila.temp_min),
      temperatura_max: Number(fila.temp_max),
      fuente: fila.fuente,
      validado: Boolean(fila.validado),
    })),
    calendario: datos.calendario.map((fila) => ({
      zona_id: fila.zona_id,
      zona: fila.zona_nombre,
      mes_inicio: Number(fila.mes_inicio),
      mes_fin: Number(fila.mes_fin),
      texto: fila.ventana.texto,
      validado: Boolean(fila.validado),
    })),
    imagenes: datos.imagenes.map((imagen) => ({
      id: imagen.id,
      alt: imagen.alt,
      ancho: imagen.ancho,
      alto: imagen.alto,
      url: `/media/imagenes/${imagen.id}/800`,
      autor: imagen.autor,
      licencia: imagen.licencia,
    })),
  };
}

async function calendario(query = {}) {
  const datos = await publicoService.datosCalendario({
    cultivo: query.cultivo,
    departamento: query.departamento,
    provincia: query.provincia,
    distrito: query.distrito,
  });
  return {
    cultivo: datos.cultivo
      ? { slug: datos.cultivo.slug, nombre: datos.cultivo.nombre }
      : null,
    ubicacion: {
      departamento: datos.departamento ? datos.departamento.nombre : null,
      provincia: datos.provincia ? datos.provincia.nombre : null,
      distrito: datos.distrito ? datos.distrito.nombre : null,
    },
    estado_datos: datos.estadoDatos,
    ultima_lectura: datos.ultimaLectura
      ? {
          fecha: String(datos.ultimaLectura.fecha).slice(0, 10),
          humedad: Number(datos.ultimaLectura.humedad),
          temperatura: Number(datos.ultimaLectura.temperatura),
        }
      : null,
    calendario: datos.calendario.map((fila) => ({
      zona: fila.zona_nombre,
      mes_inicio: Number(fila.mes_inicio),
      mes_fin: Number(fila.mes_fin),
      texto: fila.ventana.texto,
      validado: Boolean(fila.validado),
    })),
    recomendaciones: (datos.recomendaciones || []).map((fila) => ({
      zona: fila.zona,
      titulo: fila.resultado.titulo,
      cls: fila.resultado.cls,
      motivos: fila.resultado.motivos,
    })),
    generado_en: new Date().toISOString(),
  };
}

async function articulos({ pagina = 1, categoria, etiqueta, busqueda } = {}) {
  const datos = await publicoService.datosSaberes({
    categoria,
    etiqueta,
    busqueda,
    pagina,
  });
  const base = "/saberes";
  return {
    ...datos,
    articulos: datos.articulos.map((articulo) => ({
      id: articulo.id,
      titulo: articulo.titulo,
      slug: articulo.slug,
      resumen: articulo.resumen,
      categoria: articulo.categoria_nombre,
      etiquetas: (articulo.etiquetas || []).map((e) => e.slug),
      publicada_en: fechaIso(articulo.publicada_en),
      url: `${base}/${articulo.slug}`,
    })),
  };
}

async function articulo(slug) {
  const datos = await publicoService.detalleSaber(slug, null);
  return {
    id: datos.articulo.id,
    titulo: datos.articulo.titulo,
    slug: datos.articulo.slug,
    categoria: datos.articulo.categoria_nombre,
    publicada_en: fechaIso(datos.articulo.publicada_en),
    contenido_html: datos.articulo.contenidoHtml,
    etiquetas: (datos.articulo.etiquetas || []).map((e) => e.slug),
    imagenes: (datos.articulo.imagenes || []).map((imagen) => ({
      id: imagen.id,
      alt: imagen.alt,
      url: `/media/imagenes/${imagen.id}/800`,
    })),
    relacionados: datos.relacionados.map((fila) => ({
      slug: fila.slug,
      titulo: fila.titulo,
    })),
  };
}

async function comunidades() {
  const datos = await publicoService.datosComunidades();
  const lecturas = await monitorPublicoService.datosActuales(datos.comunidades);
  return datos.comunidades.map((fila) => ({
    id: fila.id,
    nombre: fila.nombre,
    distrito: fila.distrito,
    provincia: fila.provincia,
    departamento: fila.departamento,
    latitud: fila.latitud === null ? null : Number(fila.latitud),
    longitud: fila.longitud === null ? null : Number(fila.longitud),
    humedad: lecturas[fila.id] ? lecturas[fila.id].humedad : null,
    temperatura: lecturas[fila.id] ? lecturas[fila.id].temperatura : null,
    fecha_lectura: lecturas[fila.id] ? lecturas[fila.id].fecha : null,
    fuente: lecturas[fila.id] ? lecturas[fila.id].fuente : null,
    dias_desde_lectura: lecturas[fila.id] ? lecturas[fila.id].diasDesde : null,
    clase_humedad: monitorPublicoService.clasificarHumedad(
      lecturas[fila.id] ? lecturas[fila.id].humedad : null,
    ),
  }));
}

/**
 * Recomendación de siembra para una parcela del usuario autenticado.
 * Combina el requerimiento del cultivo/zona con la última lectura del suelo.
 */
async function recomendacion(parcelaId, usuarioId, { fecha } = {}) {
  const parcela = await parcelasServicio.obtenerDelUsuario(
    parcelaId,
    usuarioId,
  );
  if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(String(fecha))) {
    throw solicitudInvalida("La fecha debe tener el formato AAAA-MM-DD.");
  }
  const [requerimiento, ultima] = await Promise.all([
    cultivosRepositorio.buscarRequerimientoPorCultivoZona(
      parcela.cultivo_id,
      parcela.zona_id,
    ),
    lecturasServicio.ultima(parcela.id),
  ]);
  if (!ultima)
    throw noEncontrado("La parcela aún no tiene lecturas del suelo.");
  const resultado = motor.evaluar(
    requerimiento
      ? {
          hum_min: requerimiento.hum_min,
          hum_max: requerimiento.hum_max,
          temp_min: requerimiento.temp_min,
          temp_max: requerimiento.temp_max,
        }
      : null,
    ultima,
  );
  return {
    parcela: {
      id: parcela.id,
      nombre: parcela.nombre,
      cultivo: parcela.cultivo,
    },
    lectura: {
      fecha: String(ultima.fecha).slice(0, 10),
      humedad: Number(ultima.humedad),
      temperatura: Number(ultima.temperatura),
    },
    requerimiento: requerimiento
      ? {
          humedad_min: Number(requerimiento.hum_min),
          humedad_max: Number(requerimiento.hum_max),
          temperatura_min: Number(requerimiento.temp_min),
          temperatura_max: Number(requerimiento.temp_max),
        }
      : null,
    recomendacion: {
      codigo: resultado.cls,
      titulo: resultado.titulo,
      motivos: resultado.motivos,
    },
  };
}

module.exports = {
  cultivos,
  cultivo,
  calendario,
  articulos,
  articulo,
  comunidades,
  recomendacion,
};
