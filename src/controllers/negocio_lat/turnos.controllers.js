// src/controllers/negocio_lat/turnos.controllers.js
const {
  generarTurnosDiariosLote,
  seleccionarTurnosDiarios,
  eliminarTurnoProgramado,
  actualizarTurnoProgramado,
} = require("../../models/negocio_lat/turnos.models");

// 🔧 Control local de logs para ESTE archivo
const ShowConsoleLog = false; // ponlo en false para ocultar los console.log

function log(...args) {
  if (ShowConsoleLog) {
    console.log(...args);
  }
}

/**
 * GET /api/turnos
 * Query:
 *  - sucursal     (opcional)
 *  - fecha_desde  (opcional, YYYY-MM-DD)
 *  - fecha_hasta  (opcional, YYYY-MM-DD)
 *  - usuario_id   (opcional)
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

    // 🔍 LOGS DE DEPURACIÓN (controlados por ShowConsoleLog)

    const turnos = await seleccionarTurnosDiarios(filtros);

    return res.json({
      ok: true,
      filtros,
      turnos,
    });
  } catch (err) {
    console.error("❌ Error en getTurnos:", err.message);
    next(err);
  }
};

/**
 * POST /api/turnos/generar
 * Body esperado:
 * {
 *   "usuario_ids": [1,2,3],
 *   "fecha_desde": "2025-12-01",
 *   "fecha_hasta": "2025-12-31",
 *   "sucursal": "LATACUNGA",
 *   "hora_entrada_prog": "08:00",
 *   "hora_salida_prog": "17:00",
 *   "min_toler_atraso": 5,
 *   "min_toler_salida": 0,
 *   "excluir_fines_semana": true,
 *   "sobrescribir_existentes": false
 * }
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
      console.warn("[TURNOS] Falta usuario_ids o está vacío");
      return res.status(400).json({
        ok: false,
        message: "Debe enviar 'usuario_ids' (array) con al menos un usuario",
      });
    }

    if (!fecha_desde || !fecha_hasta) {
      console.warn("[TURNOS] Falta fecha_desde o fecha_hasta");
      return res.status(400).json({
        ok: false,
        message: "Debe enviar 'fecha_desde' y 'fecha_hasta'",
      });
    }

    if (!hora_entrada_prog || !hora_salida_prog) {
      console.warn("[TURNOS] Falta hora_entrada_prog o hora_salida_prog");
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
      excluirFinesSemana: excluir_fines_semana !== false, // por defecto true
      sobrescribirExistentes: !!sobrescribir_existentes,
    });

    return res.status(201).json({
      ok: true,
      message: "Turnos generados",
      ...resumen,
    });
  } catch (err) {
    console.error("❌ Error en postGenerarTurnos:", err.message);
    next(err);
  }
};

/**
 * PUT /api/turnos/:turnoId
 * Body:
 *  - hora_entrada_prog
 *  - hora_salida_prog
 *  - min_toler_atraso (opcional)
 *  - min_toler_salida (opcional)
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

    // 👀 OJO: aquí llamas a actualizarTurnoProgramado, asegúrate
    // de tenerlo exportado en tu modelo o ajusta al nombre real.
    const result = await actualizarTurnoProgramado(turnoId, {
      horaEntradaProg: hora_entrada_prog,
      horaSalidaProg: hora_salida_prog,
      minTolerAtraso: min_toler_atraso,
      minTolerSalida: min_toler_salida,
    });

    if (!result.affectedRows) {
      // No cumplió las restricciones (fecha pasada o ya tiene marcas)
      return res.status(409).json({
        ok: false,
        message:
          "No se puede editar este turno: la fecha ya pasó o ya tiene marcaciones.",
      });
    }

    return res.json({
      ok: true,
      message: "Turno actualizado correctamente",
    });
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
          "No se puede eliminar este turno: la fecha ya pasó o ya tiene marcaciones.",
      });
    }

    return res.json({
      ok: true,
      message: "Turno eliminado correctamente",
    });
  } catch (err) {
    console.error("❌ Error en deleteTurno:", err.message);
    next(err);
  }
};

module.exports = {
  getTurnos,
  postGenerarTurnos,
  putActualizarTurno,
  deleteTurno,
};
