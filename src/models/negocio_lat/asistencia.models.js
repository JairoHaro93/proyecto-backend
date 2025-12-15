// models/negocio_lat/asistencia.models.js
const { poolmysql } = require("../../config/db");

const insertAsistencia = (data) => {
  const sql = `
    INSERT INTO neg_t_asistencia
      (usuario_id, lector_codigo, match_ok, origen, observacion)
    VALUES (?, ?, ?, ?, ?)
  `;
  return poolmysql.query(sql, [
    data.usuario_id,
    data.lector_codigo,
    data.match_ok,
    data.origen,
    data.observacion,
  ]);
};

const selectUltimaAsistenciaHoyByUsuario = (usuario_id) => {
  const sql = `
    SELECT id, usuario_id, lector_codigo, fecha_hora
    FROM neg_t_asistencia
    WHERE usuario_id = ?
      AND fecha_hora >= CONCAT(CURDATE(), ' 00:00:00')
      AND fecha_hora <  CONCAT(DATE_ADD(CURDATE(), INTERVAL 1 DAY), ' 00:00:00')
    ORDER BY fecha_hora DESC, id DESC
    LIMIT 1
  `;
  return poolmysql.query(sql, [usuario_id]);
};

const countAsistenciasHoyByUsuario = (usuario_id) => {
  const sql = `
    SELECT COUNT(*) AS total
    FROM neg_t_asistencia
    WHERE usuario_id = ?
      AND fecha_hora >= CONCAT(CURDATE(), ' 00:00:00')
      AND fecha_hora <  CONCAT(DATE_ADD(CURDATE(), INTERVAL 1 DAY), ' 00:00:00')
  `;
  return poolmysql.query(sql, [usuario_id]);
};

function selectAsistenciaById(id) {
  return poolmysql.query(
    `SELECT id, usuario_id, fecha_hora FROM neg_t_asistencia WHERE id = ? LIMIT 1`,
    [id]
  );
}

module.exports = {
  selectAsistenciaById,
  insertAsistencia,
  selectUltimaAsistenciaHoyByUsuario,
  countAsistenciasHoyByUsuario,
};
