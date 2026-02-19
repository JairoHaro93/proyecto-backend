// src/controllers/negocio_lat/olt.controller.js
require("dotenv").config();
const { getOltSession, OltHttpError } = require("../../utils/olt.session");

// =========================
//  HELPERS BASICOS
// =========================
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

// Soporta:
//  - 16-02-2026 12:34:56
//  - 2026-02-16 12:34:56
//  - con zona: +06:00
const RE_TIME =
  /\b(?:\d{2}-\d{2}-\d{4}|\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}:\d{2}(?:[+-]\d{2}:\d{2})?\b/;

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
    if (/^\s*[A-Za-z].*?:\s+/.test(l)) break;
    if (/----\s*More\s*\(/i.test(l)) continue;
    const t = l.trim();
    if (t) out.push(t);
  }

  const joined = out.join(" ").replace(/\s+/g, " ").trim();
  return joined || null;
}

// ✅ F/S/P (soporta espacios tipo 0/ 1/2)
function extractFSP(raw = "") {
  const re = /^\s*F\/S\/P\s*:\s*(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)\s*$/im;
  const m = String(raw).match(re);
  return m ? `${m[1]}/${m[2]}/${m[3]}` : null;
}

function splitFspToNums(fsp = "") {
  const parts = String(fsp)
    .split("/")
    .map((x) => Number(String(x).trim()));
  if (parts.length !== 3) return null;
  const [f, s, p] = parts;
  if (![f, s, p].every((n) => Number.isFinite(n))) return null;
  return { f, s, p };
}

function isOltFailure(raw = "") {
  const s = String(raw || "");
  return (
    /(^|\n)\s*Failure:/i.test(s) ||
    /% Unknown command/i.test(s) ||
    /the error locates at/i.test(s)
  );
}
function isCliFailure(raw = "") {
  return isOltFailure(raw);
}

