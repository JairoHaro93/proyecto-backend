// src/modules/olt/olt.controller.js
require("dotenv").config();
const { OltClient } = require("../../utils/olt"); // ajusta path si difiere

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
    return { name: "AggregateError", message: "Todos los intentos de conexión fallaron", errors };
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
    timeout: Number(process.env.OLT_TIMEOUT_MS || 20000),
    debug: String(req.query.debug || "").toLowerCase() === "true",
  });

  try {
    await client.connect();

    // opcional, pero útil para comandos largos
    await client.exec("screen-length 0 temporary");

    const out = await client.exec("display time");

    return res.json({ ok: true, message: "Conexión OK y comando ejecutado.", output: out || "(sin salida)" });
  } catch (err) {
    console.error("❌ OLT testConnection error:", err);
    return res.status(500).json({ ok: false, error: serializeErr(err) });
  } finally {
    try { await client.end(); } catch (_) {}
  }
}

module.exports = { testConnection };
