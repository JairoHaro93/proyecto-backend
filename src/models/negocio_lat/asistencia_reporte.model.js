const { poolmysql } = require("../../config/db");

function formatFecha(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function timeStrToMinutes(timeStr) {
  if (!timeStr) return null;
  const [hh, mm] = String(timeStr).split(":");
  const h = parseInt(hh || "0", 10);
  const m = parseInt(mm || "0", 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function calcularMinutosTrabajadosDesdeMarcas(
  hora_entrada_1,
  hora_salida_1,
  hora_entrada_2,
  hora_salida_2
) {
  const e1 = timeStrToMinutes(hora_entrada_1);
  const s1 = timeStrToMinutes(hora_salida_1);
  const e2 = timeStrToMinutes(hora_entrada_2);
  const s2 = timeStrToMinutes(hora_salida_2);

  let minutos = 0;

  // Oficina: mañana + tarde
  if (e1 != null && s1 != null && s1 > e1) minutos += s1 - e1;
  if (e2 != null && s2 != null && s2 > e2) minutos += s2 - e2;

  // Campo: si por algún motivo solo se usó entrada_1 / salida_2
  if (minutos === 0 && e1 != null && s2 != null && s2 > e1) {
    minutos = s2 - e1;
  }

  return minutos;
}

async function getAsistenciaCruda({ usuarioIds, fechaDesde, fechaHasta }) {
  if (!usuarioIds || !usuarioIds.length) return [];

  // 1) Turnos diarios + datos de usuario
  const [turnosRows] = await poolmysql.query(
    `
    SELECT
      t.*,
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

  // 3) Agrupar marcas por usuario+fecha (clave con YYYY-MM-DD)
  const marcasPorClave = new Map();

  for (const row of marcasRows) {
    const fechaStr = formatFecha(row.fecha); // <-- CLAVE CORREGIDA
    const clave = `${row.usuario_id}-${fechaStr}`;

    if (!marcasPorClave.has(clave)) {
      marcasPorClave.set(clave, []);
    }
    marcasPorClave.get(clave).push({
      hora: String(row.hora), // 'HH:MM:SS'
      tipo_marcado: row.tipo_marcado, // 'ENTRADA', 'SALIDA', ...
    });
  }

  // 4) Repartir marcas en Entrada1/Salida1/Entrada2/Salida2
  function repartirMarcas(marcas) {
    if (!marcas || !marcas.length) {
      return {
        hora_entrada_1: null,
        hora_salida_1: null,
        hora_entrada_2: null,
        hora_salida_2: null,
      };
    }

    let entrada1 = null;
    let salida1 = null;
    let entrada2 = null;
    let salida2 = null;

    for (const m of marcas) {
      const tipo = m.tipo_marcado;
      const esEntrada = tipo === "ENTRADA" || tipo === "ALMUERZO_ENTRADA";
      const esSalida = tipo === "SALIDA" || tipo === "ALMUERZO_SALIDA";

      if (esEntrada) {
        if (!entrada1) {
          // Primera entrada del día
          entrada1 = m.hora;
        } else if (salida1 && !entrada2) {
          // Ya hubo primer tramo completo → esta es la entrada del segundo tramo
          entrada2 = m.hora;
        }
      } else if (esSalida) {
        if (!salida1) {
          // Primera salida del día (normalmente almuerzo o salida directa)
          salida1 = m.hora;
        } else {
          // Cualquier salida posterior la consideramos salida2 (última del día)
          salida2 = m.hora;
        }
      } else {
        // Otros tipos: como fallback, si no hay entrada, la usamos
        if (!entrada1) entrada1 = m.hora;
      }
    }

    return {
      hora_entrada_1: entrada1,
      hora_salida_1: salida1,
      hora_entrada_2: entrada2,
      hora_salida_2: salida2,
    };
  }

  // 5) Combinar turnos + marcas
  const resultado = [];

  for (const t of turnosRows) {
    const fechaStr = formatFecha(t.fecha); // 'YYYY-MM-DD'
    const clave = `${t.usuario_id}-${fechaStr}`;
    const marcas = marcasPorClave.get(clave) || [];

    const { hora_entrada_1, hora_salida_1, hora_entrada_2, hora_salida_2 } =
      repartirMarcas(marcas);

    const horaEntradaProg =
      t.hora_entrada_prog != null
        ? String(t.hora_entrada_prog).slice(0, 5)
        : null;
    const horaSalidaProg =
      t.hora_salida_prog != null
        ? String(t.hora_salida_prog).slice(0, 5)
        : null;

    const horaEntradaReal =
      t.hora_entrada_real != null
        ? String(t.hora_entrada_real).slice(11, 16) // 'YYYY-MM-DD HH:MM:SS' -> 'HH:MM'
        : null;
    const horaSalidaReal =
      t.hora_salida_real != null
        ? String(t.hora_salida_real).slice(11, 16)
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

      hora_entrada_real: horaEntradaReal,
      hora_salida_real: horaSalidaReal,

      min_trabajados: t.min_trabajados,
      min_atraso: t.min_atraso,
      min_extra: t.min_extra,
      estado_asistencia: t.estado_asistencia || null,
    });
  }

  return resultado;
}

module.exports = {
  getAsistenciaCruda,
};
