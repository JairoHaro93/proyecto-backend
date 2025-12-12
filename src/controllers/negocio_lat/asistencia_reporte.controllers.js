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

    // Quitar acentos y caracteres raros, dejar algo tipo "juan_perez_garcia"
    const safeNombre = nombre
      .normalize("NFD") // separa acentos
      .replace(/[\u0300-\u036f]/g, "") // elimina marcas diacríticas
      .replace(/\s+/g, "_") // espacios -> guiones bajos
      .replace(/[^a-zA-Z0-9_]/g, "") // solo letras, números y _
      .toLowerCase();

    if (safeNombre) {
      base += `_${safeNombre}`;
    }
  }

  return `${base}_${fecha_desde}_a_${fecha_hasta}.xlsx`;
}

function timeToMinutes(timeStr) {
  if (!timeStr) return null;
  const parts = String(timeStr).split(":"); // 'HH:MM' o 'HH:MM:SS'
  const hh = parseInt(parts[0], 10);
  const mm = parseInt(parts[1] || "0", 10);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
}

// Usado solo si min_trabajados es null (cálculo por marcas)
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

  // Campo: solo entrada_1 / salida_2
  if (minutos === 0 && e1 != null && s2 != null && s2 > e1) {
    minutos = s2 - e1;
  }

  return minutos;
}

function calcularMinutosTrabajados(row) {
  if (row.min_trabajados != null) return row.min_trabajados;
  return calcularMinutosTrabajadosDesdeMarcas(
    row.hora_entrada_1,
    row.hora_salida_1,
    row.hora_entrada_2,
    row.hora_salida_2
  );
}