function sanitizeDesc(desc = "") {
  return String(desc || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/["']/g, "")
    .slice(0, 64);
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

// =========================
//  service-port parser
// =========================
function parseServicePorts(raw = "") {
  const lines = String(raw).split("\n");
  const out = [];

  for (const line of lines) {
    const mIndex = line.match(/^\s*(\d+)\s+/);
    if (!mIndex) continue;
    const index = Number(mIndex[1]);

    // Caso A: línea con "ont" y "gemport" explícitos
    const mA = line.match(/\bgpon\b\s+(\d+\s*\/\s*\d+\s*\/\s*\d+)/i);
    const mOnt = line.match(/\bont\b\s+(\d+)/i);
    const mGem = line.match(/\bgemport\b\s+(\d+)/i);
    const mVlan2 = line.match(/^\s*\d+\s+(\d+)\s+/);
    if (mA && mOnt && mGem) {
      const fsp = mA[1].replace(/\s+/g, "");
      const vlanId = mVlan2 ? Number(mVlan2[1]) : null;
      const ontId = Number(mOnt[1]);
      const gemIndex = Number(mGem[1]);
      const state = line.trim().split(/\s+/).at(-1) || null;
      out.push({ index, vlanId, fsp, ontId, gemIndex, state });
      continue;
    }

    // Caso B: tu tabla "Switch-Oriented Flow List"
    const tokens = line.trim().split(/\s+/);
    if (tokens.length < 8) continue;

    const vlanId = /^\d+$/.test(tokens[1]) ? Number(tokens[1]) : null;
    const gponIdx = tokens.findIndex((t) => String(t).toLowerCase() === "gpon");
    if (gponIdx === -1) continue;

    let fsp = null;
    let cursor = gponIdx + 1;
    if (cursor >= tokens.length) continue;

    if (tokens[cursor + 1] && String(tokens[cursor + 1]).startsWith("/")) {
      fsp = `${tokens[cursor]}${tokens[cursor + 1]}`.replace(/\s+/g, "");
      cursor += 2;
    } else {
      fsp = String(tokens[cursor]).replace(/\s+/g, "");
      cursor += 1;
    }

    const ontId =
      tokens[cursor] && /^\d+$/.test(tokens[cursor])
        ? Number(tokens[cursor])
        : null;
    const gemIndex =
      tokens[cursor + 1] && /^\d+$/.test(tokens[cursor + 1])
        ? Number(tokens[cursor + 1])
        : null;

    const state = tokens[tokens.length - 1] || null;
    out.push({ index, vlanId, fsp, ontId, gemIndex, state });
  }

  return out;
}

// =========================
//  SN NORMALIZATION
// =========================
function ascii4ToHex8(prefix4) {
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

  if (/^[0-9A-F]{16}$/.test(compact)) {
    return { ok: true, snHex: compact, snInput: raw, snLabel: raw };
  }

  if (/^[A-Z]{4}[0-9A-F]{8}$/.test(compact)) {
    const pref = compact.slice(0, 4);
    const tail = compact.slice(4);
    const snHex = ascii4ToHex8(pref) + tail;
    const snLabel = `${pref}-${tail}`;
    return { ok: true, snHex, snInput: raw, snLabel };
  }

  return { ok: false, snHex: null, snInput: raw, snLabel: null };
}

// =========================
//  AUTOFIND PARSER
// =========================
function hex8ToAscii4(hex8) {
  try {
    const bytes = hex8.match(/.{1,2}/g).map((b) => parseInt(b, 16));
    return String.fromCharCode(...bytes);
  } catch {
    return null;
  }
}

function snLabelFromHex16(hex16) {
  const prefHex = hex16.slice(0, 8);
  const tail = hex16.slice(8);
  const prefAscii = hex8ToAscii4(prefHex);
  if (prefAscii && /^[A-Z0-9]{4}$/.test(prefAscii))
    return `${prefAscii}-${tail}`;
  return hex16;
}

function parseOntSnField(rawVal = "") {
  const v = String(rawVal || "")
    .trim()
    .toUpperCase();

  const par = v.match(/\(([A-Z0-9]{4})-([0-9A-F]{8})\)/);
  const parLabel = par ? `${par[1]}-${par[2]}` : null;

  const mHex = v.match(/\b([0-9A-F]{16})\b/);
  if (mHex) {
    const snHex = mHex[1];
    return {
      snHex,
      snLabel: parLabel || snLabelFromHex16(snHex),
      snLabelParens: parLabel,
      snRaw: rawVal,
    };
  }

  const mTxt = v.match(/\b([A-Z]{4})-?([0-9A-F]{8})\b/);
  if (mTxt) {
    const pref = mTxt[1];
    const tail = mTxt[2];
    const n = normalizeSn(`${pref}${tail}`);
    return {
      snHex: n.ok ? n.snHex : null,
      snLabel: `${pref}-${tail}`,
      snLabelParens: parLabel,
      snRaw: rawVal,
    };
  }

  return { snHex: null, snLabel: null, snLabelParens: parLabel, snRaw: rawVal };
}

function parseOntAutofindAll(raw = "") {
  const text = String(raw || "")
    .split("\n")
    .filter((l) => !/----\s*More\s*\(/i.test(l))
    .join("\n");

  if (/Failure:\s*The automatically found ONTs do not exist/i.test(text)) {
    return { total: 0, items: [] };
  }

  const lines = text.split("\n");

  const starts = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*Number\s*:\s*\d+\s*$/i.test(lines[i])) starts.push(i);
  }
  if (!starts.length) return { total: 0, items: [] };

  const items = [];
  for (let b = 0; b < starts.length; b++) {
    const i0 = starts[b];
    const i1 = b + 1 < starts.length ? starts[b + 1] : lines.length;
    const block = lines.slice(i0, i1).join("\n");

    const number = extractIntField(block, "Number");
    const fsp = extractFSP(block);

    const ontSnRaw =
      extractStrField(block, "Ont SN") || extractStrField(block, "ONT SN");
    const sn = parseOntSnField(ontSnRaw);

    const password = extractStrField(block, "Password");
    const loid = extractStrField(block, "Loid");
    const checkcode = extractStrField(block, "Checkcode");
    const vendorId = extractStrField(block, "VendorID");
    const ontVersion = extractStrField(block, "Ont Version");
    const ontSoftwareVersion = extractStrField(block, "Ont SoftwareVersion");
    const ontEquipmentId = extractStrField(block, "Ont EquipmentID");
    const autofindTime =
      extractStrField(block, "Ont autofind time") ||
      extractStrField(block, "ONT autofind time") ||
      extractTime(block);

    items.push({
      number,
      fsp,
      snHex: sn.snHex,
      snLabel: sn.snLabel,
      snRaw: sn.snRaw,
      password,
      loid,
      checkcode,
      vendorId,
      ontVersion,
      ontSoftwareVersion,
      ontEquipmentId,
      autofindTime,
    });
  }

  const totalReported =
    extractIntField(text, "The number of GPON autofind ONT is") ??
    extractIntField(text, "The number of GPON autofind ONT") ??
    null;

  return { total: totalReported ?? items.length, items };
}

async function getAutofindItemBySnHex(session, snHex, opts, debug) {
  await ensureConfig(session, debug);

  const raw = await session.run("display ont autofind all", {
    ...opts,
    timeout: 25000,
  });

  const parsed = parseOntAutofindAll(raw);
  const item =
    parsed.items.find(
      (it) =>
        String(it.snHex || "").toUpperCase() === String(snHex).toUpperCase(),
    ) || null;

  return { raw, parsed, item };
}

// =========================
//  FIND FIRST FREE ONT-ID
// =========================
function parseUsedOntIdsFromDisplayOntInfoAll(
  raw = "",
  { min = 1, max = 127 } = {},
) {
  const s = String(raw || "");
  const used = new Set();

  for (const m of s.matchAll(
    /^\s*\d+\s*\/\s*\d+\s*\/\s*\d+\s+(\d+)\s+[0-9A-F]{16}\s+/gim,
  )) {
    const id = Number(m[1]);
    if (Number.isFinite(id) && id >= min && id <= max) used.add(id);
  }

  for (const m of s.matchAll(
    /^\s*\d+\s*\/\s*\d+\s*\/\s*\d+\s+(\d+)\s{2,}\S+/gim,
  )) {
    const id = Number(m[1]);
    if (Number.isFinite(id) && id >= min && id <= max) used.add(id);
  }

  return [...used].sort((a, b) => a - b);
}

function firstFreeId(usedIds = [], { min = 1, max = 127 } = {}) {
  const used = new Set(usedIds);
  for (let id = min; id <= max; id++) if (!used.has(id)) return id;
  return null;
}

async function findFirstFreeOntId(session, f, s, pon, opts, debug) {
  const min = Number(process.env.OLT_ONTID_MIN ?? 1);
  const max = Number(process.env.OLT_ONTID_MAX ?? 127);

  await ensureConfig(session, debug);
  await session.run(`interface gpon ${f}/${s}`, opts);

  const raw = await session.run(`display ont info ${pon} all`, {
    ...opts,
    timeout: 20000,
  });

  await session.run("quit", opts).catch(() => {});
  await ensureConfig(session, debug);

  const usedIds = parseUsedOntIdsFromDisplayOntInfoAll(raw, { min, max });
  const free = firstFreeId(usedIds, { min, max });
  return { free, usedIds, rawList: raw, range: { min, max } };
}

// =========================
//  retries ont info by-sn
// =========================
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

  return { raw: "", fsp: null, ontId: null };
}

// =========================
//  ont-type prompt handling
// =========================
function needsOntTypePrompt(raw = "") {
  return /\{\s*<cr>\s*\|\s*ont-type/i.test(String(raw || ""));
}

async function sendEnter(session, opts) {
  // Intenta enviar ENTER. Dependiendo de tu olt.session, "" o "\n" puede funcionar.
  try {
    return await session.run("\n", { ...opts, timeout: 12000 });
  } catch {
    try {
      return await session.run("", { ...opts, timeout: 12000 });
    } catch {
      return "";
    }
  }
}

// rollback best-effort
async function rollbackProvision(session, { f, s, p, ontId }, opts, debug) {
  // 1) borrar service-ports (si existen)
  try {
    await ensureConfig(session, debug);
    const rawSp = await session.run(
      `display service-port port ${f}/${s}/${p} ont ${ontId}`,
      { ...opts, timeout: 20000 },
    );

    const hasNoSp =
      /Failure:\s*No service virtual port can be operated/i.test(rawSp) ||
      /Total\s*:\s*0\b/i.test(rawSp);

    const sps = hasNoSp ? [] : parseServicePorts(rawSp);
    for (const sp of sps) {
      try {
        await session.run(`undo service-port ${sp.index}`, {
          ...opts,
          timeout: 15000,
        });
      } catch {}
    }
  } catch {}

  // 2) borrar ONT
  try {
    await ensureConfig(session, debug);
    await session.run(`interface gpon ${f}/${s}`, opts);
    await session.run(`ont delete ${p} ${ontId}`, { ...opts, timeout: 20000 });
    await session.run("quit", opts).catch(() => {});
    await ensureConfig(session, debug);
  } catch {}
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

async function ready(req, res) {
  const debug = parseBool(req.query.debug);
  const session = getOltSession("default");
  const opts = debug ? { debug: true, timeout: 12000 } : { timeout: 12000 };

  try {
    await ensureConfig(session, debug);

    const raw = await session.run("display time", opts);
    const time = extractTime(raw);

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
      return res.status(err.status).json({
        ok: false,
        ready: false,
        error: { message: msg },
      });
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

// POST /api/olt/exec  { cmdId, args }
async function exec(req, res) {
  const debug = parseBool(req.query.debug);
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
    // ONT_AUTOFIND_ALL
    // =======================
    if (cmdId === "ONT_AUTOFIND_ALL") {
      await ensureConfig(session, debug);
      const raw = await session.run("display ont autofind all", {
        ...opts,
        timeout: 25000,
      });
      const parsed = parseOntAutofindAll(raw);

      const payload = {
        ok: true,
        cmdId,
        total: parsed.total,
        items: parsed.items,
      };
      if (debug) payload.raw = raw;
      return res.json(payload);
    }

    // =======================
    // ONT_NEXT_FREE_ID
    // args: { fsp:"0/1/2" }  ó { f:0,s:1,pon:2 }
    // =======================
    if (cmdId === "ONT_NEXT_FREE_ID") {
      const fsp = String(args?.fsp || "").trim();
      const f = args?.f ?? null;
      const s = args?.s ?? null;
      const pon = args?.pon ?? null;

      let ff = null,
        ss = null,
        pp = null;

      if (fsp) {
        const x = splitFspToNums(fsp);
        if (!x) {
          return res.status(400).json({
            ok: false,
            error: { message: "fsp inválido (ej: 0/1/2)" },
          });
        }
        ff = x.f;
        ss = x.s;
        pp = x.p;
      } else {
        ff = Number(f);
        ss = Number(s);
        pp = Number(pon);
        if (![ff, ss, pp].every((n) => Number.isFinite(n))) {
          return res.status(400).json({
            ok: false,
            error: { message: "Debe enviar fsp o (f,s,pon)" },
          });
        }
      }

      const r = await findFirstFreeOntId(session, ff, ss, pp, opts, debug);

      return res.json({
        ok: true,
        cmdId,
        fsp: `${ff}/${ss}/${pp}`,
        range: r.range,
        usedCount: r.usedIds.length,
        usedIds: debug ? r.usedIds : undefined,
        freeId: r.free,
        ...(debug ? { rawList: r.rawList } : {}),
      });
    }

    // =======================
    // ONT_PROVISION_AUTOFIND
    // args: { sn, desc, trafficIn, trafficOut, ontType? }
    // =======================
    if (cmdId === "ONT_PROVISION_AUTOFIND") {
      const snInput = String(args?.sn || "").trim();
      const descInput = String(args?.desc || "").trim();
      const trafficIn = Number(args?.trafficIn);
      const trafficOut = Number(args?.trafficOut);

      if (!snInput)
        return res
          .status(400)
          .json({ ok: false, error: { message: "sn requerido" } });
      if (!descInput)
        return res
          .status(400)
          .json({ ok: false, error: { message: "desc requerido" } });
      if (!Number.isFinite(trafficIn) || !Number.isFinite(trafficOut)) {
        return res.status(400).json({
          ok: false,
          error: { message: "trafficIn y trafficOut deben ser numéricos" },
        });
      }

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

      // ENV (defaults)
      const LINE = String(process.env.OLT_LINEPROFILE || "").trim();
      const SRV = String(process.env.OLT_SRVPROFILE || "").trim();
      const VLAN = Number(process.env.OLT_VLAN ?? 100);
      const GEM = Number(process.env.OLT_GEMPORT ?? 10);
      const ETH = Number(process.env.OLT_ETH ?? 1);

      if (!LINE || !SRV) {
        return res.status(500).json({
          ok: false,
          error: { message: "Falta OLT_LINEPROFILE u OLT_SRVPROFILE en env" },
        });
      }
      if (![VLAN, GEM, ETH].every((x) => Number.isFinite(x))) {
        return res.status(500).json({
          ok: false,
          error: {
            message: "Falta OLT_VLAN / OLT_GEMPORT / OLT_ETH válidos en env",
          },
        });
      }

      // 0) si ya existe -> 409
      const existsCheck = await runOntInfoBySnWithRetry(
        session,
        n.snHex,
        { ...opts, timeout: 15000 },
        debug,
      );
      if (
        existsCheck?.fsp &&
        existsCheck.ontId !== null &&
        !isOltFailure(existsCheck.raw)
      ) {
        return res.status(409).json({
          ok: false,
          error: { message: "La ONT ya existe en la OLT" },
          exists: {
            fsp: existsCheck.fsp,
            ontId: existsCheck.ontId,
            sn: n.snHex,
            snLabel: n.snLabel,
          },
          ...(debug ? { rawExists: existsCheck.raw } : {}),
        });
      }

      // 1) obtener FSP desde autofind
      const af = await getAutofindItemBySnHex(session, n.snHex, opts, debug);
      if (!af.item || !af.item.fsp) {
        return res.status(404).json({
          ok: false,
          error: {
            message: "La ONT no aparece en 'display ont autofind all'.",
          },
          ...(debug ? { rawAutofind: af.raw } : {}),
        });
      }

      const fsp = af.item.fsp;
      const x = splitFspToNums(fsp);
      if (!x) {
        return res.status(500).json({
          ok: false,
          error: { message: `F/S/P inválido obtenido desde autofind: ${fsp}` },
          ...(debug ? { item: af.item } : {}),
        });
      }

      // 2) obtener ONT-ID libre
      const rFree = await findFirstFreeOntId(
        session,
        x.f,
        x.s,
        x.p,
        opts,
        debug,
      );
      if (!rFree.free) {
        return res.status(409).json({
          ok: false,
          error: {
            message: `No hay ONT-ID libre en ${fsp} (rango ${rFree.range.min}-${rFree.range.max})`,
          },
          usedCount: rFree.usedIds.length,
          ...(debug ? { usedIds: rFree.usedIds, rawList: rFree.rawList } : {}),
        });
      }

      const ontId = rFree.free;
      const desc = sanitizeDesc(descInput);

      // ✅ ontType: args -> env -> autofind.ontEquipmentId (si sirve)
      const ontType = String(
        args?.ontType ??
          process.env.OLT_ONT_TYPE ??
          af.item.ontEquipmentId ??
          "",
      ).trim();

      let rawAdd = null;
      let rawNative = null;
      let rawSpCreate = null;
      let rawSpList = null;

      try {
        // 3) ont add
        await ensureConfig(session, debug);
        await session.run(`interface gpon ${x.f}/${x.s}`, opts);

        let cmdAdd =
          `ont add ${x.p} ${ontId} sn-auth ${n.snHex} omci ` +
          `ont-lineprofile-name ${LINE} ont-srvprofile-name ${SRV} desc ${desc}`;

        rawAdd = await session.run(cmdAdd, { ...opts, timeout: 25000 });

        // ✅ si apareció el prompt { <cr>|ont-type<K> }: => enviar ENTER
        if (needsOntTypePrompt(rawAdd)) {
          const rawCr = await sendEnter(session, opts);
          rawAdd = `${rawAdd}\n${rawCr}`;
        }

        if (isCliFailure(rawAdd)) throw new Error(`Fallo ont add: ${rawAdd}`);

        // 4) native-vlan
        rawNative = await session.run(
          `ont port native-vlan ${x.p} ${ontId} eth ${ETH} vlan ${VLAN}`,
          { ...opts, timeout: 20000 },
        );
        if (isCliFailure(rawNative))
          throw new Error(`Fallo native-vlan: ${rawNative}`);

        // salir de interfaz
        await session.run("quit", opts).catch(() => {});
        await ensureConfig(session, debug);

        // 5) service-port
        rawSpCreate = await session.run(
          `service-port vlan ${VLAN} gpon ${x.f}/${x.s}/${x.p} ont ${ontId} gemport ${GEM} ` +
            `multi-service user-vlan ${VLAN} tag-transform translate ` +
            `inbound traffic-table index ${trafficIn} outbound traffic-table index ${trafficOut}`,
          { ...opts, timeout: 25000 },
        );
        if (isCliFailure(rawSpCreate))
          throw new Error(`Fallo service-port create: ${rawSpCreate}`);

        // 6) verificar lista
        rawSpList = await session.run(
          `display service-port port ${x.f}/${x.s}/${x.p} ont ${ontId}`,
          { ...opts, timeout: 20000 },
        );

        const hasNoSp =
          /Failure:\s*No service virtual port can be operated/i.test(
            rawSpList,
          ) || /Total\s*:\s*0\b/i.test(rawSpList);

        const sps = hasNoSp ? [] : parseServicePorts(rawSpList);

        return res.json({
          ok: true,
          cmdId,
          sn: n.snHex,
          snLabel: n.snLabel,
          snInput: n.snInput,
          fsp,
          ontId,
          desc,
          profiles: { line: LINE, srv: SRV },
          vlan: VLAN,
          gemport: GEM,
          eth: ETH,
          ontType: ontType || null,
          traffic: { inbound: trafficIn, outbound: trafficOut },
          servicePorts: sps,
          ...(debug
            ? {
                autofindItem: af.item,
                rawAutofind: af.raw,
                rawList: rFree.rawList,
                rawAdd,
                rawNative,
                rawSpCreate,
                rawSpList,
              }
            : {}),
        });
      } catch (e) {
        await rollbackProvision(
          session,
          { f: x.f, s: x.s, p: x.p, ontId },
          opts,
          debug,
        );
        return res.status(500).json({
          ok: false,
          error: {
            message: "Fallo al provisionar ONT",
            details: String(e?.message || e),
          },
          ctx: { sn: n.snHex, fsp, ontId },
          ...(debug ? { rawAdd, rawNative, rawSpCreate, rawSpList } : {}),
        });
      }
    }

    // =======================
    // ONT_INFO_BY_SN (con potencia)
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
        cmdId,
        sn: n.snHex,
        snLabel: n.snLabel,
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

      const isOnline = String(runState || "").toLowerCase() === "online";

      if (isOnline) {
        const x = splitFspToNums(fsp);
        if (x) {
          await ensureConfig(session, debug);
          await session.run(`interface gpon ${x.f}/${x.s}`, opts);

          const rawOpt = await session.run(
            `display ont optical-info ${x.p} ${ontId}`,
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
            let rxDbm = extractFloatField(rawOpt, "Rx optical power\\(dBm\\)");
            let txDbm = extractFloatField(rawOpt, "Tx optical power\\(dBm\\)");
            let oltRxDbm = extractFloatField(
              rawOpt,
              "OLT Rx ONT optical power\\(dBm\\)",
            );
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
      return res.json(payload);
    }

    // =======================
    // ONT_DELETE
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

      const rawInfo = await session.run(
        `display ont info by-sn  ${n.snHex}`,
        opts,
      );
      if (/Failure:/i.test(rawInfo)) {
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

      const rawSp = await session.run(
        `display service-port port ${fsp} ont ${ontId}`,
        {
          ...opts,
          timeout: 15000,
        },
      );

      const hasNoSp =
        /Failure:\s*No service virtual port can be operated/i.test(rawSp) ||
        /Total\s*:\s*0\b/i.test(rawSp);

      const servicePorts = hasNoSp ? [] : parseServicePorts(rawSp);

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

      const x = splitFspToNums(fsp);
      if (!x) {
        return res
          .status(500)
          .json({ ok: false, error: { message: `F/S/P inválido: ${fsp}` } });
      }

      await ensureConfig(session, debug);
      await session.run(`interface gpon ${x.f}/${x.s}`, opts);

      const rawDelete = await session.run(`ont delete ${x.p} ${ontId}`, opts);

      await session.run("quit", opts).catch(() => {});
      await ensureConfig(session, debug);

      const successMatch = rawDelete.match(/success:\s*(\d+)/i);
      const okDel = successMatch
        ? Number(successMatch[1]) === 1
        : !isOltFailure(rawDelete);

      if (!okDel) {
        return res.status(500).json({
          ok: false,
          error: { message: "Fallo al eliminar la ONT", details: rawDelete },
          servicePorts: {
            deleted: deletedServicePorts,
            failed: failedServicePorts,
          },
          ...(debug ? { rawInfo, rawSp, rawDelete } : {}),
        });
      }

      const payload = {
        ok: true,
        cmdId,
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

    return res
      .status(400)
      .json({ ok: false, error: { message: `cmdId no soportado: ${cmdId}` } });
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

async function close(req, res) {
  const session = getOltSession("default");
  await session.close("manual");
  return res.json({ ok: true, message: "Sesión cerrada" });
}

module.exports = { status, testTime, ready, exec, close };
