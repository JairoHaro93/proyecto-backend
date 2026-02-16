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

const RE_TIME = /\b\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2}(?:[+-]\d{2}:\d{2})?\b/;

function extractTime(raw = "") {
  const m = String(raw).match(RE_TIME);
  return m ? m[0] : null;
}

function extractIntField(raw, labelRe) {
  const re = new RegExp(`^\\s*${labelRe}\\s*:\\s*(\\d+)\\s*$`, "im");
  const m = String(raw).match(re);
  return m ? Number(m[1]) : null;
}

function extractStrField(raw, labelRe) {
  const re = new RegExp(`^\\s*${labelRe}\\s*:\\s*(.+?)\\s*$`, "im");
  const m = String(raw).match(re);
  if (!m) return null;
  return String(m[1]).replace(/\s+/g, " ").trim();
}

function extractFloatField(raw, labelRe) {
  const re = new RegExp(
    `^\\s*${labelRe}\\s*:\\s*([+-]?[0-9]+(?:\\.[0-9]+)?)\\s*$`,
    "im",
  );
  const m = String(raw).match(re);
  return m ? Number(m[1]) : null;
}

function extractDescription(raw = "") {
  const lines = String(raw).split("\n");
  const idx = lines.findIndex((l) => /^\s*Description\s*:/.test(l));
  if (idx === -1) return null;

  const out = [];
  const first = lines[idx].split(":").slice(1).join(":").trim();
  if (first) out.push(first);

  for (let i = idx + 1; i < lines.length; i++) {
    const l = lines[i];

    // corta si aparece otro campo
    if (/^\s*[A-Za-z].*?:\s+/.test(l)) break;

    // ignora paging
    if (/----\s*More\s*\(/i.test(l)) continue;

    const t = l.trim();
    if (t) out.push(t);
  }

  const joined = out.join(" ").replace(/\s+/g, " ").trim();
  return joined || null;
}

// ✅ F/S/P
function extractFSP(raw = "") {
  const re = /^\s*F\/S\/P\s*:\s*(\d+)\/(\d+)\/(\d+)\s*$/im;
  const m = String(raw).match(re);
  return m ? `${m[1]}/${m[2]}/${m[3]}` : null;
}

// ✅ service-ports (tu parser lo dejo, pero ojo que la tabla varía según config)
function parseServicePorts(raw = "") {
  const lines = String(raw).split("\n");
  const servicePorts = [];

  for (const line of lines) {
    const match = line.match(
      /^\s*(\d+)\s+(\d+)\s+\S+\s+gpon\s+(\S+)\s+\/(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+\d+\s+\d+\s+(\S+)/,
    );

    if (match) {
      servicePorts.push({
        index: Number(match[1]),
        vlanId: Number(match[2]),
        fsp: match[3],
        ontId: Number(match[5]),
        gemIndex: Number(match[6]),
        flowType: match[7],
        flowPara: match[8],
        state: match[9],
      });
    }
  }

  return servicePorts;
}

// =========================
//  SN NORMALIZATION
// =========================
function ascii4ToHex8(prefix4) {
  // "TPLG" => "54504C47"
  return prefix4
    .split("")
    .map((ch) => ch.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/**
 * Acepta:
 * - HEX16: 54504C479346E80F
 * - TPLG934700ED
 * - TPLG-934700ED
 */
function normalizeSn(input = "") {
  const raw = String(input || "")
    .trim()
    .toUpperCase();
  const compact = raw.replace(/[\s-]/g, "");

  // HEX16
  if (/^[0-9A-F]{16}$/.test(compact)) {
    return { ok: true, snHex: compact, snInput: raw, snLabel: raw };
  }

  // AAAA + 8hex  => (ASCII AAAA en hex8) + 8hex
  if (/^[A-Z]{4}[0-9A-F]{8}$/.test(compact)) {
    const pref = compact.slice(0, 4);
    const tail = compact.slice(4);
    const snHex = ascii4ToHex8(pref) + tail;
    const snLabel = `${pref}-${tail}`;
    return { ok: true, snHex, snInput: raw, snLabel };
  }

  return { ok: false, snHex: null, snInput: raw, snLabel: null };
}

// dentro de olt.controller.js (mismo archivo donde están status/testTime/exec/close)

async function ready(req, res) {
  const debug = parseBool(req.query.debug);
  const session = getOltSession("default");
  const opts = debug ? { debug: true, timeout: 12000 } : { timeout: 12000 };

  try {
    // 1) fuerza modo config (si está gpon/enable/user lo corrige)
    await ensureConfig(session, debug);

    // 2) comando simple de salud
    const raw = await session.run("display time", opts);
    const time = extractTime(raw);

    // 3) vuelve a asegurar config por si el comando movió algo
    await ensureConfig(session, debug);

    const payload = {
      ok: true,
      ready: true,
      message: "OLT READY",
      time,
      status: session.status(),
    };

    if (debug) payload.raw = raw;
    return res.json(payload);
  } catch (err) {
    const msg = String(err?.message || "");

    if (err instanceof OltHttpError && err.status) {
      return res
        .status(err.status)
        .json({ ok: false, ready: false, error: { message: msg } });
    }

    if (/IP address has been locked|cannot log on|locked/i.test(msg)) {
      return res.status(500).json({
        ok: false,
        ready: false,
        error: {
          name: "Error",
          message:
            "OLT: la IP/usuario está bloqueada por intentos. Desbloquear en OLT o esperar expiración.",
        },
      });
    }

    return res
      .status(500)
      .json({ ok: false, ready: false, error: serializeErr(err) });
  }
}

// =========================
//  SESSION MODE GUARD
// =========================
async function ensureConfig(session, debug) {
  const opts = debug ? { debug: true } : {};
  const mode = session.status().mode; // user | enable | config | gpon | unknown

  if (mode === "config") return;

  if (mode === "gpon") {
    await session.run("quit", opts).catch(() => {});
    await new Promise((r) => setTimeout(r, 120));
    return;
  }

  if (mode === "enable") {
    await session.run("config", opts).catch(() => {});
    await new Promise((r) => setTimeout(r, 120));
    return;
  }

  await session.run("enable", opts).catch(() => {});
  await session.run("config", opts).catch(() => {});
  await new Promise((r) => setTimeout(r, 120));
}

function isBadFirstResponse(raw = "") {
  const s = String(raw || "");
  return (
    /% Unknown command/i.test(s) ||
    /the error locates at/i.test(s) ||
    /displayontinfo/i.test(s) ||
    /displayontinfoby-sn/i.test(s) ||
    /config\s+displayont/i.test(s)
  );
}

async function runOntInfoBySnWithRetry(session, snHex, opts, debug) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    await ensureConfig(session, debug);

    const cmd = `display ont info by-sn  ${snHex}`;
    const raw = await session.run(cmd, opts);

    const fsp = extractFSP(raw);
    const ontId = extractIntField(raw, "ONT-ID");

    if (fsp && ontId !== null && !isBadFirstResponse(raw)) {
      return { raw, fsp, ontId };
    }

    if (attempt === 1) {
      await session.close("retry_bad_first_response").catch(() => {});
      await new Promise((r) => setTimeout(r, 150));
      continue;
    }

    return { raw, fsp: null, ontId: null };
  }
}

// =========================
//  ROUTE HANDLERS
// =========================
async function status(req, res) {
  const session = getOltSession("default");
  return res.json({ ok: true, status: session.status() });
}

async function testTime(req, res) {
  const debug = parseBool(req.query.debug);
  const session = getOltSession("default");

  try {
    const opts = debug ? { debug: true } : {};
    const raw = await session.run("display time", opts);
    const time = extractTime(raw);
    if (!debug) return res.json({ ok: true, message: "OK", time });
    return res.json({ ok: true, message: "OK", time, raw });
  } catch (err) {
    const msg = String(err?.message || "");

    if (err instanceof OltHttpError && err.status) {
      return res
        .status(err.status)
        .json({ ok: false, error: { message: msg } });
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

// POST /api/olt/exec  { cmdId, args }
async function exec(req, res) {
  const debug = parseBool(req.query.debug); // puedes dejarlo aunque Angular no lo use
  const { cmdId, args } = req.body || {};
  const session = getOltSession("default");
  const opts = debug ? { debug: true } : {};

  try {
    if (!cmdId) {
      return res
        .status(400)
        .json({ ok: false, error: { message: "cmdId requerido" } });
    }

    // =======================
    // ONT_INFO_BY_SN (SIEMPRE CON POTENCIA)
    // =======================
    if (cmdId === "ONT_INFO_BY_SN") {
      const snInput = String(args?.sn || "").trim();
      const n = normalizeSn(snInput);

      if (!n.ok) {
        return res.status(400).json({
          ok: false,
          error: {
            message:
              "SN inválido (use HEX16 o formato TPLG934700ED / TPLG-934700ED)",
          },
        });
      }

      console.log(
        `[OLT] 📡 Consulta ONT: input="${n.snInput}" hex="${n.snHex}"`,
      );

      const r = await runOntInfoBySnWithRetry(session, n.snHex, opts, debug);
      const raw = r.raw;
      const fsp = r.fsp;
      const ontId = r.ontId;

      if (!fsp || ontId === null) {
        return res.status(500).json({
          ok: false,
          error: { message: "No se pudo obtener F/S/P u ONT-ID (2 intentos)" },
        });
      }

      const runState = extractStrField(raw, "Run state");
      const description = extractDescription(raw);

      const payload = {
        ok: true,
        cmdId: "ONT_INFO_BY_SN",
        sn: n.snHex, // ✅ siempre en HEX16
        snLabel: n.snLabel, // ✅ ej: TPLG-934700ED
        snInput: n.snInput,
        fsp,
        ontId,
        runState,
        description,

        ontLastDistanceM: extractIntField(raw, "ONT last distance\\(m\\)"),
        lastDownCause: extractStrField(raw, "Last down cause"),
        lastUpTime: extractStrField(raw, "Last up time"),
        lastDownTime: extractStrField(raw, "Last down time"),
        lastDyingGaspTime: extractStrField(raw, "Last dying gasp time"),
        onlineDuration: extractStrField(raw, "ONT online duration"),
      };

      // ✅ SIEMPRE intentamos potencia cuando está ONLINE
      const isOnline = String(runState || "").toLowerCase() === "online";

      if (isOnline) {
        const [f, s, p] = fsp.split("/").map((x) => Number(x));

        if (Number.isFinite(f) && Number.isFinite(s) && Number.isFinite(p)) {
          await ensureConfig(session, debug);
          await session.run(`interface gpon ${f}/${s}`, opts);

          const rawOpt = await session.run(
            `display ont optical-info ${p} ${ontId}`,
            opts,
          );

          await session.run("quit", opts).catch(() => {});
          await ensureConfig(session, debug);

          if (/Failure:\s*The ONT is not online/i.test(rawOpt)) {
            payload.optical = {
              available: false,
              reason: "ONT is not online",
              rxDbm: null,
              txDbm: null,
              oltRxDbm: null,
            };
          } else {
            // parse
            let rxDbm = extractFloatField(rawOpt, "Rx optical power\\(dBm\\)");
            let txDbm = extractFloatField(rawOpt, "Tx optical power\\(dBm\\)");
            let oltRxDbm = extractFloatField(
              rawOpt,
              "OLT Rx ONT optical power\\(dBm\\)",
            );

            // retry 1 vez si sale null (sin depender de debug)
            if (rxDbm === null || txDbm === null || oltRxDbm === null) {
              await ensureConfig(session, debug);
              await session.run(`interface gpon ${f}/${s}`, opts);
              const rawOpt2 = await session.run(
                `display ont optical-info ${p} ${ontId}`,
                opts,
              );
              await session.run("quit", opts).catch(() => {});
              await ensureConfig(session, debug);

              rxDbm =
                rxDbm ??
                extractFloatField(rawOpt2, "Rx optical power\\(dBm\\)");
              txDbm =
                txDbm ??
                extractFloatField(rawOpt2, "Tx optical power\\(dBm\\)");
              oltRxDbm =
                oltRxDbm ??
                extractFloatField(rawOpt2, "OLT Rx ONT optical power\\(dBm\\)");
            }

            payload.optical = { available: true, rxDbm, txDbm, oltRxDbm };
          }

          if (debug) payload.rawOpt = rawOpt;
        } else {
          payload.optical = {
            available: false,
            reason: `F/S/P inválido: ${fsp}`,
            rxDbm: null,
            txDbm: null,
            oltRxDbm: null,
          };
        }
      } else {
        payload.optical = {
          available: false,
          reason: "ONT offline",
          rxDbm: null,
          txDbm: null,
          oltRxDbm: null,
        };
      }

      if (debug) payload.raw = raw;

      console.log(
        `[OLT] ✅ OK: ${n.snHex} FSP=${fsp} ONT=${ontId} state=${runState} optical=${payload.optical?.available}`,
      );

      return res.json(payload);
    }

    // =======================
    // ONT_DELETE (opcional, tu lógica)
    // =======================
    if (cmdId === "ONT_DELETE") {
      const snInput = String(args?.sn || "").trim();
      const n = normalizeSn(snInput);

      if (!n.ok) {
        return res.status(400).json({
          ok: false,
          error: {
            message:
              "SN inválido (use HEX16 o formato TPLG934700ED / TPLG-934700ED)",
          },
        });
      }

      await ensureConfig(session, debug);

      // 1) info ONT
      const rawInfo = await session.run(
        `display ont info by-sn  ${n.snHex}`,
        opts,
      );

      if (
        /Failure:\s*The ONT does not exist/i.test(rawInfo) ||
        /Failure:/i.test(rawInfo)
      ) {
        return res.status(404).json({
          ok: false,
          error: { message: "La ONT no existe en la OLT" },
        });
      }

      const fsp = extractFSP(rawInfo);
      const ontId = extractIntField(rawInfo, "ONT-ID");
      const runState = extractStrField(rawInfo, "Run state");
      const description = extractDescription(rawInfo);

      if (!fsp || ontId === null) {
        return res.status(500).json({
          ok: false,
          error: { message: "No se pudo extraer F/S/P u ONT-ID de la ONT" },
        });
      }

      const isOnline = String(runState || "").toLowerCase() === "online";

      // 2) service-ports
      const rawSp = await session.run(
        `display service-port port ${fsp} ont ${ontId}`,
        opts,
      );
      const servicePorts = parseServicePorts(rawSp);

      const deletedServicePorts = [];
      const failedServicePorts = [];

      for (const sp of servicePorts) {
        try {
          await session.run(`undo service-port ${sp.index}`, opts);
          deletedServicePorts.push({
            index: sp.index,
            vlanId: sp.vlanId,
            success: true,
          });
        } catch (e) {
          failedServicePorts.push({
            index: sp.index,
            error: String(e?.message || e),
          });
        }
      }

      // 3) ont delete
      const [f, s, p] = fsp.split("/").map((x) => Number(x));
      if (!Number.isFinite(f) || !Number.isFinite(s) || !Number.isFinite(p)) {
        return res
          .status(500)
          .json({ ok: false, error: { message: `F/S/P inválido: ${fsp}` } });
      }

      await ensureConfig(session, debug);
      await session.run(`interface gpon ${f}/${s}`, opts);

      const rawDelete = await session.run(`ont delete ${p} ${ontId}`, opts);

      await session.run("quit", opts).catch(() => {});
      await ensureConfig(session, debug);

      const successMatch = rawDelete.match(/success:\s*(\d+)/i);
      const okDel = successMatch ? Number(successMatch[1]) === 1 : false;

      if (!okDel) {
        return res.status(500).json({
          ok: false,
          error: { message: "Fallo al eliminar la ONT", details: rawDelete },
          servicePorts: {
            deleted: deletedServicePorts,
            failed: failedServicePorts,
          },
        });
      }

      const payload = {
        ok: true,
        cmdId: "ONT_DELETE",
        message: "ONT eliminada exitosamente",
        sn: n.snHex,
        snLabel: n.snLabel,
        snInput: n.snInput,
        fsp,
        ontId,
        description,
        wasOnline: isOnline,
        servicePorts: {
          deleted: deletedServicePorts,
          failed: failedServicePorts,
        },
      };

      if (isOnline)
        payload.warning = "⚠️ La ONT estaba ONLINE al momento de eliminarla";

      if (debug) {
        payload.rawInfo = rawInfo;
        payload.rawSp = rawSp;
        payload.rawDelete = rawDelete;
      }

      return res.json(payload);
    }

    return res.status(400).json({
      ok: false,
      error: { message: `cmdId no soportado: ${cmdId}` },
    });
  } catch (err) {
    const msg = String(err?.message || "");

    if (err instanceof OltHttpError && err.status) {
      return res
        .status(err.status)
        .json({ ok: false, error: { message: msg } });
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

    console.log(`[OLT] ❌ Error general: ${msg}`);
    return res.status(500).json({ ok: false, error: serializeErr(err) });
  }
}

async function close(req, res) {
  const session = getOltSession("default");
  await session.close("manual");
  return res.json({ ok: true, message: "Sesión cerrada" });
}

module.exports = { status, testTime, ready, exec, close };
