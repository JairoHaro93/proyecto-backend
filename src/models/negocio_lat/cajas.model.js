const { poolmysql } = require("../../config/db");

// INSERTAR NUEVO REGISTRO Caja (corregido + nuevos campos)
function insertCaja({
  caja_tipo,
  caja_nombre,
  caja_estado = "DISEÑO",
  caja_hilo,
  caja_coordenadas,
  caja_ciudad, // 'LATACUNGA' | 'SALCEDO'
}) {
  return poolmysql.query(
    `
    INSERT INTO neg_t_cajas (
      caja_estado,
      caja_nombre,
      caja_tipo,
      caja_hilo,
      caja_coordenadas,
      caja_ciudad
    ) VALUES (?, ?, ?, ?, ?, ?);
    `,
    [
      caja_estado,
      caja_nombre,
      caja_tipo,
      caja_hilo ?? null,
      caja_coordenadas ?? null,
      caja_ciudad ?? null,
    ]
  );
}

// LISTAR CAJAS con filtros opcionales y bbox
function listCajas(filters = {}) {
  const { ciudad, tipo, estado, q, ne, sw, limit = 500, offset = 0 } = filters;

  const where = [];
  const params = [];

  if (ciudad) {
    where.push(`caja_ciudad = ?`);
    params.push(ciudad);
  }
  if (tipo) {
    where.push(`caja_tipo = ?`);
    params.push(tipo);
  }
  if (estado) {
    where.push(`caja_estado = ?`);
    params.push(estado);
  }
  if (q) {
    where.push(`(caja_nombre LIKE ? OR caja_hilo LIKE ?)`);
    params.push(`%${q}%`, `%${q}%`);
  }

  // filtro por bounding box (ne=lat,lng y sw=lat,lng)
  if (ne && sw) {
    const [neLat, neLng] = ne.split(",").map(Number);
    const [swLat, swLng] = sw.split(",").map(Number);
    const minLat = Math.min(neLat, swLat);
    const maxLat = Math.max(neLat, swLat);
    const minLng = Math.min(neLng, swLng);
    const maxLng = Math.max(neLng, swLng);

    where.push(
      `CAST(SUBSTRING_INDEX(caja_coordenadas, ',', 1) AS DECIMAL(10,6)) BETWEEN ? AND ?`
    );
    where.push(
      `CAST(SUBSTRING_INDEX(caja_coordenadas, ',', -1) AS DECIMAL(10,6)) BETWEEN ? AND ?`
    );
    params.push(minLat, maxLat, minLng, maxLng);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const sql = `
    SELECT
      id,
      caja_tipo,
      caja_nombre,
      caja_estado,
      caja_hilo,
      caja_ciudad,
      caja_coordenadas,
      CAST(SUBSTRING_INDEX(caja_coordenadas, ',', 1) AS DECIMAL(10,6)) AS lat,
      CAST(SUBSTRING_INDEX(caja_coordenadas, ',', -1) AS DECIMAL(10,6)) AS lng,
      created_at
    FROM neg_t_cajas
    ${whereSql}
    ORDER BY id DESC
    LIMIT ? OFFSET ?;
  `;

  params.push(Number(limit), Number(offset));
  return poolmysql.query(sql, params);
}

module.exports = {
  insertCaja,
  listCajas,
};
