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

// GET /api/olt/test
async function testTime(req, res) {
  const debug = parseBool(req.query.debug);
  const profile = String(req.query.profile || "default");

  try {
    const session = getOltSession(profile);

    const raw = await session.run("display time", { debug });
    const time = extractTime(raw);

    if (!debug) return res.json({ ok: true, message: "OK", time });
    return res.json({ ok: true, message: "OK", time, raw });
  } catch (err) {
    const msg = String(err?.message || "");

    // status controlado desde session manager
    if (err instanceof OltHttpError && err.status) {
      return res.status(err.status).json({ ok: false, error: { message: msg } });
    }

    // bloqueo típico Huawei
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

// GET /api/olt/status
async function getStatus(req, res) {
  const profile = String(req.query.profile || "default");
  try {
    const session = getOltSession(profile);
    return res.json({ ok: true, status: session.status() });
  } catch (err) {
    return res.status(500).json({ ok: false, error: serializeErr(err) });
  }
}

module.exports = { testTime, getStatus };
