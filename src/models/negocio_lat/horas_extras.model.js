// C:\PROYECTO\Backend\src\models\negocio_lat\horas_extras.model.js
const { poolmysql } = require("../../config/db");

// ===============================
// Helpers
// ===============================
async function calcMinutos(hora_inicio, hora_fin) {
  const [rows] = await poolmysql.query(
    `SELECT TIMESTAMPDIFF(MINUTE,
        CONCAT(CURDATE(),' ', ?),
        CONCAT(CURDATE(),' ', ?)
     ) AS mins`,
    [hora_inicio, hora_fin],
  );
  return Number(rows?.[0]?.mins ?? 0);
}

async function validarUsuarioPuedeSolicitar(usuario_id) {
  const [rows] = await poolmysql.query(
    `SELECT departamento_id
     FROM sisusuarios
     WHERE id = ?
     LIMIT 1`,
    [usuario_id],
  );

  if (!rows.length) throw new Error("USUARIO_NO_ENCONTRADO");

  const depto = rows[0].departamento_id;
  if (depto == null) {
    throw new Error(
      "NO_PERMITIDO: usuario sin departamento no puede solicitar horas extra.",
    );
  }

  return { departamento_id: Number(depto) };
}

// ===============================
// Crear solicitud HOY
// ===============================
async function crearSolicitudHoraExtra({
  usuario_id,
  hora_inicio,
  hora_fin,
  observacion,
}) {
  await validarUsuarioPuedeSolicitar(usuario_id);

  const obs = (observacion ?? "").toString().trim();
  if (!obs || obs.length < 5) {
    throw new Error("OBS_OBLIGATORIA: observacion mínima 5 caracteres.");
  }

  const mins = await calcMinutos(hora_inicio, hora_fin);

  if (!Number.isFinite(mins) || mins < 1) {
    throw new Error(
      "hora_fin debe ser mayor a hora_inicio (no cruce medianoche).",
    );
  }

  if (mins < 30 || mins % 30 !== 0) {
    throw new Error("MINUTOS_INVALIDOS: solo múltiplos de 30 (min 30).");
  }

  try {
    const [r] = await poolmysql.query(
      `
      INSERT INTO neg_t_horas_extras_solicitudes
        (usuario_id, fecha, hora_inicio, hora_fin, minutos, observacion, estado, solicitado_at, updated_at)
      VALUES
        (?, CURDATE(), ?, ?, ?, ?, 'SOLICITUD', NOW(), NOW())
      `,
      [usuario_id, hora_inicio, hora_fin, mins, obs],
    );

    return { id: r.insertId, minutos: mins, fecha: null };
  } catch (e) {
    if (e?.code === "ER_DUP_ENTRY") {
      throw new Error(
        "YA_EXISTE: ya tienes una solicitud de horas extra para HOY.",
      );
    }
    throw e;
  }
}

// ✅ listado mínimo para Flutter
async function listarMisSolicitudesMin(usuario_id, desde, hasta) {
  const [rows] = await poolmysql.query(
    `
    SELECT
      id,
      fecha,
      minutos,
      estado
    FROM neg_t_horas_extras_solicitudes
    WHERE usuario_id = ?
      AND fecha BETWEEN ? AND ?
    ORDER BY fecha DESC, solicitado_at DESC
    `,
    [usuario_id, desde, hasta],
  );
  return rows;
}

// ===============================
// Pendientes aprobador
// ===============================
async function listarPendientes({ desde, hasta, aprobador_id }) {
  const [rows] = await poolmysql.query(
    `
    SELECT
      s.id, s.usuario_id, s.fecha, s.hora_inicio, s.hora_fin, s.minutos,
      s.observacion, s.estado, s.solicitado_at,
      CONCAT(u.nombre,' ',u.apellido) AS usuario_nombre,
      u.sucursal_id, u.departamento_id
    FROM neg_t_horas_extras_solicitudes s
    JOIN sisusuarios u ON u.id = s.usuario_id
    WHERE s.estado = 'SOLICITUD'
      AND s.fecha BETWEEN ? AND ?
      AND u.departamento_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM neg_t_horas_extra_aprobadores a
        WHERE a.departamento_id = u.departamento_id
          AND a.aprobador_usuario_id = ?
          AND a.activo = 1
        LIMIT 1
      )
    ORDER BY s.fecha ASC, s.solicitado_at ASC
    `,
    [desde, hasta, aprobador_id],
  );
  return rows;
}

