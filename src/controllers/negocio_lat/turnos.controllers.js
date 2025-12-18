// src/controllers/negocio_lat/turnos.controllers.js
const { poolmysql } = require("../../config/db");
const {
  generarTurnosDiariosLote,
  seleccionarTurnosDiarios,
  eliminarTurnoProgramado,
  actualizarTurnoProgramado,
  selectTurnosByUsuarioRango,
  updateObsHoraAcumuladaHoy,
  updateEstadoHoraAcumuladaTurno,
  asignarDevolucionTurno,
} = require("../../models/negocio_lat/turnos.models");

// ===== Helpers fecha (evita problemas de timezone) =====
function parseYMD(ymd) {
  const [y, m, d] = (ymd || "").split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
function formatYMD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function startOfWeekMonday(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay(); // 0=Dom, 1=Lun,...6=Sab
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}
function endOfWeekSunday(monday) {
  const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate());
  d.setDate(d.getDate() + 6);
  return d;
}
function resolveUserId(req) {
  return (
    req.user?.id ||
    req.user?.usuario_id ||
    req.usuario_id ||
    req.userId ||
    req.auth?.id ||
    null
  );
}

/**
 * GET /api/turnos
 */
const getTurnos = async (req, res, next) => {
  try {
    const { sucursal, fecha_desde, fecha_hasta, usuario_id } = req.query || {};

    const usuarioIdNum =
      usuario_id !== undefined && usuario_id !== null && usuario_id !== ""
        ? Number(usuario_id)
        : null;

    const filtros = {
      sucursal: sucursal || null,
      fechaDesde: fecha_desde || null,
      fechaHasta: fecha_hasta || null,
      usuarioId: Number.isFinite(usuarioIdNum) ? usuarioIdNum : null,
    };

    const turnos = await seleccionarTurnosDiarios(filtros);

    return res.json({ ok: true, filtros, turnos });
  } catch (err) {
    console.error("❌ Error en getTurnos:", err.message);
    next(err);
  }
};

/**
 * POST /api/turnos/generar
 */
const postGenerarTurnos = async (req, res, next) => {
  try {
    let {
      usuario_ids,
      fecha_desde,
      fecha_hasta,
      sucursal,
      hora_entrada_prog,
      hora_salida_prog,
      min_toler_atraso,
      min_toler_salida,
      excluir_fines_semana,
      sobrescribir_existentes,
    } = req.body || {};

    if (!Array.isArray(usuario_ids) || usuario_ids.length === 0) {
      return res.status(400).json({
        ok: false,
        message: "Debe enviar 'usuario_ids' (array) con al menos un usuario",
      });
    }
    if (!fecha_desde || !fecha_hasta) {
      return res.status(400).json({
        ok: false,
        message: "Debe enviar 'fecha_desde' y 'fecha_hasta'",
      });
    }
    if (!hora_entrada_prog || !hora_salida_prog) {
      return res.status(400).json({
        ok: false,
        message: "Debe enviar 'hora_entrada_prog' y 'hora_salida_prog'",
      });
    }

    const resumen = await generarTurnosDiariosLote({
      usuarioIds: usuario_ids,
      fechaDesde: fecha_desde,
      fechaHasta: fecha_hasta,
      sucursal: sucursal || null,
      horaEntradaProg: hora_entrada_prog,
      horaSalidaProg: hora_salida_prog,
      minTolerAtraso: min_toler_atraso ?? 0,
      minTolerSalida: min_toler_salida ?? 0,
      excluirFinesSemana: excluir_fines_semana !== false,
      sobrescribirExistentes: !!sobrescribir_existentes,
    });

    return res
      .status(201)
      .json({ ok: true, message: "Turnos generados", ...resumen });
  } catch (err) {
    console.error("❌ Error en postGenerarTurnos:", err.message);
    next(err);
  }
};

/**
 * PUT /api/turnos/:turnoId
 */
