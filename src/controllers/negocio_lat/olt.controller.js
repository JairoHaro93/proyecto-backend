// src/modules/olt/olt.controller.js
require("dotenv").config();
const { OltClient } = require("../../utils/olt"); // ajusta path si difiere

function parseBool(v) {
  return String(v || "").toLowerCase() === "true";
}
function pick(v, def) {
  return v === undefined ? def : v;
}

async function testConnection(req, res) {
  const client = new OltClient({
    host: process.env.OLT_HOST,
    port: Number(process.env.OLT_PORT || 8090),
    username: process.env.OLT_USERNAME,
    password: process.env.OLT_PASSWORD,
    timeout: Number(process.env.OLT_TIMEOUT_MS || 8000),
    debug: parseBool(req.query.debug),
    showCreds: parseBool(req.query.showCreds),

    // ✅ desde query
    userEol: pick(req.query.userEol, "CRLF"), // "CRLF" | "CR" | "LF"
    passEol: pick(req.query.passEol, "CRLF"),
    typeMsUser: Number(req.query.typeMsUser || 0),
    typeMsPass: Number(req.query.typeMsPass || 0),
  });

  try {
    await client.connect();
    const out = await client.exec("display time"); // o 'display clock'
    res.json({
      ok: true,
      message: "Conexión OK y comando ejecutado.",
      output: out || "(sin salida)",
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || String(err) });
  } finally {
    await client.end();
  }
}

module.exports = { testConnection };