function calcularMinutosAtraso(row) {
  if (row.min_atraso != null) return row.min_atraso;

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

  // Preferimos la hora_salida_real del turno; si no hay, usamos la salida_2 de marcas
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
  const date = new Date(fechaStr + "T00:00:00");
  const fmtDia = new Intl.DateTimeFormat("es-EC", { weekday: "long" });
  const fmtFecha = new Intl.DateTimeFormat("es-EC", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  let dia = fmtDia.format(date); // 'lunes'
  dia = dia.charAt(0).toUpperCase() + dia.slice(1); // 'Lunes'

  const fechaBonita = fmtFecha.format(date); // '01/01/2025'
  return `${dia} ${fechaBonita}`; // 'Lunes 01/01/2025'
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
//
// GET /api/asistencia/reporte-excel?fecha_desde=YYYY-MM-DD&fecha_hasta=YYYY-MM-DD&usuario_id=8&departamento_id=2
//
async function getReporteAsistenciaExcel(req, res) {
  try {
    const { fecha_desde, fecha_hasta, usuario_id, departamento_id } = req.query;

    console.log("📥 Query reporte-excel COMPLETO:", {
      fecha_desde,
      fecha_hasta,
      usuario_id,
      departamento_id,
    });

    // Validaciones básicas
    if (!fecha_desde || !fecha_hasta || !usuario_id) {
      return res.status(400).json({
        message:
          "fecha_desde, fecha_hasta y usuario_id son obligatorios (YYYY-MM-DD, usuario_id numérico)",
      });
    }

    const desde = new Date(fecha_desde + "T00:00:00");
    const hasta = new Date(fecha_hasta + "T00:00:00");

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

    // 1) Obtener asistencia cruda de BD (turnos + marcas procesadas)
    const asistenciaCruda = await getAsistenciaCruda({
      usuarioIds: [uid],
      fechaDesde: fecha_desde,
      fechaHasta: fecha_hasta,
      // Si en el futuro necesitas usar departamento_id en el modelo, puedes pasarlo aquí
      // departamentoId: departamento_id ? Number(departamento_id) : undefined,
    });

    console.log("📊 asistenciaCruda registros:", asistenciaCruda.length);

    // 2) Preparar info base de usuario (por si no hay turnos en el rango)
    let nombreBase = null;
    let cedulaBase = null;

    if (asistenciaCruda.length > 0) {
      nombreBase = asistenciaCruda[0].nombre_completo;
      cedulaBase = asistenciaCruda[0].cedula;
    } else {
      // No hubo turnos en el rango → igual sacamos nombre/cedula del usuario
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
        nombreBase = userRows[0].nombre_completo;
        cedulaBase = userRows[0].cedula;
      }
    }

    // 3) Indexar asistenciaCruda por fecha
    const rowsPorFecha = new Map();
    for (const row of asistenciaCruda) {
      // row.fecha viene como 'YYYY-MM-DD'
      rowsPorFecha.set(row.fecha, row);
    }

    // 4) Construir filas del reporte para CADA día del rango
    const filasReporte = [];
    let cursor = new Date(desde);

    while (cursor.getTime() <= hasta.getTime()) {
      const fechaStr = formatFecha(cursor); // 'YYYY-MM-DD'
      const fecha_dia = buildFechaDia(fechaStr);

      const row = rowsPorFecha.get(fechaStr);

      if (row) {
        const minutos_trabajados = calcularMinutosTrabajados(row);
        const minutos_atrasados = calcularMinutosAtraso(row);
        const minutos_salida_temprana = calcularMinutosSalidaTemprana(row);

        let estado = row.estado_asistencia || "SIN_MARCA";

        filasReporte.push({
          nombre_completo: row.nombre_completo,
          cedula: row.cedula,
          fecha_dia,

          estado_asistencia: estado,

          // Programado
          hora_entrada_prog: row.hora_entrada_prog || null,
          hora_salida_prog: row.hora_salida_prog || null,

          // Marcas 1 y 2
          hora_entrada_1: row.hora_entrada_1
            ? String(row.hora_entrada_1).slice(0, 5)
            : null,
          hora_salida_1: row.hora_salida_1
            ? String(row.hora_salida_1).slice(0, 5)
            : null,
          hora_entrada_2: row.hora_entrada_2
            ? String(row.hora_entrada_2).slice(0, 5)
            : null,
          hora_salida_2: row.hora_salida_2
            ? String(row.hora_salida_2).slice(0, 5)
            : null,

          // Ya no enviamos entrada_real / salida_real al Excel
          minutos_atrasados,
          minutos_salida_temprana,
          minutos_trabajados,
        });
      } else {
        // 🚫 Día SIN turno asignado → "SIN_TURNO"
        filasReporte.push({
          nombre_completo: nombreBase || "",
          cedula: cedulaBase || "",
          fecha_dia,
          hora_entrada_1: null,
          hora_salida_1: null,
          hora_entrada_2: null,
          hora_salida_2: null,
          minutos_atrasados: 0,
          minutos_salida_temprana: 0,
          minutos_trabajados: 0,
          estado_asistencia: "SIN_TURNO",
        });
      }

      cursor.setDate(cursor.getDate() + 1);
    }

    console.log("🧾 filasReporte length:", filasReporte.length);

    // 5) Generar Excel
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Asistencia");
    worksheet.columns = [
      { header: "Nombre completo", key: "nombre_completo", width: 32 },
      { header: "Cédula", key: "cedula", width: 15 },
      { header: "Fecha (día)", key: "fecha_dia", width: 24 },
      { header: "Estado asistencia", key: "estado_asistencia", width: 18 },

      // Programado
      { header: "Hora entrada prog", key: "hora_entrada_prog", width: 16 },
      { header: "Hora salida prog", key: "hora_salida_prog", width: 16 },

      // Marcas crudas
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
    console.log("🧾 fileName generado:", fileName);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("❌ Error en getReporteAsistenciaExcel COMPLETO:", error);
    res.status(500).json({
      message: "Error interno en reporte-excel",
      error: String(error),
    });
  }
}

module.exports = {
  getReporteAsistenciaExcel,
};
