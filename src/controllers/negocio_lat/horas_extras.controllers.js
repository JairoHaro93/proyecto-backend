// C:\PROYECTO\Backend\src\controllers\negocio_lat\horas_extras.controllers.js

const {
  crearSolicitudHoraExtra,
  listarMisSolicitudesMin,
  listarPendientes,
  aprobarSolicitud,
  rechazarSolicitud,
  eliminarSolicitud,

  // ✅ movimientos
  listarAprobadasMovimientos, // NUEVO detalle
  listarAprobadasResumenMovimientos, // resumen
} = require("../../models/negocio_lat/horas_extras.model");

// ==========================
// Auth helpers
// ==========================
function getUser(req) {
  return req.user || req.usuario || req.auth || null;
}
function getUserId(user) {
  const id = user?.id ?? user?.usuario_id;
  return id != null ? Number(id) : null;
}

// ==========================
// Time helpers
// ==========================
function normHHMMSS(s) {
  const v = String(s || "").trim();
  if (!v) return null;
  if (/^\d{2}:\d{2}:\d{2}$/.test(v)) return v;
  if (/^\d{1,2}:\d{2}$/.test(v)) return v.padStart(5, "0") + ":00";
  return null;
}

// ==========================
// Date helpers (local safe)
// ==========================
function ymd(d) {
  const y = d.getFullYear().toString().padStart(4, "0");
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseYMDLocal(s) {
  const x = String(s || "").substring(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(x);
  if (!m) return null;
  const y = Number(m[1]),
    mo = Number(m[2]),
    d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  return isNaN(dt.getTime()) ? null : dt;
}

function parseYMRange(ymStr) {
  const x = String(ymStr || "").trim();
  const m = /^(\d{4})-(\d{2})$/.exec(x);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]); // 1..12
  if (!y || mo < 1 || mo > 12) return null;

  const first = new Date(y, mo - 1, 1);
  const last = new Date(y, mo, 0);
  return { ym: `${m[1]}-${m[2]}`, desde: ymd(first), hasta: ymd(last) };
}

// ✅ MIS SOLICITUDES: solo mes actual o anterior (Flutter)
function esMesActualOAnterior(ymParam) {
  const now = new Date();
  const currYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevYM = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
  return ymParam === currYM || ymParam === prevYM;
}

/**
 * Fallback anterior:
 * - permite SOLO mes actual y mes anterior (completo)
 * - minDesde = primer día del mes anterior
 * - maxHasta = HOY
 */
function clampRangoMesActualYAnterior(desdeStr, hastaStr) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const minDesde = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);

  const desde = parseYMDLocal(desdeStr) ?? minDesde;
  const hasta = parseYMDLocal(hastaStr) ?? hoy;

  const desdeClamped = new Date(Math.max(desde.getTime(), minDesde.getTime()));
  const hastaClamped = new Date(Math.min(hasta.getTime(), hoy.getTime()));

  if (desdeClamped.getTime() > hastaClamped.getTime()) {
    throw new Error("RANGO_INVALIDO");
  }
  return { desde: ymd(desdeClamped), hasta: ymd(hastaClamped) };
}

// ✅ Pendientes: fallback 30 días atrás como lo tenías
function clampRangoUnMes(desdeStr, hastaStr) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const minDesde = new Date(hoy);
  minDesde.setDate(minDesde.getDate() - 30);

  const desde = parseYMDLocal(desdeStr) ?? minDesde;
  const hasta = parseYMDLocal(hastaStr) ?? hoy;

  const desdeClamped = new Date(Math.max(desde.getTime(), minDesde.getTime()));
  const hastaClamped = new Date(Math.min(hasta.getTime(), hoy.getTime()));

  if (desdeClamped.getTime() > hastaClamped.getTime()) {
    throw new Error("RANGO_INVALIDO");
  }
  return { desde: ymd(desdeClamped), hasta: ymd(hastaClamped) };
}

