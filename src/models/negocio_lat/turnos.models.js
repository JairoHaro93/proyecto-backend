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
  excluirFinesSemana = true,
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

// acepta 15, "15", "01:30"
function parseMinutos(input) {
  if (input === null || input === undefined || input === "") return null;

  if (typeof input === "number" && Number.isFinite(input))
    return Math.trunc(input);

  const s = String(input).trim();
  if (!s) return null;

  // HH:MM
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (m) {
    const hh = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
    return hh * 60 + mm;
  }

  // minutos simples
  const n = Number(s);
  if (Number.isFinite(n)) return Math.trunc(n);

  return null;
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
    sql +=
      " AND (t.sucursal = ? OR (t.sucursal IS NULL AND t.tipo_dia = 'VACACIONES'))";
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
      params,
    );
  } else {
    const pairsSql = combos.map(() => "(?, ?)").join(", ");
    const params = [];
    combos.forEach((c) => params.push(c.usuarioId, c.fecha));

    const [existing] = await poolmysql.query(
      `SELECT usuario_id, DATE_FORMAT(fecha,'%Y-%m-%d') AS fecha
       FROM neg_t_turnos_diarios
       WHERE (usuario_id, fecha) IN (${pairsSql})`,
      params,
    );

    const existingSet = new Set(
      existing.map((r) => `${r.usuario_id}_${r.fecha}`),
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
        [usuarioId, fecha],
      );
      if (r.length) continue;
    }

    // SOLO 5 valores por fila
    values.push(
      usuarioId,
      fecha,
      sucursal || null,
      horaEntradaProg,
      horaSalidaProg,
    );
  }

  if (!values.length)
    return { totalIntentos, totalInsertados: 0, totalOmitidos };

  const rowsCount = values.length / 5;
  const rowPlaceholders = Array.from(
    { length: rowsCount },
    () => "(?, ?, ?, ?, ?, 'SIN_MARCA', 'NORMAL', 'NO', NULL, NULL)",
  );

  const sqlInsert = `
    INSERT INTO neg_t_turnos_diarios
    (
      usuario_id,
      fecha,
      sucursal,
      hora_entrada_prog,
      hora_salida_prog,
      estado_asistencia,
      tipo_dia,
      estado_hora_acumulada,
      num_minutos_acumulados,
      hora_acum_aprobado_por
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
  { horaEntradaProg, horaSalidaProg },
) {
  const [result] = await poolmysql.query(
    `
    UPDATE neg_t_turnos_diarios
       SET hora_entrada_prog = ?,
           hora_salida_prog  = ?,
           updated_at = NOW()
     WHERE id = ?
       AND fecha >= CURDATE()
       AND estado_asistencia = 'SIN_MARCA'
       AND (tipo_dia IS NULL OR tipo_dia = 'NORMAL')
    `,
    [horaEntradaProg, horaSalidaProg, turnoId],
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
    [turnoId],
  );
  return result;
}

// ===============================
//   MI HORARIO SEMANAL
// ===============================
// ===============================
//   MI HORARIO SEMANAL
// ===============================
async function selectTurnosByUsuarioRango(usuario_id, desde, hasta) {
  const sql = `
    WITH marks_raw AS (
      SELECT
        a.usuario_id,
        DATE(a.fecha_hora) AS fecha,
        ROW_NUMBER() OVER (
          PARTITION BY a.usuario_id, DATE(a.fecha_hora)
          ORDER BY a.fecha_hora ASC, a.id ASC
        ) AS rn
      FROM neg_t_asistencia a
      WHERE a.usuario_id = ?
        AND a.fecha_hora >= CONCAT(?, ' 00:00:00')
        AND a.fecha_hora <  CONCAT(DATE_ADD(?, INTERVAL 1 DAY), ' 00:00:00')
    ),
    marks_pivot AS (
      SELECT
        usuario_id,
        fecha,
        COUNT(*) AS marcas_count
      FROM marks_raw
      WHERE rn <= 4
      GROUP BY usuario_id, fecha
    )
    SELECT
      t.id,
      t.usuario_id,
      DATE_FORMAT(t.fecha, '%Y-%m-%d') AS fecha,
      t.sucursal,

      TIME_FORMAT(t.hora_entrada_prog, '%H:%i') AS hora_entrada_prog,
      TIME_FORMAT(t.hora_salida_prog,  '%H:%i') AS hora_salida_prog,

      t.hora_entrada_1,
      t.hora_salida_1,
      t.hora_entrada_2,
      t.hora_salida_2,
      t.hora_entrada_real,
      t.hora_salida_real,

      COALESCE(t.min_atraso, 0) AS min_atraso,
      COALESCE(t.min_salida_temprana, 0) AS min_salida_temprana,

      -- (si aún los quieres mostrar en Flutter, déjalos)
      t.almuerzo_permitido_min,
      t.almuerzo_real_min,
      t.almuerzo_excedido_min,

      -- ✅ generated (los dejamos)
      COALESCE(t.atraso_si, 0) AS atraso_si,
      COALESCE(t.salida_temprana_si, 0) AS salida_temprana_si,

      -- ✅ REGLA NUEVA: si hubo 3 marcas en el día => ALMUERZO EXCEDIDO (llamado de atención)
      CASE
        WHEN COALESCE(mp.marcas_count, 0) = 3 THEN 1
        ELSE COALESCE(t.almuerzo_excedido_si, 0)
      END AS almuerzo_excedido_si,

      COALESCE(mp.marcas_count, 0) AS marcas_count,

      t.estado_asistencia,
      t.tipo_dia,
      t.observacion,

      t.estado_hora_acumulada,
      t.hora_acum_aprobado_por,
      t.num_minutos_acumulados,

      t.just_atraso_estado,
      t.just_atraso_motivo,
      t.just_atraso_minutos,
      t.just_atraso_jefe_id,
      t.just_salida_estado,
      t.just_salida_motivo,
      t.just_salida_minutos,
      t.just_salida_jefe_id

    FROM neg_t_turnos_diarios t
    LEFT JOIN marks_pivot mp
      ON mp.usuario_id = t.usuario_id
     AND mp.fecha = t.fecha
    WHERE t.usuario_id = ?
      AND t.fecha BETWEEN ? AND ?
    ORDER BY t.fecha ASC
  `;

  const params = [usuario_id, desde, hasta, usuario_id, desde, hasta];
  const [rows] = await poolmysql.query(sql, params);
  return rows || [];
}

// ===============================
//   OBSERVACIÓN + SOLICITUD HOY
//   (NO permite si ya está APROBADO)
// ===============================
async function updateObsHoraAcumuladaHoy(
  usuario_id,
  { observacion, solicitar, num_minutos_acumulados },
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
      num_minutos_acumulados = CASE
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
    flag ? Number(num_minutos_acumulados) : null,
    usuario_id,
  ]);

  return result;
}

// ===============================
//   APROBAR / RECHAZAR HORAS ACUMULADAS  (transacción)
// ===============================
async function updateEstadoHoraAcumuladaTurno(
  turnoId,
  estado_hora_acumulada,
  hora_acum_aprobado_por,
) {
  const conn = await poolmysql.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `
      SELECT id, usuario_id, fecha, estado_hora_acumulada, num_minutos_acumulados, observacion
      FROM neg_t_turnos_diarios
      WHERE id = ?
      FOR UPDATE
      `,
      [turnoId],
    );
    if (!rows.length) throw new Error("Turno no encontrado");

    const turno = rows[0];

    // ✅ solo se procesa si venía en SOLICITUD
    const prev = String(turno.estado_hora_acumulada || "NO")
      .toUpperCase()
      .trim();
    if (prev !== "SOLICITUD") {
      throw new Error(
        `No se puede ${estado_hora_acumulada}: el turno está en estado ${prev}`,
      );
    }

    await conn.query(
      `
      UPDATE neg_t_turnos_diarios
      SET estado_hora_acumulada = ?,
          hora_acum_aprobado_por = ?,
          updated_at = NOW()
      WHERE id = ?
      LIMIT 1
      `,
      [estado_hora_acumulada, hora_acum_aprobado_por, turnoId],
    );

    // Insert kardex solo si APROBADO
    const pasaAprobado = estado_hora_acumulada === "APROBADO";
    const minutos = Number(turno.num_minutos_acumulados || 0);

    if (pasaAprobado && minutos > 0) {
      const obs = (turno.observacion ?? "").toString().slice(0, 255);

      await conn.query(
        `
    INSERT INTO neg_t_horas_movimientos
      (usuario_id, mov_tipo, mov_concepto, minutos, fecha, turno_id, estado, hora_acum_aprobado_por, observacion)
    VALUES
      (?, 'CREDITO', 'HORA_ACUMULADA', ?, ?, ?, 'APROBADO', ?, ?)
    `,
        [
          turno.usuario_id,
          minutos, // ✅ ya NO se multiplica
          turno.fecha,
          turno.id,
          hora_acum_aprobado_por,
          obs,
        ],
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
//   ✅ Permite saldo NEGATIVO (deuda sin tope)
//   ✅ Saldo calculado SOLO con BANCO: HORA_ACUMULADA - (JUST_* + DEVOLUCION)
// ===============================
async function asignarDevolucionTurno(turnoId, hora_acum_aprobado_por) {
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
      [turnoId],
    );
    if (!rows.length) throw new Error("Turno no encontrado");

    const turno = rows[0];

    if (
      String(turno.tipo_dia || "NORMAL")
        .toUpperCase()
        .trim() !== "NORMAL"
    ) {
      throw new Error(
        `No se puede asignar DEVOLUCIÓN: el turno ya es ${turno.tipo_dia}`,
      );
    }

    if (turno.hora_entrada_real || turno.hora_salida_real) {
      throw new Error(
        "No se puede asignar DEVOLUCIÓN: el turno ya tiene marcas reales",
      );
    }

    // Bloquea usuario (serializa operaciones)
    await conn.query(`SELECT id FROM sisusuarios WHERE id = ? FOR UPDATE`, [
      turno.usuario_id,
    ]);

    // ✅ Saldo anterior SOLO del banco (HORA_ACUMULADA)
    const [saldoRows] = await conn.query(
      `
      SELECT COALESCE(SUM(
        CASE
          WHEN estado <> 'APROBADO' THEN 0

          WHEN mov_tipo = 'CREDITO'
           AND mov_concepto = 'HORA_ACUMULADA'
          THEN minutos

          WHEN mov_tipo = 'DEBITO'
           AND mov_concepto IN ('JUST_ATRASO','JUST_SALIDA','DEVOLUCION')
          THEN -minutos

          ELSE 0
        END
      ), 0) AS saldo_minutos
      FROM neg_t_horas_movimientos
      WHERE usuario_id = ?
      `,
      [turno.usuario_id],
    );

    const saldoMin = Number(saldoRows?.[0]?.saldo_minutos || 0);

    // ✅ No bloqueamos por saldo: puede quedar negativo
    await conn.query(
      `
      UPDATE neg_t_turnos_diarios
      SET tipo_dia = 'DEVOLUCION',
          hora_acum_aprobado_por = ?,
          updated_at = NOW()
      WHERE id = ?
      LIMIT 1
      `,
      [hora_acum_aprobado_por, turnoId],
    );

    const obs = (turno.observacion ?? "").toString().slice(0, 255);

    await conn.query(
      `
      INSERT INTO neg_t_horas_movimientos
        (usuario_id, mov_tipo, mov_concepto, minutos, fecha, turno_id, estado, hora_acum_aprobado_por, observacion)
      VALUES
        (?, 'DEBITO', 'DEVOLUCION', 480, ?, ?, 'APROBADO', ?, ?)
      `,
      [turno.usuario_id, turno.fecha, turno.id, hora_acum_aprobado_por, obs],
    );

    await conn.commit();

    return {
      ok: true,
      saldo_anterior_min: saldoMin,
      saldo_nuevo_min: saldoMin - 480, // ✅ puede ser negativo
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
//   ✅ Multas: primera y última marca
//   ✅ Almuerzo excedido: marca2->marca3 (con 3 o 4 marcas)
//   ✅ Sin segundos (todo a HH:mm:00 en neg_t_turnos_diarios)
// ===============================
async function updateTurnoFromAsistencia(usuario_id, fechaMarcacion) {
  const d =
    fechaMarcacion instanceof Date ? fechaMarcacion : new Date(fechaMarcacion);
  if (Number.isNaN(d.getTime())) throw new Error("fechaMarcacion inválida");

  const fechaKey = formatFecha(d);

  const floorToMinute = (dt) => {
    if (!dt) return null;
    const x = dt instanceof Date ? new Date(dt) : new Date(dt);
    if (Number.isNaN(x.getTime())) return null;
    x.setSeconds(0, 0);
    return x;
  };

  const makeLocalDTFromTurno = (ymd, timeVal) => {
    if (!timeVal) return null;
    const s = String(timeVal).trim();
    if (!s) return null;
    const hhmmss = s.length >= 8 ? s.slice(0, 8) : `${s}:00`;
    const dt = new Date(`${ymd}T${hhmmss}`);
    return floorToMinute(dt);
  };

  const diffMin = (a, b) => {
    if (!a || !b) return 0;
    return Math.trunc((b.getTime() - a.getTime()) / 60000);
  };

  const almuerzoPermitidoPorSpan = (spanMin) => {
    if (spanMin === 540) return 60; // 9h
    if (spanMin === 570) return 90; // 9h30
    if (spanMin === 600) return 120; // 10h
    if (spanMin > 600) return 60; // >10h
    return 0; // <9h
  };

  // 1) Turno
  const [turnoRows] = await poolmysql.query(
    `
    SELECT id, hora_entrada_prog, hora_salida_prog, tipo_dia
    FROM neg_t_turnos_diarios
    WHERE usuario_id = ? AND fecha = ?
    LIMIT 1
    `,
    [usuario_id, fechaKey],
  );

  if (!turnoRows.length) return { ok: false, reason: "SIN_TURNO" };
  const turno = turnoRows[0];

  if (String(turno.tipo_dia || "NORMAL").toUpperCase() !== "NORMAL") {
    return { ok: false, reason: `TIPO_DIA_${turno.tipo_dia}` };
  }

  const progStart = makeLocalDTFromTurno(fechaKey, turno.hora_entrada_prog);
  const progEnd = makeLocalDTFromTurno(fechaKey, turno.hora_salida_prog);

  if (!progStart || !progEnd || progEnd <= progStart) {
    return { ok: false, reason: "HORARIO_PROG_INVALIDO" };
  }

  const spanProgMin = diffMin(progStart, progEnd);
  const almuerzoPermitidoMin = almuerzoPermitidoPorSpan(spanProgMin);

  // 2) Marcas crudas (hasta 4)
  const [marks] = await poolmysql.query(
    `
    SELECT fecha_hora
    FROM neg_t_asistencia
    WHERE usuario_id = ?
      AND DATE(fecha_hora) = ?
    ORDER BY fecha_hora ASC
    LIMIT 4
    `,
    [usuario_id, fechaKey],
  );

  const m = (marks || [])
    .map((r) => floorToMinute(new Date(r.fecha_hora)))
    .filter((x) => x && !Number.isNaN(x.getTime()));

  const entrada1 = m[0] || null;
  const salida1 = m[1] || null;
  const entrada2 = m[2] || null;
  const salida2 = m[3] || null;

  // ✅ Multas: siempre primera y última
  const entradaMulta = m.length ? m[0] : null;
  const salidaMulta = m.length ? m[m.length - 1] : null;

  // 3) Almuerzo real: marca2 -> marca3 si hay >=3 marcas (incluye 3 marcas)
  let almuerzoRealMin = null;
  if (m.length >= 3 && m[1] && m[2] && m[2] > m[1]) {
    almuerzoRealMin = diffMin(m[1], m[2]);
  }

  const almuerzoExcedidoMin =
    almuerzoRealMin == null
      ? 0
      : Math.max(0, almuerzoRealMin - almuerzoPermitidoMin);

  // 4) Minutos de multas (tolerancia 0)
  const min_atraso =
    entradaMulta && entradaMulta > progStart
      ? diffMin(progStart, entradaMulta)
      : 0;

  const min_salida_temprana =
    m.length >= 2 && salidaMulta && salidaMulta < progEnd
      ? diffMin(salidaMulta, progEnd)
      : 0;

  // 5) Estado (solo UI)
  let estado_asistencia = "SIN_MARCA";
  if (m.length === 0) estado_asistencia = "SIN_MARCA";
  else if (m.length === 1) estado_asistencia = "SOLO_ENTRADA";
  else {
    if (min_atraso > 0) estado_asistencia = "ATRASO";
    else if (min_salida_temprana > 0)
      estado_asistencia = "INCOMPLETO"; // aquí lo usamos como “salida temprana”
    else estado_asistencia = "OK";
  }

  // ✅ hora_entrada_real / hora_salida_real: primera y última (sin segundos)
  const hora_entrada_real = entradaMulta;
  const hora_salida_real = m.length >= 2 ? salidaMulta : null;

  // 6) Update (SOLO columnas que existen)
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

      min_atraso = ?,
      min_salida_temprana = ?,

      almuerzo_permitido_min = ?,
      almuerzo_real_min = ?,
      almuerzo_excedido_min = ?,

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
      hora_entrada_real,
      hora_salida_real,
      min_atraso,
      min_salida_temprana,
      almuerzoPermitidoMin,
      almuerzoRealMin,
      almuerzoExcedidoMin,
      estado_asistencia,
      turno.id,
    ],
  );

  return {
    ok: true,
    turno_id: turno.id,
    estado_asistencia,
    mins: {
      min_atraso,
      min_salida_temprana,
      almuerzoPermitidoMin,
      almuerzoRealMin,
      almuerzoExcedidoMin,
    },
  };
}

async function resolverJustificacionTurno(
  turnoId,
  tipo,
  estado,
  minutos,
  jefeId,
) {
  const tipoKey = String(tipo).toLowerCase() === "salida" ? "salida" : "atraso";
  const estadoUp = String(estado).toUpperCase().trim();
  const mins = minutos == null ? null : Number(minutos);

  const colEstado =
    tipoKey === "atraso" ? "just_atraso_estado" : "just_salida_estado";
  const colMin =
    tipoKey === "atraso" ? "just_atraso_minutos" : "just_salida_minutos";
  const colJefe =
    tipoKey === "atraso" ? "just_atraso_jefe_id" : "just_salida_jefe_id";
  const colMotivo =
    tipoKey === "atraso" ? "just_atraso_motivo" : "just_salida_motivo";

  const conn = await poolmysql.getConnection();
  try {
    await conn.beginTransaction();

    // 1) Verifica turno y estado actual (PENDIENTE)
    const [rows] = await conn.query(
      `
      SELECT
        id,
        usuario_id,
        fecha,
        ${colEstado} AS st,
        ${colMotivo} AS motivo
      FROM neg_t_turnos_diarios
      WHERE id = ?
      FOR UPDATE
      `,
      [turnoId],
    );

    if (!rows.length) throw new Error("Turno no encontrado.");

    if (String(rows[0].st || "").toUpperCase() !== "PENDIENTE") {
      throw new Error("La justificación no está PENDIENTE.");
    }

    const usuarioId = rows[0].usuario_id;
    const fechaMov = rows[0].fecha; // DATE del turno
    const motivoMov = (rows[0].motivo || "").trim() || null;

    // 2) Actualiza el turno (minutos pueden ser NULL)
    await conn.query(
      `
      UPDATE neg_t_turnos_diarios
      SET ${colEstado} = ?,
          ${colMin}    = ?,
          ${colJefe}   = ?,
          updated_at   = NOW()
      WHERE id = ?
      `,
      [estadoUp, mins, jefeId, turnoId],
    );

    // 3) ✅ Movimiento SOLO si APROBADA y minutos > 0
    //    (Tu tabla neg_t_horas_movimientos NO tiene "origen" ni "referencia_id")
    if (estadoUp === "APROBADA" && mins != null && mins > 0) {
      await conn.query(
        `
        INSERT INTO neg_t_horas_movimientos
          (usuario_id, mov_tipo, mov_concepto, minutos, fecha, turno_id, estado, hora_acum_aprobado_por, observacion, created_at, updated_at)
        VALUES
          (?, 'DEBITO', ?, ?, ?, ?, 'APROBADO', ?, ?, NOW(), NOW())
        `,
        [
          usuarioId,
          `JUST_${tipoKey.toUpperCase()}`, // JUST_ATRASO / JUST_SALIDA
          mins,
          fechaMov,
          turnoId,
          jefeId,
          motivoMov,
        ],
      );
    }

    await conn.commit();
    return true;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function getSaldoHorasAcumuladasMin(usuario_id) {
  const [rows] = await poolmysql.query(
    `
    SELECT COALESCE(SUM(
      CASE
        WHEN mov_tipo='CREDITO' AND mov_concepto='HORA_ACUMULADA' THEN minutos
        WHEN mov_tipo='DEBITO'  AND mov_concepto IN ('JUST_ATRASO','JUST_SALIDA','DEVOLUCION') THEN -minutos
        ELSE 0
      END
    ), 0) AS saldo_min
    FROM neg_t_horas_movimientos
    WHERE usuario_id = ?
      AND estado = 'APROBADO'
    `,
    [usuario_id],
  );

  return Number(rows?.[0]?.saldo_min ?? 0);
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
  resolverJustificacionTurno,
  getSaldoHorasAcumuladasMin,
};