const putActualizarTurno = async (req, res, next) => {
  try {
    const { turnoId } = req.params;
    const {
      hora_entrada_prog,
      hora_salida_prog,
      min_toler_atraso,
      min_toler_salida,
    } = req.body || {};

    if (!hora_entrada_prog || !hora_salida_prog) {
      return res.status(400).json({
        ok: false,
        message: "Debe enviar hora_entrada_prog y hora_salida_prog",
      });
    }

    const result = await actualizarTurnoProgramado(turnoId, {
      horaEntradaProg: hora_entrada_prog,
      horaSalidaProg: hora_salida_prog,
      minTolerAtraso: min_toler_atraso,
      minTolerSalida: min_toler_salida,
    });

    if (!result.affectedRows) {
      return res.status(409).json({
        ok: false,
        message:
          "No se puede editar: fecha pasada, no es NORMAL, o ya tiene marcaciones.",
      });
    }

    return res.json({ ok: true, message: "Turno actualizado correctamente" });
  } catch (err) {
    console.error("❌ Error en putActualizarTurno:", err.message);
    next(err);
  }
};

/**
 * DELETE /api/turnos/:turnoId
 */
const deleteTurno = async (req, res, next) => {
  try {
    const { turnoId } = req.params;

    const result = await eliminarTurnoProgramado(turnoId);

    if (!result.affectedRows) {
      return res.status(409).json({
        ok: false,
        message:
          "No se puede eliminar: fecha pasada, no es NORMAL, o ya tiene marcaciones.",
      });
    }

    return res.json({ ok: true, message: "Turno eliminado correctamente" });
  } catch (err) {
    console.error("❌ Error en deleteTurno:", err.message);
    next(err);
  }
};

/**
 * GET /api/turnos/mi-horario
 * devuelve SIEMPRE 7 días (Lun-Dom)
 */
const getMiHorarioSemana = async (req, res, next) => {
  try {
    const usuario_id = resolveUserId(req);
    if (!usuario_id) {
      return res.status(401).json({ success: false, message: "No autorizado" });
    }

    const { fecha, desde } = req.query;
    const baseDate =
      (fecha && parseYMD(fecha)) || (desde && parseYMD(desde)) || new Date();

    const monday = startOfWeekMonday(baseDate);
    const sunday = endOfWeekSunday(monday);

    const desdeISO = formatYMD(monday);
    const hastaISO = formatYMD(sunday);

    const turnos = await selectTurnosByUsuarioRango(
      usuario_id,
      desdeISO,
      hastaISO
    );

    const map = new Map();
    for (const t of turnos) map.set(t.fecha, t);

    const semana = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(
        monday.getFullYear(),
        monday.getMonth(),
        monday.getDate() + i
      );
      const ymd = formatYMD(day);

      const t = map.get(ymd);

      if (!t) {
        semana.push({
          fecha: ymd,
          tiene_turno: false,
          estado_asistencia: "SIN_TURNO",
          tipo_dia: "NORMAL",
          estado_hora_acumulada: "NO",
          num_horas_acumuladas: null,
        });
      } else {
        semana.push({
          fecha: ymd,
          tiene_turno: true,
          hora_entrada_prog: t.hora_entrada_prog,
          hora_salida_prog: t.hora_salida_prog,
          hora_entrada_real: t.hora_entrada_real,
          hora_salida_real: t.hora_salida_real,

          estado_asistencia: t.estado_asistencia,
          tipo_dia: t.tipo_dia ?? "NORMAL",

          min_trabajados: t.min_trabajados,
          min_atraso: t.min_atraso,
          min_extra: t.min_extra,
          observacion: t.observacion,
          sucursal: t.sucursal,

          estado_hora_acumulada: t.estado_hora_acumulada ?? "NO",
          num_horas_acumuladas: t.num_horas_acumuladas ?? null,
        });
      }
    }

    return res.json({
      success: true,
      desde: desdeISO,
      hasta: hastaISO,
      data: semana,
    });
  } catch (e) {
    next(e);
  }
};

/**
 * PUT /api/turnos/mi-horario/observacion
 * body: { observacion, solicitar_hora_acumulada, num_horas_acumuladas }
 *
 * ✅ NO permite modificar si estado_hora_acumulada = APROBADO
 */
