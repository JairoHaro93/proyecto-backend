// src/utils/olt.js
const { Telnet } = require("telnet-client");

/** Prompts Huawei: user(>) / enable(#) / config(#) / interface(...)# */
const PROMPT_ANY =
  /(?:MA5800[^\r\n]*[>#]\s*|<[^>\r\n]+>\s*|\[[^\]\r\n]+\]\s*|[>#]\s*)[\s\x00-\x1f\x7f-\x9f]*$/m;

const LOGIN_PROMPT = /User\s*name\s*:\s*/i;
const PASS_PROMPT = /User\s*password\s*:\s*/i;

const FAILED_LOGIN =
  /Username\s+or\s+password\s+invalid|The IP address has been locked|cannot log on it|locked/i;

const NEEDS_CR = /\{\s*<cr>[\s\S]*\}\s*:\s*$/im;
const MORE_PROMPT = /----\s*More\s*\(\s*Press\s*'Q'\s*to\s*break\s*\)\s*----/im;

const LOGOUT_CONFIRM = /Are you sure to log out\?\s*\(y\/n\)\[n\]\s*:\s*$/im;

const WAIT_PROMPT_OR_CR_OR_MORE = new RegExp(
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

    this.connection.on("error", (e) => {
      if (this._closing && e?.code === "ECONNRESET") return; // normal en Huawei al cerrar
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

    await sleep(120);
    await this.ensurePrompt();
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

  /**
   * Ejecuta comando y:
   * - si pide {<cr>}: envía ENTER extra
   * - si sale "---- More ----": envía 'q' para cortar y volver al prompt
   */
  async exec(cmd, opts = {}) {
    const c = String(cmd || "").trim();
    if (!c) return "";

    await this.ensurePrompt();

    let raw = await this.connection.send(c, {
      ors: "\r\n",
      waitFor: WAIT_PROMPT_OR_CR_OR_MORE,
      timeout: this.timeout,
      ...opts,
    });

    let clean = sanitize(raw);

    // 1) Caso <cr>
    if (NEEDS_CR.test(clean)) {
      const raw2 = await this.connection.send("", {
        ors: "\r\n",
        waitFor: WAIT_PROMPT_OR_CR_OR_MORE,
        timeout: this.timeout,
      });
      raw = String(raw) + "\n" + String(raw2);
      clean = sanitize(raw);
    }

    // 2) Caso paginado: cortamos con 'q' y esperamos prompt
    if (MORE_PROMPT.test(clean)) {
      const rawQ = await this.connection.send("q", {
        ors: "", // NO enviar CRLF
        waitFor: PROMPT_ANY,
        timeout: this.timeout,
      });
      raw = String(raw) + "\n" + String(rawQ);
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

  async destroy() {
    try {
      await this.connection.destroy();
    } catch {}
  }
}

module.exports = { OltClient };
