// src/models/negocio_lat/turnos.models.js
const { poolmysql } = require("../../config/db");

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function diffMinutes(a, b) {
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 60000);
}

// "HH:MM:SS" o "HH:MM" -> minutos totales
function timeStrToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [hh, mm] = String(timeStr).split(":");
  const h = parseInt(hh || "0", 10);
  const m = parseInt(mm || "0", 10);
  return h * 60 + m;
}

// yyyy-mm-dd de un Date
function formatFecha(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Lógica principal:
 *  - Busca el turno diario del usuario en la fecha de la marcación.
 *  - Actualiza entrada/salida real según tipo_marcado.
 *  - Recalcula min_trabajados, min_atraso, min_extra, estado_asistencia.
 */
async function updateTurnoFromAsistencia(
  usuario_id,
  fechaHoraMarcacion,
  tipo_marcado
) {
  try {
    const fechaStr = formatFecha(fechaHoraMarcacion);

    // 1) Buscar turno del día
    const [rows] = await poolmysql.query(
      `
      SELECT *
      FROM neg_t_turnos_diarios
      WHERE usuario_id = ? AND fecha = ?
      LIMIT 1
    `,
      [usuario_id, fechaStr]
    );

    if (!rows || rows.length === 0) {
      console.log(
        `[TURNOS] Usuario ${usuario_id} no tiene turno definido para ${fechaStr}. No se actualiza turno.`
      );
      return;
    }

    const turno = rows[0];

    let horaEntradaReal = toDate(turno.hora_entrada_real);
    let horaSalidaReal = toDate(turno.hora_salida_real);

    const marcacion = fechaHoraMarcacion; // Date

    // 2) Actualizar entrada/salida real según tipo de marcación
    if (tipo_marcado === "ENTRADA") {
      // Tomamos la PRIMERA entrada del día
      if (!horaEntradaReal || marcacion < horaEntradaReal) {
        horaEntradaReal = marcacion;
      }
    } else if (tipo_marcado === "SALIDA") {
      // Tomamos la ÚLTIMA salida del día
      if (!horaSalidaReal || marcacion > horaSalidaReal) {
        horaSalidaReal = marcacion;
      }
    }

    // 3) Cálculos de tiempos
    const jornadaProgMin =
      timeStrToMinutes(turno.hora_salida_prog) -
      timeStrToMinutes(turno.hora_entrada_prog);

    const minTolerAtraso = Number(turno.min_toler_atraso || 0);

    let min_trabajados = 0;
    let min_atraso = 0;
    let min_extra = 0;

    // Minutos trabajados solo si ya hay entrada y salida
    if (horaEntradaReal && horaSalidaReal) {
      min_trabajados = diffMinutes(horaEntradaReal, horaSalidaReal);
    }

    // Atraso (comparado con hora_entrada_prog + tolerancia)
    if (horaEntradaReal && turno.hora_entrada_prog) {
      const entradaProgFecha = new Date(
        `${fechaStr}T${turno.hora_entrada_prog}`
      );
      const diffEntrada = diffMinutes(entradaProgFecha, horaEntradaReal);

      if (diffEntrada > minTolerAtraso) {
        min_atraso = diffEntrada;
      }
    }

    // Minutos extra (trabajó más de la jornada)
    if (
      min_trabajados > 0 &&
      jornadaProgMin > 0 &&
      min_trabajados > jornadaProgMin
    ) {
      min_extra = min_trabajados - jornadaProgMin;
    }

    // 4) Estado de asistencia según tus reglas:
    //
    //   - FALTA       -> si no registra ningún registro de asistencia en el turno asignado
    //                    (esta la pondremos con una rutina aparte para días ya pasados).
    //
    //   - INCOMPLETO  -> si tiene marcas pero AÚN NO completa los minutos de trabajo previstos.
    //
    //   - ATRASO      -> si completó los minutos de trabajo, pero tuvo atraso.
    //
    //   - COMPLETO    -> si completó la jornada y no tuvo atrasos.
    //
    const tieneEntrada = !!horaEntradaReal;
    const tieneSalida = !!horaSalidaReal;
    const jornadaDefinida = jornadaProgMin > 0;
    const haIniciado = tieneEntrada || tieneSalida;
    const haCumplidoJornada =
      jornadaDefinida && min_trabajados >= jornadaProgMin;

    let estado_asistencia = turno.estado_asistencia || "SIN_MARCA";

    if (!haIniciado) {
      // Hay turno pero aún ninguna marca: se queda SIN_MARCA (pendiente).
      // (Luego, si pasa el día sin marcas, una rutina lo convertirá en FALTA.)
      estado_asistencia = "SIN_MARCA";
    } else if (!tieneSalida || !jornadaDefinida || !haCumplidoJornada) {
      // Tiene alguna marca (entrada y/o salida), pero todavía NO cumple la jornada programada
      estado_asistencia = "INCOMPLETO";
    } else if (hasCumplidoJornada && min_atraso > 0) {
      // Cumplió jornada pero con atraso
      estado_asistencia = "ATRASO";
    } else if (hasCumplidoJornada && min_atraso === 0) {
      // Cumplió jornada sin atraso
      estado_asistencia = "COMPLETO";
    }

    // 5) Guardar cambios
    await poolmysql.query(
      `
      UPDATE neg_t_turnos_diarios
      SET
        hora_entrada_real   = ?,
        hora_salida_real    = ?,
        min_trabajados      = ?,
        min_atraso          = ?,
        min_extra           = ?,
        estado_asistencia   = ?
      WHERE id = ?
    `,
      [
        horaEntradaReal || null,
        horaSalidaReal || null,
        min_trabajados,
        min_atraso,
        min_extra,
        estado_asistencia,
        turno.id,
      ]
    );

    console.log(
      `[TURNOS] Actualizado turno diario usuario=${usuario_id}, fecha=${fechaStr}, tipo=${tipo_marcado} ` +
        `min_trabajados=${min_trabajados}, min_atraso=${min_atraso}, min_extra=${min_extra}, estado=${estado_asistencia}`
    );
  } catch (err) {
    console.error("❌ Error en updateTurnoFromAsistencia:", err.message);
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
     AND DATE(a.fecha_hora) = t.fecha
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