const putObservacionTurnoHoy = async (req, res, next) => {
  try {
    const usuario_id = resolveUserId(req);
    if (!usuario_id) {
      return res.status(401).json({ success: false, message: "No autorizado" });
    }

    const observacion = (req.body?.observacion ?? "").toString().trim();
    const solicitar = !!req.body?.solicitar_hora_acumulada;
    const numHoras = req.body?.num_horas_acumuladas ?? null;

    if (solicitar) {
      const n = Number(numHoras);
      if (!Number.isInteger(n) || n < 1 || n > 15) {
        return res.status(400).json({
          success: false,
          message: "num_horas_acumuladas debe ser entero entre 1 y 15",
        });
      }
    }

    const result = await updateObsHoraAcumuladaHoy(usuario_id, {
      observacion,
      solicitar,
      num_horas_acumuladas: solicitar ? Number(numHoras) : null,
    });

    if (!result.affectedRows) {
      // Diferenciamos: no turno hoy vs aprobado vs tipo_dia no NORMAL
      const [rows] = await poolmysql.query(
        `SELECT estado_hora_acumulada, tipo_dia
         FROM neg_t_turnos_diarios
         WHERE usuario_id = ? AND fecha = CURDATE()
         LIMIT 1`,
        [usuario_id]
      );

      if (!rows.length) {
        return res
          .status(404)
          .json({ success: false, message: "No existe turno para HOY" });
      }

      const st = String(rows[0].estado_hora_acumulada || "NO")
        .toUpperCase()
        .trim();
      const tipo = String(rows[0].tipo_dia || "NORMAL")
        .toUpperCase()
        .trim();

      if (st === "APROBADO") {
        return res.status(409).json({
          success: false,
          message: "No se puede modificar: la solicitud ya está APROBADA",
        });
      }

      if (tipo !== "NORMAL") {
        return res.status(409).json({
          success: false,
          message: `No se puede modificar: el día es ${tipo}`,
        });
      }

      return res.status(409).json({
        success: false,
        message: "No se pudo guardar la observación",
      });
    }

    return res.json({ success: true, message: "Guardado" });
  } catch (e) {
    next(e);
  }
};

/**
 * PUT /api/turnos/hora-acumulada/:turnoId
 * body: { estado_hora_acumulada: 'APROBADO' | 'RECHAZADO' }
 */
const putEstadoHoraAcumuladaTurno = async (req, res, next) => {
  const { turnoId } = req.params;

  try {
    const estado = String(req.body?.estado_hora_acumulada || "")
      .toUpperCase()
      .trim();

    if (!["APROBADO", "RECHAZADO"].includes(estado)) {
      return res.status(400).json({
        success: false,
        message: "estado_hora_acumulada debe ser 'APROBADO' o 'RECHAZADO'",
      });
    }

    const aprobadoPor = resolveUserId(req);
    if (!aprobadoPor) {
      return res.status(401).json({
        success: false,
        message: "No se pudo identificar el usuario aprobador (token)",
      });
    }

    const result = await updateEstadoHoraAcumuladaTurno(
      turnoId,
      estado,
      aprobadoPor
    );

    return res.status(200).json({
      success: true,
      message: "Estado de horas acumuladas actualizado",
      result,
    });
  } catch (error) {
    console.error("❌ putEstadoHoraAcumuladaTurno error:", error);
    res.status(400).json({ success: false, message: error.message || "Error" });
  }
};

/**
 * PUT /api/turnos/devolucion/:id
 * asigna DEVOLUCION y debita 8h
 */
async function putAsignarDevolucion(req, res) {
  try {
    const { id } = req.params; // turnoId
    const aprobado_por = resolveUserId(req);

    if (!aprobado_por) {
      return res.status(401).json({ message: "No autorizado" });
    }

    const r = await asignarDevolucionTurno(id, aprobado_por);
    res.status(200).json({ message: "✅ DEVOLUCIÓN asignada", ...r });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
}

module.exports = {
  getTurnos,
  postGenerarTurnos,
  putActualizarTurno,
  deleteTurno,
  getMiHorarioSemana,
  putObservacionTurnoHoy,
  putEstadoHoraAcumuladaTurno,
  putAsignarDevolucion,
};
