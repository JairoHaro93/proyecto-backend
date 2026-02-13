// src/utils/olt.js
const { Telnet } = require("telnet-client");

// Prompt Huawei típico: MA5800-X15>
const PROMPT_ANY =
  /(?:MA5800[^\r\n]*[>#]\s*|<[^>\r\n]+>\s*|\[[^\]\r\n]+\]\s*|[>#]\s*)[\s\x00-\x1f\x7f-\x9f]*$/m;

// Prompts de login (Huawei: ">>User name:" / ">>User password:")
const LOGIN_PROMPT = /User\s*name\s*:\s*/i;
const PASS_PROMPT = /User\s*password\s*:\s*/i;

// Fallos típicos (incluye bloqueo por intentos)
const FAILED_LOGIN =
  /Username\s+or\s+password\s+invalid|The IP address has been locked|cannot log on it|locked/i;

// Paging “More” (por si aparece)
const PAGE_REGEX = /-+\s*More[\s\S]*?-+/;

// Huawei a veces devuelve el modo parámetros:
const NEEDS_CR = /\{\s*<cr>[\s\S]*\}\s*:\s*$/im;

// Confirmación de logout
const LOGOUT_CONFIRM = /Are you sure to log out\?\s*\(y\/n\)\[n\]\s*:\s*$/im;

// Para que NO espere 20s cuando la OLT se quedó en "{ <cr> ... }:"
const WAIT_PROMPT_OR_CR = new RegExp(
  `${PROMPT_ANY.source}|${NEEDS_CR.source}`,
  "im"
);

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class OltClient {
  constructor({
    host,
    port = 23,
    username,
    password,
    timeout = 20000,
    debug = false,
    showCreds = false,
  }) {
    this.connection = new Telnet();

    this.host = host;
    this.port = Number(port || 23);
    this.username = String(username ?? "");
    this.password = String(password ?? "");
    this.timeout = Number(timeout || 20000);

    this.debug = !!debug;
    this.showCreds = !!showCreds;

    // flags para cierre
    this._closing = false;
    this._closed = false;

    this.connection.on("timeout", () => this._log("TIMEOUT"));
    this.connection.on("close", () => {
      this._closed = true;
      this._log("CLOSE");
    });

    this.connection.on("error", (e) => {
      // ✅ ECONNRESET al cerrar es normal en Huawei
      if (
        this._closing &&
        (e?.code === "ECONNRESET" ||
          /ECONNRESET/i.test(String(e?.message || "")))
      ) {
        this._log("INFO", "ECONNRESET al cerrar (normal en Huawei)");
        return;
      }
      this._log("ERROR", e?.message || e);
    });

    // Debug: muestra data entrante (prompt/banner)
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
    const buf = Buffer.from(raw, "utf8");
    this._log("CREDS", `${label}: ${JSON.stringify(raw)} | bytes=${buf.length}`);
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
      newlineReplace: "\n",
      pageSeparator: PAGE_REGEX,
      echoLines: 0,
      stripShellPrompt: false,
    });

    this._log("READY", "Sesión lista (con login)");

    // Huawei a veces sigue mandando banner/warnings un instante
    await sleep(120);
    await this.ensurePrompt();

    return this;
  }

  // ✅ deja la consola en prompt antes de ejecutar algo
  async ensurePrompt() {
    try {
      this._log("DRAIN", "enter");
      // Nota: telnet-client usa "waitfor" (minúscula); duplicamos por compatibilidad
      await this.connection.send("", {
        ors: "\r\n",
        waitfor: PROMPT_ANY,
        waitFor: PROMPT_ANY,
        timeout: 2500,
      });
    } catch {}
  }

  // ✅ ejecuta comando y si Huawei pide <cr>, manda ENTER extra
  async exec(cmd, opts = {}) {
    const c = String(cmd || "").trim();
    if (!c) return "";

    await this.ensurePrompt();
    this._log("EXEC", c);

    // 1) esperamos prompt O "{ <cr> ... }:"
    let raw = await this.connection.send(c, {
      ors: "\r\n",
      waitfor: WAIT_PROMPT_OR_CR,
      waitFor: WAIT_PROMPT_OR_CR,
      timeout: this.timeout,
      ...opts,
    });

    let clean = sanitize(raw);

    // 2) si Huawei pidió <cr>, mandamos ENTER extra y ahora sí esperamos prompt final
    if (NEEDS_CR.test(clean)) {
      this._log("FIX", "OLT pidió <cr>: enviando ENTER extra");

      const raw2 = await this.connection.send("", {
        ors: "\r\n",
        waitfor: PROMPT_ANY,
        waitFor: PROMPT_ANY,
        timeout: this.timeout,
      });

      raw = String(raw) + "\n" + String(raw2);
      clean = sanitize(raw);
    }

    if (clean) this._log("OUT", trunc(clean));
    return clean;
  }

  async end() {
    this._closing = true;

    // antes de quit, vuelve a prompt para no “pegar” comandos
    await this.ensurePrompt();

    try {
      this._log("EXEC", "quit");

      // mandamos quit y esperamos confirmación o prompt
      const resp = await this.connection
        .send("quit", {
          ors: "\r\n",
          waitfor: new RegExp(`${LOGOUT_CONFIRM.source}|${PROMPT_ANY.source}`, "im"),
          waitFor: new RegExp(`${LOGOUT_CONFIRM.source}|${PROMPT_ANY.source}`, "im"),
          timeout: 2500,
        })
        .catch(() => "");

      const txt = sanitize(resp);

      if (LOGOUT_CONFIRM.test(txt)) {
        this._log("EXEC", "logout confirm: y");
        await this.connection
          .send("y", { ors: "\r\n", timeout: 1500 })
          .catch(() => {});
      }
    } catch {}

    // cierre corto; si ya cerró la OLT, no te quedes esperando
    try {
      this._log("END", "Cerrando socket");
      await Promise.race([this.connection.end(), sleep(800)]);
    } catch {}

    try {
      await this.connection.destroy();
    } catch {}
  }
}

module.exports = { OltClient };
