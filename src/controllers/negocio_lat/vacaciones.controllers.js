// src/controllers/negocio_lat/vacaciones.controllers.js
"use strict";

const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit"); // npm i pdfkit
const { poolmysql } = require("../../config/db");

const Vac = require("../../models/negocio_lat/vacaciones.models");

// ---------- Helpers ----------
function ymdOk(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.trim());
}

function tiempoEnOrganizacion(fechaContYMD, refDate = new Date()) {
  if (!fechaContYMD) return "";

  // Usamos tu parseECDate para evitar corrimientos por zona horaria
  const start = parseECDate(fechaContYMD);
  const end = new Date(refDate.getTime());

  if (end.getTime() < start.getTime()) return "0 meses";

  // Diferencia en meses (ajustada por día del mes)
  let months =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth());

  // Si aún no llega al día del mes de contratación, restamos 1 mes
  if (end.getDate() < start.getDate()) months -= 1;

  if (months < 0) months = 0;

  const years = Math.floor(months / 12);
  const remMonths = months % 12;

  const yLabel = years === 1 ? "año" : "años";
  const mLabel = remMonths === 1 ? "mes" : "meses";

  if (years > 0 && remMonths > 0)
    return `${years} ${yLabel} ${remMonths} ${mLabel}`;
  if (years > 0) return `${years} ${yLabel}`;
  return `${remMonths} ${mLabel}`;
}

function toYMD(value) {
  if (!value) return null;

  // ya viene bien
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }

  // si viene como Date desde MySQL, usar UTC para evitar corrimiento por zona horaria
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // fallback
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function parseECDate(ymd) {
  // fija -05:00 para evitar corrimientos
  return new Date(`${ymd}T00:00:00-05:00`);
}

function format2(n) {
  const x = Number(n || 0);
  return Math.round(x * 100) / 100;
}

function daysInclusive(desdeYMD, hastaYMD) {
  const a = parseECDate(desdeYMD);
  const b = parseECDate(hastaYMD);
  const ms = b.getTime() - a.getTime();
  const days = Math.floor(ms / (24 * 3600 * 1000)) + 1;
  return days;
}

