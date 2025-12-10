const { poolmysql } = require("../../config/db");

async function getAsistenciaCruda({ usuarioIds, fechaDesde, fechaHasta }) {
  if (!usuarioIds || !usuarioIds.length) return [];

  // 1) Turnos diarios + datos de usuario
  const [turnosRows] = await poolmysql.query(
    `
    SELECT
      t.usuario_id,
      t.fecha,
      t.sucursal,
      t.hora_entrada_prog,
      t.hora_salida_prog,
      t.min_trabajados,
      t.min_atraso,
      t.min_extra,
      TIME(t.hora_entrada_real) AS hora_entrada_real_time,
      TIME(t.hora_salida_real) AS hora_salida_real_time,
      t.estado_asistencia,                             -- 👈 NUEVO
      u.ci AS cedula,
      CONCAT(u.nombre, ' ', u.apellido) AS nombre_completo
    FROM neg_t_turnos_diarios t
    JOIN sisusuarios u ON u.id = t.usuario_id
    WHERE t.usuario_id IN (?)
      AND t.fecha BETWEEN ? AND ?
    ORDER BY t.usuario_id, t.fecha
    `,
    [usuarioIds, fechaDesde, fechaHasta]
  );

  // 2) Marcas de timbre
  const [marcasRows] = await poolmysql.query(
    `
    SELECT
      a.usuario_id,
      DATE(a.fecha_hora) AS fecha,
      TIME(a.fecha_hora) AS hora,
      a.tipo_marcado
    FROM neg_t_asistencia a
    WHERE a.usuario_id IN (?)
      AND DATE(a.fecha_hora) BETWEEN ? AND ?
    ORDER BY a.usuario_id, fecha, hora
    `,
    [usuarioIds, fechaDesde, fechaHasta]
  );

  // 3) Agrupar marcas por usuario+fecha
  const marcasPorClave = new Map(); // 👈 ESTA LÍNEA ES LA QUE FALTABA

  for (const row of marcasRows) {
    const clave = `${row.usuario_id}-${row.fecha}`; // fecha es 'YYYY-MM-DD'
    if (!marcasPorClave.has(clave)) {
      marcasPorClave.set(clave, []);
    }
    marcasPorClave.get(clave).push({
      hora: row.hora, // 'HH:MM:SS'
      tipo_marcado: row.tipo_marcado, // 'ENTRADA', 'SALIDA', 'ALMUERZO_SALIDA', etc.
    });
  }

  // 4) Repartir marcas en 4 slots (entrada1, salida1, entrada2, salida2)
  function repartirMarcas(marcas) {
    if (!marcas || !marcas.length) {
      return {
        hora_entrada_1: null,
        hora_salida_1: null,
        hora_entrada_2: null,
        hora_salida_2: null,
      };
    }

    // Ya vienen ordenadas por hora gracias al ORDER BY
    let entrada1 = null;
    let almSalida = null;
    let almEntrada = null;
    let salidaDef = null;

    for (const m of marcas) {
      switch (m.tipo_marcado) {
        case "ENTRADA":
          if (!entrada1) entrada1 = m.hora;
          if (!salidaDef) salidaDef = m.hora; // fallback inicial
          break;
        case "ALMUERZO_SALIDA":
          if (!almSalida) almSalida = m.hora;
          break;
        case "ALMUERZO_ENTRADA":
          if (!almEntrada) almEntrada = m.hora;
          break;
        case "SALIDA":
          // última SALIDA del día manda
          salidaDef = m.hora;
          break;
        default:
          // 'OTRO' u otros: como fallback si falta algo
          if (!entrada1) entrada1 = m.hora;
          salidaDef = m.hora;
          break;
      }
    }

    // Si no hay SALIDA explícita, tomar la última marca como salida
    if (!salidaDef && marcas.length) {
      salidaDef = marcas[marcas.length - 1].hora;
    }

    // Si no hay ENTRADA explícita, tomar la primera marca como entrada
    if (!entrada1 && marcas.length) {
      entrada1 = marcas[0].hora;
    }

    return {
      hora_entrada_1: entrada1,
      hora_salida_1: almSalida,
      hora_entrada_2: almEntrada,
      hora_salida_2: salidaDef,
    };
  }

  // 5) Combinar turnos + marcas
  const resultado = [];

  for (const t of turnosRows) {
    const fechaStr =
      t.fecha instanceof Date
        ? t.fecha.toISOString().slice(0, 10)
        : String(t.fecha).slice(0, 10); // 'YYYY-MM-DD'

    const clave = `${t.usuario_id}-${fechaStr}`;
    const marcas = marcasPorClave.get(clave) || [];

    const { hora_entrada_1, hora_salida_1, hora_entrada_2, hora_salida_2 } =
      repartirMarcas(marcas);

    // hora_entrada_prog / hora_salida_prog vienen como 'HH:MM:SS' → recortamos a HH:MM
    const horaEntradaProg =
      t.hora_entrada_prog != null
        ? String(t.hora_entrada_prog).slice(0, 5)
        : null;
    const horaSalidaProg =
      t.hora_salida_prog != null
        ? String(t.hora_salida_prog).slice(0, 5)
        : null;

    const horaSalidaReal =
      t.hora_salida_real_time != null
        ? String(t.hora_salida_real_time).slice(0, 5)
        : null;

    resultado.push({
      usuario_id: Number(t.usuario_id),
      nombre_completo: t.nombre_completo,
      cedula: t.cedula,
      fecha: fechaStr,
      sucursal: t.sucursal,
      hora_entrada_prog: horaEntradaProg,
      hora_salida_prog: horaSalidaProg,
      hora_entrada_1,
      hora_salida_1,
      hora_entrada_2,
      hora_salida_2,
      min_trabajados: t.min_trabajados,
      min_atraso: t.min_atraso,
      min_extra: t.min_extra,
      hora_salida_real_time: horaSalidaReal,
      estado_asistencia: t.estado_asistencia || null, // 👈 NUEVO PARA EL REPORTE
    });
  }

  return resultado;
}

module.exports = {
  getAsistenciaCruda,
};
