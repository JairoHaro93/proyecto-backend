// src/controllers/negocio_lat/asistencia_reporte.controllers.js
const ExcelJS = require("exceljs");
const {
  getAsistenciaCruda,
} = require("../../models/negocio_lat/asistencia_reporte.model");

const {
  selectPendientesJustificaciones,
} = require("../../models/negocio_lat/justificaciones_turno.model");

const { poolmysql } = require("../../config/db");

// ==========================
// Helpers
// ==========================
function safeFilePart(text) {
  const s = String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .toLowerCase();
  return s;
}

function buildFileName(mes, nombreBase, uid) {
  let base = "reporte";
  const safeNombre = safeFilePart(nombreBase || "");
  if (safeNombre) base += `_${safeNombre}`;
  else base += `_usuario_${uid}`;
  return `${base}_${mes}.xlsx`;
}

function toHHMM(value) {
  if (!value) return null;
  return String(value).slice(0, 5);
}

function timeToMinutes(timeStr) {
  if (!timeStr) return null;
  const parts = String(timeStr).split(":");
  const hh = parseInt(parts[0], 10);
  const mm = parseInt(parts[1] || "0", 10);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
}

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
  if (e1 != null && s1 != null && s1 > e1) minutos += s1 - e1;
  if (e2 != null && s2 != null && s2 > e2) minutos += s2 - e2;

  // Fallback: si solo hay entrada y salida final
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

// ✅ Para atrasos/salida temprana en reporte:
// - Si tu turno ya guarda min_atraso/min_salida_temprana en BD, úsalo.
// - Si no existe, calcula “simple” por comparación de HH:mm.
// Nota: Aquí NO recomputamos con CEIL/segundos porque el cálculo real ya debe venir desde updateTurnoFromAsistencia.
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
  // Ecuador -05:00
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

