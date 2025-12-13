// src/models/negocio_lat/asistencia_reporte.model.js
const { poolmysql } = require("../../config/db");

function inPlaceholders(arr = []) {
  return arr.map(() => "?").join(", ");
}

/**
 * Devuelve filas por (usuario_id, fecha) dentro del rango.
 * Fuente principal: neg_t_turnos_diarios (programado + estado + marcas reconstruidas)
 * Fuente secundaria: neg_t_asistencia (si hubo marcas pero NO hubo turno => SIN_TURNO)
 *
 * Campos clave que usa el Excel:
 *  - fecha (YYYY-MM-DD)
 *  - nombre_completo, cedula
 *  - estado_asistencia
 *  - hora_entrada_prog, hora_salida_prog
 *  - hora_entrada_1, hora_salida_1, hora_entrada_2, hora_salida_2 (HH:MM:SS)
 *  - hora_salida_real_time (HH:MM:SS) opcional
 *  - min_trabajados, min_atraso, min_extra (si existen)
 */
async function getAsistenciaCruda({ usuarioIds = [], fechaDesde, fechaHasta }) {
  usuarioIds = (usuarioIds || [])
    .map((x) => Number(x))
    .filter((x) => !Number.isNaN(x));

  if (!usuarioIds.length) return [];
  if (!fechaDesde || !fechaHasta) return [];

  const inUsers = inPlaceholders(usuarioIds);

  // NOTA:
  // - En marks_raw filtramos por rango (desde 00:00:00 hasta +1 día de fechaHasta 00:00:00)
  // - Usamos ROW_NUMBER para asignar 1..4 por cronología
  const sql = `
    WITH marks_raw AS (
      SELECT
        a.usuario_id,
        DATE(a.fecha_hora) AS fecha,
        DATE_FORMAT(a.fecha_hora, '%H:%i:%s') AS hhmmss,
        ROW_NUMBER() OVER (
          PARTITION BY a.usuario_id, DATE(a.fecha_hora)
          ORDER BY a.fecha_hora ASC, a.id ASC
        ) AS rn
      FROM neg_t_asistencia a
      WHERE a.usuario_id IN (${inUsers})
        AND a.fecha_hora >= CONCAT(?, ' 00:00:00')
        AND a.fecha_hora <  CONCAT(DATE_ADD(?, INTERVAL 1 DAY), ' 00:00:00')
    ),
    marks_pivot AS (
      SELECT
        usuario_id,
        fecha,
        MAX(CASE WHEN rn = 1 THEN hhmmss END) AS hora_entrada_1,
        MAX(CASE WHEN rn = 2 THEN hhmmss END) AS hora_salida_1,
        MAX(CASE WHEN rn = 3 THEN hhmmss END) AS hora_entrada_2,
        MAX(CASE WHEN rn = 4 THEN hhmmss END) AS hora_salida_2,
        COUNT(*) AS marcas_count
      FROM marks_raw
      WHERE rn <= 4
      GROUP BY usuario_id, fecha
    )

    -- A) Días CON TURNO (principal)
    SELECT
      t.usuario_id,
      DATE_FORMAT(t.fecha, '%Y-%m-%d') AS fecha,

      u.ci AS cedula,
      CONCAT(u.nombre, ' ', u.apellido) AS nombre_completo,

 CASE
  WHEN COALESCE(mp.marcas_count, 0) = 0 THEN
    CASE WHEN t.fecha < CURDATE() THEN 'FALTA' ELSE 'INCOMPLETO' END
  WHEN t.estado_asistencia = 'SIN_MARCA' THEN 'INCOMPLETO'
  ELSE t.estado_asistencia
END AS estado_asistencia,

      t.hora_entrada_prog,
      t.hora_salida_prog,

      -- Marcas: prioridad a lo reconstruido en turno; si está NULL, tomamos del log pivot
      COALESCE(DATE_FORMAT(t.hora_entrada_1, '%H:%i:%s'), mp.hora_entrada_1) AS hora_entrada_1,
      COALESCE(DATE_FORMAT(t.hora_salida_1,  '%H:%i:%s'), mp.hora_salida_1)  AS hora_salida_1,
      COALESCE(DATE_FORMAT(t.hora_entrada_2, '%H:%i:%s'), mp.hora_entrada_2) AS hora_entrada_2,
      COALESCE(DATE_FORMAT(t.hora_salida_2,  '%H:%i:%s'), mp.hora_salida_2)  AS hora_salida_2,

      DATE_FORMAT(t.hora_salida_real, '%H:%i:%s') AS hora_salida_real_time,

      t.min_trabajados,
      t.min_atraso,
      t.min_extra
    FROM neg_t_turnos_diarios t
    JOIN sisusuarios u ON u.id = t.usuario_id
    LEFT JOIN marks_pivot mp
      ON mp.usuario_id = t.usuario_id
     AND mp.fecha = t.fecha
    WHERE t.usuario_id IN (${inUsers})
      AND t.fecha >= ?
      AND t.fecha <= ?

    UNION ALL

    -- B) Días SIN TURNO pero CON MARCAS (secundario)
    SELECT
      mp.usuario_id,
      DATE_FORMAT(mp.fecha, '%Y-%m-%d') AS fecha,

      u.ci AS cedula,
      CONCAT(u.nombre, ' ', u.apellido) AS nombre_completo,

      'SIN_TURNO' AS estado_asistencia,
      NULL AS hora_entrada_prog,
      NULL AS hora_salida_prog,

      mp.hora_entrada_1,
      mp.hora_salida_1,
      mp.hora_entrada_2,
      mp.hora_salida_2,

      NULL AS hora_salida_real_time,

      NULL AS min_trabajados,
      NULL AS min_atraso,
      NULL AS min_extra
    FROM marks_pivot mp
    JOIN sisusuarios u ON u.id = mp.usuario_id
    LEFT JOIN neg_t_turnos_diarios t
      ON t.usuario_id = mp.usuario_id
     AND t.fecha = mp.fecha
    WHERE t.id IS NULL

    ORDER BY fecha ASC, usuario_id ASC
  `;

  // Params:
  // 1) marks_raw IN(...) -> usuarioIds
  // 2) marks_raw rango -> fechaDesde, fechaHasta
  // 3) turnos IN(...) -> usuarioIds
  // 4) turnos rango -> fechaDesde, fechaHasta
  const params = [
    ...usuarioIds,
    fechaDesde,
    fechaHasta,
    ...usuarioIds,
    fechaDesde,
    fechaHasta,
  ];

  const [rows] = await poolmysql.query(sql, params);
  return rows || [];
}

module.exports = {
  getAsistenciaCruda,
};