// ==========================
// 1) CREAR SOLICITUD (HOY)
// ==========================
const postCrearSolicitudHoraExtra = async (req, res, next) => {
  try {
    const uid = getUserId(getUser(req));
    if (!uid) return res.status(401).json({ message: "No autenticado" });

    const hora_inicio = normHHMMSS(req.body?.hora_inicio);
    const hora_fin = normHHMMSS(req.body?.hora_fin);
    const observacion = (req.body?.observacion || "").toString().trim();

    if (!hora_inicio || !hora_fin) {
      return res
        .status(400)
        .json({ message: "hora_inicio y hora_fin son requeridos (HH:MM)." });
    }
    if (!observacion || observacion.length < 5) {
      return res
        .status(400)
        .json({ message: "observacion es obligatoria (mínimo 5 caracteres)." });
    }

    const out = await crearSolicitudHoraExtra({
      usuario_id: uid,
      hora_inicio,
      hora_fin,
      observacion,
    });
    return res.status(201).json({ ok: true, ...out });
  } catch (e) {
    const msg = String(e?.message || "");
    if (msg.includes("YA_EXISTE") || String(e?.code) === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({ message: "Ya existe una solicitud de hora extra para HOY." });
    }
    if (msg.includes("NO_PERMITIDO"))
      return res.status(403).json({ message: msg });
    if (msg.includes("MINUTOS_INVALIDOS"))
      return res.status(400).json({ message: msg });
    next(e);
  }
};

// ==========================
// 2) MIS SOLICITUDES (por mes)
// - ahora acepta ?ym=YYYY-MM
// - restringido: mes actual o anterior
// - retorna LISTA DIRECTA mínima
// ==========================
const getMisSolicitudesHoraExtra = async (req, res, next) => {
  try {
    const uid = getUserId(getUser(req));
    if (!uid) return res.status(401).json({ message: "No autenticado" });

    const { ym: ymQ, desde, hasta } = req.query;

    // ✅ preferido: ym
    if (ymQ) {
      const r = parseYMRange(ymQ);
      if (!r)
        return res.status(400).json({ message: "ym inválido (YYYY-MM)." });
      if (!esMesActualOAnterior(r.ym)) {
        return res
          .status(403)
          .json({ message: "Solo se permite mes actual o anterior." });
      }
      const rows = await listarMisSolicitudesMin(uid, r.desde, r.hasta);
      return res.json(rows); // lista directa
    }

    // fallback viejo (desde/hasta) como lo tenías
    let rango;
    try {
      rango = clampRangoMesActualYAnterior(desde, hasta);
    } catch (_) {
      return res.status(400).json({ message: "Rango inválido." });
    }
    const rows = await listarMisSolicitudesMin(uid, rango.desde, rango.hasta);
    return res.json(rows);
  } catch (e) {
    next(e);
  }
};

// ==========================
// 3) PENDIENTES (aprobador)
// - ahora acepta ?ym=YYYY-MM (mes completo)
// - si no viene ym, mantiene desde/hasta (30 días)
// - devuelve data completa (puede ser lista u objeto; aquí dejo objeto)
// ==========================
const getPendientesHoraExtra = async (req, res, next) => {
  try {
    const uid = getUserId(getUser(req));
    if (!uid) return res.status(401).json({ message: "No autenticado" });

    const { ym: ymQ, desde, hasta } = req.query;

    if (ymQ) {
      const r = parseYMRange(ymQ);
      if (!r)
        return res.status(400).json({ message: "ym inválido (YYYY-MM)." });

      const rows = await listarPendientes({
        desde: r.desde,
        hasta: r.hasta,
        aprobador_id: uid,
      });

      return res.json({ ym: r.ym, desde: r.desde, hasta: r.hasta, data: rows });
    }

    // fallback anterior (30 días)
    let rango;
    try {
      rango = clampRangoUnMes(desde, hasta);
    } catch (_) {
      return res.status(400).json({ message: "Rango inválido." });
    }

    const rows = await listarPendientes({
      desde: rango.desde,
      hasta: rango.hasta,
      aprobador_id: uid,
    });

    return res.json({ desde: rango.desde, hasta: rango.hasta, data: rows });
  } catch (e) {
    next(e);
  }
};

// ==========================
// 4) APROBAR
// ==========================
const putAprobarSolicitudHoraExtra = async (req, res, next) => {
  try {
    const uid = getUserId(getUser(req));
    if (!uid) return res.status(401).json({ message: "No autenticado" });

    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "ID inválido" });

    const out = await aprobarSolicitud(id, uid);
    return res.json({ ok: true, ...out });
  } catch (e) {
    const msg = String(e?.message || "");
    if (msg.includes("NO_AUTORIZADO"))
      return res
        .status(403)
        .json({ message: "No autorizado para aprobar esta solicitud." });
    if (msg.includes("ESTADO_INVALIDO"))
      return res.status(409).json({ message: msg });
    next(e);
  }
};