function listYMDInRange(desdeYMD, hastaYMD) {
  const out = [];
  let d = parseECDate(desdeYMD);
  const end = parseECDate(hastaYMD);
  while (d.getTime() <= end.getTime()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${day}`);
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function addYears(dateObj, years) {
  const d = new Date(dateObj.getTime());
  d.setFullYear(d.getFullYear() + years);
  return d;
}

function minDate(a, b) {
  return a.getTime() <= b.getTime() ? a : b;
}

function calcGenerados({ fechaContYMD, hastaDate, config }) {
  const base = Number(config?.dias_base || 15);
  const extraDesde = Number(config?.extra_desde_anio || 6); // 6 => extra a partir del año 6
  const extraMax = Number(config?.extra_max || 15);

  const start = parseECDate(fechaContYMD);
  const end = hastaDate;

  if (end.getTime() <= start.getTime()) return 0;

  let total = 0;
  let yearNum = 1;
  let cursor = new Date(start.getTime());

  while (cursor.getTime() < end.getTime()) {
    const nextAnniv = addYears(start, yearNum);
    const segEnd = minDate(nextAnniv, end);

    const segDays = Math.max(
      0,
      Math.floor((segEnd.getTime() - cursor.getTime()) / (24 * 3600 * 1000))
    );

    let extra = 0;
    if (yearNum >= extraDesde) {
      extra = yearNum - (extraDesde - 1);
      if (extra > extraMax) extra = extraMax;
    }
    const entitlement = base + extra;

    const yearStart = addYears(start, yearNum - 1);
    const yearEnd = addYears(start, yearNum);
    const yearLenDays = Math.max(
      1,
      Math.floor((yearEnd.getTime() - yearStart.getTime()) / (24 * 3600 * 1000))
    );

    total += (entitlement * segDays) / yearLenDays;

    cursor = segEnd;
    yearNum += 1;
  }

  return total;
}

async function computeSaldo(usuarioId, refDate = new Date()) {
  const config = await Vac.getConfig();
  if (!config) throw new Error("vac_config no configurado");

  const fechaCorte = toYMD(config.fecha_corte);

  const user = await Vac.getUsuarioBaseById(usuarioId);
  if (!user) return null;

  const generados = calcGenerados({
    fechaContYMD: user.fecha_cont,
    hastaDate: refDate,
    config,
  });

  const consumidoInicial = await Vac.getConsumoInicial({
    usuarioId,
    fechaCorte,
  });

  const consumidoAsign = await Vac.sumConsumidoAsignacionesActivas({
    usuarioId,
  });

  const consumidoTotal = consumidoInicial + consumidoAsign;

  const saldoReal = generados - consumidoTotal;
  const saldoVisible = Math.max(0, saldoReal);
  const deuda = Math.max(0, -saldoReal);

  return {
    config,
    user,
    generados: format2(generados),
    consumido_inicial: format2(consumidoInicial),
    consumido_asignaciones: format2(consumidoAsign),
    consumido_total: format2(consumidoTotal),
    saldo_real: format2(saldoReal),
    saldo_visible: format2(saldoVisible),
    deuda: format2(deuda),
  };
}

// (Opcional) fecha larga estilo "martes, 30 de diciembre de 2025"
function formatFechaLargaEC(ymd) {
  if (!ymdOk(ymd)) return String(ymd || "");
  try {
    const d = parseECDate(ymd);
    // Node puede no traer es-EC en algunos builds; si falla, se va al catch
    return new Intl.DateTimeFormat("es-EC", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "2-digit",
      timeZone: "America/Guayaquil",
    }).format(d);
  } catch {
    return String(ymd);
  }
}

/**
 * Genera el PDF del FORMULARIO (layout v19) usando PDFKit
 * - margin 0 para control total
 * - logo opcional (si logoAbsPath existe)
 */
function pdfWriteSolicitudV19({ absPath, data, logoAbsPath = null }) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(absPath), { recursive: true });

    const doc = new PDFDocument({ size: "A4", margin: 0 });
    const stream = fs.createWriteStream(absPath);
    doc.pipe(stream);

    // ===== Helpers internos =====
    const mm = (v) => (v * 72) / 25.4; // points
    const W = doc.page.width;

    const M = mm(8); // margen externo
    const LINE = 0.8;

    const rect = (x, y, w, h) => doc.lineWidth(LINE).rect(x, y, w, h).stroke();
    const hline = (x1, y, x2) =>
      doc.lineWidth(LINE).moveTo(x1, y).lineTo(x2, y).stroke();
    const vline = (x, y1, y2) =>
      doc.lineWidth(LINE).moveTo(x, y1).lineTo(x, y2).stroke();

    const fitTextSize = (
      text,
      maxW,
      font = "Helvetica",
      size = 8.5,
      min = 6
    ) => {
      let s = size;
      doc.font(font);
      while (
        s > min &&
        doc.widthOfString(String(text || ""), { size: s }) > maxW
      )
        s -= 0.25;
      return s;
    };

    const drawFit = (text, x, y, maxW, opts = {}) => {
      const font = opts.font || "Helvetica";
      const size0 = opts.size || 8.5;
      const min = opts.min || 6;
      const s = fitTextSize(text, maxW, font, size0, min);
      doc
        .font(font)
        .fontSize(s)
        .text(String(text || ""), x, y, { width: maxW, lineBreak: false });
    };

    const centerText = (text, x, y, w, h, opts = {}) => {
      const font = opts.font || "Helvetica-Bold";
      const size = opts.size || 8;
      doc
        .font(font)
        .fontSize(size)
        .text(String(text || ""), x, y + (h - size) / 2 - 1, {
          width: w,
          align: "center",
          lineBreak: false,
        });
    };

    const checkbox = (x, y, label, checked = false) => {
      doc
        .font("Helvetica")
        .fontSize(7.5)
        .text(label, x, y, { lineBreak: false });
      const lw = doc.widthOfString(label, { size: 7.5 });
      const bx = x + lw + mm(2);
      const by = y - mm(2);
      const s = mm(2.8);
      rect(bx, by, s, s);
      if (checked) {
        doc
          .lineWidth(0.9)
          .moveTo(bx + 1.5, by + 1.5)
          .lineTo(bx + s - 1.5, by + s - 1.5)
          .stroke()
          .moveTo(bx + 1.5, by + s - 1.5)
          .lineTo(bx + s - 1.5, by + 1.5)
          .stroke();
      }
    };

    const siNoCentered = (x0, x1, y, value) => {
      const fontSize = 7.5;
      const s = mm(2.8);
      const gap = mm(2);
      const between = mm(6);

      const wSI = doc.widthOfString("SI", { size: fontSize });
      const wNO = doc.widthOfString("NO", { size: fontSize });
      const groupW = wSI + gap + s + between + wNO + gap + s;
      const start = x0 + (x1 - x0 - groupW) / 2;

      checkbox(start, y, "SI", value === true);
      checkbox(start + (wSI + gap + s) + between, y, "NO", value === false);
    };

    // ===== Data =====
    const noSolicitud = String(data.no_solicitud || "");
    const fechaElab = String(
      data.fecha_elaboracion_larga || data.fecha_elaboracion || ""
    );

    const col = data.colaborador || {};

    const nombres = String(col.nombres_completos || "");
    const fechaIngreso = String(col.fecha_ingreso || "");
    const tiempoOrg = String(col.tiempo_organizacion || "");
    const sucursal = String(col.sucursal || "");
    const cargo = String(col.cargo || "");

    const rango = data.rango || {};
    const desde = String(rango.desde_larga || rango.desde || "");
    const hasta = String(rango.hasta_larga || rango.hasta || "");
    const diasSolic = Number(rango.dias_solicitados || 0);

    const saldo = data.saldo || {};
    const saldoAnt = Number(saldo.saldo_anterior || 0);
    const saldoPos = Number(saldo.saldo_posterior || 0);

    // ===== Layout v19 (medidas) =====
    const headerH = mm(15);
    const rowH = mm(6.2);
    const rangeH = mm(13);
    const saldoH = mm(22);
    const repH = mm(12.5);
    const obsH = mm(12);
    const sigH = mm(18);
    const regH = mm(11.5);
    const footerH = mm(20);
    const gapY = mm(2);

    let y = M;

    // ================= HEADER =================
    rect(M, y, W - 2 * M, headerH);

    const colLogo = mm(38);
    const colMeta = mm(24);
    const colTitle = W - 2 * M - colLogo - colMeta;

    const xLogo = M;
    const xTitle = M + colLogo;
    const xMeta = xTitle + colTitle;

    vline(xTitle, y, y + headerH);
    vline(xMeta, y, y + headerH);

    // Logo (sin cuadro interno)
    if (logoAbsPath && fs.existsSync(logoAbsPath)) {
      const pad = mm(0.8);
      doc.image(logoAbsPath, xLogo + pad, y + pad, {
        fit: [colLogo - 2 * pad, headerH - 2 * pad],
        align: "center",
        valign: "center",
      });
    }

    // Título
    doc
      .font("Helvetica-Bold")
      .fontSize(11.5)
      .text("FORMULARIO DE SOLICITUD DE VACACIONES", xTitle, y + mm(3.2), {
        width: colTitle,
        align: "center",
      });

    // Meta: 3 filas (arriba derecha)
    const meta1 = String(data?.meta?.version || "Versión-01");
    const meta2 = String(data?.meta?.codigo || "Ver01-FO-TH-04A");
    const meta3 = String(data?.meta?.pagina || "Página 1 de 1");

    const r1 = headerH / 3;
    const r2 = (headerH * 2) / 3;

    // líneas que dividen las 3 filas
    hline(xMeta, y + r1, M + (W - 2 * M));
    hline(xMeta, y + r2, M + (W - 2 * M));

    doc
      .font("Helvetica")
      .fontSize(7.3)
      .text(meta1, xMeta, y + mm(1.8), { width: colMeta, align: "center" })
      .text(meta2, xMeta, y + r1 + mm(1.6), { width: colMeta, align: "center" })
      .text(meta3, xMeta, y + r2 + mm(1.6), {
        width: colMeta,
        align: "center",
      });

    y += headerH + gapY;

    // ================= 3 filas 40/60 =================
    const draw40_60 = (leftLabel, leftVal, rightLabel, rightVal, cfg = {}) => {
      rect(M, y, W - 2 * M, rowH);
      const split = M + (W - 2 * M) * 0.4;
      vline(split, y, y + rowH);

      doc
        .font("Helvetica")
        .fontSize(cfg.labelLeftSize || 7)
        .text(leftLabel, M + mm(2), y + mm(1.7), { lineBreak: false });

      drawFit(
        leftVal,
        M + mm(2) + (cfg.leftLabelW || mm(30)),
        y + mm(1.5),
        split - mm(2) - (M + mm(2) + (cfg.leftLabelW || mm(30))),
        { size: 8.5 }
      );

      doc
        .font("Helvetica")
        .fontSize(cfg.labelRightSize || 7)
        .text(rightLabel, split + mm(2), y + mm(1.7), { lineBreak: false });

      drawFit(
        rightVal,
        split + mm(2) + (cfg.rightLabelW || mm(34)),
        y + mm(1.5),
        M + (W - 2 * M) - mm(2) - (split + mm(2) + (cfg.rightLabelW || mm(34))),
        { size: 8.5 }
      );

      y += rowH;
    };

    draw40_60(
      "Fecha de Elaboración:",
      fechaElab,
      "Nombres Completos:",
      nombres,
      {
        leftLabelW: mm(30),
        rightLabelW: mm(34),
      }
    );

    draw40_60(
      "Fecha de Ingreso a la Compañía:",
      fechaIngreso,
      "Tiempo en la Organización:",
      tiempoOrg,
      {
        leftLabelW: mm(48),
        rightLabelW: mm(46),
        labelLeftSize: 6.7,
        labelRightSize: 6.7,
      }
    );

    draw40_60("Departamento/Sucursal:", sucursal, "Cargo:", cargo, {
      leftLabelW: mm(40),
      rightLabelW: mm(12),
    });

    y += gapY;

    // ================= RANGO + NO SOLICITUD =================
    rect(M, y, W - 2 * M, rangeH);
    const rightW = mm(40);
    const midW = (W - 2 * M - rightW) / 2;

    const x1 = M;
    const x2 = M + midW;
    const x3 = M + 2 * midW;

    vline(x2, y, y + rangeH);
    vline(x3, y, y + rangeH);

    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .text("DESDE:", x1 + mm(2), y + mm(2));
    drawFit(desde, x1 + mm(2), y + mm(7), midW - mm(4), { size: 8.5 });

    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .text("HASTA:", x2 + mm(2), y + mm(2));
    drawFit(hasta, x2 + mm(2), y + mm(7), midW - mm(4), { size: 8.5 });

    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .text("No. solicitud:", x3 + mm(2), y + mm(2));
    doc
      .font("Helvetica-Bold")
      .fontSize(9.5)
      .text(noSolicitud, x3 + mm(2), y + mm(7));

    y += rangeH + gapY;

    // ================= SALDO (3 filas) =================
    rect(M, y, W - 2 * M, saldoH);

    const labelW = mm(48);
    vline(M + labelW, y, y + saldoH);
    centerText("Saldo de Vacaciones", M, y, labelW, saldoH, { size: 8 });

    const rx0 = M + labelW;
    const rx1 = M + (W - 2 * M);
    const valColW = mm(18);
    const splitVal = rx1 - valColW;

    vline(splitVal, y, y + saldoH);

    const r = saldoH / 3;
    hline(rx0, y + r, rx1);
    hline(rx0, y + 2 * r, rx1);

    const saldoRow = (i, label, value) => {
      const top = y + (i - 1) * r;
      doc
        .font("Helvetica")
        .fontSize(8)
        .text(label, rx0, top + mm(3), {
          width: splitVal - rx0,
          align: "center",
        });
      doc
        .font("Helvetica-Bold")
        .fontSize(9.5)
        .text(String(value), splitVal, top + mm(2.6), {
          width: rx1 - splitVal,
          align: "center",
        });
    };

    saldoRow(1, "Saldo anterior a la solicitud", saldoAnt);
    saldoRow(2, "Días solicitados en este formulario", diasSolic);
    saldoRow(3, "Saldo posterior a la solicitud", saldoPos);

    y += saldoH + gapY;

    // ================= REEMPLAZO =================
    rect(M, y, W - 2 * M, repH);

    const leftW = mm(46);
    vline(M + leftW, y, y + repH);

    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .text("Requiere Reemplazo:", M + mm(2), y + mm(2));
    siNoCentered(M, M + leftW, y + mm(7), data.requiere_reemplazo ?? null);

    const rx = M + leftW + mm(2);
    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .text("Nombre de quien le reemplazaría:", rx, y + mm(2));
    hline(rx + mm(56), y + mm(4.2), M + (W - 2 * M) - mm(3));

    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .text("Tareas pendientes", rx, y + mm(7));
    hline(rx + mm(30), y + mm(9.2), M + (W - 2 * M) - mm(3));

    y += repH + gapY;

    // ================= OBS JEFE =================
    rect(M, y, W - 2 * M, obsH);
    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .text("Observaciones de parte del jefe/a:", M + mm(2), y + mm(2));
    hline(M + mm(56), y + mm(4.2), M + (W - 2 * M) - mm(3));
    hline(M + mm(2), y + mm(9.2), M + (W - 2 * M) - mm(3));

    y += obsH + gapY;

    // ================= FIRMAS =================
    rect(M, y, W - 2 * M, sigH);
    const mid = M + (W - 2 * M) / 2;
    vline(mid, y, y + sigH);

    // Línea de firma más abajo (más espacio para firmar arriba)
    const lineY = y + sigH - mm(6.2);
    hline(M + mm(10), lineY, mid - mm(10));
    hline(mid + mm(10), lineY, M + (W - 2 * M) - mm(10));

    // Texto más pegado al borde inferior
    doc
      .font("Helvetica")
      .fontSize(8)
      .text("Firma del Colaborador/a", M, y + sigH - mm(3.8), {
        width: (W - 2 * M) / 2,
        align: "center",
      });
    doc
      .font("Helvetica")
      .fontSize(8)
      .text("Firma del jefe/a inmediato/a", mid, y + sigH - mm(3.8), {
        width: (W - 2 * M) / 2,
        align: "center",
      });

    y += sigH;

    // ================= REGISTRADO =================
    rect(M, y, W - 2 * M, regH);
    const regCellW = mm(34);
    vline(M + regCellW, y, y + regH);

    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .text("Registrado", M, y + mm(2), { width: regCellW, align: "center" });
    siNoCentered(M, M + regCellW, y + mm(7), data.registrado ?? null);

    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .text("Observaciones:", M + regCellW + mm(2), y + mm(2));
    hline(M + regCellW + mm(30), y + mm(4.2), M + (W - 2 * M) - mm(3));
    hline(M + regCellW + mm(2), y + mm(9.2), M + (W - 2 * M) - mm(3));

    y += regH + gapY;

    // ================= FOOTER TALENTO HUMANO =================
    rect(M, y, W - 2 * M, footerH);
    vline(mid, y, y + footerH);

    // Línea de firma más abajo (más espacio para firmar arriba)
    const lineY2 = y + footerH - mm(6.5);
    hline(M + mm(10), lineY2, mid - mm(10));
    hline(mid + mm(10), lineY2, M + (W - 2 * M) - mm(10));

    // Texto más pegado al borde inferior
    doc
      .font("Helvetica")
      .fontSize(8)
      .text("Fecha de registro Talento Humano", M, y + footerH - mm(4.0), {
        width: (W - 2 * M) / 2,
        align: "center",
      });
    doc
      .font("Helvetica")
      .fontSize(8)
      .text("f. Jefe/a Talento Humano", mid, y + footerH - mm(4.0), {
        width: (W - 2 * M) / 2,
        align: "center",
      });

    doc.end();

    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}

// ---------- Controllers ----------
async function getVacConfig(req, res) {
  try {
    const config = await Vac.getConfig();
    if (!config)
      return res.status(404).json({ message: "vac_config no existe" });
    return res.json(config);
  } catch (e) {
    console.error("❌ getVacConfig:", e);
    return res.status(500).json({ message: "Error interno", error: String(e) });
  }
}

async function getMiSaldo(req, res) {
  try {
    const uid = Number(req.user?.id);
    const s = await computeSaldo(uid, new Date());
    if (!s) return res.status(404).json({ message: "Usuario no existe" });
    return res.json({ saldo_visible: s.saldo_visible });
  } catch (e) {
    console.error("❌ getMiSaldo:", e);
    return res.status(500).json({ message: "Error interno", error: String(e) });
  }
}

async function getResumenUsuario(req, res) {
  try {
    const usuarioId = Number(req.params.usuarioId);
    const s = await computeSaldo(usuarioId, new Date());
    if (!s) return res.status(404).json({ message: "Usuario no existe" });

    return res.json({
      usuario_id: usuarioId,
      fecha_corte: String(s.config.fecha_corte),
      generados_hoy: s.generados,
      consumido_inicial: s.consumido_inicial,
      consumido_asignaciones: s.consumido_asignaciones,
      saldo_real: s.saldo_real,
      saldo_visible: s.saldo_visible,
      deuda: s.deuda,
    });
  } catch (e) {
    console.error("❌ getResumenUsuario:", e);
    return res.status(500).json({ message: "Error interno", error: String(e) });
  }
}

async function listAsignaciones(req, res) {
  try {
    const usuarioId = Number(req.query.usuario_id);
    if (Number.isNaN(usuarioId)) {
      return res
        .status(400)
        .json({ message: "usuario_id es obligatorio y numérico" });
    }

    const estado = String(req.query.estado || "TODAS").toUpperCase();
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
    const offset = Math.max(0, Number(req.query.offset || 0));

    const rows = await Vac.listAsignacionesByUsuario({
      usuarioId,
      estado,
      limit,
      offset,
    });
    return res.json(rows);
  } catch (e) {
    console.error("❌ listAsignaciones:", e);
    return res.status(500).json({ message: "Error interno", error: String(e) });
  }
}

async function previewAsignacion(req, res) {
  try {
    const { usuario_id, fecha_desde, fecha_hasta } = req.body || {};
    const usuarioId = Number(usuario_id);

    if (Number.isNaN(usuarioId))
      return res.status(400).json({ message: "usuario_id inválido" });
    if (!ymdOk(fecha_desde) || !ymdOk(fecha_hasta)) {
      return res.status(400).json({
        message: "fecha_desde/fecha_hasta inválidas (YYYY-MM-DD)",
      });
    }

    const config = await Vac.getConfig();
    const fechaCorte = toYMD(config.fecha_corte);

    if (fecha_desde < fechaCorte) {
      return res.status(400).json({
        message: `No permitido antes de fecha_corte (${fechaCorte})`,
      });
    }
    if (fecha_desde > fecha_hasta) {
      return res
        .status(400)
        .json({ message: "Rango inválido: fecha_desde > fecha_hasta" });
    }

    const dias = daysInclusive(fecha_desde, fecha_hasta);

    // Conflictos
    const conflictos = await Vac.selectConflictosEnRango(poolmysql, {
      usuarioId,
      desde: fecha_desde,
      hasta: fecha_hasta,
    });

    const tienePermisoDevol = conflictos.filter((x) =>
      ["PERMISO", "DEVOLUCION"].includes(String(x.tipo_dia || ""))
    );
    const tieneVac = conflictos.filter(
      (x) => String(x.tipo_dia || "") === "VACACIONES"
    );

    if (tienePermisoDevol.length) {
      return res.status(409).json({
        message: "Conflicto: existe PERMISO/DEVOLUCION en el rango",
        conflictos: tienePermisoDevol,
      });
    }
    if (tieneVac.length) {
      return res.status(409).json({
        message: "Conflicto: ya existen VACACIONES en el rango",
        conflictos: tieneVac,
      });
    }

    // Saldos
    const s = await computeSaldo(usuarioId, new Date());
    if (!s) return res.status(404).json({ message: "Usuario no existe" });

    const saldoRealDesp = format2(s.saldo_real - dias);
    const saldoVisibleDesp = format2(Math.max(0, saldoRealDesp));

    return res.json({
      dias_calendario: dias,
      saldo: {
        saldo_real_antes: s.saldo_real,
        saldo_real_despues: saldoRealDesp,
        saldo_visible_antes: s.saldo_visible,
        saldo_visible_despues: saldoVisibleDesp,
        deuda_despues: format2(Math.max(0, -saldoRealDesp)),
      },
    });
  } catch (e) {
    console.error("❌ previewAsignacion:", e);
    return res.status(500).json({ message: "Error interno", error: String(e) });
  }
}

async function createAsignacion(req, res) {
  const conn = await poolmysql.getConnection();
  let absPdfPath = null;

  try {
    const { usuario_id, fecha_desde, fecha_hasta, observacion } =
      req.body || {};
    const usuarioId = Number(usuario_id);

    // ========== Validaciones ==========
    if (Number.isNaN(usuarioId)) {
      return res.status(400).json({ message: "usuario_id inválido" });
    }
    if (!ymdOk(fecha_desde) || !ymdOk(fecha_hasta)) {
      return res.status(400).json({
        message: "fecha_desde/fecha_hasta inválidas (YYYY-MM-DD)",
      });
    }

    const config = await Vac.getConfig();
    const fechaCorte = toYMD(config.fecha_corte);

    if (fecha_desde < fechaCorte) {
      return res.status(400).json({
        message: `No permitido antes de fecha_corte (${fechaCorte})`,
      });
    }
    if (fecha_desde > fecha_hasta) {
      return res
        .status(400)
        .json({ message: "Rango inválido: fecha_desde > fecha_hasta" });
    }

    const dias = daysInclusive(fecha_desde, fecha_hasta);

    // ========== Conflictos ==========
    const conflictos = await Vac.selectConflictosEnRango(conn, {
      usuarioId,
      desde: fecha_desde,
      hasta: fecha_hasta,
    });

    const tienePermisoDevol = conflictos.filter((x) =>
      ["PERMISO", "DEVOLUCION"].includes(String(x.tipo_dia || ""))
    );
    const tieneVac = conflictos.filter(
      (x) => String(x.tipo_dia || "") === "VACACIONES"
    );

    if (tienePermisoDevol.length) {
      return res.status(409).json({
        message: "Conflicto: existe PERMISO/DEVOLUCION en el rango",
        conflictos: tienePermisoDevol,
      });
    }
    if (tieneVac.length) {
      return res.status(409).json({
        message: "Conflicto: ya existen VACACIONES en el rango",
        conflictos: tieneVac,
      });
    }

    // ========== Saldos (antes/después) ==========
    const saldoAntes = await computeSaldo(usuarioId, new Date());
    if (!saldoAntes) {
      return res.status(404).json({ message: "Usuario no existe" });
    }

    const saldoRealDesp = format2(saldoAntes.saldo_real - dias);
    const saldoVisibleDesp = format2(Math.max(0, saldoRealDesp));

    // ========== Datos base ==========
    const trabajador = await Vac.getUsuarioBaseById(usuarioId, conn);
    if (!trabajador) {
      return res.status(404).json({ message: "Usuario no existe" });
    }

    // ========== Transacción ==========
    await conn.beginTransaction();

    // ✅ Consecutivo POR USUARIO + AÑO
    const stamp = new Date();
    const anioSol = stamp.getFullYear();

    // OJO: (conn, usuarioId, anioSol)
    const consec = await Vac.nextSolicitudConsecutivo(conn, usuarioId, anioSol);
    const noSolicitud = `SV-${anioSol}-${String(consec).padStart(3, "0")}`;

    // 1) Crear vac_asignaciones
    const asignacionId = await Vac.insertAsignacion(conn, {
      sol_anio: anioSol,
      sol_consecutivo: consec,
      sol_numero: noSolicitud,

      usuario_id: usuarioId,
      jefe_id: Number(req.user.id),
      fecha_desde,
      fecha_hasta,
      dias_calendario: dias,
      observacion: observacion || null,

      generados_al_momento: saldoAntes.generados,
      consumido_antes: saldoAntes.consumido_total,
      saldo_real_antes: saldoAntes.saldo_real,
      saldo_real_despues: saldoRealDesp,
      saldo_visible_antes: saldoAntes.saldo_visible,
      saldo_visible_despues: saldoVisibleDesp,
    });

    // 2) Turnos + backups
    const turnosExistentes = await Vac.selectTurnosEnRango(conn, {
      usuarioId,
      desde: fecha_desde,
      hasta: fecha_hasta,
    });

    const mapTurnos = new Map();
    for (const t of turnosExistentes) mapTurnos.set(String(t.fecha), t);

    const fechas = listYMDInRange(fecha_desde, fecha_hasta);
    const backups = [];

    const sucursalBody = String(req.body?.sucursal || "").trim() || null;
    const sucursalInferida =
      sucursalBody ||
      trabajador?.sucursal_nombre ||
      (await Vac.getSucursalRecienteFromTurnos(conn, usuarioId)) ||
      (await Vac.getSucursalRecienteFromTurnos(conn, Number(req.user.id))) ||
      null;

    for (const f of fechas) {
      const t = mapTurnos.get(f);

      if (t) {
        backups.push({
          vacacion_id: asignacionId,
          usuario_id: usuarioId,
          fecha: f,
          turno_id: t.id,
          turno_existia: 1,
          tipo_dia_anterior: t.tipo_dia || "NORMAL",
        });

        await Vac.updateTurnoTipoDia(conn, {
          turnoId: t.id,
          tipoDia: "VACACIONES",
        });
      } else {
        const turnoId = await Vac.insertTurnoVacacion(conn, {
          usuarioId,
          fecha: f,
          sucursal: sucursalInferida,
        });

        backups.push({
          vacacion_id: asignacionId,
          usuario_id: usuarioId,
          fecha: f,
          turno_id: turnoId,
          turno_existia: 0,
          tipo_dia_anterior: "NORMAL",
        });
      }
    }

    await Vac.insertBackupsBatch(conn, backups);

    // 3) PDF + files + file_links
    const docsRoot = path.resolve(
      process.env.RUTA_DOCS_ROOT || process.env.RUTA_DESTINO || "uploads"
    );
    const relDir = process.env.RUTA_DOCS_VACACIONES || "docs/pdfs/vacaciones";

    const y = stamp.getFullYear();
    const mo = String(stamp.getMonth() + 1).padStart(2, "0");
    const da = String(stamp.getDate()).padStart(2, "0");
    const hh = String(stamp.getHours()).padStart(2, "0");
    const mi = String(stamp.getMinutes()).padStart(2, "0");
    const ss = String(stamp.getSeconds()).padStart(2, "0");

    const fileName = `solicitud_vac_${asignacionId}_${y}${mo}${da}_${hh}${mi}${ss}.pdf`;
    const rutaRelativa = `${relDir}/${fileName}`;
    absPdfPath = path.join(docsRoot, rutaRelativa);

    let logoAbsPath = process.env.RUTA_LOGO_REDECOM
      ? path.resolve(process.env.RUTA_LOGO_REDECOM)
      : path.resolve(__dirname, "../../assets/logo.png");

    if (!fs.existsSync(logoAbsPath)) {
      console.warn("⚠️ Logo NO encontrado:", logoAbsPath);
      logoAbsPath = null;
    }

    const tiempoOrg = tiempoEnOrganizacion(trabajador?.fecha_cont, stamp);

    await pdfWriteSolicitudV19({
      absPath: absPdfPath,
      logoAbsPath,
      data: {
        meta: {
          version: "Versión-01",
          codigo: "Ver01-FO-TH-04A",
          pagina: "Página 1 de 1",
        },

        no_solicitud: noSolicitud,
        fecha_elaboracion: `${y}-${mo}-${da}`,
        fecha_elaboracion_larga: formatFechaLargaEC(`${y}-${mo}-${da}`),

        colaborador: {
          nombres_completos: trabajador?.nombre_completo || `ID ${usuarioId}`,
          fecha_ingreso: trabajador?.fecha_cont || "",
          tiempo_organizacion: tiempoOrg,
          sucursal: trabajador?.sucursal_nombre || sucursalInferida || "",
          cargo: trabajador?.cargo || "",
        },

        rango: {
          desde: fecha_desde,
          hasta: fecha_hasta,
          desde_larga: formatFechaLargaEC(fecha_desde),
          hasta_larga: formatFechaLargaEC(fecha_hasta),
          dias_solicitados: dias,
        },

        saldo: {
          saldo_anterior: Math.floor(Number(saldoAntes.saldo_visible || 0)),
          saldo_posterior: Math.floor(Number(saldoVisibleDesp || 0)),
        },

        requiere_reemplazo: null,
        registrado: null,
      },
    });

    const stat = fs.statSync(absPdfPath);

    const fileId = await Vac.insertFile(conn, {
      ruta_relativa: rutaRelativa,
      mimetype: "application/pdf",
      size: Number(stat.size || 0),
      created_by: Number(req.user.id),
    });

    await Vac.insertFileLink(conn, {
      module: "vacaciones",
      entity_id: asignacionId,
      tag: "acta",
      position: 1,
      file_id: fileId,
      created_by: Number(req.user.id),
    });

    await conn.commit();

    return res.status(201).json({
      id: asignacionId,
      estado: "ACTIVA",
      sol_numero: noSolicitud,
      sol_anio: anioSol,
      sol_consecutivo: consec,
      dias_calendario: dias,
      saldos: {
        saldo_real_antes: saldoAntes.saldo_real,
        saldo_real_despues: saldoRealDesp,
        saldo_visible_antes: saldoAntes.saldo_visible,
        saldo_visible_despues: saldoVisibleDesp,
      },
      acta: {
        file_id: fileId,
        download_url: `/api/files/${fileId}/download`,
      },
    });
  } catch (e) {
    console.error("❌ createAsignacion:", e);

    try {
      await conn.rollback();
    } catch {}

    if (absPdfPath && fs.existsSync(absPdfPath)) {
      try {
        fs.unlinkSync(absPdfPath);
      } catch {}
    }

    return res.status(500).json({ message: "Error interno", error: String(e) });
  } finally {
    conn.release();
  }
}

async function anularAsignacion(req, res) {
  const conn = await poolmysql.getConnection();
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id))
      return res.status(400).json({ message: "id inválido" });

    const motivo = String(req.body?.motivo || "cambio/ajuste");

    const asig = await Vac.getAsignacionById(id);
    if (!asig) return res.status(404).json({ message: "Asignación no existe" });
    if (String(asig.estado) !== "ACTIVA") {
      return res.status(409).json({ message: "Asignación no está ACTIVA" });
    }

    await conn.beginTransaction();

    const backups = await Vac.getBackupsByVacacion(conn, id);

    for (const b of backups) {
      if (Number(b.turno_existia) === 1) {
        await Vac.updateTurnoTipoDia(conn, {
          turnoId: b.turno_id,
          tipoDia: b.tipo_dia_anterior || "NORMAL",
        });
      } else {
        const t = await Vac.getTurnoById(conn, b.turno_id);
        if (!t) continue;

        const tieneMarcas =
          t.hora_entrada_1 ||
          t.hora_salida_1 ||
          t.hora_entrada_2 ||
          t.hora_salida_2 ||
          t.hora_entrada_real ||
          t.hora_salida_real;

        const tieneHorarioProg = t.hora_entrada_prog || t.hora_salida_prog;

        const esBorrable =
          !tieneMarcas &&
          !tieneHorarioProg &&
          String(t.estado_asistencia || "") === "SIN_MARCA" &&
          (t.observacion == null || String(t.observacion).trim() === "") &&
          String(t.tipo_dia || "") === "VACACIONES";

        if (esBorrable) {
          await Vac.deleteTurnoById(conn, b.turno_id);
        } else {
          await Vac.updateTurnoTipoDia(conn, {
            turnoId: b.turno_id,
            tipoDia: "NORMAL",
          });
        }
      }
    }

    await Vac.marcarAsignacionAnulada(conn, {
      id,
      anulada_por: Number(req.user.id),
      motivo,
    });

    await conn.commit();

    return res.json({ message: "✅ Vacación anulada", id });
  } catch (e) {
    console.error("❌ anularAsignacion:", e);
    try {
      await conn.rollback();
    } catch {}
    return res.status(500).json({ message: "Error interno", error: String(e) });
  } finally {
    conn.release();
  }
}

async function getActaAsignacion(req, res) {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id))
      return res.status(400).json({ message: "id inválido" });

    const asig = await Vac.getAsignacionById(id);
    if (!asig) return res.status(404).json({ message: "Asignación no existe" });

    const roles = Array.isArray(req.user?.rol) ? req.user.rol : [];
    const isJefe = roles.includes("ATurnos") || roles.includes("AHorarios");
    const isOwner = Number(asig.usuario_id) === Number(req.user?.id);

    if (!isJefe && !isOwner)
      return res.status(403).json({ message: "No autorizado" });

    const fileId = await Vac.getActaFileIdByAsignacion(id);
    if (!fileId) return res.status(404).json({ message: "Acta no encontrada" });

    return res.json({
      file_id: fileId,
      download_url: `/api/files/${fileId}/download`,
    });
  } catch (e) {
    console.error("❌ getActaAsignacion:", e);
    return res.status(500).json({ message: "Error interno", error: String(e) });
  }
}

module.exports = {
  getVacConfig,
  getMiSaldo,
  getResumenUsuario,
  listAsignaciones,
  previewAsignacion,
  createAsignacion,
  anularAsignacion,
  getActaAsignacion,
};
