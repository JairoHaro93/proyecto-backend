// src/models/negocio_lat/turnos.models.js
const { poolmysql } = require("../../config/db");

// yyyy-mm-dd de un Date
function formatFecha(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatFechaEcuador(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date); // YYYY-MM-DD
}

function timeStrToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [hh, mm] = String(timeStr).split(":");
  return parseInt(hh || "0", 10) * 60 + parseInt(mm || "0", 10);
}

function dateToMinutesInDayEcuador(dt) {
  if (!dt) return null;
  const d = new Date(dt);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Guayaquil",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const hh = Number(parts.find((p) => p.type === "hour")?.value || 0);
  const mm = Number(parts.find((p) => p.type === "minute")?.value || 0);
  return hh * 60 + mm;
}

function diffMinutes(a, b) {
  if (!a || !b) return 0;
  const da = new Date(a);
  const db = new Date(b);
  return Math.round((db.getTime() - da.getTime()) / 60000);
}

async function updateTurnoFromAsistencia(usuario_id, fechaHoraMarcacion) {
  try {
    const fechaStr = formatFechaEcuador(fechaHoraMarcacion);

    // 1) turno del día
    const [rowsTurno] = await poolmysql.query(
      `SELECT * FROM neg_t_turnos_diarios WHERE usuario_id = ? AND fecha = ? LIMIT 1`,
      [usuario_id, fechaStr]
    );

    if (!rowsTurno || rowsTurno.length === 0) {
      // OJO: igual se registra asistencia aunque no haya turno.
      console.log(
        `[TURNOS] No hay turno para usuario=${usuario_id} fecha=${fechaStr}. Se omite reconstrucción.`
      );
      return;
    }

    const turno = rowsTurno[0];

    // 2) primeras 4 marcas del día por cronología (evento crudo)
    const desde = `${fechaStr} 00:00:00`;
    const hasta = `${formatFechaEcuador(
      new Date(new Date(fechaHoraMarcacion).getTime() + 24 * 60 * 60 * 1000)
    )} 00:00:00`;

    const [marks] = await poolmysql.query(
      `
      SELECT id, fecha_hora
      FROM neg_t_asistencia
      WHERE usuario_id = ?
        AND fecha_hora >= ?
        AND fecha_hora < ?
      ORDER BY fecha_hora ASC, id ASC
      LIMIT 4
      `,
      [usuario_id, desde, hasta]
    );

    const m1 = marks[0]?.fecha_hora || null;
    const m2 = marks[1]?.fecha_hora || null;
    const m3 = marks[2]?.fecha_hora || null;
    const m4 = marks[3]?.fecha_hora || null;

    // 3) calcular min_trabajados según pares disponibles
    let min_trabajados = 0;
    if (m1 && m2) min_trabajados += Math.max(0, diffMinutes(m1, m2));
    if (m3 && m4) min_trabajados += Math.max(0, diffMinutes(m3, m4));

    // 4) atraso contra Entrada1
    const jornadaProgMin =
      timeStrToMinutes(turno.hora_salida_prog) -
      timeStrToMinutes(turno.hora_entrada_prog);

    const toler = Number(turno.min_toler_atraso || 0);

    let min_atraso = 0;
    if (m1 && turno.hora_entrada_prog) {
      const entradaProgMin = timeStrToMinutes(turno.hora_entrada_prog);
      const entradaRealMin = dateToMinutesInDayEcuador(m1);
      const diff = entradaRealMin != null ? entradaRealMin - entradaProgMin : 0;
      if (diff > toler) min_atraso = diff;
    }

    // 5) extra
    let min_extra = 0;
    if (jornadaProgMin > 0 && min_trabajados > jornadaProgMin) {
      min_extra = min_trabajados - jornadaProgMin;
    }

    // 6) estado (solo: SIN_MARCA / INCOMPLETO / ATRASO / COMPLETO) + faltas se marcan aparte
    const marksCount = marks.length;
    let estado_asistencia = "SIN_MARCA";

    if (marksCount === 0) {
      estado_asistencia = "SIN_MARCA";
    } else {
      const cumple =
        jornadaProgMin > 0 ? min_trabajados >= jornadaProgMin : false;

      if (!cumple) {
        estado_asistencia = "INCOMPLETO";
      } else if (min_atraso > 0) {
        estado_asistencia = "ATRASO";
      } else {
        estado_asistencia = "COMPLETO";
      }
    }

    // 7) guardar en turno diario (las 4 marcas)
    await poolmysql.query(
      `
      UPDATE neg_t_turnos_diarios
      SET
        hora_entrada_1 = ?,
        hora_salida_1  = ?,
        hora_entrada_2 = ?,
        hora_salida_2  = ?,

        -- opcional compat: entrada_real = entrada_1, salida_real = última marca disponible
        hora_entrada_real = ?,
        hora_salida_real  = ?,

        min_trabajados = ?,
        min_atraso     = ?,
        min_extra      = ?,
        estado_asistencia = ?
      WHERE id = ?
      `,
      [
        m1,
        m2,
        m3,
        m4,
        m1,
        m4 || m3 || m2 || m1 || null,
        min_trabajados,
        min_atraso,
        min_extra,
        estado_asistencia,
        turno.id,
      ]
    );

    console.log(
      `[TURNOS] Reconstruido usuario=${usuario_id} fecha=${fechaStr} marks=${marksCount} estado=${estado_asistencia}`
    );
  } catch (err) {
    console.error("❌ Error en updateTurnoFromAsistencia:", err);
  }
}

