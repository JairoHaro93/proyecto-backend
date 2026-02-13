// src/utils/olt.js
const { Telnet } = require("telnet-client");

/** Prompt típico Huawei: MA5800-X15>, MA5800-X15#, MA5800-X15(config)# */
const PROMPT_ANY =
  /(?:MA5800[^\r\n]*[>#]\s*|MA5800[^\r\n]*\([^)]+\)[#>]\s*|<[^>\r\n]+>\s*|\[[^\]\r\n]+\]\s*|[>#]\s*)[\s\x00-\x1f\x7f-\x9f]*$/m;

// Login prompts Huawei
const LOGIN_PROMPT = /User\s*name\s*:\s*/i;
const PASS_PROMPT  = /User\s*password\s*:\s*/i;

// Fallos típicos (incluye lock)
const FAILED_LOGIN =
  /Username\s+or\s+password\s+invalid|The IP address has been locked|cannot log on it|locked/i;

// Caso especial del CLI: pide <cr> para ejecutar
const NEEDS_CR = /\{\s*<cr>[\s\S]*\}\s*:\s*$/im;

// Paginación (a veces te pide ENTER/More)
const MORE_PROMPT =
  /----\s*More[\s\S]*?----|--\s*More\s*--|Press\s+Q\s+to\s+break/i;

// Logout confirm Huawei
const LOGOUT_CONFIRM = /Are you sure to log out\?\s*\(y\/n\)\[n\]\s*:\s*$/im;

// Espera prompt o {<cr>} o paginación
const WAIT_ANY = new RegExp(
  `${PROMPT_ANY.source}|${NEEDS_CR.source}|${MORE_PROMPT.source}`,
  "im"
);

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

    if (this.debug) {
      this.connection.on("data", (buf) => {
        const txt = sanitize(buf.toString("utf8"));
        if (txt) console.log("[OLT]", txt);
      });
    }

    this.connection.on("error", (e) => {
      if (this._closing && e?.code === "ECONNRESET") {
        if (this.debug) console.log("[OLT][INFO] ECONNRESET al cerrar (normal en Huawei)");
        return;
      }
      if (this.debug) console.log("[OLT][ERROR]", e?.message || e);
    });

    this.connection.on("close", () => {
      if (this.debug) console.log("[OLT][CLOSE]");
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

    await sleep(120);
    await this.ensurePrompt();
    return this;
  }

  /** ENTER vacío para quedar en prompt */
  async ensurePrompt() {
    try {
      await this.connection.send("", {
        ors: "\r\n",
        waitFor: PROMPT_ANY,
        timeout: 2500,
      });
    } catch {}
  }

  /** Ejecuta comando + maneja "{ <cr> }:" + maneja paging */
  async exec(cmd) {
    const c = String(cmd || "");
    if (!c.trim()) return "";

    await this.ensurePrompt();

    // 👇 importante: NO tocar espacios, los dejamos tal cual
    const raw1 = await this.connection.send(c, {
      ors: "\r\n",
      waitFor: WAIT_ANY,
      timeout: this.timeout,
    });

    let out = raw1;
    let lastChunk = sanitize(raw1);

    // Caso: pide <cr> (ENTER extra)
    if (NEEDS_CR.test(lastChunk)) {
      const raw2 = await this.connection.send("", {
        ors: "\r\n",
        waitFor: WAIT_ANY,
        timeout: this.timeout,
      });
      out += "\n" + raw2;
      lastChunk = sanitize(raw2);
    }

    // Caso: paginación -> seguir enviando ENTER hasta que vuelva el prompt final
    let guard = 0;
    while (MORE_PROMPT.test(lastChunk) && guard < 80) {
      guard += 1;
      const rawN = await this.connection.send("", {
        ors: "\r\n",
        waitFor: WAIT_ANY,
        timeout: this.timeout,
      });
      out += "\n" + rawN;
      lastChunk = sanitize(rawN);
    }

    return sanitize(out);
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

  async destroy() {
    try { await this.connection.destroy(); } catch {}
  }
}

module.exports = { OltClient, PROMPT_ANY };
