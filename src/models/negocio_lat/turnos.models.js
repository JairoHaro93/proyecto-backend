// src/models/negocio_lat/turnos.models.js
const { poolmysql } = require("../../config/db");

// ===============================
//   LISTAR TURNOS (ADMIN/JEFES)
// ===============================
async function seleccionarTurnosDiarios({
  sucursal,
  fechaDesde,
  fechaHasta,
  usuarioId,
}) {
  const params = [];
  let sql = `
    SELECT
      t.*,
      TIME(t.hora_entrada_real) AS hora_entrada_real,
      TIME(t.hora_salida_real)  AS hora_salida_real,
      CONCAT(u.nombre, ' ', u.apellido) AS usuario_nombre,
      u.usuario AS usuario_usuario,
      u.ci AS usuario_cedula
    FROM neg_t_turnos_diarios t
    JOIN sisusuarios u ON u.id = t.usuario_id
    WHERE 1=1
  `;

  if (sucursal) {
    sql += " AND t.sucursal = ?";
    params.push(sucursal);
  }
  if (fechaDesde) {
    sql += " AND t.fecha >= ?";
    params.push(fechaDesde);
  }
  if (fechaHasta) {
    sql += " AND t.fecha <= ?";
    params.push(fechaHasta);
  }
  if (usuarioId) {
    sql += " AND t.usuario_id = ?";
    params.push(usuarioId);
  }

  sql += " ORDER BY t.fecha ASC, u.nombre ASC, u.apellido ASC";

  const [rows] = await poolmysql.query(sql, params);
  return rows;
}

// ===============================
//   GENERAR TURNOS (LOTE)
// ===============================

function formatFecha(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function enumerarFechas(
  fechaDesdeStr,
  fechaHastaStr,
  excluirFinesSemana = true
) {
  if (!fechaDesdeStr || !fechaHastaStr) return [];

  const start = new Date(`${fechaDesdeStr}T00:00:00`);
  const end = new Date(`${fechaHastaStr}T00:00:00`);

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return [];

  const fechas = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const day = d.getDay(); // 0=Dom,6=Sab
    if (excluirFinesSemana && (day === 0 || day === 6)) continue;
    fechas.push(formatFecha(d));
  }
  return fechas;
}

async function generarTurnosDiariosLote({
  usuarioIds = [],
  fechaDesde,
  fechaHasta,
  sucursal,
  horaEntradaProg,
  horaSalidaProg,
  minTolerAtraso = 0,
  minTolerSalida = 0,
  excluirFinesSemana = true,
  sobrescribirExistentes = false,
}) {
  usuarioIds = (usuarioIds || [])
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id));

  if (!usuarioIds.length)
    return { totalIntentos: 0, totalInsertados: 0, totalOmitidos: 0 };

  const fechas = enumerarFechas(fechaDesde, fechaHasta, excluirFinesSemana);
  if (!fechas.length)
    return { totalIntentos: 0, totalInsertados: 0, totalOmitidos: 0 };

  const combos = [];
  for (const usuarioId of usuarioIds)
    for (const fecha of fechas) combos.push({ usuarioId, fecha });

  const totalIntentos = combos.length;
  let totalOmitidos = 0;

  if (sobrescribirExistentes) {
    const pairsSql = combos.map(() => "(?, ?)").join(", ");
    const params = [];
    combos.forEach((c) => params.push(c.usuarioId, c.fecha));
    await poolmysql.query(
      `DELETE FROM neg_t_turnos_diarios WHERE (usuario_id, fecha) IN (${pairsSql})`,
      params
    );
  } else {
    const pairsSql = combos.map(() => "(?, ?)").join(", ");
    const params = [];
    combos.forEach((c) => params.push(c.usuarioId, c.fecha));

    const [existing] = await poolmysql.query(
      `SELECT usuario_id, DATE_FORMAT(fecha,'%Y-%m-%d') AS fecha
       FROM neg_t_turnos_diarios
       WHERE (usuario_id, fecha) IN (${pairsSql})`,
      params
    );

    const existingSet = new Set(
      existing.map((r) => `${r.usuario_id}_${r.fecha}`)
    );

    combos.forEach((c) => {
      const key = `${c.usuarioId}_${c.fecha}`;
      if (existingSet.has(key)) totalOmitidos++;
    });
  }

  const values = [];
  for (const { usuarioId, fecha } of combos) {
    if (!sobrescribirExistentes) {
      const [r] = await poolmysql.query(
        `SELECT id FROM neg_t_turnos_diarios WHERE usuario_id = ? AND fecha = ? LIMIT 1`,
        [usuarioId, fecha]
      );
      if (r.length) continue;
    }

    values.push(
      usuarioId,
      fecha,
      sucursal || null,
      horaEntradaProg,
      horaSalidaProg,
      Number(minTolerAtraso) || 0,
      Number(minTolerSalida) || 0
    );
  }

  if (!values.length)
    return { totalIntentos, totalInsertados: 0, totalOmitidos };

  const rowsCount = values.length / 7;
  const rowPlaceholders = Array.from(
    { length: rowsCount },
    () => "(?, ?, ?, ?, ?, ?, ?, 'SIN_MARCA', 'NO', NULL)"
  );

  const sqlInsert = `
    INSERT INTO neg_t_turnos_diarios
    (
      usuario_id,
      fecha,
      sucursal,
      hora_entrada_prog,
      hora_salida_prog,
      min_toler_atraso,
      min_toler_salida,
      estado_asistencia,
      estado_hora_acumulada,
      num_horas_acumuladas
    )
    VALUES ${rowPlaceholders.join(", ")}
  `;

  const [result] = await poolmysql.query(sqlInsert, values);

  return {
    totalIntentos,
    totalInsertados: result.affectedRows || 0,
    totalOmitidos,
  };
}

