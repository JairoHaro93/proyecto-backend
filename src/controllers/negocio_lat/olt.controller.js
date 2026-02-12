// src/modules/olt/olt.controller.js
require("dotenv").config();
const { OltClient } = require("../../utils/olt");

// ===============================
// Helpers
// ===============================
function serializeErr(err) {
  if (err && err.name === "AggregateError") {
    const errors = (err.errors || []).map((e) => ({
      name: e?.name,
      message: e?.message,
      code: e?.code,
      errno: e?.errno,
      syscall: e?.syscall,
      address: e?.address,
      port: e?.port,
      host: e?.host,
    }));
    return {
      name: "AggregateError",
      message: "Todos los intentos de conexión fallaron",
      errors,
    };
  }

  return {
    name: err?.name,
    message: err?.message || String(err),
    code: err?.code,
    errno: err?.errno,
    syscall: err?.syscall,
    address: err?.address,
    port: err?.port,
    host: err?.host,
  };
}

// ===============================
// Anti-lock: 1 intento + cooldown
// ===============================
let oltBusy = false;
let lastFailAt = 0;
const COOLDOWN_MS = 30_000;

// ===============================
// Controller
// ===============================
async function testConnection(req, res) {
  if (oltBusy) {
    return res
      .status(429)
      .json({ ok: false, error: { message: "OLT: intento en curso" } });
  }

  const now = Date.now();
  if (now - lastFailAt < COOLDOWN_MS) {
    const waitMs = COOLDOWN_MS - (now - lastFailAt);
    return res.status(429).json({
      ok: false,
      error: { message: `OLT: espera ${Math.ceil(waitMs / 1000)}s antes de reintentar` },
    });
  }

  oltBusy = true;

  const client = new OltClient({
    host: process.env.OLT_HOST,
    port: Number(process.env.OLT_PORT || 8090),
    username: process.env.OLT_USERNAME,
    password: process.env.OLT_PASSWORD,
    timeout: Number(process.env.OLT_TIMEOUT_MS || 20000),
    debug: String(req.query.debug || "").toLowerCase() === "true",
    showCreds: String(req.query.showCreds || "").toLowerCase() === "true",
    userEol: req.query.userEol || "CRLF",
    passEol: req.query.passEol || "CRLF",
    typeMsUser: Number(req.query.typeMsUser || 0),
    typeMsPass: Number(req.query.typeMsPass || 0),
  });

  try {
    await client.connect();

    // útil para comandos largos (cuando el login ya funciona)
    await client.exec("screen-length 0 temporary");

    const out = await client.exec("display time");

    return res.json({
      ok: true,
      message: "Conexión OK y comando ejecutado.",
      output: out || "(sin salida)",
    });
  } catch (err) {
    lastFailAt = Date.now();
    console.error("❌ OLT testConnection error:", err);
    return res.status(500).json({ ok: false, error: serializeErr(err) });
  } finally {
    oltBusy = false;
    try {
      await client.end();
    } catch (_) {}
  }
}

module.exports = { testConnection };
