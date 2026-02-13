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

const RE_TIME =
  /\b\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2}(?:[+-]\d{2}:\d{2})?\b/;

function extractTime(raw = "") {
  const m = String(raw).match(RE_TIME);
  return m ? m[0] : null;
}

function extractIntField(raw, labelRe) {
  const re = new RegExp(`^\\s*${labelRe}\\s*:\\s*(\\d+)\\s*$`, "im");
  const m = String(raw).match(re);
  return m ? Number(m[1]) : null;
}

function extractStrField(raw, labelRe) {
  const re = new RegExp(`^\\s*${labelRe}\\s*:\\s*(.+?)\\s*$`, "im");
  const m = String(raw).match(re);
  return m ? String(m[1]).trim() : null;
}

function extractDescription(raw = "") {
  const lines = String(raw).split("\n");
  const idx = lines.findIndex((l) => /^\s*Description\s*:/.test(l));
  if (idx === -1) return null;

  const out = [];
  const first = lines[idx].split(":").slice(1).join(":").trim();
  if (first) out.push(first);

  for (let i = idx + 1; i < lines.length; i++) {
    const l = lines[i];

    // cortar si aparece otro campo tipo "Last down cause :"
    if (/^\s*[A-Za-z].*?:\s+/.test(l)) break;

    // ignorar paging
    if (/----\s*More\s*\(/i.test(l)) continue;

    const t = l.trim();
    if (t) out.push(t);
  }

  const joined = out.join(" ").replace(/\s+/g, " ").trim();
  return joined || null;
}

async function status(req, res) {
  const session = getOltSession("default");
  return res.json({ ok: true, status: session.status() });
}

// GET /api/olt/test  -> display time
async function testTime(req, res) {
  const debug = parseBool(req.query.debug);
  const session = getOltSession("default");

  try {
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
          message:
            "OLT: la IP/usuario está bloqueada por intentos. Desbloquear en OLT o esperar expiración.",
        },
      });
    }

    return res.status(500).json({ ok: false, error: serializeErr(err) });
  }
}

// POST /api/olt/exec  { cmdId, args }
async function exec(req, res) {
  const debug = parseBool(req.query.debug);
  const { cmdId, args } = req.body || {};
  const session = getOltSession("default");

  try {
    if (!cmdId) {
      return res.status(400).json({ ok: false, error: { message: "cmdId requerido" } });
    }

    if (cmdId === "ONT_INFO_BY_SN") {
      const sn = String(args?.sn || "").trim().toUpperCase();

      if (!/^[0-9A-F]{16}$/i.test(sn)) {
        return res.status(400).json({
          ok: false,
          error: { message: "SN inválido (debe ser HEX de 16 chars)" },
        });
      }

      // asegurar contexto (si ya estás, no pasa nada relevante)
      await session.run("enable", { debug }).catch(() => {});
      await session.run("config", { debug }).catch(() => {});

      const cmd = `display ont info by-sn  ${sn}`;
      const raw = await session.run(cmd, { debug });

      // parse
      const fsp = extractStrField(raw, "F\\/S\\/P");
      const ontId = extractIntField(raw, "ONT-ID");
      const runState = extractStrField(raw, "Run state");
      const description = extractDescription(raw);

      const ontLastDistanceM = extractIntField(raw, "ONT last distance\\(m\\)");

      const lastDownCause = extractStrField(raw, "Last down cause");
      const lastUpTime = extractStrField(raw, "Last up time");
      const lastDownTime = extractStrField(raw, "Last down time");
      const lastDyingGaspTime = extractStrField(raw, "Last dying gasp time");
      const onlineDuration = extractStrField(raw, "ONT online duration");

      const payload = {
        ok: true,
        cmdId: "ONT_INFO_BY_SN",
        sn,
        fsp,
        ontId,
        runState,
        description,
        ontLastDistanceM,
        lastDownCause,
        lastUpTime,
        lastDownTime,
        lastDyingGaspTime,
        onlineDuration,
      };

      if (debug) payload.raw = raw;
      return res.json(payload);
    }

    return res.status(400).json({
      ok: false,
      error: { message: `cmdId no soportado: ${cmdId}` },
    });
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
          message:
            "OLT: la IP/usuario está bloqueada por intentos. Desbloquear en OLT o esperar expiración.",
        },
      });
    }

    return res.status(500).json({ ok: false, error: serializeErr(err) });
  }
}

// POST /api/olt/close  (opcional)
async function close(req, res) {
  const session = getOltSession("default");
  await session.close("manual");
  return res.json({ ok: true, message: "Sesión cerrada" });
}

module.exports = { status, testTime, exec, close };