// ===============================
//   EDITAR / ELIMINAR
// ===============================
async function actualizarTurnoProgramado(
  turnoId,
  { horaEntradaProg, horaSalidaProg, minTolerAtraso = 0, minTolerSalida = 0 }
) {
  const [result] = await poolmysql.query(
    `
    UPDATE neg_t_turnos_diarios
       SET hora_entrada_prog = ?,
           hora_salida_prog  = ?,
           min_toler_atraso  = ?,
           min_toler_salida  = ?
     WHERE id = ?
       AND fecha >= CURDATE()
       AND estado_asistencia = 'SIN_MARCA'
    `,
    [
      horaEntradaProg,
      horaSalidaProg,
      Number(minTolerAtraso) || 0,
      Number(minTolerSalida) || 0,
      turnoId,
    ]
  );
  return result;
}

async function eliminarTurnoProgramado(turnoId) {
  const [result] = await poolmysql.query(
    `
    DELETE FROM neg_t_turnos_diarios
     WHERE id = ?
       AND fecha >= CURDATE()
       AND estado_asistencia = 'SIN_MARCA'
    `,
    [turnoId]
  );
  return result;
}

// ===============================
//   MI HORARIO SEMANAL
// ===============================
async function selectTurnosByUsuarioRango(usuario_id, desde, hasta) {
  const sql = `
    SELECT
      id,
      usuario_id,
      DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha,
      sucursal,
      TIME_FORMAT(hora_entrada_prog, '%H:%i') AS hora_entrada_prog,
      TIME_FORMAT(hora_salida_prog, '%H:%i') AS hora_salida_prog,
      hora_entrada_real,
      hora_salida_real,
      min_trabajados,
      min_atraso,
      min_extra,
      estado_asistencia,
      observacion,
      estado_hora_acumulada,
      num_horas_acumuladas
    FROM neg_t_turnos_diarios
    WHERE usuario_id = ?
      AND fecha BETWEEN ? AND ?
    ORDER BY fecha ASC
  `;
  const [rows] = await poolmysql.query(sql, [usuario_id, desde, hasta]);
  return rows;
}

// ===============================
//   OBSERVACIÓN + SOLICITUD HOY
// ===============================
async function updateObsHoraAcumuladaHoy(
  usuario_id,
  { observacion, solicitar, num_horas_acumuladas }
) {
  const flag = solicitar ? 1 : 0;

  const sql = `
    UPDATE neg_t_turnos_diarios
    SET
      observacion = ?,
      estado_hora_acumulada = CASE
        WHEN ? = 1 THEN 'SOLICITUD'
        ELSE 'NO'
      END,
      num_horas_acumuladas = CASE
        WHEN ? = 1 THEN ?
        ELSE NULL
      END
    WHERE usuario_id = ? AND fecha = CURDATE()
  `;

  const [result] = await poolmysql.query(sql, [
    observacion,
    flag,
    flag,
    flag ? Number(num_horas_acumuladas) : null,
    usuario_id,
  ]);

  return result;
}

// ===============================
//   APROBAR / RECHAZAR
// ===============================

