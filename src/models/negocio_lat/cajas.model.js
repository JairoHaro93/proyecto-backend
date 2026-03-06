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

  // ✅ OLT
  olt_id,
  olt_slot,
  olt_pon,
  olt_frame_override,
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
      caja_pon_ruta,
      olt_id,
      olt_slot,
      olt_pon,
      olt_frame_override
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
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
      olt_id ?? null,
      olt_slot ?? null,
      olt_pon ?? null,
      olt_frame_override ?? null,
    ],
  );
}

// LISTAR CAJAS con filtros opcionales y bbox
function listCajas(filters = {}) {
  const { ciudad, tipo, estado, q, ne, sw, limit = 500, offset = 0 } = filters;

  const where = [];
  const params = [];

  if (ciudad) {
    where.push(`C.caja_ciudad = ?`);
    params.push(ciudad);
  }
  if (tipo) {
    where.push(`C.caja_tipo = ?`);
    params.push(tipo);
  }
  if (estado) {
    where.push(`C.caja_estado = ?`);
    params.push(estado);
  }
  if (q) {
    where.push(`(C.caja_nombre LIKE ? OR C.caja_hilo LIKE ?)`);
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
      `CAST(SUBSTRING_INDEX(C.caja_coordenadas, ',', 1) AS DECIMAL(10,6)) BETWEEN ? AND ?`,
    );
    where.push(
      `CAST(SUBSTRING_INDEX(C.caja_coordenadas, ',', -1) AS DECIMAL(10,6)) BETWEEN ? AND ?`,
    );
    params.push(minLat, maxLat, minLng, maxLng);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const sql = `
    SELECT
      C.id,
      C.caja_ciudad,
      C.caja_tipo,
      C.caja_estado,
      C.caja_nombre,
      C.caja_hilo,
      C.caja_coordenadas,
      C.caja_observacion,
      C.caja_root_split,
      C.caja_segmento,
      C.caja_pon_id,
      C.caja_pon_ruta,

      -- ✅ OLT (guardado en caja)
      C.olt_id,
      C.olt_slot,
      C.olt_pon,
      C.olt_frame_override,

      -- ✅ datos OLT (opcional para UI)
      O.olt_nombre,
      O.olt_frame_default,

      -- ✅ frame efectivo
      COALESCE(C.olt_frame_override, O.olt_frame_default) AS olt_frame,

      CAST(SUBSTRING_INDEX(C.caja_coordenadas, ',', 1) AS DECIMAL(10,6)) AS lat,
      CAST(SUBSTRING_INDEX(C.caja_coordenadas, ',', -1) AS DECIMAL(10,6)) AS lng,
      C.created_at
    FROM neg_t_cajas C
    LEFT JOIN neg_t_olts O ON O.id = C.olt_id
    ${whereSql}
    ORDER BY C.id DESC
    LIMIT ? OFFSET ?;
  `;

  params.push(Number(limit), Number(offset));
  return poolmysql.query(sql, params);
}

function selectCajaById(id) {
  return poolmysql.query(
    `
    SELECT
      C.id,
      C.caja_ciudad,
      C.caja_tipo,
      C.caja_estado,
      C.caja_nombre,
      C.caja_hilo,
      C.caja_coordenadas,
      C.caja_observacion,
      C.caja_root_split,
      C.caja_segmento,
      C.caja_pon_id,
      C.caja_pon_ruta,

      -- ✅ OLT (guardado en caja)
      C.olt_id,
      C.olt_slot,
      C.olt_pon,
      C.olt_frame_override,

      -- ✅ datos OLT (opcional para UI)
      O.olt_nombre,
      O.olt_frame_default,

      -- ✅ frame efectivo
      COALESCE(C.olt_frame_override, O.olt_frame_default) AS olt_frame,

      C.created_at
    FROM neg_t_cajas C
    LEFT JOIN neg_t_olts O ON O.id = C.olt_id
    WHERE C.id = ?
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

    // ✅ OLT
    "olt_id",
    "olt_slot",
    "olt_pon",
    "olt_frame_override",
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

function selectCajasByIds(ids) {
  const { uniq, ph } = buildIn(ids);
  return poolmysql.query(
    `SELECT id, caja_tipo, caja_root_split FROM neg_t_cajas WHERE id IN (${ph});`,
    uniq,
  );
}

// ---------- OLTs ----------
function listOltsBySucursal(sucursalId) {
  return poolmysql.query(
    `
    SELECT
      id,
      sucursal_id,
      olt_ciudad,
      olt_nombre,
      olt_ip,
      olt_vendor,
      olt_frame_default,
      estado,
      created_at
    FROM neg_t_olts
    WHERE sucursal_id = ?
      AND estado = 'ACTIVA'
    ORDER BY olt_nombre ASC;
    `,
    [sucursalId],
  );
}

function selectOltById(id) {
  return poolmysql.query(
    `
    SELECT
      id,
      sucursal_id,
      olt_ciudad,
      olt_frame_default,
      estado
    FROM neg_t_olts
    WHERE id = ?
    LIMIT 1;
    `,
    [id],
  );
}

// ✅ Crea 1 o varias PON (ramas) en transacción.
// ramas: [{ segmento: '0/4/9/S2/1', nombre: 'LAT-PON-0/4/9/S2/1-R8' }, ...]
async function insertPonRamasTx({
  ciudad,
  estado,
  hilo,
  coordenadas,
  observacion,
  root_split,
  olt_id,
  olt_slot,
  olt_pon,
  ramas = [],
}) {
  const conn = await poolmysql.getConnection();
  try {
    await conn.beginTransaction();

    const created = [];

    for (const r of ramas) {
      const segmento = String(r.segmento || "").trim();
      const nombre = String(r.nombre || "").trim();

      const [result] = await conn.query(
        `
        INSERT INTO neg_t_cajas (
          caja_ciudad, caja_tipo, caja_estado, caja_nombre, caja_hilo,
          caja_coordenadas, caja_observacion,
          caja_root_split, caja_segmento, caja_pon_id, caja_pon_ruta,
          olt_id, olt_slot, olt_pon, olt_frame_override
        ) VALUES (?, 'PON', ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, NULL);
        `,
        [
          ciudad ?? null,
          estado ?? "DISEÑO",
          nombre ?? null,
          hilo ?? null,
          coordenadas ?? null,
          observacion ?? null,
          root_split ?? null,
          segmento ?? null,
          olt_id ?? null,
          olt_slot ?? null,
          olt_pon ?? null,
        ],
      );

      created.push({
        id: result.insertId,
        caja_nombre: nombre,
        caja_segmento: segmento,
      });
    }

    await conn.commit();
    return created;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
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

  // ✅ OLTs
  listOltsBySucursal,
  selectOltById,
  insertPonRamasTx,
};
