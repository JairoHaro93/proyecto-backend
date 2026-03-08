const { poolmysql } = require("../../config/db");

/**
 * Lista OLTs activas por sucursal.
 * Útil si luego quieres mostrar opciones o validar cobertura.
 */
async function listOltsActivasBySucursal(sucursalId) {
  const sql = `
    SELECT
      id,
      sucursal_id,
      olt_ciudad,
      olt_nombre,
      olt_ip,
      olt_port,
      olt_vendor,
      olt_frame_default,
      estado,
      created_at,
      updated_at
    FROM neg_t_olts
    WHERE sucursal_id = ?
      AND estado = 'ACTIVA'
    ORDER BY olt_nombre ASC
  `;

  const [rows] = await poolmysql.query(sql, [sucursalId]);
  return rows;
}

/**
 * Trae configuración completa de una OLT por id.
 */
async function getOltConfigById(oltId) {
  const sql = `
    SELECT
      id,
      sucursal_id,
      olt_ciudad,
      olt_nombre,
      olt_ip,
      olt_port,
      olt_username,
      olt_password,
      olt_timeout_ms,
      olt_vendor,
      olt_frame_default,
      olt_lineprofile,
      olt_srvprofile,
      olt_vlan,
      olt_gemport,
      olt_eth,
      olt_ontid_min,
      olt_ontid_max,
      estado,
      created_at,
      updated_at
    FROM neg_t_olts
    WHERE id = ?
    LIMIT 1
  `;

  const [rows] = await poolmysql.query(sql, [oltId]);
  return rows[0] || null;
}

/**
 * Trae configuración completa de una OLT activa por id.
 */
async function getOltConfigActivaById(oltId) {
  const sql = `
    SELECT
      id,
      sucursal_id,
      olt_ciudad,
      olt_nombre,
      olt_ip,
      olt_port,
      olt_username,
      olt_password,
      olt_timeout_ms,
      olt_vendor,
      olt_frame_default,
      olt_lineprofile,
      olt_srvprofile,
      olt_vlan,
      olt_gemport,
      olt_eth,
      olt_ontid_min,
      olt_ontid_max,
      estado,
      created_at,
      updated_at
    FROM neg_t_olts
    WHERE id = ?
      AND estado = 'ACTIVA'
    LIMIT 1
  `;

  const [rows] = await poolmysql.query(sql, [oltId]);
  return rows[0] || null;
}

/**
 * Resuelve el contexto OLT desde una caja.
 *
 * Reglas:
 * - Si la caja seleccionada es PON, usa esa misma caja como PON.
 * - Si la caja seleccionada es NAP, sube a su PON padre usando caja_pon_id.
 * - La OLT real se toma desde la PON resuelta.
 */
async function getCajaOltContext(cajaId) {
  const sql = `
    SELECT
      c.id AS caja_id,
      c.caja_tipo,
      c.caja_nombre,
      c.caja_ciudad,
      c.caja_segmento,
      c.caja_pon_id,
      c.caja_pon_ruta,
      c.caja_estado,
      c.olt_id,
      c.olt_slot,
      c.olt_pon,
      c.olt_frame_override,

      p.id AS pon_id,
      p.caja_nombre AS pon_nombre,
      p.caja_segmento AS pon_segmento,
      p.caja_estado AS pon_estado,
      p.olt_id AS pon_olt_id,
      p.olt_slot AS pon_olt_slot,
      p.olt_pon AS pon_olt_pon,
      p.olt_frame_override AS pon_olt_frame_override,

      o.id AS resolved_olt_id,
      o.sucursal_id,
      o.olt_ciudad,
      o.olt_nombre,
      o.olt_ip,
      o.olt_port,
      o.olt_username,
      o.olt_password,
      o.olt_timeout_ms,
      o.olt_vendor,
      o.olt_frame_default,
      o.olt_lineprofile,
      o.olt_srvprofile,
      o.olt_vlan,
      o.olt_gemport,
      o.olt_eth,
      o.olt_ontid_min,
      o.olt_ontid_max,
      o.estado AS olt_estado
    FROM neg_t_cajas c
    LEFT JOIN neg_t_cajas p
      ON p.id = CASE
        WHEN c.caja_tipo = 'PON' THEN c.id
        ELSE c.caja_pon_id
      END
    LEFT JOIN neg_t_olts o
      ON o.id = p.olt_id
    WHERE c.id = ?
    LIMIT 1
  `;

  const [rows] = await poolmysql.query(sql, [cajaId]);
  const row = rows[0] || null;
  if (!row) return null;

  return {
    caja: {
      id: row.caja_id,
      tipo: row.caja_tipo,
      nombre: row.caja_nombre,
      ciudad: row.caja_ciudad,
      segmento: row.caja_segmento,
      ponId: row.caja_pon_id,
      ponRuta: row.caja_pon_ruta,
      estado: row.caja_estado,
      oltId: row.olt_id,
      oltSlot: row.olt_slot,
      oltPon: row.olt_pon,
      oltFrameOverride: row.olt_frame_override,
    },
    pon: row.pon_id
      ? {
          id: row.pon_id,
          nombre: row.pon_nombre,
          segmento: row.pon_segmento,
          estado: row.pon_estado,
          oltId: row.pon_olt_id,
          oltSlot: row.pon_olt_slot,
          oltPon: row.pon_olt_pon,
          oltFrameOverride: row.pon_olt_frame_override,
        }
      : null,
    olt: row.resolved_olt_id
      ? {
          id: row.resolved_olt_id,
          sucursalId: row.sucursal_id,
          ciudad: row.olt_ciudad,
          nombre: row.olt_nombre,
          ip: row.olt_ip,
          port: row.olt_port,
          username: row.olt_username,
          password: row.olt_password,
          timeoutMs: row.olt_timeout_ms,
          vendor: row.olt_vendor,
          frameDefault: row.olt_frame_default,
          lineprofile: row.olt_lineprofile,
          srvprofile: row.olt_srvprofile,
          vlan: row.olt_vlan,
          gemport: row.olt_gemport,
          eth: row.olt_eth,
          ontIdMin: row.olt_ontid_min,
          ontIdMax: row.olt_ontid_max,
          estado: row.olt_estado,
        }
      : null,
  };
}

module.exports = {
  listOltsActivasBySucursal,
  getOltConfigById,
  getOltConfigActivaById,
  getCajaOltContext,
};
