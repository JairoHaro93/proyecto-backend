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
 * IMPORTANTE PARA EXCEL (multas):
 *  - Debe incluir campos just_* para saber si se perdona atraso/salida.
 */
async function getAsistenciaCruda({ usuarioIds = [], fechaDesde, fechaHasta }) {
  usuarioIds = (usuarioIds || [])
    .map((x) => Number(x))
    .filter((x) => !Number.isNaN(x));

  if (!usuarioIds.length) return [];
  if (!fechaDesde || !fechaHasta) return [];

  const inUsers = inPlaceholders(usuarioIds);

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

      CASE
        WHEN (t.tipo_dia IS NOT NULL AND t.tipo_dia <> 'NORMAL') THEN t.tipo_dia
        WHEN COALESCE(mp.marcas_count, 0) = 0 THEN
          CASE WHEN t.fecha < CURDATE() THEN 'FALTA' ELSE 'SIN_MARCA' END
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
      t.min_extra,
      t.observacion AS observacion,

      -- ✅ JUSTIFICACIONES (CLAVE para no multar si está APROBADA)
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
    WHERE t.usuario_id IN (${inUsers})
      AND t.fecha >= ?
      AND t.fecha <= ?

    UNION ALL

    -- B) Días SIN TURNO pero CON MARCAS (secundario)
    SELECT
      mp.usuario_id,
      DATE_FORMAT(mp.fecha, '%Y-%m-%d') AS fecha,

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
      NULL AS min_extra,
      NULL AS observacion,

      -- ✅ mismas columnas que arriba (para UNION)
      NULL AS just_atraso_estado,
      NULL AS just_atraso_motivo,
      NULL AS just_atraso_minutos,
      NULL AS just_atraso_jefe_id,

      NULL AS just_salida_estado,
      NULL AS just_salida_motivo,
      NULL AS just_salida_minutos,
      NULL AS just_salida_jefe_id

    FROM marks_pivot mp
    LEFT JOIN neg_t_turnos_diarios t
      ON t.usuario_id = mp.usuario_id
     AND t.fecha = mp.fecha
    WHERE t.id IS NULL

    ORDER BY fecha ASC, usuario_id ASC
  `;

  const params = [
    ...usuarioIds, // IN marks_raw
    fechaDesde,
    fechaHasta,

    ...usuarioIds, // IN select A
    fechaDesde,
    fechaHasta,
  ];

  const [rows] = await poolmysql.query(sql, params);
  return rows || [];
}

module.exports = { getAsistenciaCruda };
