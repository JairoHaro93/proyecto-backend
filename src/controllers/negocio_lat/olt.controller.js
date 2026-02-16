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

  // Limpia espacios extras internos (ej: "0/4/2   " -> "0/4/2")
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

// ✅ Función específica para extraer F/S/P
function extractFSP(raw = "") {
  const re = /^\s*F\/S\/P\s*:\s*(\d+)\/(\d+)\/(\d+)\s*$/im;
  const m = String(raw).match(re);
  if (!m) {
    console.log(
      `[OLT] ⚠️  No se pudo parsear F/S/P. Raw length: ${raw.length}`,
    );
    return null;
  }
  return `${m[1]}/${m[2]}/${m[3]}`;
}

// ✅ parsea service-ports de "display service-port port F/S/P ont ONTID"
function parseServicePorts(raw = "") {
  const lines = String(raw).split("\n");
  const servicePorts = [];

  for (const line of lines) {
    // busca líneas con índice numérico al inicio
    // Ejemplo: "    1386  100 common   gpon 0/1 /14 77   10    vlan  100        41   40   down"
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

// ✅ asegura que estemos en config sin romper si ya estamos ahí
async function ensureConfig(session, debug) {
  const mode = session.status().mode; // user | enable | config | gpon | unknown

  if (mode === "config") return;

  const opts = debug ? { debug: true } : {};

  if (mode === "gpon") {
    await session.run("quit", opts).catch(() => {});
    // sigue a config
  }

  if (mode === "enable") {
    await session.run("config", opts).catch(() => {});
    return;
  }

  await session.run("enable", opts).catch(() => {});
  await session.run("config", opts).catch(() => {});
}

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
  const debug = parseBool(req.query.debug);
  const { cmdId, args } = req.body || {};
  const session = getOltSession("default");

  try {
    if (!cmdId) {
      return res
        .status(400)
        .json({ ok: false, error: { message: "cmdId requerido" } });
    }

    // ========== ONT_INFO_BY_SN ==========
    if (cmdId === "ONT_INFO_BY_SN") {
      console.log(`[OLT] 📡 Solicitud consulta ONT: ${args?.sn}`);

      const sn = String(args?.sn || "")
        .trim()
        .toUpperCase();
      const includeOptical = parseBool(args?.includeOptical);

      if (!/^[0-9A-F]{16}$/i.test(sn)) {
        return res.status(400).json({
          ok: false,
          error: { message: "SN inválido (debe ser HEX de 16 chars)" },
        });
      }

      await ensureConfig(session, debug);

      // ✅ Pequeño delay después de ensureConfig
      await new Promise((resolve) => setTimeout(resolve, 500));

      const opts = debug ? { debug: true } : {};

      // 1) info principal
      const cmd = `display ont info by-sn  ${sn}`;

      console.log(`[OLT] 📤 Enviando comando: "${cmd}"`);
      const raw = await session.run(cmd, opts);

      console.log(`[OLT] 📄 Respuesta recibida, longitud: ${raw.length} chars`);

      const fsp = extractFSP(raw);
      const ontId = extractIntField(raw, "ONT-ID");
      const runState = extractStrField(raw, "Run state");
      const description = extractDescription(raw);

      if (!fsp || ontId === null) {
        console.log(`[OLT] ⚠️  Parseo incompleto: FSP=${fsp}, ONT-ID=${ontId}`);
        console.log(`[OLT] 📝 Primeras 500 chars: ${raw.substring(0, 500)}`);
      }

      const ontLastDistanceM = extractIntField(raw, "ONT last distance\\(m\\)");
      const lastDownCause = extractStrField(raw, "Last down cause");
      const lastUpTime = extractStrField(raw, "Last up time");
      const lastDownTime = extractStrField(raw, "Last down time");
      const lastDyingGaspTime = extractStrField(raw, "Last dying gasp time");
      const onlineDuration = extractStrField(raw, "ONT online duration");

      const payload = {
        ok: true,
        cmdId: "ONT_INFO_BY_SN",
        sn,
        fsp,
        ontId,
        runState,
        description,
        ontLastDistanceM,
        lastDownCause,
        lastUpTime,
        lastDownTime,
        lastDyingGaspTime,
        onlineDuration,
      };

      // 2) optical (opcional)
      if (
        includeOptical &&
        fsp &&
        ontId !== null &&
        String(runState || "").toLowerCase() === "online"
      ) {
        const parts = fsp.split("/").map((x) => Number(x));
        const [f, s, p] = parts;

        if (Number.isFinite(f) && Number.isFinite(s) && Number.isFinite(p)) {
          // entra a interface gpon f/s
          await ensureConfig(session, debug);
          await session.run(`interface gpon ${f}/${s}`, opts);

          const rawOpt = await session.run(
            `display ont optical-info ${p} ${ontId}`,
            opts,
          );

          // vuelve a config
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
            const rxDbm = extractFloatField(
              rawOpt,
              "Rx optical power\\(dBm\\)",
            );
            const txDbm = extractFloatField(
              rawOpt,
              "Tx optical power\\(dBm\\)",
            );
            const oltRxDbm = extractFloatField(
              rawOpt,
              "OLT Rx ONT optical power\\(dBm\\)",
            );

            // ✅ Si no se obtienen las potencias, reintentar UNA vez
            if (
              (rxDbm === null || txDbm === null || oltRxDbm === null) &&
              !debug
            ) {
              console.log(`[OLT] ⚠️  Potencias nulas, reintentando...`);

              await ensureConfig(session, debug);
              await session.run(`interface gpon ${f}/${s}`, opts);

              const rawOpt2 = await session.run(
                `display ont optical-info ${p} ${ontId}`,
                opts,
              );

              await session.run("quit", opts).catch(() => {});
              await ensureConfig(session, debug);

              const rxDbm2 = extractFloatField(
                rawOpt2,
                "Rx optical power\\(dBm\\)",
              );
              const txDbm2 = extractFloatField(
                rawOpt2,
                "Tx optical power\\(dBm\\)",
              );
              const oltRxDbm2 = extractFloatField(
                rawOpt2,
                "OLT Rx ONT optical power\\(dBm\\)",
              );

              payload.optical = {
                available: true,
                rxDbm: rxDbm2 ?? rxDbm,
                txDbm: txDbm2 ?? txDbm,
                oltRxDbm: oltRxDbm2 ?? oltRxDbm,
              };

              console.log(
                `[OLT] 🔄 Reintento potencias: Rx=${rxDbm2}, Tx=${txDbm2}, OLT-Rx=${oltRxDbm2}`,
              );
            } else {
              payload.optical = {
                available: true,
                rxDbm,
                txDbm,
                oltRxDbm,
              };
            }
          }

          if (debug) payload.rawOpt = rawOpt;
        }
      } else if (includeOptical) {
        payload.optical = {
          available: false,
          reason: "No optical (ONT offline o sin datos F/S/P u ONT-ID)",
          rxDbm: null,
          txDbm: null,
          oltRxDbm: null,
        };
      }

      console.log(
        `[OLT] ✅ Consulta completa: SN=${sn}, FSP=${fsp}, Estado=${runState}, Potencias=${payload.optical ? "OK" : "N/A"}`,
      );

      if (debug) payload.raw = raw;
      return res.json(payload);
    }

    // ========== ONT_DELETE ==========
    if (cmdId === "ONT_DELETE") {
      console.log(`[OLT] 🗑️  Solicitud eliminación ONT: ${args?.sn}`);

      const sn = String(args?.sn || "")
        .trim()
        .toUpperCase();

      if (!/^[0-9A-F]{16}$/i.test(sn)) {
        return res.status(400).json({
          ok: false,
          error: { message: "SN inválido (debe ser HEX de 16 chars)" },
        });
      }

      await ensureConfig(session, debug);

      // ✅ Pequeño delay después de ensureConfig
      await new Promise((resolve) => setTimeout(resolve, 500));

      const opts = debug ? { debug: true } : {};

      // 1) Obtener info de la ONT
      const cmdInfo = `display ont info by-sn  ${sn}`;
      const rawInfo = await session.run(cmdInfo, opts);

      // Verificar si la ONT existe
      if (
        /Failure:\s*The ONT does not exist/i.test(rawInfo) ||
        /Failure:/i.test(rawInfo)
      ) {
        console.log(`[OLT] ❌ ONT no existe: ${sn}`);
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
        console.log(`[OLT] ❌ Error parseando F/S/P u ONT-ID`);
        console.log(
          `[OLT] 📝 Primeras 500 chars: ${rawInfo.substring(0, 500)}`,
        );
        return res.status(500).json({
          ok: false,
          error: { message: "No se pudo extraer F/S/P u ONT-ID de la ONT" },
        });
      }

      const isOnline = String(runState || "").toLowerCase() === "online";
      console.log(
        `[OLT] 📋 Info ONT: FSP=${fsp}, ONT-ID=${ontId}, Estado=${runState}`,
      );

      // 2) Buscar service-ports
      const cmdSp = `display service-port port ${fsp} ont ${ontId}`;
      const rawSp = await session.run(cmdSp, opts);

      const servicePorts = parseServicePorts(rawSp);
      const deletedServicePorts = [];
      const failedServicePorts = [];

      console.log(`[OLT] 📌 Service-ports encontrados: ${servicePorts.length}`);

      // 3) Eliminar service-ports
      if (servicePorts.length === 0) {
        deletedServicePorts.push({
          warning: "No se encontraron service-ports para eliminar",
        });
      } else {
        for (const sp of servicePorts) {
          try {
            const cmdUndo = `undo service-port ${sp.index}`;
            await session.run(cmdUndo, opts);
            deletedServicePorts.push({
              index: sp.index,
              vlanId: sp.vlanId,
              state: sp.state,
              success: true,
            });
            console.log(`[OLT] ✅ Service-port eliminado: ${sp.index}`);
          } catch (err) {
            failedServicePorts.push({
              index: sp.index,
              error: String(err?.message || err),
            });
            console.log(
              `[OLT] ❌ Falló eliminar service-port ${sp.index}: ${err?.message}`,
            );
          }
        }
      }

      // 4) Eliminar ONT
      const parts = fsp.split("/").map((x) => Number(x));
      const [f, s, p] = parts;

      if (!Number.isFinite(f) || !Number.isFinite(s) || !Number.isFinite(p)) {
        return res.status(500).json({
          ok: false,
          error: { message: `F/S/P inválido: ${fsp}` },
        });
      }

      await ensureConfig(session, debug);
      await session.run(`interface gpon ${f}/${s}`, opts);

      const cmdDelete = `ont delete ${p} ${ontId}`;
      const rawDelete = await session.run(cmdDelete, opts);

      // Volver a config
      await session.run("quit", opts).catch(() => {});
      await ensureConfig(session, debug);

      // Verificar resultado
      const successMatch = rawDelete.match(/success:\s*(\d+)/i);
      const ontDeleteSuccess = successMatch
        ? Number(successMatch[1]) === 1
        : false;

      if (!ontDeleteSuccess) {
        console.log(`[OLT] ❌ Falló eliminación ONT`);
        return res.status(500).json({
          ok: false,
          error: {
            message: "Fallo al eliminar la ONT",
            details: rawDelete,
          },
          servicePorts: {
            deleted: deletedServicePorts,
            failed: failedServicePorts,
          },
        });
      }

      console.log(
        `[OLT] ✅ Eliminación completa: SN=${sn}, FSP=${fsp}, ONT-ID=${ontId}, Online=${isOnline}`,
      );

      // Respuesta exitosa
      const payload = {
        ok: true,
        cmdId: "ONT_DELETE",
        message: "ONT eliminada exitosamente",
        sn,
        fsp,
        ontId,
        description,
        wasOnline: isOnline,
        servicePorts: {
          deleted: deletedServicePorts,
          failed: failedServicePorts,
        },
      };

      if (isOnline) {
        payload.warning = "⚠️ La ONT estaba ONLINE al momento de eliminarla";
      }

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

module.exports = { status, testTime, exec, close };
