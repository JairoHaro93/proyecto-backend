// src/models/negocio_lat/turnos.models.js
const { poolmysql } = require("../../config/db");

// ===============================
// Helpers
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

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    start > end
  )
    return [];

  const fechas = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const day = d.getDay(); // 0=Dom,6=Sab
    if (excluirFinesSemana && (day === 0 || day === 6)) continue;
    fechas.push(formatFecha(d));
  }
  return fechas;
}

function toDateLocalFromYmdAndTime(ymd, hhmmss) {
  const [y, m, d] = String(ymd)
    .split("-")
    .map((x) => parseInt(x, 10));
  const [hh, mm, ss] = String(hhmmss || "00:00:00")
    .split(":")
    .map((x) => parseInt(x, 10));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, hh || 0, mm || 0, ss || 0);
}

function diffMin(a, b) {
  return Math.floor((b.getTime() - a.getTime()) / 60000);
}

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
    () => "(?, ?, ?, ?, ?, ?, ?, 'SIN_MARCA', 'NORMAL', 'NO', NULL, NULL)"
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
      tipo_dia,
      estado_hora_acumulada,
      num_horas_acumuladas,
      aprobado_por
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
           min_toler_salida  = ?,
           updated_at = NOW()
     WHERE id = ?
       AND fecha >= CURDATE()
       AND estado_asistencia = 'SIN_MARCA'
       AND (tipo_dia IS NULL OR tipo_dia = 'NORMAL')
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
       AND (tipo_dia IS NULL OR tipo_dia = 'NORMAL')
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
      tipo_dia,
      estado_hora_acumulada,
      num_horas_acumuladas,
      aprobado_por
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
//   (NO permite si ya está APROBADO)
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
      END,
      updated_at = NOW()
    WHERE usuario_id = ?
      AND fecha = CURDATE()
      AND (estado_hora_acumulada IS NULL OR estado_hora_acumulada <> 'APROBADO')
      AND (tipo_dia IS NULL OR tipo_dia = 'NORMAL')
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
//   APROBAR / RECHAZAR  (transacción)
// ===============================
async function updateEstadoHoraAcumuladaTurno(
  turnoId,
  estado_hora_acumulada,
  aprobado_por
) {
  const conn = await poolmysql.getConnection();
  try {
    await conn.beginTransaction();

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

    // ✅ solo se procesa si venía en SOLICITUD (regla de negocio)
    const prev = String(turno.estado_hora_acumulada || "NO")
      .toUpperCase()
      .trim();
    if (prev !== "SOLICITUD") {
      throw new Error(
        `No se puede ${estado_hora_acumulada}: el turno está en estado ${prev}`
      );
    }

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

    // Insert kardex solo si APROBADO
    const pasaAprobado = estado_hora_acumulada === "APROBADO";
    const horas = Number(turno.num_horas_acumuladas || 0);

    if (pasaAprobado && horas > 0) {
      const minutos = horas * 60;
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

// ===============================
//   ASIGNAR DEVOLUCIÓN (DEBITO 8h)
// ===============================
async function asignarDevolucionTurno(turnoId, aprobado_por) {
  const conn = await poolmysql.getConnection();
  try {
    await conn.beginTransaction();

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

    if (
      String(turno.tipo_dia || "NORMAL")
        .toUpperCase()
        .trim() !== "NORMAL"
    ) {
      throw new Error(
        `No se puede asignar DEVOLUCIÓN: el turno ya es ${turno.tipo_dia}`
      );
    }
    if (turno.hora_entrada_real || turno.hora_salida_real) {
      throw new Error(
        "No se puede asignar DEVOLUCIÓN: el turno ya tiene marcas reales"
      );
    }

    await conn.query(`SELECT id FROM sisusuarios WHERE id = ? FOR UPDATE`, [
      turno.usuario_id,
    ]);

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

// ===============================
//   RECONSTRUIR TURNO DESDE ASISTENCIA
//   ✅ ATRASO si min_atraso > 0 (aunque cumpla minutos)
//   ✅ OK solo si cumple minutos y NO hay atraso
// ===============================
async function updateTurnoFromAsistencia(
  usuario_id,
  fechaMarcacion /*, tipoFinal */
) {
  const d =
    fechaMarcacion instanceof Date ? fechaMarcacion : new Date(fechaMarcacion);
  if (Number.isNaN(d.getTime())) throw new Error("fechaMarcacion inválida");

  const fechaKey = formatFecha(d);

  const [turnoRows] = await poolmysql.query(
    `
    SELECT id, fecha, hora_entrada_prog, hora_salida_prog, min_toler_atraso, min_toler_salida, tipo_dia
    FROM neg_t_turnos_diarios
    WHERE usuario_id = ? AND fecha = ?
    LIMIT 1
    `,
    [usuario_id, fechaKey]
  );

  if (!turnoRows.length) return { ok: false, reason: "SIN_TURNO" };

  const turno = turnoRows[0];

  if (
    turno.tipo_dia &&
    String(turno.tipo_dia).toUpperCase().trim() !== "NORMAL"
  ) {
    return { ok: false, reason: `TIPO_DIA_${turno.tipo_dia}` };
  }

  const [marks] = await poolmysql.query(
    `
    SELECT fecha_hora
    FROM neg_t_asistencia
    WHERE usuario_id = ?
      AND DATE(fecha_hora) = ?
    ORDER BY fecha_hora ASC, id ASC
    LIMIT 4
    `,
    [usuario_id, fechaKey]
  );

  const m = marks
    .map((r) => new Date(r.fecha_hora))
    .filter((x) => !Number.isNaN(x.getTime()));

  const entrada1 = m[0] || null;
  const salida1 = m[1] || null;
  const entrada2 = m[2] || null;
  const salida2 = m[3] || null;

  const entradaReal = entrada1;
  const salidaReal = m.length ? m[m.length - 1] : null;

  let min_trabajados = 0;
  if (entrada1 && salida1)
    min_trabajados += Math.max(0, diffMin(entrada1, salida1));
  if (entrada2 && salida2)
    min_trabajados += Math.max(0, diffMin(entrada2, salida2));

  // atraso con tolerancia
  let min_atraso = 0;
  if (entrada1 && turno.hora_entrada_prog) {
    const prog = String(turno.hora_entrada_prog).slice(0, 8); // HH:MM:SS
    const startProg = toDateLocalFromYmdAndTime(fechaKey, prog);
    if (startProg) {
      const toler = Number(turno.min_toler_atraso || 0);
      const atraso = diffMin(startProg, entrada1) - toler;
      min_atraso = Math.max(0, atraso);
    }
  }

  // min extra
  let min_extra = 0;
  let min_prog = 0;
  if (turno.hora_entrada_prog && turno.hora_salida_prog) {
    const hEnt = String(turno.hora_entrada_prog).slice(0, 8);
    const hSal = String(turno.hora_salida_prog).slice(0, 8);
    const a = toDateLocalFromYmdAndTime(fechaKey, hEnt);
    const b = toDateLocalFromYmdAndTime(fechaKey, hSal);
    if (a && b && b > a) {
      min_prog = diffMin(a, b);
      min_extra = Math.max(0, min_trabajados - min_prog);
    }
  }

  // ✅ criterio de cumplimiento (considera tolerancia salida)
  const tolerSalida = Number(turno.min_toler_salida || 0);
  const min_requeridos = Math.max(0, (min_prog || 0) - tolerSalida);
  const cumpleMinutos =
    min_prog > 0 ? min_trabajados >= min_requeridos : m.length >= 2;

  // Estado por marcas + reglas de negocio
  let estado_asistencia = "SIN_MARCA";

  if (m.length === 0) estado_asistencia = "SIN_MARCA";
  else if (m.length === 1) estado_asistencia = "SOLO_ENTRADA";
  else if (m.length === 3) estado_asistencia = "INCOMPLETO";
  else {
    // 2 o 4 marcas
    if (!cumpleMinutos) estado_asistencia = "INCOMPLETO";
    else estado_asistencia = min_atraso > 0 ? "ATRASO" : "OK";
  }

  await poolmysql.query(
    `
    UPDATE neg_t_turnos_diarios
    SET
      hora_entrada_1 = ?,
      hora_salida_1  = ?,
      hora_entrada_2 = ?,
      hora_salida_2  = ?,
      hora_entrada_real = ?,
      hora_salida_real  = ?,
      min_trabajados = ?,
      min_atraso     = ?,
      min_extra      = ?,
      estado_asistencia = ?,
      updated_at = NOW()
    WHERE id = ?
    LIMIT 1
    `,
    [
      entrada1,
      salida1,
      entrada2,
      salida2,
      entradaReal,
      salidaReal,
      min_trabajados,
      min_atraso,
      min_extra,
      estado_asistencia,
      turno.id,
    ]
  );

  return { ok: true, turno_id: turno.id, estado_asistencia };
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
  updateTurnoFromAsistencia,
};
