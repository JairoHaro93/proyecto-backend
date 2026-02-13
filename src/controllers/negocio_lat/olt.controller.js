// src/controllers/negocio_lat/olt.controller.js
require("dotenv").config();
const { getOltSession, OltHttpError } = require("../../utils/olt.session");

function parseBool(v) {
  return String(v || "").toLowerCase() === "true";
}


function toIsoFromHuawei(dt) {
  // "12-02-2026 20:47:12-05:00"  ->  "2026-02-12T20:47:12-05:00"
  const s = String(dt || "").trim();
  const m = s.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}:\d{2}:\d{2})([+-]\d{2}:\d{2})$/);
  if (!m) return null;
  const [, dd, mm, yyyy, hhmmss, tz] = m;
  return `${yyyy}-${mm}-${dd}T${hhmmss}${tz}`;
}

function fmtDuration(sec) {
  if (sec == null || !Number.isFinite(sec)) return null;
  sec = Math.max(0, Math.floor(sec));
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return d > 0 ? `${d}d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
}

function pick(raw, re) {
  const m = String(raw || "").match(re);
  return m ? String(m[1] ?? "").trim() : null;
}



function serializeErr(err) {
  return {
    name: err?.name,
    message: err?.message || String(err),
    code: err?.code,
  };
}

function extractTime(raw = "") {
  const m = String(raw).match(
    /\b\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2}(?:[+-]\d{2}:\d{2})?\b/
  );
  return m ? m[0] : null;
}

/**
 * ✅ WHITELIST de comandos (por cmdId)
 * Agrega aquí nuevos comandos, siempre read-only al inicio.
 */
const COMMANDS = {
  TIME: {
    build: () => "display time",
    parse: (raw) => ({ time: extractTime(raw) }),
  },

  ONT_INFO_BY_SN: {
    build: ({ sn } = {}) => {
      const serial = String(sn || "").trim().toUpperCase();
      // Huawei SN suele venir en 16 HEX (como tu ejemplo)
      if (!/^[0-9A-F]{16}$/.test(serial)) {
        throw new Error("SN inválido: debe ser HEX de 16 caracteres (ej: 54504C479346E80F)");
      }
      return `display ont info by-sn ${serial}`;
    },

    parse: (raw) => {
      const out = String(raw || "");

      // Estos nombres pueden variar un poco; ajustamos si tu salida usa otro texto
      const runState = pick(out, /Run\s*state\s*:\s*([^\n]+)/i) || pick(out, /\bStatus\s*:\s*([^\n]+)/i);
      const lastUp   = pick(out, /Last\s*up\s*time\s*:\s*([^\n]+)/i);
      const lastDown = pick(out, /Last\s*down\s*time\s*:\s*([^\n]+)/i);
      const downCause =
        pick(out, /Last\s*down\s*cause\s*:\s*([^\n]+)/i) ||
        pick(out, /Last\s*down\s*reason\s*:\s*([^\n]+)/i);

      // Algunos firmwares dan duración directa
      const onlineDurText =
        pick(out, /Online\s*(?:duration|time)\s*(?:\(\w+\))?\s*:\s*([^\n]+)/i);

      // Si no hay duración, calculamos con lastUp
      let onlineSeconds = null;
      if (!onlineDurText && lastUp) {
        const iso = toIsoFromHuawei(lastUp);
        if (iso) {
          const t = Date.parse(iso);
          if (!Number.isNaN(t) && String(runState || "").toLowerCase().includes("online")) {
            onlineSeconds = Math.floor((Date.now() - t) / 1000);
          }
        }
      }

      return {
        runState: runState || null,
        lastUpTime: lastUp || null,
        lastDownTime: lastDown || null,
        lastDownCause: downCause || null,
        online: {
          seconds: onlineSeconds,
          text: onlineDurText || fmtDuration(onlineSeconds),
        },
      };
    },
  },
};


async function testTime(req, res) {
  const debug = parseBool(req.query.debug);
  try {
    const session = getOltSession();
    const raw = await session.run("display time", { debug });

    const time = extractTime(raw);
    if (!debug) return res.json({ ok: true, message: "OK", time });
    return res.json({ ok: true, message: "OK", time, raw });
  } catch (err) {
    return handleOltError(err, res);
  }
}

async function status(req, res) {
  const session = getOltSession();
  return res.json({ ok: true, status: session.status() });
}

async function exec(req, res) {
  const debug = parseBool(req.query.debug);
  const { cmdId, args } = req.body || {};

  if (!cmdId || typeof cmdId !== "string") {
    return res.status(400).json({ ok: false, error: { message: "cmdId es requerido" } });
  }

  const def = COMMANDS[cmdId.toUpperCase()];
  if (!def) {
    return res.status(400).json({
      ok: false,
      error: { message: `cmdId no permitido: ${cmdId}` },
    });
  }

  try {
    const session = getOltSession();

    const cmd = def.build ? def.build(args || {}) : null;
    if (!cmd || typeof cmd !== "string") {
      return res.status(400).json({
        ok: false,
        error: { message: `No se pudo construir comando para cmdId=${cmdId}` },
      });
    }

    const raw = await session.run(cmd, { debug });

    // Respuesta normalizada
    const parsed = def.parse ? def.parse(raw) : {};
    const base = { ok: true, cmdId: cmdId.toUpperCase(), ...parsed };

    if (!debug) return res.json(base);
    return res.json({ ...base, raw });
  } catch (err) {
    return handleOltError(err, res);
  }
}

function handleOltError(err, res) {
  const msg = String(err?.message || "");

  // Errores controlados (cooldown)
  if (err instanceof OltHttpError && err.status) {
    return res.status(err.status).json({ ok: false, error: { message: msg } });
  }

  // Bloqueos típicos Huawei
  if (/IP address has been locked|cannot log on|locked/i.test(msg)) {
    return res.status(500).json({
      ok: false,
      error: {
        name: "Error",
        message:
          "OLT: la IP/usuario está bloqueada por intentos. Desbloquear en OLT o esperar expiración.",
      },
    });
  }

  return res.status(500).json({ ok: false, error: serializeErr(err) });
}

module.exports = { testTime, status, exec };
