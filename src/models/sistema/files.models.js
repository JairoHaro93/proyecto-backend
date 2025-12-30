// src/models/sistema/files.models.js
const { poolmysql } = require("../../config/db");

async function selectFileById(fileId) {
  const [rows] = await poolmysql.query(
    `SELECT id, ruta_relativa, mimetype, size, checksum, created_by, created_at
     FROM files
     WHERE id = ?
     LIMIT 1`,
    [fileId]
  );
  return rows?.[0] || null;
}

async function selectFileLinksByFileId(fileId) {
  const [rows] = await poolmysql.query(
    `SELECT id, module, entity_id, tag, position, file_id, created_by, created_at
     FROM file_links
     WHERE file_id = ?
     ORDER BY created_at DESC`,
    [fileId]
  );
  return rows || [];
}

// Solo lo usamos cuando module='vacaciones'
async function selectVacAsignacionOwner(vacacionId) {
  const [rows] = await poolmysql.query(
    `SELECT id, usuario_id, jefe_id, estado, fecha_desde, fecha_hasta
     FROM vac_asignaciones
     WHERE id = ?
     LIMIT 1`,
    [vacacionId]
  );
  return rows?.[0] || null;
}

module.exports = {
  selectFileById,
  selectFileLinksByFileId,
  selectVacAsignacionOwner,
};
