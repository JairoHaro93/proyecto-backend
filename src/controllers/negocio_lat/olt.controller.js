// src/controllers/negocio_lat/olt.controller.js
require("dotenv").config();
const { getOltSession } = require("../../utils/olt.session");

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

// ✅ Endpoint base: ejecuta comando básico y devuelve fecha limpia
async function testTime(req, res) {
  const debug = parseBool(req.query.debug);

  // ⚠️ recomendado: NO exponer showCreds por query en prod
  // Si lo quieres mantener para diagnóstico extremo, que SOLO se use si debug=true
  const showCreds = debug && parseBool(req.query.showCreds);

  try {
    const session = getOltSession();

    const raw = await session.run("display time", { debug, showCreds });

    const time = extractTime(raw);

    // ✅ respuesta limpia por defecto
    if (!debug) {
      return res.json({ ok: true, message: "OK", time });
    }

    // 🧪 debug: incluye raw
    return res.json({ ok: true, message: "OK", time, raw });
  } catch (err) {
    const msg = String(err?.message || "");

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

module.exports = { testTime };
