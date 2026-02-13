// src/controllers/negocio_lat/olt.controller.js
require("dotenv").config();
const { getOltSession, OltHttpError } = require("../../utils/olt.session");

function parseBool(v) {
  return String(v || "").toLowerCase() === "true";
}

function extractTime(raw = "") {
  const m = String(raw).match(
    /\b\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2}(?:[+-]\d{2}:\d{2})?\b/
  );
  return m ? m[0] : null;
}

function serializeErr(err) {
  return {
    name: err?.name,
    message: err?.message || String(err),
    code: err?.code,
  };
}

async function testTime(req, res) {
  const debug = parseBool(req.query.debug);

  try {
    const session = getOltSession();

    const raw = await session.run("display time", { debug });
    const time = extractTime(raw);

    if (!debug) return res.json({ ok: true, message: "OK", time });
    return res.json({ ok: true, message: "OK", time, raw });
  } catch (err) {
    if (err instanceof OltHttpError) {
      return res.status(err.status).json({ ok: false, error: { message: err.message } });
    }

    const msg = String(err?.message || "");
    if (/IP address has been locked|cannot log on|locked/i.test(msg)) {
      return res.status(500).json({
        ok: false,
        error: { message: "OLT: la IP/usuario está bloqueada. Desbloquear en OLT o esperar expiración." },
      });
    }

    return res.status(500).json({ ok: false, error: serializeErr(err) });
  }
}

module.exports = { testTime };
