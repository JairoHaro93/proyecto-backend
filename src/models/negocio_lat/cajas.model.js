const { poolmysql } = require("../../config/db");

// ---------- HELPERS ----------
function buildIn(ids = []) {
  const clean = ids
    .map((x) => Number.parseInt(String(x), 10))
    .filter((n) => Number.isFinite(n) && n > 0);

  const uniq = [...new Set(clean)];
  const ph = uniq.map(() => "?").join(",");
  return { uniq, ph: ph || "NULL" };
}

// ---------- CAJAS ----------
function insertCaja({
  caja_ciudad,
  caja_tipo,
  caja_estado,
  caja_nombre,
  caja_hilo,
  caja_coordenadas,
  caja_observacion,

  // nuevos
  caja_root_split,
  caja_segmento,
  caja_pon_id,
  caja_pon_ruta,
}) {
  return poolmysql.query(
    `
    INSERT INTO neg_t_cajas (
      caja_ciudad,
      caja_tipo,
      caja_estado,
      caja_nombre,
      caja_hilo,
      caja_coordenadas,
      caja_observacion,
      caja_root_split,
      caja_segmento,
      caja_pon_id,
      caja_pon_ruta
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `,
    [
      caja_ciudad ?? null,
      caja_tipo ?? null,
      caja_estado ?? null,
      caja_nombre ?? null,
      caja_hilo ?? null,
      caja_coordenadas ?? null,
      caja_observacion ?? null,
      caja_root_split ?? null,
      caja_segmento ?? null,
      caja_pon_id ?? null,
      caja_pon_ruta ?? null,
    ],
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

  // bbox (ne=lat,lng y sw=lat,lng)
  if (ne && sw) {
    const [neLat, neLng] = String(ne).split(",").map(Number);
    const [swLat, swLng] = String(sw).split(",").map(Number);

    const minLat = Math.min(neLat, swLat);
    const maxLat = Math.max(neLat, swLat);
    const minLng = Math.min(neLng, swLng);
    const maxLng = Math.max(neLng, swLng);

    where.push(
      `CAST(SUBSTRING_INDEX(caja_coordenadas, ',', 1) AS DECIMAL(10,6)) BETWEEN ? AND ?`,
    );
    where.push(
      `CAST(SUBSTRING_INDEX(caja_coordenadas, ',', -1) AS DECIMAL(10,6)) BETWEEN ? AND ?`,
    );
    params.push(minLat, maxLat, minLng, maxLng);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const sql = `
    SELECT
      id,
      caja_ciudad,
      caja_tipo,
      caja_estado,
      caja_nombre,
      caja_hilo,
      caja_coordenadas,
      caja_observacion,
      caja_root_split,
      caja_segmento,
      caja_pon_id,
      caja_pon_ruta,
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

function selectCajaById(id) {
  return poolmysql.query(
    `
    SELECT
      id,
      caja_ciudad,
      caja_tipo,
      caja_estado,
      caja_nombre,
      caja_hilo,
      caja_coordenadas,
      caja_observacion,
      caja_root_split,
      caja_segmento,
      caja_pon_id,
      caja_pon_ruta,
      created_at
    FROM neg_t_cajas
    WHERE id = ?
    LIMIT 1;
    `,
    [id],
  );
}

function updateCajaById(id, patch = {}) {
  const allowed = [
    "caja_ciudad",
    "caja_tipo",
    "caja_estado",
    "caja_nombre",
    "caja_hilo",
    "caja_coordenadas",
    "caja_observacion",
    "caja_root_split",
    "caja_segmento",
    "caja_pon_id",
    "caja_pon_ruta",
  ];

  const sets = [];
  const params = [];

  for (const k of allowed) {
    if (patch[k] !== undefined) {
      sets.push(`${k} = ?`);
      params.push(patch[k] === "" ? null : patch[k]);
    }
  }

  if (!sets.length) return Promise.resolve([{ affectedRows: 0 }]);

  params.push(id);

  return poolmysql.query(
    `
    UPDATE neg_t_cajas
    SET ${sets.join(", ")}
    WHERE id = ?;
    `,
    params,
  );
}

// ---------- SPLITTERS ----------
function listSplittersByCaja(caja_id) {
  return poolmysql.query(
    `
    SELECT caja_id, path, factor, created_at
    FROM neg_t_caja_splitters
    WHERE caja_id = ?
    ORDER BY id ASC;
    `,
    [caja_id],
  );
}

function insertSplitter(caja_id, path, factor) {
  return poolmysql.query(
    `
    INSERT INTO neg_t_caja_splitters (caja_id, path, factor)
    VALUES (?, ?, ?);
    `,
    [caja_id, path, factor],
  );
}

// ---------- NAPs colgadas de una PON (ocupación de rutas) ----------
function listNapRoutesByPon(pon_id) {
  return poolmysql.query(
    `
    SELECT id, caja_pon_ruta
    FROM neg_t_cajas
    WHERE caja_tipo = 'NAP'
      AND caja_pon_id = ?
      AND caja_pon_ruta IS NOT NULL;
    `,
    [pon_id],
  );
}

// ---------- Clientes asignados a una NAP ----------
function countClientesByNap(nap_id) {
  return poolmysql.query(
    `
    SELECT COUNT(*) AS usados
    FROM neg_t_nap_clientes
    WHERE nap_id = ?;
    `,
    [nap_id],
  );
}

// ---------- BATCH HELPERS (para getCajas eficiente) ----------

// NAP usados (clientes por NAP)
function countClientesByNapIds(napIds) {
  const { uniq, ph } = buildIn(napIds);
  return poolmysql.query(
    `
    SELECT nap_id, COUNT(*) AS usados
    FROM neg_t_nap_clientes
    WHERE nap_id IN (${ph})
    GROUP BY nap_id;
    `,
    uniq,
  );
}

// PON usados (NAPs colgadas por PON)
function countNapsByPonIds(ponIds) {
  const { uniq, ph } = buildIn(ponIds);
  return poolmysql.query(
    `
    SELECT caja_pon_id AS pon_id, COUNT(*) AS usados
    FROM neg_t_cajas
    WHERE caja_tipo='NAP' AND caja_pon_id IN (${ph})
    GROUP BY caja_pon_id;
    `,
    uniq,
  );
}

// Splitters por caja (PONs)
function listSplittersByCajaIds(cajaIds) {
  const { uniq, ph } = buildIn(cajaIds);
  return poolmysql.query(
    `
    SELECT caja_id, path, factor
    FROM neg_t_caja_splitters
    WHERE caja_id IN (${ph});
    `,
    uniq,
  );
}

// (Opcional) si algún día lo quieres usar
function selectCajasByIds(ids) {
  const { uniq, ph } = buildIn(ids);
  return poolmysql.query(
    `SELECT id, caja_tipo, caja_root_split FROM neg_t_cajas WHERE id IN (${ph});`,
    uniq,
  );
}

module.exports = {
  // cajas
  insertCaja,
  listCajas,
  selectCajaById,
  updateCajaById,

  // splitters
  listSplittersByCaja,
  insertSplitter,

  // pon/nap ocupación y clientes
  listNapRoutesByPon,
  countClientesByNap,

  // batch eficiente
  countClientesByNapIds,
  countNapsByPonIds,
  listSplittersByCajaIds,

  // opcional
  selectCajasByIds,
};
