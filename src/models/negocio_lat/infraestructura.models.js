// models/infraestructura.model.js
const { poolmysql } = require("../../config/db");

/**
 * Crea un registro de infraestructura y agrega el trabajo a la agenda (transaccional)
 */
async function insertInfraYAgenda({
  nombre,
  coordenadas = null,
  observacion = null,
}) {
  let conn;
  try {
    conn = await poolmysql.getConnection();
    await conn.beginTransaction();

    // 1) Insert en neg_t_infraestructura
    const sqlInfra = `
      INSERT INTO neg_t_infraestructura (nombre, coordenadas, observacion)
      VALUES (?, ?, ?)
    `;
    const paramsInfra = [nombre, coordenadas, observacion];
    const [resInfra] = await conn.query(sqlInfra, paramsInfra);
    const infraestructuraId = resInfra.insertId;

    // 2) Insert en neg_t_agenda
    const sqlAgenda = `
      INSERT INTO neg_t_agenda (
        age_tipo, age_estado, ord_ins, age_id_tipo, age_telefono, age_diagnostico, age_coordenadas
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const paramsAgenda = [
      "INFRAESTRUCTURA", // age_tipo
      "PENDIENTE", // age_estado
      86502, // ord_ins (según tu requerimiento)
      infraestructuraId, // age_id_tipo
      null, // age_telefono
      observacion, // age_diagnostico
      coordenadas, // age_coordenadas
    ];
    const [resAgenda] = await conn.query(sqlAgenda, paramsAgenda);

    await conn.commit();

    return {
      id: infraestructuraId, // id de neg_t_infraestructura
      agenda_id: resAgenda.insertId, // id en neg_t_agenda
    };
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (_) {}
    }
    throw err;
  } finally {
    if (conn) conn.release();
  }
}

/**
 * Obtiene una infraestructura por ID
 */
async function selectInfraById(id) {
  const sql = `SELECT id, nombre, coordenadas, observacion FROM neg_t_infraestructura WHERE id = ? LIMIT 1`;
  const [rows] = await poolmysql.query(sql, [id]);
  return rows[0] || null;
}

/**
 * Detalle de un trabajo de INFRAESTRUCTURA por ID de agenda (A.id)
 * Une agenda + infraestructura (+ nombre del técnico que revisó si existe)
 * Retorna: objeto plano o null si no existe
 */

// models/infraestructura.model.js  (solo esta función)
async function selectInfraTrabajoByAgendaId(agendaId) {
  const [rows] = await poolmysql.query(
    `
    SELECT 
      -- AGENDA
      A.id                      AS agenda_id,
      A.age_tipo,
      A.age_estado,
      A.ord_ins,
      A.age_id_tipo,
      A.age_id_sop,
      A.age_hora_inicio,
      A.age_hora_fin,
      A.age_fecha,
      A.age_vehiculo,
      A.age_tecnico,
      A.age_diagnostico,
      A.age_coordenadas,
      A.age_telefono,
      A.age_solucion,

      -- INFRAESTRUCTURA
      I.id                      AS infra_id,
      I.nombre                  AS infra_nombre,
      I.coordenadas             AS infra_coordenadas,
      I.observacion             AS infra_observacion,
      I.img_ref1                AS infra_img_ref1,
      I.img_ref2                AS infra_img_ref2,
      I.created_at              AS infra_created_at,
      I.updated_at              AS infra_updated_at,

      -- TÉCNICO (asignado en la agenda)
      CONCAT(U.nombre, ' ', U.apellido) AS tecnico_nombre
    FROM neg_t_agenda A
    LEFT JOIN neg_t_infraestructura I ON I.id = A.age_id_tipo
    LEFT JOIN sisusuarios U           ON U.id = A.age_tecnico
    WHERE 
      A.id = ?
      AND A.age_tipo = 'INFRAESTRUCTURA'
    LIMIT 1
    `,
    [agendaId]
  );

  if (!rows || rows.length === 0) return null;
  return rows[0];
}

module.exports = {
  insertInfraYAgenda,
  selectInfraById,
  selectInfraTrabajoByAgendaId,
};
