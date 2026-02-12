// src/controllers/negocio_lat/olt.controller.js
require("dotenv").config();
const { OltClient } = require("../../utils/olt");

let oltBusy = false;
let lastFailAt = 0;
const COOLDOWN_MS = 30_000;

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
  if (now - lastFailAt < COOLDOWN_MS) {
    const wait = Math.ceil((COOLDOWN_MS - (now - lastFailAt)) / 1000);
    return res.status(429).json({ ok: false, error: { message: `OLT: espera ${wait}s antes de reintentar` } });
  }

  oltBusy = true;

  const client = new OltClient({
    host: process.env.OLT_HOST,
    port: Number(process.env.OLT_PORT || 8090),
    username: process.env.OLT_USERNAME,
    password: process.env.OLT_PASSWORD,
    timeout: Number(process.env.OLT_TIMEOUT_MS || 20000),
    debug: String(req.query.debug || "").toLowerCase() === "true",

    // puedes ajustar desde query si quieres
    userEol: req.query.userEol || "CRLF",
    passEol: req.query.passEol || "CRLF",
    typeMsUser: Number(req.query.typeMsUser || 0),
    typeMsPass: Number(req.query.typeMsPass || 30), // 👈 recomendado para password
  });

  try {
    await client.connect();
    const out = await client.exec("display time");
    return res.json({ ok: true, message: "Conexión OK y comando ejecutado.", output: out || "(sin salida)" });
  } catch (err) {
    lastFailAt = Date.now();
    return res.status(500).json({ ok: false, error: serializeErr(err) });
  } finally {
    oltBusy = false;
    try { await client.end(); } catch {}
  }
}

module.exports = { testConnection };
