// src/utils/olt.js
const { Telnet } = require("telnet-client");

/** Prompt típico Huawei */
const PROMPT_ANY =
  /(?:MA5800[^\r\n]*[>#]\s*|<[^>\r\n]+>\s*|\[[^\]\r\n]+\]\s*|[>#]\s*)[\s\x00-\x1f\x7f-\x9f]*$/m;

// Login prompts Huawei
const LOGIN_PROMPT = /User\s*name\s*:\s*/i;
const PASS_PROMPT  = /User\s*password\s*:\s*/i;

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
  "im"
);

// Para quitar ANSI / limpiar
function sanitize(s = "") {
  return String(s)
    .replace(/\x1B\[[0-9;?]*[ -/]*[@-~]/g, "") // ANSI
    .replace(/\r\n/g, "\n")
    .trim();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class OltClient {
  constructor({ host, port = 23, username, password, timeout = 20000, debug = false }) {
    this.connection = new Telnet();
    this.host = host;
    this.port = Number(port || 23);
    this.username = String(username ?? "");
    this.password = String(password ?? "");
    this.timeout = Number(timeout || 20000);
    this.debug = !!debug;

    this._closing = false;
    this._bootstrapped = false;

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

    // Huawei a veces termina banners un poquito después
    await sleep(120);
    await this.ensurePrompt();

    // ✅ deja sesión lista: enable + scroll 512 + config
    await this.bootstrap();

    return this;
  }

  async ensurePrompt() {
    try {
      await this.connection.send("", {
        ors: "\r\n",
        waitFor: PROMPT_ANY,
        timeout: 2500,
      });
    } catch {}
  }

  // ✅ bootstrap para “scroll 512” (y entrar a config)
  async bootstrap() {
    if (this._bootstrapped) return;
    this._bootstrapped = true;

    const scrollLines = Number(process.env.OLT_SCROLL_LINES || 512);

    // no queremos que falle por “Unknown command”
    try { await this.exec("enable", { timeout: 2500 }); } catch {}
    try { await this.exec(`scroll ${scrollLines}`, { timeout: 2500 }); } catch {}
    try { await this.exec("config", { timeout: 2500 }); } catch {}
  }

  async exec(cmd, opts = {}) {
    const c = String(cmd || "").trim();
    if (!c) return "";

    await this.ensurePrompt();

    let raw = await this.connection.send(c, {
      ors: "\r\n",
      waitFor: WAIT_PROMPT_OR_CR,
      timeout: this.timeout,
      ...opts,
    });

    let clean = sanitize(raw);

    // Si el CLI pide <cr>, mandamos ENTER y ahora sí esperamos el prompt final
    if (NEEDS_CR.test(clean)) {
      const raw2 = await this.connection.send("", {
        ors: "\r\n",
        waitFor: PROMPT_ANY,
        timeout: this.timeout,
      });

      raw = String(raw) + "\n" + String(raw2);
      clean = sanitize(raw);
    }

    return clean;
  }

  async end() {
    this._closing = true;

    await this.ensurePrompt();

    try {
      const resp = await this.connection
        .send("quit", {
          ors: "\r\n",
          waitFor: new RegExp(`${LOGOUT_CONFIRM.source}|${PROMPT_ANY.source}`, "im"),
          timeout: 2500,
        })
        .catch(() => "");

      const txt = sanitize(resp);

      if (LOGOUT_CONFIRM.test(txt)) {
        await this.connection.send("y", { ors: "\r\n", timeout: 1500 }).catch(() => {});
      }
    } catch {}

    try {
      await this.connection.end();
    } catch {}
  }

  // opcional (si lo llamas en session manager)
  async destroy() {
    try { await this.connection.end(); } catch {}
  }
}

module.exports = { OltClient };
