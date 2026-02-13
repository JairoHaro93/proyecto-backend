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

/**
 * ✅ WHITELIST de comandos (por cmdId)
 * Agrega aquí nuevos comandos, siempre read-only al inicio.
 */
const COMMANDS = {
  TIME: {
    build: () => "display time",
    parse: (raw) => ({ time: extractTime(raw) }),
  },

  // Ejemplo (si lo quieres probar luego):
  // VERSION: { build: () => "display version" },
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
