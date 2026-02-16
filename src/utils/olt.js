// src/utils/olt.js
const { Telnet } = require("telnet-client");

/** Prompt típico Huawei */
const PROMPT_ANY =
  /(?:MA5800[^\r\n]*[>#]\s*|<[^>\r\n]+>\s*|\[[^\]\r\n]+\]\s*|[>#]\s*)[\s\x00-\x1f\x7f-\x9f]*$/m;

// Login prompts Huawei
const LOGIN_PROMPT = /User\s*name\s*:\s*/i;
const PASS_PROMPT = /User\s*password\s*:\s*/i;

// Fallos típicos (incluye lock)
const FAILED_LOGIN =
  /Username\s+or\s+password\s+invalid|The IP address has been locked|cannot log on it|locked/i;

// Caso especial del CLI: pide <cr> para ejecutar
const NEEDS_CR = /\{\s*<cr>[\s\S]*\}\s*:\s*$/im;

// Logout confirm Huawei
const LOGOUT_CONFIRM = /Are you sure to log out\?\s*\(y\/n\)\[n\]\s*:\s*$/im;

// Espera prompt o el bloque { <cr> ... }:
const WAIT_PROMPT_OR_CR = new RegExp(
  `${PROMPT_ANY.source}|${NEEDS_CR.source}`,
  "im",
);

// limpia ANSI y cosas raras
function sanitize(s = "") {
  return String(s)
    .replace(/\x1B\[[0-9;?]*[ -/]*[@-~]/g, "") // ANSI
    .replace(/\r\n/g, "\n")
    .replace(/\[37D/g, "") // a veces aparece por paging
    .trim();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function extractLastPrompt(text = "") {
  const s = sanitize(text);
  const matches = [...s.matchAll(/MA5800[^\r\n]*[>#>]\s*$/gm)];
  if (!matches.length) return null;
  return matches[matches.length - 1][0].trim();
}

function modeFromPrompt(prompt = "") {
  const p = String(prompt);

  // más específico primero
  if (/\(config-if-gpon-[^)]+\)#$/i.test(p)) return "gpon";
  if (/\(config\)#$/i.test(p)) return "config";
  if (/#$/.test(p)) return "enable";
  if (/>$/.test(p)) return "user";
  return "unknown";
}

class OltClient {
  constructor({
    host,
    port = 23,
    username,
    password,
    timeout = 20000,
    debug = false,
  }) {
    this.connection = new Telnet();
    this.host = host;
    this.port = Number(port || 23);
    this.username = String(username ?? "");
    this.password = String(password ?? "");
    this.timeout = Number(timeout || 20000);
    this.debug = !!debug;

    this._closing = false;
    this._bootstrapped = false;

    // ✅ estado de prompt
    this.lastPrompt = null;
    this.mode = "unknown";

    if (this.debug) {
      this.connection.on("data", (buf) => {
        const txt = sanitize(buf.toString("utf8"));
        if (txt) console.log("[OLT]", txt);
      });
    }

    this.connection.on("error", (e) => {
      if (this._closing && e?.code === "ECONNRESET") return;
      if (this.debug) console.log("[OLT][ERROR]", e?.message || e);
    });
  }

  _updateModeFromText(text) {
    const p = extractLastPrompt(text);
    if (p) {
      this.lastPrompt = p;
      this.mode = modeFromPrompt(p);
    }
  }

  async connect() {
    if (!this.host) throw new Error("OLT_HOST no definido");
    if (!this.username) throw new Error("OLT_USERNAME no definido");
    if (!this.password) throw new Error("OLT_PASSWORD no definido");

    await this.connection.connect({
      host: this.host,
      port: this.port,
      timeout: this.timeout,

      shellPrompt: PROMPT_ANY,
      loginPrompt: LOGIN_PROMPT,
      passwordPrompt: PASS_PROMPT,
      failedLoginMatch: FAILED_LOGIN,

      username: this.username,
      password: this.password,

      irs: "\r\n",
      ors: "\r\n",
      initialLFCR: true,

      execTimeout: this.timeout,
      sendTimeout: this.timeout,

      stripControls: true,
      stripShellPrompt: false,
    });

    await sleep(80);

    // ✅ capturamos prompt y modo desde el inicio
    await this.ensurePrompt();

    // ✅ deja sesión lista: enable + scroll 512 + config
    await this.bootstrap();

    return this;
  }

  async ensurePrompt() {
    try {
      const resp = await this.connection.send("", {
        ors: "\r\n",
        waitFor: PROMPT_ANY,
        timeout: 2500,
      });
      this._updateModeFromText(resp);
    } catch {}
  }

  // ✅ bootstrap para "scroll 512" (y entrar a config)
  async bootstrap() {
    if (this._bootstrapped) return;
    this._bootstrapped = true;

    const scrollLines = Number(process.env.OLT_SCROLL_LINES || 512);

    try {
      await this.exec("enable", { timeout: 2500 });
    } catch {}
    try {
      await this.exec(`scroll ${scrollLines}`, { timeout: 2500 });
    } catch {}
    try {
      await this.exec("config", { timeout: 2500 });
    } catch {}

    // ✅ Delay extra después de bootstrap para asegurar estabilidad
    await sleep(1500);

    // por si acaso
    this.mode = this.mode || "config";
  }

  async exec(cmd, opts = {}) {
    const c = String(cmd || "").trim();
    if (!c) return "";

    // si no sabemos dónde estamos, pedimos prompt
    if (this.mode === "unknown") await this.ensurePrompt();

    let raw = await this.connection.send(c, {
      ors: "\r\n",
      waitFor: WAIT_PROMPT_OR_CR,
      timeout: this.timeout,
      ...opts,
    });

    let clean = sanitize(raw);

    // Si el CLI pide <cr>, mandamos ENTER extra y ahora sí esperamos prompt final
    if (NEEDS_CR.test(clean)) {
      const raw2 = await this.connection.send("", {
        ors: "\r\n",
        waitFor: PROMPT_ANY,
        timeout: this.timeout,
      });
      raw = String(raw) + "\n" + String(raw2);
      clean = sanitize(raw);
    }

    // ✅ Detectar comando concatenado (palabras sin espacios)
    if (c.startsWith("display ") && /display\w+info\w+by-sn\w+/i.test(clean)) {
      console.log(
        `[OLT] ❌ Comando concatenado detectado, forzando error para reconexión`,
      );
      throw new Error("Comando concatenado - sesión corrupta");
    }

    this._updateModeFromText(clean);
    return clean;
  }

  async end() {
    this._closing = true;

    try {
      await this.ensurePrompt();
    } catch {}

    // ✅ puede estar en config-if/config/enable/user
    //    hacemos quit varias veces hasta ver confirmación de logout o al menos salir
    for (let i = 0; i < 4; i++) {
      const resp = await this.connection
        .send("quit", {
          ors: "\r\n",
          waitFor: new RegExp(
            `${LOGOUT_CONFIRM.source}|${PROMPT_ANY.source}`,
            "im",
          ),
          timeout: 2500,
        })
        .catch(() => "");

      const txt = sanitize(resp);
      this._updateModeFromText(txt);

      if (LOGOUT_CONFIRM.test(txt)) {
        await this.connection
          .send("y", { ors: "\r\n", timeout: 1500 })
          .catch(() => {});
        break;
      }

      // si ya está en user/enable y no pide confirmación, con otro quit suele pedirlo
      if (this.mode === "user" || this.mode === "enable") continue;
      // si sigue en config, otra vuelta también sirve
    }

    try {
      await this.connection.end();
    } catch {}
  }

  async destroy() {
    try {
      await this.connection.end();
    } catch {}
  }
}

module.exports = { OltClient };
