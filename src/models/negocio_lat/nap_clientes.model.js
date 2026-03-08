const { poolmysql } = require("../../config/db");

function normalizeOnu(value = "") {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/-/g, "");
}

function uniqInts(values = []) {
  return [
    ...new Set(
      values.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0),
    ),
  ];
}

function uniqOnus(values = []) {
  return [...new Set(values.map((v) => normalizeOnu(v)).filter(Boolean))];
}

function makeError(status, message, extra = {}) {
  const err = new Error(message);
  err.status = status;
  Object.assign(err, extra);
  return err;
}

function mapAsignacionRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    nap_id: Number(row.nap_id),
    nap_nombre: row.nap_nombre || null,
    puerto: Number(row.puerto),
    ord_ins: Number(row.ord_ins),
    onu: row.onu || "",
    observacion: row.observacion || null,
    created_at: row.created_at || null,
    created_by: row.created_by ?? null,
    updated_at: row.updated_at || null,
    updated_by: row.updated_by ?? null,
  };
}

async function getNapById(executor, napId, { lock = false } = {}) {
  const sql = `
    SELECT
      id,
      caja_nombre,
      caja_tipo,
      caja_estado,
      caja_root_split
    FROM neg_t_cajas
    WHERE id = ?
    LIMIT 1
    ${lock ? "FOR UPDATE" : ""}
  `;
  const [rows] = await executor.query(sql, [napId]);
  return rows[0] || null;
}

async function getAsignacionActualById(executor, id, { lock = false } = {}) {
  const sql = `
    SELECT
      nc.id,
      nc.nap_id,
      c.caja_nombre AS nap_nombre,
      nc.puerto,
      nc.ord_ins,
      nc.onu,
      nc.observacion,
      nc.created_at,
      nc.created_by,
      nc.updated_at,
      nc.updated_by
    FROM neg_t_nap_clientes nc
    LEFT JOIN neg_t_cajas c ON c.id = nc.nap_id
    WHERE nc.id = ?
    LIMIT 1
    ${lock ? "FOR UPDATE" : ""}
  `;
  const [rows] = await executor.query(sql, [id]);
  return mapAsignacionRow(rows[0] || null);
}

async function getAsignacionActualByOrdInsExecutor(
  executor,
  ordIns,
  { lock = false } = {},
) {
  const sql = `
    SELECT
      nc.id,
      nc.nap_id,
      c.caja_nombre AS nap_nombre,
      nc.puerto,
      nc.ord_ins,
      nc.onu,
      nc.observacion,
      nc.created_at,
      nc.created_by,
      nc.updated_at,
      nc.updated_by
    FROM neg_t_nap_clientes nc
    LEFT JOIN neg_t_cajas c ON c.id = nc.nap_id
    WHERE nc.ord_ins = ?
    LIMIT 1
    ${lock ? "FOR UPDATE" : ""}
  `;
  const [rows] = await executor.query(sql, [ordIns]);
  return mapAsignacionRow(rows[0] || null);
}

async function getAsignacionActualByOnuExecutor(
  executor,
  onu,
  { lock = false } = {},
) {
  const onuNorm = normalizeOnu(onu);
  const sql = `
    SELECT
      nc.id,
      nc.nap_id,
      c.caja_nombre AS nap_nombre,
      nc.puerto,
      nc.ord_ins,
      nc.onu,
      nc.observacion,
      nc.created_at,
      nc.created_by,
      nc.updated_at,
      nc.updated_by
    FROM neg_t_nap_clientes nc
    LEFT JOIN neg_t_cajas c ON c.id = nc.nap_id
    WHERE nc.onu = ?
    LIMIT 1
    ${lock ? "FOR UPDATE" : ""}
  `;
  const [rows] = await executor.query(sql, [onuNorm]);
  return mapAsignacionRow(rows[0] || null);
}

