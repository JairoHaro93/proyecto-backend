// controllers/negocio_lat/justificaciones_turno.controllers.js

const {
  solicitarJustAtraso,
  solicitarJustSalida,
  selectPendientesJustificaciones,
} = require("../../models/negocio_lat/justificaciones_turno.model");

const {
  resolverJustificacionTurno,
} = require("../../models/negocio_lat/turnos.models");

function getUserId(req) {
  return (
    req.user?.id || req.usuario?.id || req.auth?.id || req.usuario_id || null
  );
}

// acepta 15, "15", "01:30"
function parseMinutos(input) {
  if (input === null || input === undefined || input === "") return null;

  if (typeof input === "number" && Number.isFinite(input)) {
    return Math.trunc(input);
  }

  const s = String(input).trim();
  if (!s) return null;

  // HH:MM
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (m) {
    const hh = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
    if (mm < 0 || mm > 59) return null;
    return hh * 60 + mm;
  }

  // minutos simples
  const n = Number(s);
  if (Number.isFinite(n)) return Math.trunc(n);

  return null;
}

function validarMinutos(min) {
  if (min === null) return false;
  if (!Number.isInteger(min)) return false;

  // ⚠️ tu tabla tiene CHECK(minutos > 0)
  if (min < 1) return false;

  // límite razonable (ajústalo)
  if (min > 600) return false;

  return true;
}

// ==========================
// Solicitar (usuario)
// ==========================
const postSolicitarAtraso = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { motivo } = req.body;

    if (!motivo || String(motivo).trim().length < 5) {
      return res
        .status(400)
        .json({ message: "Motivo requerido (mínimo 5 caracteres)." });
    }

    const ok = await solicitarJustAtraso(id, String(motivo).trim());
    if (!ok) return res.status(404).json({ message: "Turno no encontrado." });

    return res
      .status(201)
      .json({ message: "✅ Justificación de atraso enviada (PENDIENTE)." });
  } catch (e) {
    next(e);
  }
};

const postSolicitarSalida = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { motivo } = req.body;

    if (!motivo || String(motivo).trim().length < 5) {
      return res
        .status(400)
        .json({ message: "Motivo requerido (mínimo 5 caracteres)." });
    }

    const ok = await solicitarJustSalida(id, String(motivo).trim());
    if (!ok) return res.status(404).json({ message: "Turno no encontrado." });

    return res.status(201).json({
      message: "✅ Justificación de salida temprana enviada (PENDIENTE).",
    });
  } catch (e) {
    next(e);
  }
};

// ==========================
// Resolver (jefe) — con minutos + DEBITO en kardex (si APROBADA)
// ==========================
const putResolverAtraso = async (req, res, next) => {
  try {
    const jefeId = Number(getUserId(req));
    const turnoId = Number(req.params.id);
    const { estado, minutos } = req.body || {};

    if (!jefeId) {
      return res.status(401).json({ message: "No autenticado." });
    }
    if (!turnoId) {
      return res.status(400).json({ message: "ID de turno inválido." });
    }

    if (!["APROBADA", "RECHAZADA"].includes(String(estado).toUpperCase())) {
      return res
        .status(400)
        .json({ message: "Estado inválido. Use APROBADA o RECHAZADA." });
    }

    let minParsed = null;

    if (String(estado).toUpperCase() === "APROBADA") {
      minParsed = parseMinutos(minutos);
      if (!validarMinutos(minParsed)) {
        return res.status(400).json({
          message:
            "Minutos inválidos. En APROBADA debe enviar minutos > 0 (ej: 15 o 01:30).",
        });
      }
    }

    await resolverJustificacionTurno(
      turnoId,
      "atraso",
      String(estado).toUpperCase(),
      minParsed,
      jefeId
    );

    return res.json({
      ok: true,
      message: `✅ Justificación de atraso ${String(estado).toUpperCase()}.`,
      minutos: minParsed,
    });
  } catch (e) {
    // si tu modelo lanza errores de negocio, aquí puedes mapear a 409
    if (String(e?.message || "").includes("PENDIENTE")) {
      return res.status(409).json({ message: e.message });
    }
    next(e);
  }
};

const putResolverSalida = async (req, res, next) => {
  try {
    const jefeId = Number(getUserId(req));
    const turnoId = Number(req.params.id);
    const { estado, minutos } = req.body || {};

    if (!jefeId) {
      return res.status(401).json({ message: "No autenticado." });
    }
    if (!turnoId) {
      return res.status(400).json({ message: "ID de turno inválido." });
    }

    if (!["APROBADA", "RECHAZADA"].includes(String(estado).toUpperCase())) {
      return res
        .status(400)
        .json({ message: "Estado inválido. Use APROBADA o RECHAZADA." });
    }

    let minParsed = null;

    if (String(estado).toUpperCase() === "APROBADA") {
      minParsed = parseMinutos(minutos);
      if (!validarMinutos(minParsed)) {
        return res.status(400).json({
          message:
            "Minutos inválidos. En APROBADA debe enviar minutos > 0 (ej: 10 o 00:45).",
        });
      }
    }

    await resolverJustificacionTurno(
      turnoId,
      "salida",
      String(estado).toUpperCase(),
      minParsed,
      jefeId
    );

    return res.json({
      ok: true,
      message: `✅ Justificación de salida ${String(estado).toUpperCase()}.`,
      minutos: minParsed,
    });
  } catch (e) {
    if (String(e?.message || "").includes("PENDIENTE")) {
      return res.status(409).json({ message: e.message });
    }
    next(e);
  }
};

// ==========================
// Pendientes
// ==========================
const getPendientes = async (req, res, next) => {
  try {
    const { desde, hasta, usuario_id } = req.query;
    if (!desde || !hasta) {
      return res
        .status(400)
        .json({ message: "Parámetros desde/hasta requeridos." });
    }

    const rows = await selectPendientesJustificaciones({
      desde,
      hasta,
      usuario_id: usuario_id ? Number(usuario_id) : null,
    });

    return res.json(rows);
  } catch (e) {
    next(e);
  }
};

module.exports = {
  postSolicitarAtraso,
  postSolicitarSalida,
  putResolverAtraso,
  putResolverSalida,
  getPendientes,
};
