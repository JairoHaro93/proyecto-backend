// src/utils/olt.js
const { Telnet } = require("telnet-client");

/** Prompt típico Huawei */
const PROMPT_ANY =
  /(?:MA5800[^\r\n]*[>#]\s*|<[^>\r\n]+>\s*|\[[^\]\r\n]+\]\s*|[>#]\s*)[\s\x00-\x1f\x7f-\x9f]*$/m;

// Login prompts Huawei
const LOGIN_PROMPT = /User\s*name\s*:\s*/i;
const PASS_PROMPT = /User\s*password\s*:\s*/i;

// Fallos típicos
const FAILED_LOGIN =
  /Username\s+or\s+password\s+invalid|The IP address has been locked|cannot log on it|locked/i;

// Caso especial: pide <cr>
const NEEDS_CR = /\{\s*<cr>[\s\S]*\}\s*:\s*$/im;

// Paging "More"
const MORE_PROMPT = /----\s*More\s*\(.*?\)\s*----/im;

// Confirmación de logout
const LOGOUT_CONFIRM = /Are you sure to log out\?\s*\(y\/n\)\[n\]\s*:\s*$/im;

// Esperar prompt, o <cr>, o "More"
const WAIT_ANY = new RegExp(
  `${PROMPT_ANY.source}|${NEEDS_CR.source}|${MORE_PROMPT.source}|${LOGOUT_CONFIRM.source}`,
  "im"
);

function sanitize(s = "") {
  return String(s)
    // ANSI ESC sequences
    .replace(/\x1B\[[0-9;?]*[ -/]*[@-~]/g, "")
    // a veces queda "[37D" sin ESC (cursor left)
    .replace(/\[\d+[A-Za-z]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\x00/g, "")
    .trim();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    this.mode = "unknown"; // user | enable | config | unknown
  }

  _log(...args) {
    if (!this.debug) return;
    console.log("[OLT]", ...args);
  }

  _updateModeFromText(txt) {
    const t = String(txt || "");
    // prioridad: config
    if (/\(config[^\)]*\)#\s*$/im.test(t) || /\(config[^\)]*\)/i.test(t)) {
      this.mode = "config";
      return;
    }
    if (/#\s*$/m.test(t)) {
      this.mode = "enable";
      return;
    }
    if (/>\s*$/m.test(t)) {
      this.mode = "user";
      return;
    }
    // no cambia si no detecta
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
      echoLines: 0,
    });

    // Huawei suele mandar warning/banners después del login
    await sleep(120);
    await this.ensurePrompt();
    return this;
  }

  async _send(data, { waitFor = WAIT_ANY, timeout = this.timeout, ors = "\r\n" } = {}) {
    const raw = await this.connection.send(data, { ors, waitFor, timeout });
    const clean = sanitize(raw);
    if (clean) this._log(clean);
    this._updateModeFromText(clean);
    return clean;
  }

  /** Lleva la consola a un prompt estable, resolviendo "More" o "<cr>" si quedaron colgados */
  async ensurePrompt() {
    for (let i = 0; i < 6; i++) {
      try {
        const out = await this._send("", { waitFor: WAIT_ANY, timeout: 1800 });

        // si aparece "More", ENTER para seguir
        if (MORE_PROMPT.test(out)) continue;

        // si aparece "<cr>", ENTER para ejecutar lo pendiente
        if (NEEDS_CR.test(out)) continue;

        // si ya hay prompt, listo
        if (PROMPT_ANY.test(out)) return;
      } catch {
        // ignorar; a veces no responde al primer enter
      }
    }
  }

  /** Ejecuta comando y maneja:
   *  - "{ <cr> ... }:" => ENTER extra
   *  - "---- More ----" => ENTER repetidos hasta llegar al prompt
   */
  async exec(cmd) {
    const c = String(cmd || "").trim();
    if (!c) return "";

    await this.ensurePrompt();

    // primer envío
    let all = await this._send(c, { waitFor: WAIT_ANY, timeout: this.timeout });

    // bucle para resolver <cr> y paging
    for (let i = 0; i < 30; i++) {
      const txt = String(all);

      // si pide <cr> => ENTER
      if (NEEDS_CR.test(txt)) {
        const more = await this._send("", { waitFor: WAIT_ANY, timeout: this.timeout });
        all = `${all}\n${more}`;
        continue;
      }

      // si hay paging => ENTER (como tú lo haces manual)
      if (MORE_PROMPT.test(txt)) {
        const more = await this._send("", { waitFor: WAIT_ANY, timeout: this.timeout });
        all = `${all}\n${more}`;
        continue;
      }

      // si ya terminó en prompt, salimos
      if (PROMPT_ANY.test(txt)) break;

      // si no terminó en prompt pero tampoco hay señales, intentamos leer con ENTER
      const more = await this._send("", { waitFor: WAIT_ANY, timeout: 1800 });
      all = `${all}\n${more}`;
      if (PROMPT_ANY.test(all)) break;
    }

    return sanitize(all);
  }

  async end() {
    this._closing = true;

    try {
      await this.ensurePrompt();
      const resp = await this._send("quit", {
        waitFor: new RegExp(`${LOGOUT_CONFIRM.source}|${PROMPT_ANY.source}`, "im"),
        timeout: 2500,
      }).catch(() => "");

      if (LOGOUT_CONFIRM.test(resp)) {
        await this._send("y", { waitFor: PROMPT_ANY, timeout: 1500 }).catch(() => {});
      }
    } catch {}

    try {
      await this.connection.end();
    } catch {}
  }

  async destroy() {
    try {
      await this.connection.destroy();
    } catch {}
  }
}

module.exports = { OltClient };
