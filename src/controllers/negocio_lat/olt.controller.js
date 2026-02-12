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
    errno: err?.errno,
    syscall: err?.syscall,
    address: err?.address,
    port: err?.port,
    host: err?.host,
  };
}

async function testConnection(req, res) {
  // Evita que 2 requests simultáneos te bloqueen IP/usuario
  if (oltBusy) {
    return res
      .status(429)
      .json({ ok: false, error: { message: "OLT: intento en curso" } });
  }

  // Cooldown tras fallo (para no disparar lock en la OLT)
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

    // prueba simple (como tu telnet manual)
    const out = await client.exec("display time");

    return res.json({
      ok: true,
      message: "Conexión OK y comando ejecutado.",
      output: out || "(sin salida)",
    });
  } catch (err) {
    lastFailAt = Date.now();
    console.error("❌ OLT testConnection error:", err);

    // Si Huawei responde lock, devuélvelo bonito
    const msg = String(err?.message || "");
    if (/locked/i.test(msg)) {
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
