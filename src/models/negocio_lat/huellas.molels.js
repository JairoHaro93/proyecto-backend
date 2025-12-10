const { poolmysql } = require("../../config/db");

// Insertar una huella asociada a un usuario y un timbre (slot = 1 ó 2)
function insertHuella({
  usuario_id,
  lector_codigo,
  finger_id,
  slot,
  estado = "ACTIVA",
}) {
  const sql = `
    INSERT INTO sis_t_huellas (usuario_id, lector_codigo, finger_id, slot, estado)
    VALUES (?, ?, ?, ?, ?)
  `;
  const params = [usuario_id, lector_codigo, finger_id, slot, estado];
  return poolmysql.query(sql, params);
}

// Buscar si ya existe una huella para ese timbre + finger_id
function selectHuellaByLectorFinger(lector_codigo, finger_id) {
  const sql = `
    SELECT *
    FROM sis_t_huellas
    WHERE lector_codigo = ? AND finger_id = ?
    LIMIT 1
  `;
  return poolmysql.query(sql, [lector_codigo, finger_id]);
}

// Obtener usuario por huella (para asistencia)
// No necesita mano/dedo, solo lector_codigo + finger_id
function getUsuarioByHuella(lector_codigo, finger_id) {
  const sql = `
    SELECT 
      h.usuario_id,
      u.nombre,
      u.apellido
    FROM sis_t_huellas h
    JOIN sisusuarios u ON u.id = h.usuario_id
    WHERE h.lector_codigo = ?
      AND h.finger_id = ?
      AND h.estado = 'ACTIVA'
    LIMIT 1
  `;
  return poolmysql.query(sql, [lector_codigo, finger_id]);
}

// Contar cuántas huellas activas tiene un usuario en un timbre
function selectHuellasCountByUsuarioLector(usuario_id, lector_codigo) {
  const sql = `
    SELECT COUNT(*) AS total
    FROM sis_t_huellas
    WHERE usuario_id = ?
      AND lector_codigo = ?
      AND estado = 'ACTIVA'
  `;
  return poolmysql.query(sql, [usuario_id, lector_codigo]);
}

// Ver si ya existe una huella para ese usuario + lector + slot (1 ó 2)
function selectHuellaByUsuarioLectorSlot(usuario_id, lector_codigo, slot) {
  const sql = `
    SELECT *
    FROM sis_t_huellas
    WHERE usuario_id = ?
      AND lector_codigo = ?
      AND slot = ?
      AND estado = 'ACTIVA'
    LIMIT 1
  `;
  return poolmysql.query(sql, [usuario_id, lector_codigo, slot]);
}

// Eliminar todas las huellas de un usuario en un timbre específico
function deleteHuellasByUsuarioLector(usuario_id, lector_codigo) {
  const sql = `
    DELETE FROM sis_t_huellas
    WHERE usuario_id = ? AND lector_codigo = ?
  `;
  return poolmysql.query(sql, [usuario_id, lector_codigo]);
}

// Obtener todas las huellas ACTIVAS de un timbre con datos de usuario
function selectHuellasActivasByLector(lector_codigo) {
  const sql = `
    SELECT 
      h.id           AS huella_id,
      h.usuario_id,
      h.lector_codigo,
      h.finger_id,
      h.slot,
      h.estado,
      u.nombre,
      u.apellido,
      u.usuario,
      u.ci
    FROM sis_t_huellas h
    JOIN sisusuarios u ON u.id = h.usuario_id
    WHERE h.lector_codigo = ?
      AND h.estado = 'ACTIVA'
    ORDER BY u.apellido, u.nombre, h.slot
  `;
  return poolmysql.query(sql, [lector_codigo]);
}

// Obtener TODAS las huellas (cualquier estado) de un usuario en un timbre
function selectHuellasByUsuarioLector(usuario_id, lector_codigo) {
  const sql = `
    SELECT *
    FROM sis_t_huellas
    WHERE usuario_id = ?
      AND lector_codigo = ?
  `;
  return poolmysql.query(sql, [usuario_id, lector_codigo]);
}

module.exports = {
  insertHuella,
  selectHuellaByLectorFinger,
  getUsuarioByHuella,
  selectHuellasCountByUsuarioLector,
  selectHuellaByUsuarioLectorSlot,
  deleteHuellasByUsuarioLector,
  selectHuellasActivasByLector,
  selectHuellasByUsuarioLector,
};
