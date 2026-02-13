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

function extractHuaweiTime(raw = "") {
  // Ej: 12-02-2026 18:56:09-05:00
  const m = String(raw).match(
    /\b\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2}(?:[+-]\d{2}:\d{2})?\b/
  );
  return m ? m[0] : null;
}

async function testConnection(req, res) {
  // evita 2 requests simultáneos (bloqueo por intentos)
  if (oltBusy) {
    return res
      .status(429)
      .json({ ok: false, error: { message: "OLT: intento en curso" } });
  }

  // cooldown tras fallo (para no disparar lock)
  const now = Date.now();
  const waitMs = 30_000;
  const diff = now - lastFailAt;
  if (diff < waitMs) {
    return res.status(429).json({
      ok: false,
      error: {
        message: `OLT: espera ${Math.ceil((waitMs - diff) / 1000)}s antes de reintentar`,
      },
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

    // ✅ comando básico
    const raw = await client.exec("display time");
    const time = extractHuaweiTime(raw);

    return res.json({ ok: true, message: "OK", time, raw });
  } catch (err) {
    lastFailAt = Date.now();

    const msg = String(err?.message || "");
    if (
      /IP address has been locked/i.test(msg) ||
      /cannot log on/i.test(msg) ||
      /locked/i.test(msg)
    ) {
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
    try {
      await client.end();
    } catch {}
  }
}

module.exports = { testConnection };