// ===============================
// Aprobación / rechazo / eliminar
// (dejo tu lógica igual)
// ===============================
async function validarAprobadorConn(conn, { departamento_id, aprobador_id }) {
  if (departamento_id == null) return false;

  const [ok] = await conn.query(
    `
    SELECT 1
    FROM neg_t_horas_extra_aprobadores a
    WHERE a.departamento_id = ?
      AND a.aprobador_usuario_id = ?
      AND a.activo = 1
    LIMIT 1
    `,
    [departamento_id, aprobador_id],
  );

  return ok.length > 0;
}

async function aprobarSolicitud(solicitudId, aprobador_id) {
  const conn = await poolmysql.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `
      SELECT
        s.*,
        u.departamento_id
      FROM neg_t_horas_extras_solicitudes s
      JOIN sisusuarios u ON u.id = s.usuario_id
      WHERE s.id = ?
      FOR UPDATE
      `,
      [solicitudId],
    );
    if (!rows.length) throw new Error("Solicitud no encontrada.");
    const sol = rows[0];

    if (String(sol.estado).toUpperCase() !== "SOLICITUD") {
      throw new Error("ESTADO_INVALIDO: la solicitud no está en SOLICITUD.");
    }

    const autorizado = await validarAprobadorConn(conn, {
      departamento_id: sol.departamento_id,
      aprobador_id,
    });
    if (!autorizado) throw new Error("NO_AUTORIZADO");

    const obs = (sol.observacion ?? "").toString().slice(0, 255) || null;

    const [mov] = await conn.query(
      `
      INSERT INTO neg_t_horas_movimientos
        (usuario_id, mov_tipo, mov_concepto, minutos, fecha, turno_id, estado, hora_acum_aprobado_por, observacion, created_at, updated_at)
      VALUES
        (?, 'CREDITO', 'HORA_EXTRA', ?, ?, NULL, 'APROBADO', ?, ?, NOW(), NOW())
      `,
      [sol.usuario_id, Number(sol.minutos || 0), sol.fecha, aprobador_id, obs],
    );

    const movimiento_id = mov.insertId;

    await conn.query(
      `
      UPDATE neg_t_horas_extras_solicitudes
      SET estado='APROBADO',
          aprobado_por=?,
          aprobado_at=NOW(),
          movimiento_id=?,
          updated_at=NOW()
      WHERE id=?
      LIMIT 1
      `,
      [aprobador_id, movimiento_id, solicitudId],
    );

    await conn.commit();
    return { id: solicitudId, movimiento_id };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function rechazarSolicitud(solicitudId, aprobador_id, motivo_rechazo) {
  const conn = await poolmysql.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `
      SELECT
        s.*,
        u.departamento_id
      FROM neg_t_horas_extras_solicitudes s
      JOIN sisusuarios u ON u.id = s.usuario_id
      WHERE s.id = ?
      FOR UPDATE
      `,
      [solicitudId],
    );
    if (!rows.length) throw new Error("Solicitud no encontrada.");
    const sol = rows[0];

    if (String(sol.estado).toUpperCase() !== "SOLICITUD") {
      throw new Error("ESTADO_INVALIDO: la solicitud no está en SOLICITUD.");
    }

    const autorizado = await validarAprobadorConn(conn, {
      departamento_id: sol.departamento_id,
      aprobador_id,
    });
    if (!autorizado) throw new Error("NO_AUTORIZADO");

    await conn.query(
      `
      UPDATE neg_t_horas_extras_solicitudes
      SET estado='RECHAZADO',
          aprobado_por=?,
          aprobado_at=NOW(),
          motivo_rechazo=?,
          updated_at=NOW()
      WHERE id=?
      LIMIT 1
      `,
      [aprobador_id, String(motivo_rechazo).slice(0, 255), solicitudId],
    );

    await conn.commit();
    return { id: solicitudId };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function eliminarSolicitud(solicitudId, usuario_id) {
  const conn = await poolmysql.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `
      SELECT id, usuario_id, estado, fecha, movimiento_id
      FROM neg_t_horas_extras_solicitudes
      WHERE id = ?
      FOR UPDATE
      `,
      [solicitudId],
    );

    if (!rows.length) throw new Error("NO_EXISTE");
    const s = rows[0];

    if (Number(s.usuario_id) !== Number(usuario_id))
      throw new Error("NO_AUTORIZADO");
    if (String(s.estado).toUpperCase() !== "SOLICITUD") {
      throw new Error("ESTADO_INVALIDO: solo se puede eliminar en SOLICITUD.");
    }
    if (s.movimiento_id != null) {
      throw new Error(
        "ESTADO_INVALIDO: no se puede eliminar si ya tiene movimiento.",
      );
    }

    const [r] = await conn.query(
      `
      DELETE FROM neg_t_horas_extras_solicitudes
      WHERE id = ?
        AND usuario_id = ?
        AND estado = 'SOLICITUD'
        AND fecha = CURDATE()
        AND movimiento_id IS NULL
      LIMIT 1
      `,
      [solicitudId, usuario_id],
    );

    if (!r.affectedRows) {
      throw new Error("ESTADO_INVALIDO: solo se puede eliminar HOY.");
    }

    await conn.commit();
    return { id: solicitudId, eliminado: true };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// ===============================
