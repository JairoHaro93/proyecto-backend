// controllers/negocio_lat/asistencia_reporte.controllers.js
const ExcelJS = require("exceljs");
const {
  getAsistenciaCruda,
} = require("../../models/negocio_lat/asistencia_reporte.model");
const { poolmysql } = require("../../config/db");

// ==========================
// Helpers generales
// ==========================

function buildFileName(fecha_desde, fecha_hasta, filasReporte) {
  let base = "reporte";

  if (Array.isArray(filasReporte) && filasReporte.length > 0) {
    const nombre = filasReporte[0].nombre_completo || "";

    const safeNombre = nombre
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_]/g, "")
      .toLowerCase();

    if (safeNombre) base += `_${safeNombre}`;
  }

  return `${base}_${fecha_desde}_a_${fecha_hasta}.xlsx`;
}

function toHHMM(value) {
  if (!value) return null;
  return String(value).slice(0, 5); // "HH:MM"
}

function timeToMinutes(timeStr) {
  if (!timeStr) return null;
  const parts = String(timeStr).split(":");
  const hh = parseInt(parts[0], 10);
  const mm = parseInt(parts[1] || "0", 10);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
}

// Fallback solo si min_trabajados viene null
function calcularMinutosTrabajadosDesdeMarcas(
  hora_entrada_1,
  hora_salida_1,
  hora_entrada_2,
  hora_salida_2
) {
  const e1 = timeToMinutes(hora_entrada_1);
  const s1 = timeToMinutes(hora_salida_1);
  const e2 = timeToMinutes(hora_entrada_2);
  const s2 = timeToMinutes(hora_salida_2);

  let minutos = 0;

  // Oficina: mañana + tarde
  if (e1 != null && s1 != null && s1 > e1) minutos += s1 - e1;
  if (e2 != null && s2 != null && s2 > e2) minutos += s2 - e2;

  // Campo: entrada_1 -> salida_2
  if (minutos === 0 && e1 != null && s2 != null && s2 > e1) {
    minutos = s2 - e1;
  }

  return minutos;
}

function calcularMinutosTrabajados(row) {
  if (row.min_trabajados != null) return Number(row.min_trabajados) || 0;
  return calcularMinutosTrabajadosDesdeMarcas(
    row.hora_entrada_1,
    row.hora_salida_1,
    row.hora_entrada_2,
    row.hora_salida_2
  );
}

function calcularMinutosAtraso(row) {
  if (row.min_atraso != null) return Number(row.min_atraso) || 0;

  const entradaProgMin = timeToMinutes(row.hora_entrada_prog);
  const entradaReal = row.hora_entrada_1 || row.hora_entrada_2 || null;
  const entradaRealMin = timeToMinutes(entradaReal);

  if (
    entradaProgMin != null &&
    entradaRealMin != null &&
    entradaRealMin > entradaProgMin
  ) {
    return entradaRealMin - entradaProgMin;
  }
  return 0;
}

// (Opcional) métrica informativa, no afecta estados
function calcularMinutosSalidaTemprana(row) {
  const salidaProgMin = timeToMinutes(row.hora_salida_prog);
  const salidaReal = row.hora_salida_real_time || row.hora_salida_2 || null;
  const salidaRealMin = timeToMinutes(salidaReal);

  if (
    salidaProgMin != null &&
    salidaRealMin != null &&
    salidaRealMin < salidaProgMin
  ) {
    return salidaProgMin - salidaRealMin;
  }

  return 0;
}