async function updateEstadoHoraAcumuladaTurno(
  turnoId,
  estado_hora_acumulada,
  aprobado_por
) {
  const conn = await poolmysql.getConnection();
  try {
    await conn.beginTransaction();

    // 1) Leer el turno (bloqueado) incluyendo observacion
    const [rows] = await conn.query(
      `
      SELECT id, usuario_id, fecha, estado_hora_acumulada, num_horas_acumuladas, observacion
      FROM neg_t_turnos_diarios
      WHERE id = ?
      FOR UPDATE
      `,
      [turnoId]
    );

    if (!rows.length) throw new Error("Turno no encontrado");

    const turno = rows[0];

    // 2) Update del turno
    await conn.query(
      `
      UPDATE neg_t_turnos_diarios
      SET estado_hora_acumulada = ?,
          aprobado_por = ?,
          updated_at = NOW()
      WHERE id = ?
      LIMIT 1
      `,
      [estado_hora_acumulada, aprobado_por, turnoId]
    );

    // 3) Insertar movimiento SOLO si pasa a APROBADO y antes no estaba APROBADO
    const pasaAprobado = estado_hora_acumulada === "APROBADO";
    const yaEstabaAprobado = turno.estado_hora_acumulada === "APROBADO";
    const horas = Number(turno.num_horas_acumuladas || 0);

    if (pasaAprobado && !yaEstabaAprobado && horas > 0) {
      const minutos = horas * 60;

      // misma observación del turno (recortada a 255 por si es TEXT)
      const obs = (turno.observacion ?? "").toString().slice(0, 255);

      await conn.query(
        `
        INSERT INTO neg_t_horas_movimientos
          (usuario_id, mov_tipo, mov_concepto, minutos, fecha, turno_id, estado, aprobado_por, observacion)
        VALUES
          (?, 'CREDITO', 'HORA_EXTRA', ?, ?, ?, 'APROBADO', ?, ?)
        `,
        [turno.usuario_id, minutos, turno.fecha, turno.id, aprobado_por, obs]
      );
    }

    await conn.commit();
    return { ok: true };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function asignarDevolucionTurno(turnoId, aprobado_por) {
  const conn = await poolmysql.getConnection();
  try {
    await conn.beginTransaction();

    // 1) Leer turno a afectar (bloqueado)
    const [rows] = await conn.query(
      `
      SELECT id, usuario_id, fecha, tipo_dia, observacion, hora_entrada_real, hora_salida_real
      FROM neg_t_turnos_diarios
      WHERE id = ?
      FOR UPDATE
      `,
      [turnoId]
    );

    if (!rows.length) throw new Error("Turno no encontrado");
    const turno = rows[0];

    // Validaciones básicas
    if (turno.tipo_dia !== "NORMAL") {
      throw new Error(
        `No se puede asignar DEVOLUCIÓN: el turno ya es ${turno.tipo_dia}`
      );
    }

    if (turno.hora_entrada_real || turno.hora_salida_real) {
      throw new Error(
        "No se puede asignar DEVOLUCIÓN: el turno ya tiene marcas reales"
      );
    }

    // 2) Bloquear usuario para evitar carreras (muy recomendado)
    await conn.query(`SELECT id FROM sisusuarios WHERE id = ? FOR UPDATE`, [
      turno.usuario_id,
    ]);

    // 3) Calcular saldo actual (solo movimientos APROBADO)
    const [saldoRows] = await conn.query(
      `
      SELECT COALESCE(SUM(
        CASE
          WHEN estado <> 'APROBADO' THEN 0
          WHEN mov_tipo = 'CREDITO' THEN  minutos
          WHEN mov_tipo = 'DEBITO'  THEN -minutos
          ELSE 0
        END
      ), 0) AS saldo_minutos
      FROM neg_t_horas_movimientos
      WHERE usuario_id = ?
      `,
      [turno.usuario_id]
    );

    const saldoMin = Number(saldoRows?.[0]?.saldo_minutos || 0);
    if (saldoMin < 480) {
      throw new Error(
        `Saldo insuficiente para DEVOLUCIÓN (saldo: ${saldoMin} min, requiere: 480 min)`
      );
    }

    // 4) Marcar el turno como DEVOLUCION
    await conn.query(
      `
  UPDATE neg_t_turnos_diarios
  SET tipo_dia = 'DEVOLUCION',
      aprobado_por = ?,
      updated_at = NOW()
  WHERE id = ?
  LIMIT 1
  `,
      [aprobado_por, turnoId]
    );

    // 5) Insertar DEBITO en kardex (observación = la misma del turno)
    const obs = (turno.observacion ?? "").toString().slice(0, 255);

    await conn.query(
      `
      INSERT INTO neg_t_horas_movimientos
        (usuario_id, mov_tipo, mov_concepto, minutos, fecha, turno_id, estado, aprobado_por, observacion)
      VALUES
        (?, 'DEBITO', 'DEVOLUCION', 480, ?, ?, 'APROBADO', ?, ?)
      `,
      [turno.usuario_id, turno.fecha, turno.id, aprobado_por, obs]
    );

    await conn.commit();

    // saldo nuevo (opcional para devolver al frontend)
    return {
      ok: true,
      saldo_anterior_min: saldoMin,
      saldo_nuevo_min: saldoMin - 480,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  generarTurnosDiariosLote,
  seleccionarTurnosDiarios,
  actualizarTurnoProgramado,
  eliminarTurnoProgramado,
  selectTurnosByUsuarioRango,
  updateObsHoraAcumuladaHoy,
  updateEstadoHoraAcumuladaTurno,
  asignarDevolucionTurno,
};
