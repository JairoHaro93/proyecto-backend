// src/controllers/negocio_lat/olt.controller.js
require("dotenv").config();
const { getOltSession, OltHttpError } = require("../../utils/olt.session");

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

function pickLineValue(raw, label) {
  const re = new RegExp(`${label}\\s*:\\s*([^\\n\\r]+)`, "i");
  const m = String(raw).match(re);
  return m ? m[1].trim() : null;
}

function extractBlock(raw, label) {
  const s = String(raw);
  const i = s.search(new RegExp(`${label}\\s*:`, "i"));
  if (i < 0) return null;

  const after = s.slice(i);
  const m = after.match(
    new RegExp(
      `${label}\\s*:\\s*([\\s\\S]*?)(?=\\n\\s*[A-Za-z0-9\\-\\/() ]+\\s*:\\s*|$)`,
      "i"
    )
  );

  if (!m) return null;
  return m[1]
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .join(" ");
}

function parseOntInfo(raw) {
  const fsp = pickLineValue(raw, "F/S/P");
  const ontIdStr = pickLineValue(raw, "ONT-ID");
  const runState = pickLineValue(raw, "Run state");
  const description = extractBlock(raw, "Description");

  const lastDownCause = pickLineValue(raw, "Last down cause");
  const lastUpTime = pickLineValue(raw, "Last up time");
  const lastDownTime = pickLineValue(raw, "Last down time");
  const lastDyingGaspTime = pickLineValue(raw, "Last dying gasp time");
  const onlineDuration = pickLineValue(raw, "ONT online duration");

  return {
    fsp: fsp || null,
    ontId: ontIdStr ? Number(ontIdStr) : null,
    runState: runState || null,
    description: description || null,
    lastDownCause: lastDownCause || null,
    lastUpTime: lastUpTime || null,
    lastDownTime: lastDownTime || null,
    lastDyingGaspTime: lastDyingGaspTime || null,
    onlineDuration: onlineDuration || null,
  };
}

function extractTime(raw = "") {
  const m = String(raw).match(
    /\b\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2}(?:[+-]\d{2}:\d{2})?\b/
  );
  return m ? m[0] : null;
}

async function status(req, res) {
  const session = getOltSession();
  return res.json({ ok: true, status: session.status() });
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
    const msg = String(err?.message || "");

    if (err instanceof OltHttpError && err.status) {
      return res.status(err.status).json({ ok: false, error: { message: msg } });
    }

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

async function exec(req, res) {
  const debug = parseBool(req.query.debug);

  const cmdId = String(req.body?.cmdId || "").trim();
  const args = req.body?.args || {};

  if (!cmdId) return res.status(400).json({ ok: false, error: { message: "cmdId requerido" } });

  try {
    const session = getOltSession();

    if (cmdId === "ONT_INFO_BY_SN") {
      const sn = String(args?.sn || "").trim();
      if (!sn) return res.status(400).json({ ok: false, error: { message: "args.sn requerido" } });

      // Aseguramos config para que el comando exista
      await session.ensureConfig({ debug });

      const cmd = `display ont info by-sn  ${sn}`;
      const raw = await session.run(cmd, { debug });

      const info = parseOntInfo(raw);

      if (!debug) {
        return res.json({
          ok: true,
          cmdId,
          sn,
          ...info,
        });
      }

      return res.json({
        ok: true,
        cmdId,
        sn,
        cmd,
        ...info,
        raw,
      });
    }

    return res.status(400).json({
      ok: false,
      error: { message: `cmdId no soportado: ${cmdId}` },
    });
  } catch (err) {
    const msg = String(err?.message || "");

    if (err instanceof OltHttpError && err.status) {
      return res.status(err.status).json({ ok: false, error: { message: msg } });
    }

    return res.status(500).json({ ok: false, error: serializeErr(err) });
  }
}

module.exports = { status, testTime, exec };