function excelColName(n) {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function parseMesToRange(mes) {
  // mes: YYYY-MM
  const m = String(mes || "").trim();
  if (!/^\d{4}-\d{2}$/.test(m)) return null;

  const [yy, mm] = m.split("-");
  const y = Number(yy);
  const month = Number(mm);

  if (Number.isNaN(y) || Number.isNaN(month) || month < 1 || month > 12) {
    return null;
  }

  const lastDay = new Date(y, month, 0).getDate(); // month es 1-12 aquí
  const fechaDesde = `${yy}-${mm}-01`;
  const fechaHasta = `${yy}-${mm}-${String(lastDay).padStart(2, "0")}`;

  return { fechaDesde, fechaHasta };
}

// ==========================
// MULTAS
// ==========================
function rangoMulta(minutos) {
  const m = Number(minutos || 0);
  if (m >= 1 && m <= 5) return "1-5";
  if (m >= 6 && m <= 10) return "6-10";
  if (m >= 11) return "11+";
  return null;
}

function multaPorFrecuencia(rangoKey, nuevoCount) {
  if (!rangoKey) return 0;

  if (rangoKey === "1-5") {
    return nuevoCount >= 2 ? 2.0 : 0;
  }
  if (rangoKey === "6-10") {
    return nuevoCount === 1 ? 2.5 : 5.0;
  }
  if (rangoKey === "11+") {
    return nuevoCount === 1 ? 10.0 : 20.0;
  }
  return 0;
}

function calcularMultaDia({ minAtraso, minSalidaTemprana }, freq) {
  let total = 0;

  // ATRASO
  const rA = rangoMulta(minAtraso);
  if (rA) {
    freq.atraso[rA] = (freq.atraso[rA] || 0) + 1;
    total += multaPorFrecuencia(rA, freq.atraso[rA]);
  }

  // SALIDA TEMPRANA
  const rS = rangoMulta(minSalidaTemprana);
  if (rS) {
    freq.salida[rS] = (freq.salida[rS] || 0) + 1;
    total += multaPorFrecuencia(rS, freq.salida[rS]);
  }

  return Math.round(total * 100) / 100;
}

// ✅ Justificaciones
function normEstado(v) {
  return String(v || "NO")
    .trim()
    .toUpperCase();
}

// Acepta APROBADA o APROBADO por si algún lado lo guarda distinto
function esAprobadaJust(v) {
  const s = normEstado(v);
  return s === "APROBADA" || s === "APROBADO";
}

// ==========================
// Controller
// ==========================
async function getReporteAsistenciaExcel(req, res) {
  try {
    const { mes, usuario_id } = req.query;

    if (!mes || !usuario_id) {
      return res.status(400).json({
        message: "mes (YYYY-MM) y usuario_id son obligatorios",
      });
    }

    const range = parseMesToRange(mes);
    if (!range) {
      return res.status(400).json({
        message: "mes inválido. Use formato YYYY-MM (ej: 2025-12)",
      });
    }

    const uid = Number(usuario_id);
    if (Number.isNaN(uid)) {
      return res.status(400).json({ message: "usuario_id debe ser numérico" });
    }

    // ✅ 0) No permitir reporte si hay justificaciones pendientes
    const pendientes = await selectPendientesJustificaciones({
      desde: range.fechaDesde,
      hasta: range.fechaHasta,
      usuario_id: uid,
    });

    if (pendientes.length) {
      return res.status(409).json({
        message:
          "⛔ No se puede generar el reporte: existen justificaciones PENDIENTES en el mes seleccionado.",
        pendientes,
      });
    }

    // 1) Datos crudos
    const asistenciaCruda = await getAsistenciaCruda({
      usuarioIds: [uid],
      fechaDesde: range.fechaDesde,
      fechaHasta: range.fechaHasta,
    });

    // 2) Base del usuario
    let nombreBase = "";
    let cedulaBase = "";

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

    if (userRows && userRows.length > 0) {
      nombreBase = userRows[0].nombre_completo || "";
      cedulaBase = userRows[0].cedula || "";
    } else if (asistenciaCruda && asistenciaCruda.length > 0) {
      nombreBase = asistenciaCruda[0].nombre_completo || "";
      cedulaBase = asistenciaCruda[0].cedula || "";
    }

    // 3) Map por fecha
    const rowsPorFecha = new Map();
    for (const row of asistenciaCruda) rowsPorFecha.set(row.fecha, row);

    // 4) Filas del reporte (todo el mes)
    const filasReporte = [];

    const desdeDate = new Date(`${range.fechaDesde}T00:00:00-05:00`);
    const hastaDate = new Date(`${range.fechaHasta}T00:00:00-05:00`);

    const freq = {
      atraso: { "1-5": 0, "6-10": 0, "11+": 0 },
      salida: { "1-5": 0, "6-10": 0, "11+": 0 },
    };

    let cursor = new Date(desdeDate);
    while (cursor.getTime() <= hastaDate.getTime()) {
      const fechaStr = formatFecha(cursor);
      const fecha_dia = buildFechaDia(fechaStr);

      const row = rowsPorFecha.get(fechaStr);

      if (row) {
        const minutos_trabajados = calcularMinutosTrabajados(row);

        // ✅ minutos “reales”
        const minutos_atrasados_real = calcularMinutosAtraso(row);
        const minutos_salida_temprana_real = calcularMinutosSalidaTemprana(row);

        // ✅ estados de justificación (si tu query los trae)
        const justAtrasoEstado = normEstado(row.just_atraso_estado);
        const justSalidaEstado = normEstado(row.just_salida_estado);

        // ✅ PARA MULTA:
        // si está APROBADA => NO cuenta (0 min) y NO incrementa frecuencia
        const minAtrasoParaMulta = esAprobadaJust(justAtrasoEstado)
          ? 0
          : minutos_atrasados_real;

        const minSalidaParaMulta = esAprobadaJust(justSalidaEstado)
          ? 0
          : minutos_salida_temprana_real;

        const multa = calcularMultaDia(
          {
            minAtraso: minAtrasoParaMulta,
            minSalidaTemprana: minSalidaParaMulta,
          },
          freq
        );

        filasReporte.push({
          fecha_dia,
          estado_asistencia: row.estado_asistencia || "INCOMPLETO",

          hora_entrada_prog: toHHMM(row.hora_entrada_prog),
          hora_salida_prog: toHHMM(row.hora_salida_prog),

          hora_entrada_1: toHHMM(row.hora_entrada_1),
          hora_salida_1: toHHMM(row.hora_salida_1),
          hora_entrada_2: toHHMM(row.hora_entrada_2),
          hora_salida_2: toHHMM(row.hora_salida_2),

          // ✅ Transparencia: mostramos minutos reales
          minutos_atrasados: minutos_atrasados_real,
          minutos_salida_temprana: minutos_salida_temprana_real,

          // ✅ y mostramos el estado de autorización
          just_atraso_estado: justAtrasoEstado,
          just_salida_estado: justSalidaEstado,

          minutos_trabajados,

          multa,
          observacion: row.observacion || null,
        });
      } else {
        filasReporte.push({
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

          just_atraso_estado: "NO",
          just_salida_estado: "NO",

          minutos_trabajados: 0,

          multa: 0,
          observacion: null,
        });
      }

      cursor.setDate(cursor.getDate() + 1);
    }

    // 5) Excel
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Asistencia");

    worksheet.columns = [
      { header: "Fecha (día)", key: "fecha_dia", width: 24 },
      { header: "Estado\nasistencia", key: "estado_asistencia", width: 14 },

      { header: "Entrada\nprogramada", key: "hora_entrada_prog", width: 12 },
      { header: "Salida\nprogramada", key: "hora_salida_prog", width: 12 },

      { header: "Entrada\n1", key: "hora_entrada_1", width: 10 },
      { header: "Salida\n1", key: "hora_salida_1", width: 10 },
      { header: "Entrada\n2", key: "hora_entrada_2", width: 10 },
      { header: "Salida\n2", key: "hora_salida_2", width: 10 },

      { header: "Min\natraso", key: "minutos_atrasados", width: 10 },
      { header: "Just\natraso", key: "just_atraso_estado", width: 10 },

      {
        header: "Min.\nsalida temprana",
        key: "minutos_salida_temprana",
        width: 14,
      },
      { header: "Just\nsalida", key: "just_salida_estado", width: 10 },

      { header: "Minutos\ntrabajados", key: "minutos_trabajados", width: 14 },

      { header: "Multas\n($)", key: "multa", width: 10 },
      { header: "Observación", key: "observacion", width: 45 },
    ];

    worksheet.addRows(filasReporte);

    // ====== Cabecera superior (4 filas arriba) ======
    const totalCols = worksheet.columns.length;
    const lastCol = excelColName(totalCols);

    const rowTitulo = [
      "REPORTE DE ASISTENCIA",
      ...Array(totalCols - 1).fill(""),
    ];
    const rowNombre = [
      `Nombre: ${nombreBase || ""}`,
      ...Array(totalCols - 1).fill(""),
    ];
    const rowCedula = [
      `Cédula: ${cedulaBase || ""}`,
      ...Array(totalCols - 1).fill(""),
    ];
    const rowBlank = [...Array(totalCols).fill("")];

    worksheet.spliceRows(1, 0, rowTitulo, rowNombre, rowCedula, rowBlank);

    worksheet.mergeCells(`A1:${lastCol}1`);
    worksheet.mergeCells(`A2:${lastCol}2`);
    worksheet.mergeCells(`A3:${lastCol}3`);

    worksheet.getRow(1).font = { bold: true, size: 16 };
    worksheet.getRow(1).alignment = {
      vertical: "middle",
      horizontal: "center",
    };
    worksheet.getRow(2).font = { bold: true, size: 12 };
    worksheet.getRow(3).font = { bold: true, size: 12 };
    worksheet.getRow(2).alignment = { vertical: "middle", horizontal: "left" };
    worksheet.getRow(3).alignment = { vertical: "middle", horizontal: "left" };

    worksheet.getRow(1).height = 22;
    worksheet.getRow(2).height = 18;
    worksheet.getRow(3).height = 18;

    const headerRowIndex = 5;
    const hdr = worksheet.getRow(headerRowIndex);
    hdr.height = 30;
    hdr.font = { bold: true };
    hdr.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };

    worksheet.views = [{ state: "frozen", ySplit: 5 }];

    // Formato moneda para columna multas
    const multaColIndex =
      worksheet.columns.findIndex((c) => c.key === "multa") + 1;
    if (multaColIndex > 0) {
      worksheet.getColumn(multaColIndex).numFmt = '"$"#,##0.00';
    }

    // ====== Total Multas ======
    const dataStartRow = headerRowIndex + 1; // 6
    const dataEndRow = dataStartRow + filasReporte.length - 1;
    const multaColLetter = excelColName(multaColIndex);

    const totalRow = worksheet.addRow([]);
    totalRow.getCell(1).value = "TOTAL MULTAS";
    totalRow.getCell(1).font = { bold: true };

    totalRow.getCell(multaColIndex).value = {
      formula: `SUM(${multaColLetter}${dataStartRow}:${multaColLetter}${dataEndRow})`,
      result: 0,
    };
    totalRow.font = { bold: true };
    totalRow.alignment = { vertical: "middle" };

    const fileName = buildFileName(mes, nombreBase, uid);

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

module.exports = { getReporteAsistenciaExcel };