// ===============================
//   HELPERS PARA GENERAR TURNOS
// ===============================

function enumerarFechas(
  fechaDesdeStr,
  fechaHastaStr,
  excluirFinesSemana = true
) {
  if (!fechaDesdeStr || !fechaHastaStr) return [];

  const start = new Date(`${fechaDesdeStr}T00:00:00`);
  const end = new Date(`${fechaHastaStr}T00:00:00`);

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
    return [];
  }

  const fechas = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const day = d.getDay(); // 0 = domingo, 6 = sábado
    if (excluirFinesSemana && (day === 0 || day === 6)) continue;
    fechas.push(formatFecha(d));
  }
  return fechas;
}

/**
 * Genera turnos diarios en lote para varios usuarios y un rango de fechas.
 */
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
    .filter((id) => !isNaN(id));

  if (usuarioIds.length === 0) {
    return { totalIntentos: 0, totalInsertados: 0, totalOmitidos: 0 };
  }

  const fechas = enumerarFechas(fechaDesde, fechaHasta, excluirFinesSemana);
  if (fechas.length === 0) {
    return { totalIntentos: 0, totalInsertados: 0, totalOmitidos: 0 };
  }

  const combos = [];
  for (const usuarioId of usuarioIds) {
    for (const fecha of fechas) {
      combos.push({ usuarioId, fecha });
    }
  }

  const totalIntentos = combos.length;
  if (totalIntentos === 0) {
    return { totalIntentos: 0, totalInsertados: 0, totalOmitidos: 0 };
  }

  let totalOmitidos = 0;
  let existingSet = new Set();

  if (!sobrescribirExistentes) {
    // Consultamos qué (usuario, fecha) ya tienen turno
    const pairsSql = combos.map(() => "(?, ?)").join(", ");
    const params = [];
    combos.forEach((c) => {
      params.push(c.usuarioId, c.fecha);
    });

    const [existing] = await poolmysql.query(
      `
      SELECT usuario_id, fecha
      FROM neg_t_turnos_diarios
      WHERE (usuario_id, fecha) IN (${pairsSql})
    `,
      params
    );

    existingSet = new Set(
      existing.map(
        (row) => `${row.usuario_id}_${formatFecha(new Date(row.fecha))}`
      )
    );
  } else {
    // Sobrescribir: primero borramos los combos que vamos a generar
    const pairsSql = combos.map(() => "(?, ?)").join(", ");
    const params = [];
    combos.forEach((c) => {
      params.push(c.usuarioId, c.fecha);
    });

    await poolmysql.query(
      `
      DELETE FROM neg_t_turnos_diarios
      WHERE (usuario_id, fecha) IN (${pairsSql})
    `,
      params
    );
  }

  const values = [];

  for (const { usuarioId, fecha } of combos) {
    const key = `${usuarioId}_${fecha}`;

    if (!sobrescribirExistentes && existingSet.has(key)) {
      totalOmitidos++;
      continue;
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

  if (values.length === 0) {
    return {
      totalIntentos,
      totalInsertados: 0,
      totalOmitidos,
    };
  }

  const rowsCount = values.length / 7;
  const rowPlaceholders = [];

  for (let i = 0; i < rowsCount; i++) {
    // 7 parámetros + estado_asistencia literal 'SIN_MARCA'
    rowPlaceholders.push("(?, ?, ?, ?, ?, ?, ?, 'SIN_MARCA')");
  }

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
      estado_asistencia
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

/**
 * Listar turnos con filtros:
 *  - sucursal (opcional)
 *  - fechaDesde, fechaHasta (opcional)
 *  - usuarioId (opcional)
 */
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
//   EDITAR / ELIMINAR TURNO
// ===============================

/**
 * Actualiza solo la programación (NO la asistencia real) de un turno.
 * Restricciones:
 *  - fecha >= CURDATE()
 *  - estado_asistencia = 'SIN_MARCA' (sin marcas aún)
 */
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

  return result; // result.affectedRows te dice si se actualizó o no
}

/**
 * Elimina un turno programado.
 * Restricciones:
 *  - fecha >= CURDATE()
 *  - estado_asistencia = 'SIN_MARCA'
 */
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

async function marcarFaltasHastaFecha(fechaHasta = null) {
  // fechaHasta: string 'YYYY-MM-DD' o null (por defecto hoy)
  const hoy = new Date();
  const limite = fechaHasta || formatFecha(hoy);

  const sql = `
  UPDATE neg_t_turnos_diarios t
  LEFT JOIN neg_t_asistencia a
    ON a.usuario_id = t.usuario_id
   AND a.fecha_hora >= CONCAT(t.fecha, ' 00:00:00')
   AND a.fecha_hora <  CONCAT(DATE_ADD(t.fecha, INTERVAL 1 DAY), ' 00:00:00')
  SET t.estado_asistencia = 'FALTA'
  WHERE t.fecha < ?
    AND t.estado_asistencia = 'SIN_MARCA'
    AND a.id IS NULL
`;

  const [result] = await poolmysql.query(sql, [limite]);

  console.log(
    `[TURNOS] marcarFaltasHastaFecha(${limite}) → filas modificadas:`,
    result.affectedRows
  );

  return result;
}

module.exports = {
  updateTurnoFromAsistencia,
  generarTurnosDiariosLote,
  seleccionarTurnosDiarios,
  actualizarTurnoProgramado,
  eliminarTurnoProgramado,
  marcarFaltasHastaFecha, // 👈 exportamos también esto
};