async function insertHistorial(executor, payload) {
  const sql = `
    INSERT INTO neg_t_nap_clientes_historial (
      nap_cliente_id_ref,
      tipo_evento,
      nap_id,
      puerto,
      ord_ins,
      onu,
      nap_id_origen,
      puerto_origen,
      nap_id_destino,
      puerto_destino,
      motivo,
      observacion,
      created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    payload.nap_cliente_id_ref ?? null,
    payload.tipo_evento,
    payload.nap_id ?? null,
    payload.puerto ?? null,
    payload.ord_ins ?? null,
    payload.onu ?? null,
    payload.nap_id_origen ?? null,
    payload.puerto_origen ?? null,
    payload.nap_id_destino ?? null,
    payload.puerto_destino ?? null,
    payload.motivo ?? null,
    payload.observacion ?? null,
    payload.created_by ?? null,
  ];

  const [result] = await executor.query(sql, params);
  return result.insertId;
}

async function findNextFreePuerto(executor, napId, capacidad) {
  const [rows] = await executor.query(
    `
      SELECT puerto
      FROM neg_t_nap_clientes
      WHERE nap_id = ?
      ORDER BY puerto ASC
    `,
    [napId],
  );

  const used = new Set(
    rows.map((r) => Number(r.puerto)).filter((n) => Number.isFinite(n)),
  );
  for (let i = 1; i <= capacidad; i++) {
    if (!used.has(i)) return i;
  }
  return null;
}

async function lookupServiciosControl({ ordInsList = [], onuList = [] }) {
  const ords = uniqInts(ordInsList);
  const onus = uniqOnus(onuList);

  if (!ords.length && !onus.length) {
    return [];
  }

  const where = [];
  const params = [];

  if (ords.length) {
    where.push(`nc.ord_ins IN (${ords.map(() => "?").join(",")})`);
    params.push(...ords);
  }

  if (onus.length) {
    where.push(`nc.onu IN (${onus.map(() => "?").join(",")})`);
    params.push(...onus);
  }

  const sql = `
    SELECT
      nc.id,
      nc.nap_id,
      c.caja_nombre AS nap_nombre,
      nc.puerto,
      nc.ord_ins,
      nc.onu,
      nc.created_at
    FROM neg_t_nap_clientes nc
    LEFT JOIN neg_t_cajas c ON c.id = nc.nap_id
    WHERE ${where.join(" OR ")}
    ORDER BY nc.id DESC
  `;

  const [rows] = await poolmysql.query(sql, params);

  const ordSet = new Set(ords);
  const onuSet = new Set(onus);

  return rows.map((row) => {
    const onuNorm = normalizeOnu(row.onu);

    return {
      ord_ins: Number(row.ord_ins || 0),
      onu: onuNorm,
      bloqueadoPorOrdIns: ordSet.has(Number(row.ord_ins || 0)),
      bloqueadoPorOnu: !!onuNorm && onuSet.has(onuNorm),
      detalle: {
        napId: row.nap_id != null ? Number(row.nap_id) : null,
        napNombre: row.nap_nombre || null,
        puerto: row.puerto != null ? Number(row.puerto) : null,
        onu: onuNorm || null,
        createdAt: row.created_at || null,
      },
    };
  });
}

async function getAsignacionActualByOrdIns(ordIns) {
  return getAsignacionActualByOrdInsExecutor(poolmysql, ordIns);
}

async function getAsignacionActualByOnu(onu) {
  return getAsignacionActualByOnuExecutor(poolmysql, onu);
}

async function createAsignacion({
  napId,
  puerto = null,
  ordIns,
  onu,
  observacion = null,
  actorUserId = null,
}) {
  const conn = await poolmysql.getConnection();

  try {
    await conn.beginTransaction();

    const napIdNum = Number(napId);
    const ordInsNum = Number(ordIns);
    const puertoNum = puerto == null || puerto === "" ? null : Number(puerto);
    const onuNorm = normalizeOnu(onu);

    if (!Number.isFinite(napIdNum) || napIdNum <= 0) {
      throw makeError(400, "nap_id inválido");
    }
    if (!Number.isFinite(ordInsNum) || ordInsNum <= 0) {
      throw makeError(400, "ord_ins inválido");
    }
    if (!onuNorm) {
      throw makeError(400, "onu requerida");
    }

    const nap = await getNapById(conn, napIdNum, { lock: true });
    if (!nap) throw makeError(404, "NAP no encontrada");
    if (String(nap.caja_tipo || "").toUpperCase() !== "NAP") {
      throw makeError(400, "La caja indicada no es una NAP");
    }

    const capacidad = Number(nap.caja_root_split || 0);
    if (!Number.isFinite(capacidad) || capacidad <= 0) {
      throw makeError(409, "La NAP no tiene capacidad válida configurada");
    }

    const existeOrd = await getAsignacionActualByOrdInsExecutor(
      conn,
      ordInsNum,
      {
        lock: true,
      },
    );
    if (existeOrd) {
      throw makeError(
        409,
        `El servicio ya está asignado en ${existeOrd.nap_nombre || "otra NAP"}, puerto ${existeOrd.puerto}`,
        {
          code: "ORD_INS_DUPLICADO",
          data: existeOrd,
        },
      );
    }

    const existeOnu = await getAsignacionActualByOnuExecutor(conn, onuNorm, {
      lock: true,
    });
    if (existeOnu) {
      throw makeError(
        409,
        `La ONU ya está asignada al servicio ${existeOnu.ord_ins} en ${existeOnu.nap_nombre || "otra NAP"}, puerto ${existeOnu.puerto}`,
        {
          code: "ONU_DUPLICADA",
          data: existeOnu,
        },
      );
    }

    let puertoFinal = null;

    if (puertoNum != null) {
      if (!Number.isFinite(puertoNum) || puertoNum <= 0) {
        throw makeError(400, "puerto inválido");
      }
      if (puertoNum > capacidad) {
        throw makeError(
          409,
          `El puerto ${puertoNum} supera la capacidad de la NAP (${capacidad})`,
        );
      }

      const [rowsPuerto] = await conn.query(
        `
          SELECT id
          FROM neg_t_nap_clientes
          WHERE nap_id = ? AND puerto = ?
          FOR UPDATE
        `,
        [napIdNum, puertoNum],
      );

      if (rowsPuerto.length) {
        throw makeError(409, `El puerto ${puertoNum} ya está ocupado`);
      }

      puertoFinal = puertoNum;
    } else {
      puertoFinal = await findNextFreePuerto(conn, napIdNum, capacidad);
      if (!puertoFinal) {
        throw makeError(409, "La NAP ya no tiene puertos disponibles");
      }
    }

    const [insertRes] = await conn.query(
      `
        INSERT INTO neg_t_nap_clientes (
          nap_id,
          puerto,
          ord_ins,
          onu,
          observacion,
          created_by,
          updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        napIdNum,
        puertoFinal,
        ordInsNum,
        onuNorm,
        observacion || null,
        actorUserId ?? null,
        actorUserId ?? null,
      ],
    );

    const asignacionId = insertRes.insertId;

    await insertHistorial(conn, {
      nap_cliente_id_ref: asignacionId,
      tipo_evento: "ASIGNACION",
      nap_id: napIdNum,
      puerto: puertoFinal,
      ord_ins: ordInsNum,
      onu: onuNorm,
      nap_id_destino: napIdNum,
      puerto_destino: puertoFinal,
      observacion: observacion || null,
      created_by: actorUserId ?? null,
    });

    const creada = await getAsignacionActualById(conn, asignacionId);

    await conn.commit();
    return creada;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function liberarAsignacionById(
  id,
  { motivo = null, observacion = null, actorUserId = null } = {},
) {
  const conn = await poolmysql.getConnection();

  try {
    await conn.beginTransaction();

    const idNum = Number(id);
    if (!Number.isFinite(idNum) || idNum <= 0) {
      throw makeError(400, "id inválido");
    }

    const actual = await getAsignacionActualById(conn, idNum, { lock: true });
    if (!actual) {
      throw makeError(404, "Asignación no encontrada");
    }

    await insertHistorial(conn, {
      nap_cliente_id_ref: actual.id,
      tipo_evento: "LIBERACION",
      nap_id: actual.nap_id,
      puerto: actual.puerto,
      ord_ins: actual.ord_ins,
      onu: actual.onu,
      nap_id_origen: actual.nap_id,
      puerto_origen: actual.puerto,
      motivo: motivo || null,
      observacion: observacion || actual.observacion || null,
      created_by: actorUserId ?? null,
    });

    await conn.query(`DELETE FROM neg_t_nap_clientes WHERE id = ?`, [
      actual.id,
    ]);

    await conn.commit();
    return actual;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function liberarAsignacionByOnu(onu, opts = {}) {
  const actual = await getAsignacionActualByOnu(onu);
  if (!actual) {
    throw makeError(404, "Asignación no encontrada para esa onu");
  }
  return liberarAsignacionById(actual.id, opts);
}

async function liberarAsignacionByOrdIns(ordIns, opts = {}) {
  const actual = await getAsignacionActualByOrdIns(ordIns);
  if (!actual) {
    throw makeError(404, "Asignación no encontrada para ese ord_ins");
  }
  return liberarAsignacionById(actual.id, opts);
}

async function listHistorial({
  ordIns = null,
  onu = null,
  napId = null,
  limit = 200,
} = {}) {
  const where = [];
  const params = [];

  if (ordIns != null && ordIns !== "") {
    const ordInsNum = Number(ordIns);
    if (Number.isFinite(ordInsNum) && ordInsNum > 0) {
      where.push(`h.ord_ins = ?`);
      params.push(ordInsNum);
    }
  }

  const onuNorm = normalizeOnu(onu);
  if (onuNorm) {
    where.push(`h.onu = ?`);
    params.push(onuNorm);
  }

  if (napId != null && napId !== "") {
    const napIdNum = Number(napId);
    if (Number.isFinite(napIdNum) && napIdNum > 0) {
      where.push(
        `(h.nap_id = ? OR h.nap_id_origen = ? OR h.nap_id_destino = ?)`,
      );
      params.push(napIdNum, napIdNum, napIdNum);
    }
  }

  const limitNum = Math.min(Math.max(Number(limit) || 200, 1), 500);

  const sql = `
    SELECT
      h.id,
      h.tipo_evento,
      h.nap_cliente_id_ref,
      h.nap_id,
      c.caja_nombre AS nap_nombre,
      h.puerto,
      h.ord_ins,
      h.onu,
      h.nap_id_origen,
      co.caja_nombre AS nap_nombre_origen,
      h.puerto_origen,
      h.nap_id_destino,
      cd.caja_nombre AS nap_nombre_destino,
      h.puerto_destino,
      h.motivo,
      h.observacion,
      h.created_at,
      h.created_by
    FROM neg_t_nap_clientes_historial h
    LEFT JOIN neg_t_cajas c ON c.id = h.nap_id
    LEFT JOIN neg_t_cajas co ON co.id = h.nap_id_origen
    LEFT JOIN neg_t_cajas cd ON cd.id = h.nap_id_destino
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY h.created_at DESC, h.id DESC
    LIMIT ${limitNum}
  `;

  const [rows] = await poolmysql.query(sql, params);

  return rows.map((row) => ({
    id: Number(row.id),
    tipo_evento: row.tipo_evento,
    nap_cliente_id_ref:
      row.nap_cliente_id_ref != null ? Number(row.nap_cliente_id_ref) : null,
    nap_id: row.nap_id != null ? Number(row.nap_id) : null,
    nap_nombre: row.nap_nombre || null,
    puerto: row.puerto != null ? Number(row.puerto) : null,
    ord_ins: row.ord_ins != null ? Number(row.ord_ins) : null,
    onu: row.onu || null,
    nap_id_origen: row.nap_id_origen != null ? Number(row.nap_id_origen) : null,
    nap_nombre_origen: row.nap_nombre_origen || null,
    puerto_origen: row.puerto_origen != null ? Number(row.puerto_origen) : null,
    nap_id_destino:
      row.nap_id_destino != null ? Number(row.nap_id_destino) : null,
    nap_nombre_destino: row.nap_nombre_destino || null,
    puerto_destino:
      row.puerto_destino != null ? Number(row.puerto_destino) : null,
    motivo: row.motivo || null,
    observacion: row.observacion || null,
    created_at: row.created_at || null,
    created_by: row.created_by != null ? Number(row.created_by) : null,
  }));
}

module.exports = {
  normalizeOnu,
  lookupServiciosControl,
  getAsignacionActualByOrdIns,
  getAsignacionActualByOnu,
  createAsignacion,
  liberarAsignacionById,
  liberarAsignacionByOrdIns,
  listHistorial,
  liberarAsignacionByOnu,
};
