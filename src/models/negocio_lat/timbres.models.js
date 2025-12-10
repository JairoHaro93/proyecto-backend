const { poolmysql } = require("../../config/db");

// Obtener config de un timbre por codigo
function selectConfigByCodigo(codigo) {
  const sql = `
    SELECT
      lector_codigo,
      nombre,
      sucursal,
      tipo,
      modo_actual,
      last_heartbeat,
  
  
      usuario_enrolando_id
    FROM neg_t_timbres
    WHERE lector_codigo = ?
    LIMIT 1
  `;
  return poolmysql.query(sql, [codigo]);
}

// Poner timbre en modo ENROLAMIENTO para un usuario
function setEnrolamiento(codigo, usuarioId) {
  const sql = `
    UPDATE neg_t_timbres
    SET modo_actual = 'ENROLAMIENTO',
        usuario_enrolando_id = ?
    WHERE lector_codigo = ?
  `;
  return poolmysql.query(sql, [usuarioId, codigo]);
}

// Volver a PRODUCCION (limpiar usuario_enrolando_id)
function setProduccion(codigo) {
  const sql = `
    UPDATE neg_t_timbres
    SET modo_actual = 'PRODUCCION',
        usuario_enrolando_id = NULL
    WHERE lector_codigo = ?
  `;
  return poolmysql.query(sql, [codigo]);
}

// 🔹 Obtener todos los timbres registrados
function selectAllTimbres() {
  const sql = `
    SELECT 
      id,
      lector_codigo,
      sucursal,
      tipo,
      modo_actual,
      last_heartbeat,
      usuario_enrolando_id
    FROM neg_t_timbres
    ORDER BY sucursal
  `;

  return poolmysql.query(sql);
}

module.exports = {
  selectConfigByCodigo,
  setEnrolamiento,
  setProduccion,
  selectAllTimbres,
};
