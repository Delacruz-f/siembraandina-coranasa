const { db } = require("../../config/db");
const { insertarYDevolverId } = require("../../utils/baseDatos");

async function catalogoAgronomico() {
  const [cultivos, requerimientos, calendarios, zonas] = await Promise.all([
    db("cultivos")
      .select(
        "id",
        "nombre",
        "slug",
        "dias_ciclo",
        "ciclo_referencial",
        "ciclo_fuente",
      )
      .where({ activo: true })
      .orderBy("nombre"),
    db("cultivo_requerimientos as cr")
      .join("zonas_altitudinales as z", "z.id", "cr.zona_id")
      .select(
        "cr.cultivo_id",
        "cr.zona_id",
        "cr.hum_min",
        "cr.hum_max",
        "cr.temp_min",
        "cr.temp_max",
        "z.clave as zona_clave",
      )
      .orderBy("z.orden"),
    db("calendario_tradicional as ct").select(
      "ct.cultivo_id",
      "ct.zona_id",
      "ct.mes_inicio",
      "ct.mes_fin",
    ),
    db("zonas_altitudinales").select(
      "id",
      "clave",
      "altitud_min_m",
      "altitud_max_m",
      "orden",
    ),
  ]);
  return { cultivos, requerimientos, calendarios, zonas };
}

async function guardarConsultaPublica(datos) {
  return insertarYDevolverId("consulta_publica", {
    distrito_id: datos.distritoId || null,
    cultivo_id: datos.cultivoId || null,
    ventanas_sugeridas: JSON.stringify(datos.ventanas),
    created_at: db.fn.now(),
  });
}

function listarTecnicosDeProvincia(provinciaId) {
  return db("tecnico_distritos as td")
    .join("distritos as d", "d.id", "td.distrito_id")
    .join("usuarios as u", "u.id", "td.tecnico_id")
    .join("usuario_roles as ur", "ur.usuario_id", "u.id")
    .join("roles as r", "r.id", "ur.rol_id")
    .join("perfiles as p", "p.usuario_id", "u.id")
    .select("p.nombre")
    .distinct()
    .where("d.provincia_id", provinciaId)
    .andWhere("r.clave", "tecnico")
    .andWhere("u.activo", true)
    .whereNotNull("u.email_verificado_en")
    .whereNull("u.deleted_at")
    .orderBy("p.nombre")
    .limit(20);
}

function existeConsultaPublica(id) {
  return db("consulta_publica").select("id").where({ id }).first();
}

function obtenerConsultaPublica(id) {
  return db("consulta_publica")
    .select("id", "distrito_id", "cultivo_id", "ventanas_sugeridas", "created_at")
    .where({ id })
    .first()
    .then((fila) => {
      if (!fila) return null;
      let ventanas = fila.ventanas_sugeridas;
      if (typeof ventanas === "string") {
        try {
          ventanas = JSON.parse(ventanas);
        } catch (error) {
          throw new Error("La consulta pública guardada tiene datos inválidos.", {
            cause: error,
          });
        }
      }
      return { ...fila, ventanas_sugeridas: ventanas };
    });
}

module.exports = {
  catalogoAgronomico,
  guardarConsultaPublica,
  listarTecnicosDeProvincia,
  existeConsultaPublica,
  obtenerConsultaPublica,
};
