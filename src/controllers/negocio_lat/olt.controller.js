// src/controllers/negocio_lat/olt.controller.js
require("dotenv").config();
const { getOltSession, OltHttpError } = require("../../utils/olt.session");

function parseBool(v) {
  return String(v || "").toLowerCase() === "true";
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

function pick(raw, re) {
  const m = String(raw || "").match(re);
  return m ? String(m[1] ?? "").trim() : null;
}

function parseHuaweiDuration(txt) {
  const s = String(txt || "");
  const m = s.match(
    /(\d+)\s*day\(s\)\s*,\s*(\d+)\s*hour\(s\)\s*,\s*(\d+)\s*minute\(s\)\s*,\s*(\d+)\s*second\(s\)/i
  );
  if (!m) return null;
  const d = Number(m[1]), h = Number(m[2]), mi = Number(m[3]), se = Number(m[4]);
  return d * 86400 + h * 3600 + mi * 60 + se;
}

async function testTime(req, res) {
  const debug = parseBool(req.query.debug);

  try {
    const session = getOltSession("default");
    const raw = await session.run("display time", { debug });

    const time = extractTime(raw);
    if (!debug) return res.json({ ok: true, message: "OK", time });
    return res.json({ ok: true, message: "OK", time, raw });
  } catch (err) {
    const msg = String(err?.message || "");

    if (err instanceof OltHttpError && err.status) {
      return res.status(err.status).json({ ok: false, error: { message: msg } });
    }

    if (/IP address has been locked|cannot log on|locked/i.test(msg)) {
      return res.status(500).json({
        ok: false,
        error: {
          name: "Error",
          message: "OLT: la IP/usuario está bloqueada por intentos. Desbloquear en OLT o esperar expiración.",
        },
      });
    }

    return res.status(500).json({ ok: false, error: serializeErr(err) });
  }
}

async function status(req, res) {
  const session = getOltSession("default");
  return res.json({ ok: true, status: session.status() });
}

// ✅ exec con whitelist de comandos
const COMMANDS = {
  ONT_INFO_BY_SN: {
    mode: "config", // <-- clave (enable + config automáticamente)
    build: ({ sn } = {}) => {
      const serial = String(sn || "").trim().toUpperCase();
      if (!/^[0-9A-F]{16}$/.test(serial)) {
        throw new Error("SN inválido: debe ser HEX de 16 caracteres (ej: 54504C479346E80F)");
      }
      return `display ont info by-sn  ${serial}`; // (doble espacio como tú lo usas)
    },
    parse: (raw, { sn }) => {
      const fsp = pick(raw, /F\/S\/P\s*:\s*([0-9]+\/[0-9]+\/[0-9]+)/i);
      const ontId = pick(raw, /ONT-ID\s*:\s*(\d+)/i);
      const runState = pick(raw, /Run state\s*:\s*([^\n]+)/i);

      const lastDownCause = pick(raw, /Last down cause\s*:\s*([^\n]+)/i);
      const lastUpTime = pick(raw, /Last up time\s*:\s*([^\n]+)/i);
      const lastDownTime = pick(raw, /Last down time\s*:\s*([^\n]+)/i);

      const onlineDurText = pick(raw, /ONT online duration\s*:\s*([^\n]+)/i);
      const onlineSeconds = parseHuaweiDuration(onlineDurText);

      return {
        sn: String(sn || "").toUpperCase(),
        fsp,
        ontId: ontId ? Number(ontId) : null,
        runState,
        lastUpTime,
        lastDownTime,
        lastDownCause,
        online: { seconds: onlineSeconds, text: onlineDurText || null },
      };
    },
  },
};

async function exec(req, res) {
  const debug = parseBool(req.query.debug);

  try {
    const { cmdId, args } = req.body || {};
    const id = String(cmdId || "").trim();

    const spec = COMMANDS[id];
    if (!spec) {
      return res.status(400).json({ ok: false, error: { message: "cmdId no permitido" } });
    }

    const session = getOltSession("default");
    const cmd = spec.build(args || {});
    const raw = await session.run(cmd, { debug, mode: spec.mode });

    const parsed = spec.parse ? spec.parse(raw, args || {}) : {};
    const payload = { ok: true, cmdId: id, ...parsed };

    if (debug) {
      payload.cmd = cmd;   // <-- útil para ver si se están perdiendo espacios
      payload.raw = raw;
    }

    return res.json(payload);
  } catch (err) {
    const msg = String(err?.message || "");

    if (err instanceof OltHttpError && err.status) {
      return res.status(err.status).json({ ok: false, error: { message: msg } });
    }

    if (/IP address has been locked|cannot log on|locked/i.test(msg)) {
      return res.status(500).json({
        ok: false,
        error: {
          name: "Error",
          message: "OLT: la IP/usuario está bloqueada por intentos. Desbloquear en OLT o esperar expiración.",
        },
      });
    }

    return res.status(500).json({ ok: false, error: serializeErr(err) });
  }
}

module.exports = { testTime, status, exec };