function buildFechaDia(fechaStr) {
  // Ecuador continental fijo (-05:00)
  const date = new Date(`${fechaStr}T00:00:00-05:00`);

  const fmtDia = new Intl.DateTimeFormat("es-EC", { weekday: "long" });
  const fmtFecha = new Intl.DateTimeFormat("es-EC", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  let dia = fmtDia.format(date);
  dia = dia.charAt(0).toUpperCase() + dia.slice(1);

  const fechaBonita = fmtFecha.format(date);
  return `${dia} ${fechaBonita}`;
}

function formatFecha(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ==========================
//   Controller principal
// ==========================
async function getReporteAsistenciaExcel(req, res) {
  try {
    const { fecha_desde, fecha_hasta, usuario_id } = req.query;

    if (!fecha_desde || !fecha_hasta || !usuario_id) {
      return res.status(400).json({
        message:
          "fecha_desde, fecha_hasta y usuario_id son obligatorios (YYYY-MM-DD, usuario_id numérico)",
      });
    }

    // Ecuador (-05:00)
    const desde = new Date(`${fecha_desde}T00:00:00-05:00`);
    const hasta = new Date(`${fecha_hasta}T00:00:00-05:00`);

    if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) {
      return res
        .status(400)
        .json({ message: "Fechas inválidas, use formato YYYY-MM-DD" });
    }

    if (hasta < desde) {
      return res.status(400).json({
        message: "fecha_hasta no puede ser menor que fecha_desde",
      });
    }

    const diffMs = hasta.getTime() - desde.getTime();
    const diffDias = diffMs / (1000 * 60 * 60 * 24) + 1;
    if (diffDias > 31) {
      return res.status(400).json({
        message:
          "El rango máximo permitido para el reporte de asistencia es de 31 días.",
      });
    }

    const uid = Number(usuario_id);
    if (Number.isNaN(uid)) {
      return res.status(400).json({ message: "usuario_id debe ser numérico" });
    }

    // 1) Obtener asistencia cruda (ya viene con 4 marcas)
    const asistenciaCruda = await getAsistenciaCruda({
      usuarioIds: [uid],
      fechaDesde: fecha_desde,
      fechaHasta: fecha_hasta,
    });

    // 2) Info base de usuario si no hay nada en el rango
    let nombreBase = "";
    let cedulaBase = "";

    if (asistenciaCruda.length > 0) {
      nombreBase = asistenciaCruda[0].nombre_completo || "";
      cedulaBase = asistenciaCruda[0].cedula || "";
    } else {
      const [userRows] = await poolmysql.query(
        `
        SELECT
          ci AS cedula,
          CONCAT(nombre, ' ', apellido) AS nombre_completo
        FROM sisusuarios
        WHERE id = ?
        `,
        [uid]
      );
      if (userRows.length > 0) {
        nombreBase = userRows[0].nombre_completo || "";
        cedulaBase = userRows[0].cedula || "";
      }
    }

    // 3) Indexar por fecha (YYYY-MM-DD)
    const rowsPorFecha = new Map();
    for (const row of asistenciaCruda) {
      rowsPorFecha.set(row.fecha, row);
    }

    // 4) Filas por cada día del rango
    const filasReporte = [];
    let cursor = new Date(desde);

    while (cursor.getTime() <= hasta.getTime()) {
      const fechaStr = formatFecha(cursor);
      const fecha_dia = buildFechaDia(fechaStr);

      const row = rowsPorFecha.get(fechaStr);

      if (row) {
        const minutos_trabajados = calcularMinutosTrabajados(row);
        const minutos_atrasados = calcularMinutosAtraso(row);
        const minutos_salida_temprana = calcularMinutosSalidaTemprana(row);

        filasReporte.push({
          nombre_completo: row.nombre_completo || nombreBase,
          cedula: row.cedula || cedulaBase,
          fecha_dia,

          estado_asistencia: row.estado_asistencia || "INCOMPLETO",

          hora_entrada_prog: toHHMM(row.hora_entrada_prog),
          hora_salida_prog: toHHMM(row.hora_salida_prog),

          hora_entrada_1: toHHMM(row.hora_entrada_1),
          hora_salida_1: toHHMM(row.hora_salida_1),
          hora_entrada_2: toHHMM(row.hora_entrada_2),
          hora_salida_2: toHHMM(row.hora_salida_2),

          minutos_atrasados,
          minutos_salida_temprana,
          minutos_trabajados,
        });
      } else {
        // Día sin turno y sin marcas en el rango: dejamos SIN_TURNO (tal como lo vienes manejando)
        filasReporte.push({
          nombre_completo: nombreBase,
          cedula: cedulaBase,
          fecha_dia,

          estado_asistencia: "SIN_TURNO",

          hora_entrada_prog: null,
          hora_salida_prog: null,

          hora_entrada_1: null,
          hora_salida_1: null,
          hora_entrada_2: null,
          hora_salida_2: null,

          minutos_atrasados: 0,
          minutos_salida_temprana: 0,
          minutos_trabajados: 0,
        });
      }

      cursor.setDate(cursor.getDate() + 1);
    }

    // 5) Excel
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Asistencia");

    worksheet.columns = [
      { header: "Nombre completo", key: "nombre_completo", width: 32 },
      { header: "Cédula", key: "cedula", width: 15 },
      { header: "Fecha (día)", key: "fecha_dia", width: 24 },
      { header: "Estado asistencia", key: "estado_asistencia", width: 18 },

      { header: "Hora entrada prog", key: "hora_entrada_prog", width: 16 },
      { header: "Hora salida prog", key: "hora_salida_prog", width: 16 },

      { header: "Entrada 1", key: "hora_entrada_1", width: 12 },
      { header: "Salida 1", key: "hora_salida_1", width: 12 },
      { header: "Entrada 2", key: "hora_entrada_2", width: 12 },
      { header: "Salida 2", key: "hora_salida_2", width: 12 },

      { header: "Minutos atraso", key: "minutos_atrasados", width: 16 },
      {
        header: "Min. salida temprana",
        key: "minutos_salida_temprana",
        width: 20,
      },
      { header: "Minutos trabajados", key: "minutos_trabajados", width: 18 },
    ];

    worksheet.addRows(filasReporte);
    worksheet.views = [{ state: "frozen", ySplit: 1 }];

    const fileName = buildFileName(fecha_desde, fecha_hasta, filasReporte);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("❌ Error en getReporteAsistenciaExcel:", error);
    res.status(500).json({
      message: "Error interno en reporte-excel",
      error: String(error),
    });
  }
}

module.exports = {
  getReporteAsistenciaExcel,
};
