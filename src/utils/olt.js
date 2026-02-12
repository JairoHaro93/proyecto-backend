// src/utils/olt.js
const { Telnet } = require("telnet-client");

// ✅ Prompt Huawei tolerante: permite bytes de control al final (Telnet/IAC/etc)
const SHELL_PROMPT =
  /(?:MA5800[^\r\n]*[>#]\s*|<[^>\r\n]+>\s*|\[[^\]\r\n]+\]\s*|[>#]\s*)[\s\x00-\x1f\x7f-\x9f]*$/m;

// Prompts de login
const LOGIN_PROMPT = /User\s*name\s*:\s*/i;
const PASS_PROMPT = /User\s*password\s*:\s*/i;

// Fallos típicos (incluye lock por IP)
const FAILED_LOGIN =
  /Username\s+or\s+password\s+invalid|The IP address has been locked|cannot log on it|locked/i;

// Paging (si aparece)
const PAGE_REGEX = /-+\s*More[\s\S]*?-+/;

function sanitize(s = "") {
  return String(s)
    .replace(/\x1B\[[0-9;?]*[ -/]*[@-~]/g, "") // ANSI
    .replace(/\r\n/g, "\n")
    .trim();
}

function trunc(s = "", max = 1600) {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n…[${s.length - max} chars más]`;
}

class OltClient {
  constructor({
    host,
    port = 23,
    username,
    password,
    timeout = 30000,
    debug = false,
    showCreds = false,
  }) {
    this.connection = new Telnet();

    this.host = host;
    this.port = Number(port || 23);
    this.username = String(username ?? "");
    this.password = String(password ?? "");
    this.timeout = Number(timeout || 30000);

    this.debug = !!debug;
    this.showCreds = !!showCreds;

    this.connection.on("timeout", () => this._log("TIMEOUT"));
    this.connection.on("close", () => this._log("CLOSE"));
    this.connection.on("error", (e) => this._log("ERROR", e?.message || e));

    // Solo para debug visual: NO confiar en esto para “fin de comando”
    this.connection.on("data", (buf) => {
      if (!this.debug) return;
      const txt = sanitize(buf.toString("utf8"));
      if (txt) this._log("DATA", trunc(txt));
    });
  }

  _log(tag, msg = "") {
    if (!this.debug) return;
    const ts = new Date().toISOString();
    console.log(`[OLT][${ts}][${tag}] ${msg}`);
  }

  _dumpCred(label, value) {
    if (!this.debug || !this.showCreds) return;
    const raw = String(value ?? "");
    const visible = JSON.stringify(raw);
    const buf = Buffer.from(raw, "utf8");
    this._log("CREDS", `${label}: visible=${visible} | bytes=${buf.length}`);
  }

  async connect() {
    if (!this.host) throw new Error("OLT_HOST no definido");
    if (!this.username) throw new Error("OLT_USERNAME no definido");
    if (!this.password) throw new Error("OLT_PASSWORD no definido");

    this._log("CONNECT", `${this.host}:${this.port} t=${this.timeout}`);
    this._dumpCred("username", this.username);
    this._dumpCred("password", this.password);

    await this.connection.connect({
      host: this.host,
      port: this.port,
      timeout: this.timeout,

      shellPrompt: SHELL_PROMPT,
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
      pageSeparator: PAGE_REGEX,
      echoLines: 0,
      stripShellPrompt: false,
    });

    this._log("READY", "Sesión lista (con login)");

    // Limpia warnings pendientes
    await this.drain();

    return this;
  }

  async drain() {
    try {
      this._log("DRAIN", "enter");
      await this.connection.send("", {
        ors: "\r\n",
        waitFor: SHELL_PROMPT, // ✅ waitFor (F mayúscula)
        timeout: 1500,
      });
    } catch {}
  }

  // ✅ Exec robusto: usa send + waitFor (no connection.exec)
  async exec(cmd, opts = {}) {
    const c = String(cmd || "").trim();
    if (!c) return "";

    this._log("EXEC", c);

    try {
      const raw = await this.connection.send(c, {
        ors: "\r\n",
        waitFor: SHELL_PROMPT,
        timeout: this.timeout,
        ...opts,
      });

      const clean = sanitize(raw);
      if (clean) this._log("OUT", trunc(clean));
      return clean;
    } catch (err) {
      // Re-sync 1 vez por si quedó “desfasado” el prompt
      if (String(err?.message || "").toLowerCase().includes("response not received")) {
        this._log("RESYNC", "drain + retry");
        await this.drain();
        const raw2 = await this.connection.send(c, {
          ors: "\r\n",
          waitFor: SHELL_PROMPT,
          timeout: this.timeout,
          ...opts,
        });
        const clean2 = sanitize(raw2);
        if (clean2) this._log("OUT", trunc(clean2));
        return clean2;
      }
      throw err;
    }
  }

  async end() {
    try {
      this._log("EXEC", "quit");
      await this.connection.send("quit", {
        ors: "\r\n",
        waitFor: /(?:Configuration console exit|retry to log on|Connection closed|CLOSE)/im,
        timeout: 1500,
      }).catch(() => {});
    } catch {}

    try {
      this._log("END", "Cerrando socket");
      await this.connection.end();
    } catch {}
  }

  async destroy() {
    try { await this.connection.destroy(); } catch {}
  }
}

module.exports = { OltClient };
