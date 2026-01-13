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

  // fallback (por si viene raro)
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

    // Entitlement del año de servicio `yearNum`:
    // year 1-5 => 15
    // year 6 => 16, year 7 => 17, etc.
    let extra = 0;
    if (yearNum >= extraDesde) {
      extra = yearNum - (extraDesde - 1);
      if (extra > extraMax) extra = extraMax;
    }
    const entitlement = base + extra;

    // Prorrateo por días del segmento / días del “año servicio”
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

function pdfWriteActa({ absPath, data }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const stream = fs.createWriteStream(absPath);
    doc.pipe(stream);

    doc.fontSize(16).text("ACTA DE VACACIONES", { align: "center" });
    doc.moveDown(1);

    doc.fontSize(11);
    doc.text(`Trabajador: ${data.trabajador_nombre}`);
    doc.text(`Cédula: ${data.trabajador_ci}`);
    if (data.trabajador_cargo) doc.text(`Cargo: ${data.trabajador_cargo}`);
    doc.text(`Fecha contratación: ${data.fecha_cont}`);
    doc.moveDown(0.5);

    doc.text(`Rango de vacaciones: ${data.fecha_desde} a ${data.fecha_hasta}`);
    doc.text(`Días (calendario): ${data.dias_calendario}`);
    doc.moveDown(0.5);

    doc.text(`Generados al momento: ${data.generados_al_momento}`);
    doc.text(`Consumido antes: ${data.consumido_antes}`);
    doc.text(`Saldo real antes: ${data.saldo_real_antes}`);
    doc.text(`Saldo real después: ${data.saldo_real_despues}`);
    doc.text(`Saldo visible después: ${data.saldo_visible_despues}`);
    doc.moveDown(1);

    doc.text("Observación:", { underline: true });
    doc.text(data.observacion || "-", { width: 500 });
    doc.moveDown(2);

    doc.text("Firmas:", { underline: true });
    doc.moveDown(1);

    const y = doc.y;
    doc.text("______________________________", 60, y);
    doc.text("______________________________", 330, y);

    doc.moveDown(0.2);
    doc.text("Trabajador", 60);
    doc.text("Jefe", 330);

    doc.moveDown(1);
    doc.text(`Jefe: ${data.jefe_nombre}`);

    doc.moveDown(2);
    doc.text(`Fecha emisión: ${data.fecha_emision}`);

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
      return res
        .status(400)
        .json({ message: "fecha_desde/fecha_hasta inválidas (YYYY-MM-DD)" });
    }

    const config = await Vac.getConfig();
   const fechaCorte = toYMD(config.fecha_corte);


    if (fecha_desde < fechaCorte) {
      return res
        .status(400)
        .json({ message: `No permitido antes de fecha_corte (${fechaCorte})` });
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

    if (Number.isNaN(usuarioId))
      return res.status(400).json({ message: "usuario_id inválido" });
    if (!ymdOk(fecha_desde) || !ymdOk(fecha_hasta)) {
      return res
        .status(400)
        .json({ message: "fecha_desde/fecha_hasta inválidas (YYYY-MM-DD)" });
    }

    const config = await Vac.getConfig();
const fechaCorte = toYMD(config.fecha_corte);


    if (fecha_desde < fechaCorte) {
      return res
        .status(400)
        .json({ message: `No permitido antes de fecha_corte (${fechaCorte})` });
    }
    if (fecha_desde > fecha_hasta) {
      return res
        .status(400)
        .json({ message: "Rango inválido: fecha_desde > fecha_hasta" });
    }

    const dias = daysInclusive(fecha_desde, fecha_hasta);

    // Conflictos
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

    // Saldos (antes/después)
    const saldoAntes = await computeSaldo(usuarioId, new Date());
    if (!saldoAntes)
      return res.status(404).json({ message: "Usuario no existe" });

    const saldoRealDesp = format2(saldoAntes.saldo_real - dias);
    const saldoVisibleDesp = format2(Math.max(0, saldoRealDesp));

    // Datos base
    const trabajador = await Vac.getUsuarioBaseById(usuarioId, conn);
    const jefe = await Vac.getUsuarioBaseById(Number(req.user.id), conn);

    await conn.beginTransaction();

    // 1) Crear vac_asignaciones
    const asignacionId = await Vac.insertAsignacion(conn, {
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
          sucursal: null,
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

    // 3) Generar PDF + guardar files + file_links
    const docsRoot = path.resolve(
      process.env.RUTA_DOCS_ROOT || process.env.RUTA_DESTINO || "uploads"
    );
    const relDir = process.env.RUTA_DOCS_VACACIONES || "docs/pdfs/vacaciones";

    const stamp = new Date();
    const y = stamp.getFullYear();
    const m = String(stamp.getMonth() + 1).padStart(2, "0");
    const d = String(stamp.getDate()).padStart(2, "0");
    const hh = String(stamp.getHours()).padStart(2, "0");
    const mm = String(stamp.getMinutes()).padStart(2, "0");
    const ss = String(stamp.getSeconds()).padStart(2, "0");

    const fileName = `acta_vac_${asignacionId}_${y}${m}${d}_${hh}${mm}${ss}.pdf`;
    const rutaRelativa = `${relDir}/${fileName}`;

    absPdfPath = path.join(docsRoot, rutaRelativa);

    await pdfWriteActa({
      absPath: absPdfPath,
      data: {
        trabajador_nombre: trabajador?.nombre_completo || `ID ${usuarioId}`,
        trabajador_ci: trabajador?.ci || "",
        trabajador_cargo: trabajador?.cargo || "", // si agregaste campo cargo
        fecha_cont: trabajador?.fecha_cont || "",
        fecha_desde,
        fecha_hasta,
        dias_calendario: dias,
        generados_al_momento: saldoAntes.generados.toFixed(2),
        consumido_antes: saldoAntes.consumido_total.toFixed(2),
        saldo_real_antes: saldoAntes.saldo_real.toFixed(2),
        saldo_real_despues: saldoRealDesp.toFixed(2),
        saldo_visible_despues: saldoVisibleDesp.toFixed(2),
        observacion: observacion || "",
        jefe_nombre: jefe?.nombre_completo || req.user?.usuario || "",
        fecha_emision: `${y}-${m}-${d}`,
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
    // Si alcanzó a crear archivo y algo falló, lo limpiamos
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
        // si lo creamos solo para vacaciones, intentamos borrar si está “vacío”
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

    // Permisos: jefe (ATurnos/AHorarios) o dueño (usuario_id)
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
