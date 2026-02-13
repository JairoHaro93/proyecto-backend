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

const DT_REGEX = /\b\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2}(?:[+-]\d{2}:\d{2})?\b/;

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
  // desde label hasta el próximo "Algo :"
  const m = after.match(
    new RegExp(`${label}\\s*:\\s*([\\s\\S]*?)(?=\\n\\s*[A-Za-z0-9\\-\\/() ]+\\s*:\\s*|$)`, "i")
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
  const lastUpTime = pickLineValue(raw, "Last up time") || (String(raw).match(/Last up time\s*:\s*([^\n\r]+)/i)?.[1]?.trim() ?? null);
  const lastDownTime = pickLineValue(raw, "Last down time") || (String(raw).match(/Last down time\s*:\s*([^\n\r]+)/i)?.[1]?.trim() ?? null);
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

function parseOptical(raw) {
  const s = String(raw);

  if (/Failure:\s*The ONT is not online/i.test(s)) {
    return { ok: false, reason: "ONT_NOT_ONLINE" };
  }

  const rx = s.match(/Rx optical power\(dBm\)\s*:\s*([-\d.]+)/i);
  const tx = s.match(/Tx optical power\(dBm\)\s*:\s*([-\d.]+)/i);
  const oltRx = s.match(/OLT Rx ONT optical power\(dBm\)\s*:\s*([-\d.]+)/i);

  const rxDbm = rx ? Number(rx[1]) : null;
  const txDbm = tx ? Number(tx[1]) : null;
  const oltRxDbm = oltRx ? Number(oltRx[1]) : null;

  // si no encontró nada útil, igual devolvemos nulls
  return { ok: true, rxDbm, txDbm, oltRxDbm };
}

function extractTime(raw = "") {
  const m = String(raw).match(DT_REGEX);
  return m ? m[0] : null;
}

/** GET /api/olt/status */
async function status(req, res) {
  const profile = String(req.query.profile || "default");
  const session = getOltSession(profile);
  return res.json({ ok: true, status: session.status() });
}

/** GET /api/olt/test  -> display time */
async function testTime(req, res) {
  const debug = parseBool(req.query.debug);
  const profile = String(req.query.profile || "default");

  try {
    const session = getOltSession(profile);
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

/** POST /api/olt/exec  body: { cmdId, args } */
async function exec(req, res) {
  const debug = parseBool(req.query.debug);
  const profile = String(req.query.profile || "default");

  const cmdId = String(req.body?.cmdId || "").trim();
  const args = req.body?.args || {};

  if (!cmdId) return res.status(400).json({ ok: false, error: { message: "cmdId requerido" } });

  try {
    const session = getOltSession(profile);

    // ============================================================
    // ONT_INFO_BY_SN  -> resumen + potencia
    // ============================================================
    if (cmdId === "ONT_INFO_BY_SN") {
      const sn = String(args?.sn || "").trim();
      if (!sn) return res.status(400).json({ ok: false, error: { message: "args.sn requerido" } });

      // 1) asegurar config y ejecutar display ont info by-sn
      await session.ensureConfig({ debug });
      const cmd1 = `display ont info by-sn  ${sn}`;
      const raw1 = await session.run(cmd1, { debug });

      const info = parseOntInfo(raw1);

      // Si no pudo sacar ontId/fsp, igual respondemos con lo que tenga
      let optical = null;

      // 2) si tenemos fsp y ontId, buscamos potencia
      if (info.fsp && info.ontId != null) {
        const [frame, slot, port] = info.fsp.split("/").map((x) => x.trim());
        const frameSlot = `${frame}/${slot}`; // "0/1"
        const p = Number(port);

        // entrar a interface gpon 0/1
        await session.enterGponView(frameSlot, { debug });

        const cmd2 = `display ont optical-info ${p} ${info.ontId}`;
        const raw2 = await session.run(cmd2, { debug });

        // salir a config para no quedarnos en interface
        await session.exitOneLevel({ debug });

        const opt = parseOptical(raw2);
        optical = opt.ok ? { rxDbm: opt.rxDbm, txDbm: opt.txDbm, oltRxDbm: opt.oltRxDbm } : { error: opt.reason };

        if (debug) {
          return res.json({
            ok: true,
            cmdId,
            sn,
            cmd: cmd1,
            ...info,
            optical,
            raw: { ontInfo: raw1, optical: raw2 },
          });
        }
      }

      // respuesta normal (sin raw)
      return res.json({
        ok: true,
        cmdId,
        sn,
        ...info,
        optical,
      });
    }

    // Si llega cmdId no soportado
    return res.status(400).json({
      ok: false,
      error: { message: `cmdId no soportado: ${cmdId}` },
    });
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

module.exports = { status, testTime, exec };
