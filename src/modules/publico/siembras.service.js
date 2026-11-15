const env = require("../../config/env");
const campaniasRepositorio = require("../campanias/campanias.repository");

const MINIMO_PUBLICO = 3;
const DATOS_DEMO = [
  {
    demoKey: "a",
    cultivoSlug: "papa",
    cantidadSiembras: 5,
    fechaMediana: "2025-10-20",
    fechaDesde: "2025-10-14",
    fechaHasta: "2025-10-28",
    sembradas: 5,
    cosechadas: 0,
    estado: "sembrado",
    latitud: -13.52,
    longitud: -71.97,
  },
  {
    demoKey: "b",
    cultivoSlug: "maiz",
    cantidadSiembras: 4,
    fechaMediana: "2025-11-18",
    fechaDesde: "2025-11-12",
    fechaHasta: "2025-11-25",
    sembradas: 2,
    cosechadas: 2,
    estado: "mixto",
    latitud: -13.54,
    longitud: -71.93,
  },
  {
    demoKey: "c",
    cultivoSlug: "quinua",
    cantidadSiembras: 6,
    fechaMediana: "2025-12-10",
    fechaDesde: "2025-12-03",
    fechaHasta: "2025-12-17",
    sembradas: 1,
    cosechadas: 5,
    estado: "cosechado",
    latitud: -13.56,
    longitud: -71.99,
  },
  {
    demoKey: "d",
    cultivoSlug: "papa",
    cantidadSiembras: 4,
    fechaMediana: "2025-10-12",
    fechaDesde: "2025-10-06",
    fechaHasta: "2025-10-19",
    sembradas: 3,
    cosechadas: 1,
    estado: "mixto",
    latitud: -15.97,
    longitud: -69.8,
  },
  {
    demoKey: "e",
    cultivoSlug: "maiz",
    cantidadSiembras: 5,
    fechaMediana: "2025-11-09",
    fechaDesde: "2025-11-02",
    fechaHasta: "2025-11-16",
    sembradas: 4,
    cosechadas: 1,
    estado: "mixto",
    latitud: -15.04,
    longitud: -70.37,
  },
  {
    demoKey: "f",
    cultivoSlug: "quinua",
    cantidadSiembras: 3,
    fechaMediana: "2025-12-06",
    fechaDesde: "2025-12-01",
    fechaHasta: "2025-12-12",
    sembradas: 0,
    cosechadas: 3,
    estado: "cosechado",
    latitud: -13.95,
    longitud: -72.18,
  },
];

function fechaIso(valor) {
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  return String(valor).slice(0, 10);
}

function medianaFechas(fechas) {
  const ordenadas = fechas
    .map((fecha) => new Date(`${fecha}T00:00:00Z`).getTime())
    .sort((a, b) => a - b);
  const mitad = Math.floor(ordenadas.length / 2);
  const mediana =
    ordenadas.length % 2
      ? ordenadas[mitad]
      : (ordenadas[mitad - 1] + ordenadas[mitad]) / 2;
  return new Date(mediana).toISOString().slice(0, 10);
}

function agruparSiembras(filas) {
  const grupos = new Map();
  for (const fila of filas) {
    const clave = `${fila.distrito_id}:${fila.cultivo_id}`;
    if (!grupos.has(clave)) {
      grupos.set(clave, {
        distritoId: fila.distrito_id,
        distrito: fila.distrito,
        provincia: fila.provincia,
        departamento: fila.departamento,
        departamentoId: fila.departamento_id,
        cultivo: fila.cultivo,
        cultivoSlug: fila.cultivo_slug,
        fechas: [],
        cosechadas: 0,
        latitud: Number(fila.latitud_distrito),
        longitud: Number(fila.longitud_distrito),
      });
    }
    const grupo = grupos.get(clave);
    grupo.fechas.push(fechaIso(fila.fecha));
    if (Number(fila.cosechas_registradas) > 0) grupo.cosechadas += 1;
  }

  return [...grupos.values()]
    .filter((grupo) => grupo.fechas.length >= MINIMO_PUBLICO)
    .map((grupo) => {
      const fechas = grupo.fechas.sort();
      const cantidadSiembras = fechas.length;
      const sembradas = cantidadSiembras - grupo.cosechadas;
      return {
        distrito: grupo.distrito,
        provincia: grupo.provincia,
        departamento: grupo.departamento,
        cultivo: grupo.cultivo,
        cultivoSlug: grupo.cultivoSlug,
        cantidadSiembras,
        fechaMediana: medianaFechas(fechas),
        fechaDesde: fechas[0],
        fechaHasta: fechas[fechas.length - 1],
        sembradas,
        cosechadas: grupo.cosechadas,
        estado:
          sembradas && grupo.cosechadas
            ? "mixto"
            : grupo.cosechadas
              ? "cosechado"
              : "sembrado",
        latitud: Number.isFinite(grupo.latitud)
          ? Math.round(grupo.latitud * 100) / 100
          : null,
        longitud: Number.isFinite(grupo.longitud)
          ? Math.round(grupo.longitud * 100) / 100
          : null,
      };
    });
}

function filtrarDemo(filtros) {
  return DATOS_DEMO.filter((fila) => {
    const coincideCultivo =
      !filtros.cultivo || fila.cultivoSlug === filtros.cultivo;
    const coincideMes =
      !filtros.mes ||
      Number(fila.fechaMediana.slice(5, 7)) === Number(filtros.mes);
    return coincideCultivo && coincideMes;
  });
}

async function datosPublicos(
  filtros = {},
  { demoActivada = env.siembras.demoPublico } = {},
) {
  const registros = await campaniasRepositorio.listarSiembrasPublicas(filtros);
  const reales = agruparSiembras(registros);
  const demo =
    demoActivada && reales.length < 3 && !filtros.departamento
      ? filtrarDemo(filtros).map((fila) => ({ ...fila, demo: true }))
      : [];
  return {
    reales,
    demo,
  };
}

module.exports = { datosPublicos, agruparSiembras, MINIMO_PUBLICO };