// ==========================
// 5) RECHAZAR
// ==========================
const putRechazarSolicitudHoraExtra = async (req, res, next) => {
  try {
    const uid = getUserId(getUser(req));
    if (!uid) return res.status(401).json({ message: "No autenticado" });

    const id = Number(req.params.id);
    const motivo = (req.body?.motivo_rechazo || "").toString().trim();

    if (!id) return res.status(400).json({ message: "ID inválido" });
    if (!motivo || motivo.length < 3) {
      return res
        .status(400)
        .json({ message: "motivo_rechazo requerido (mínimo 3 caracteres)." });
    }

    const out = await rechazarSolicitud(id, uid, motivo);
    return res.json({ ok: true, ...out });
  } catch (e) {
    const msg = String(e?.message || "");
    if (msg.includes("NO_AUTORIZADO"))
      return res
        .status(403)
        .json({ message: "No autorizado para rechazar esta solicitud." });
    if (msg.includes("ESTADO_INVALIDO"))
      return res.status(409).json({ message: msg });
    next(e);
  }
};

// ==========================
// 6) ELIMINAR (dueño, HOY, SOLICITUD)
// ==========================
const putEliminarSolicitudHoraExtra = async (req, res, next) => {
  try {
    const uid = getUserId(getUser(req));
    if (!uid) return res.status(401).json({ message: "No autenticado" });

    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "ID inválido" });

    const out = await eliminarSolicitud(id, uid);
    return res.json({ ok: true, ...out });
  } catch (e) {
    const msg = String(e?.message || "");
    if (msg.includes("NO_AUTORIZADO"))
      return res.status(403).json({ message: "No autorizado." });
    if (msg.includes("ESTADO_INVALIDO"))
      return res.status(409).json({ message: msg });
    if (msg.includes("NO_EXISTE"))
      return res.status(404).json({ message: "Solicitud no encontrada." });
    next(e);
  }
};

// ==========================
// 7) ✅ APROBADAS DETALLE (desde movimientos) POR MES
// GET /horas-extra/aprobadas?ym=YYYY-MM
// Devuelve lista para pintar celdas (fecha, usuario, minutos, observacion)
// ==========================
const getAprobadasMovHoraExtra = async (req, res, next) => {
  try {
    const uid = getUserId(getUser(req));
    if (!uid) return res.status(401).json({ message: "No autenticado" });

    const { ym: ymQ } = req.query;
    const r = parseYMRange(ymQ);
    if (!r) return res.status(400).json({ message: "ym inválido (YYYY-MM)." });

    const rows = await listarAprobadasMovimientos(r.desde, r.hasta);
    return res.json(rows); // ✅ lista directa (Angular calcula total)
  } catch (e) {
    next(e);
  }
};

// ==========================
// 8) RESUMEN (opcional) POR MES o rango
// GET /horas-extra/aprobadas-resumen?ym=YYYY-MM
// (o mantiene desde/hasta)
// ==========================
function isYMD(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "").trim());
}
function parseYMD(s) {
  if (!isYMD(s)) return null;
  const d = new Date(String(s) + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}

const getAprobadasResumenHoraExtra = async (req, res, next) => {
  try {
    const uid = getUserId(getUser(req));
    if (!uid) return res.status(401).json({ message: "No autenticado" });

    const { ym: ymQ, desde, hasta } = req.query;

    if (ymQ) {
      const r = parseYMRange(ymQ);
      if (!r)
        return res.status(400).json({ message: "ym inválido (YYYY-MM)." });
      const rows = await listarAprobadasResumenMovimientos(r.desde, r.hasta);
      return res.json(rows);
    }

    // fallback rango
    const d1 = parseYMD(desde);
    const d2 = parseYMD(hasta);
    if (!d1 || !d2)
      return res
        .status(400)
        .json({ message: "desde/hasta inválidos (YYYY-MM-DD)." });
    if (d1.getTime() > d2.getTime())
      return res
        .status(400)
        .json({ message: "Rango inválido: desde > hasta." });

    const rows = await listarAprobadasResumenMovimientos(desde, hasta);
    return res.json(rows);
  } catch (e) {
    next(e);
  }
};

module.exports = {
  postCrearSolicitudHoraExtra,
  getMisSolicitudesHoraExtra,
  getPendientesHoraExtra,
  putAprobarSolicitudHoraExtra,
  putRechazarSolicitudHoraExtra,
  putEliminarSolicitudHoraExtra,

  // ✅ aprobadas
  getAprobadasMovHoraExtra,
  getAprobadasResumenHoraExtra,
};
