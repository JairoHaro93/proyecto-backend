// models/negocio_lat/asistencia.models.js
const { poolmysql } = require("../../config/db");

// Inserta un registro de asistencia
const insertAsistencia = (data) => {
  const sql = `
    INSERT INTO neg_t_asistencia
      (usuario_id, lector_codigo, tipo_marcado, match_ok, origen, observacion)
    VALUES (?, ?, ?, ?, ?, ?)
  `;
  const params = [
    data.usuario_id,
    data.lector_codigo,
    data.tipo_marcado,
    data.match_ok,
    data.origen,
    data.observacion,
  ];
  return poolmysql.query(sql, params);
};

// Obtiene la última marca de asistencia de un usuario (la más reciente)
function selectUltimaAsistenciaByUsuario(usuario_id) {
  const sql = `
    SELECT 
      id,
      usuario_id,
      lector_codigo,
      tipo_marcado,
      fecha_hora
    FROM neg_t_asistencia
    WHERE usuario_id = ?
    ORDER BY fecha_hora DESC
    LIMIT 1
  `;

  return poolmysql.query(sql, [usuario_id]);
}

// 🔹 NUEVO: última asistencia SOLO de hoy
const selectUltimaAsistenciaHoyByUsuario = (usuario_id) => {
  const sql = `
    SELECT id, usuario_id, lector_codigo, tipo_marcado, fecha_hora
    FROM neg_t_asistencia
    WHERE usuario_id = ?
      AND DATE(fecha_hora) = CURDATE()
    ORDER BY fecha_hora DESC
    LIMIT 1
  `;
  return poolmysql.query(sql, [usuario_id]);
};

module.exports = {
  insertAsistencia,
  selectUltimaAsistenciaByUsuario,
  selectUltimaAsistenciaHoyByUsuario,
};
