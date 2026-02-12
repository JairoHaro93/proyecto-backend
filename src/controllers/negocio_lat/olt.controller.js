// src/modules/olt/olt.controller.js
require("dotenv").config();
const { OltClient } = require("../../utils/olt"); // ajusta path si difiere

function parseBool(v) {
  return String(v || "").toLowerCase() === "true";
}
function pick(v, def) {
  return v === undefined ? def : v;
}
function serializeErr(err) {
  // Node suele devolver AggregateError con .errors[]
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

async function testConnection(req, res) {
  const client = new OltClient({
    host: process.env.OLT_HOST,
    port: Number(process.env.OLT_PORT || 8090),
    username: process.env.OLT_USERNAME,
    password: process.env.OLT_PASSWORD,
    timeout: Number(process.env.OLT_TIMEOUT_MS || 8000),
    debug: String(req.query.debug || "").toLowerCase() === "true",
    showCreds: String(req.query.showCreds || "").toLowerCase() === "true",
    userEol: req.query.userEol || "CRLF",
    passEol: req.query.passEol || "CRLF",
    typeMsUser: Number(req.query.typeMsUser || 0),
    typeMsPass: Number(req.query.typeMsPass || 0),
  });


  console.log("OLT ENV:", {
  host: process.env.OLT_HOST,
  port: process.env.OLT_PORT,
  user: process.env.OLT_USERNAME,
  timeout: process.env.OLT_TIMEOUT_MS,
});


  try {
    await client.connect();
    const out = await client.exec("display time");
    return res.json({ ok: true, message: "Conexión OK y comando ejecutado.", output: out || "(sin salida)" });
  } catch (err) {
    console.error("❌ OLT testConnection error:", err);
    return res.status(500).json({ ok: false, error: serializeErr(err) });
  } finally {
    // MUY importante: que end() no genere otro error y te cambie el resultado
    try { await client.end(); } catch (_) {}
  }
}

module.exports = { testConnection };


