// src/controllers/negocio_lat/olt.controller.js
require("dotenv").config();
const { OltClient } = require("../../utils/olt");

let oltBusy = false;
let lastFailAt = 0;

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

async function testConnection(req, res) {
  if (oltBusy) {
    return res.status(429).json({ ok: false, error: { message: "OLT: intento en curso" } });
  }

  const now = Date.now();
  const waitMs = 30_000;
  const diff = now - lastFailAt;
  if (diff < waitMs) {
    return res.status(429).json({
      ok: false,
      error: { message: `OLT: espera ${Math.ceil((waitMs - diff) / 1000)}s antes de reintentar` },
    });
  }

  oltBusy = true;

  const client = new OltClient({
    host: process.env.OLT_HOST,
    port: Number(process.env.OLT_PORT || 8090),
    username: process.env.OLT_USERNAME,
    password: process.env.OLT_PASSWORD,
    timeout: Number(process.env.OLT_TIMEOUT_MS || 20000),
    debug: parseBool(req.query.debug),
    showCreds: parseBool(req.query.showCreds),
  });

  try {
    await client.connect();

    // Por seguridad, drenamos una vez más antes del comando
    await client.drain();

    const out = await client.exec("display time");

    return res.json({
      ok: true,
      message: "Conexión OK y comando ejecutado.",
      output: out || "(sin salida)",
    });
  } catch (err) {
    lastFailAt = Date.now();

    const msg = String(err?.message || "");
    if (/IP address has been locked/i.test(msg) || /cannot log on/i.test(msg) || /locked/i.test(msg)) {
      return res.status(500).json({
        ok: false,
        error: {
          name: "Error",
          message:
            "OLT: la IP del servidor está bloqueada por intentos. Desbloquear en OLT o esperar expiración.",
        },
      });
    }

    return res.status(500).json({ ok: false, error: serializeErr(err) });
  } finally {
    oltBusy = false;
    try { await client.end(); } catch {}
  }
}

module.exports = { testConnection };