// ✅ NUEVO: APROBADAS DETALLE desde movimientos (para celdas)
// ===============================
async function listarAprobadasMovimientos(desde, hasta) {
  const [rows] = await poolmysql.query(
    `
    SELECT
      m.id,
      m.usuario_id,
      CONCAT(u.nombre,' ',u.apellido) AS usuario_nombre,
      DATE_FORMAT(m.fecha, '%Y-%m-%d') AS fecha,
      m.minutos,
      m.observacion,
      DATE_FORMAT(m.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
    FROM neg_t_horas_movimientos m
    JOIN sisusuarios u ON u.id = m.usuario_id
    WHERE m.mov_tipo = 'CREDITO'
      AND m.mov_concepto = 'HORA_EXTRA'
      AND m.estado = 'APROBADO'
      AND m.fecha BETWEEN ? AND ?
    ORDER BY m.fecha DESC, m.created_at DESC
    `,
    [desde, hasta],
  );

  return (rows || []).map((r) => ({
    id: Number(r.id || 0),
    usuario_id: Number(r.usuario_id || 0),
    usuario_nombre: (r.usuario_nombre ?? "").toString(),
    fecha: (r.fecha ?? "").toString(), // ✅ ya viene YYYY-MM-DD
    minutos: Number(r.minutos || 0),
    observacion: r.observacion != null ? String(r.observacion) : null,
    created_at: r.created_at ? String(r.created_at) : null, // ✅ YYYY-MM-DD HH:mm:ss
  }));
}

// ✅ Resumen por persona (lo dejas igual)
async function listarAprobadasResumenMovimientos(desde, hasta) {
  const [rows] = await poolmysql.query(
    `
    SELECT
      m.usuario_id,
      CONCAT(u.nombre,' ',u.apellido) AS usuario_nombre,
      COUNT(*) AS cantidad,
      SUM(m.minutos) AS total_minutos
    FROM neg_t_horas_movimientos m
    JOIN sisusuarios u ON u.id = m.usuario_id
    WHERE m.mov_tipo = 'CREDITO'
      AND m.mov_concepto = 'HORA_EXTRA'
      AND m.estado = 'APROBADO'
      AND m.fecha BETWEEN ? AND ?
    GROUP BY m.usuario_id, usuario_nombre
    ORDER BY total_minutos DESC, usuario_nombre ASC
    `,
    [desde, hasta],
  );

  return (rows || []).map((r) => ({
    usuario_id: Number(r.usuario_id || 0),
    usuario_nombre: (r.usuario_nombre ?? "").toString(),
    cantidad: Number(r.cantidad || 0),
    total_minutos: Number(r.total_minutos || 0),
  }));
}

module.exports = {
  crearSolicitudHoraExtra,
  listarMisSolicitudesMin,
  listarPendientes,
  aprobarSolicitud,
  rechazarSolicitud,
  eliminarSolicitud,
  listarAprobadasMovimientos,
  listarAprobadasResumenMovimientos,
};
