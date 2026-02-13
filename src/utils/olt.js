// src/utils/olt.js
const { Telnet } = require("telnet-client");

/** Prompt Huawei: MA5800-X15>  / MA5800-X15# / MA5800-X15(config)# */
const PROMPT_ANY =
  /(?:MA5800[^\r\n]*[>#]\s*|<[^>\r\n]+>\s*|\[[^\]\r\n]+\]\s*|[>#]\s*)[\s\x00-\x1f\x7f-\x9f]*$/m;

const LOGIN_PROMPT = /User\s*name\s*:\s*/i;
const PASS_PROMPT = /User\s*password\s*:\s*/i;

const FAILED_LOGIN =
  /Username\s+or\s+password\s+invalid|The IP address has been locked|cannot log on it|locked/i;

/** CLI pide ENTER para ejecutar */
const NEEDS_CR = /\{\s*<cr>[\s\S]*\}\s*:\s*$/im;

/** Paging */
const MORE_PROMPT = /----\s*More\s*\(\s*Press\s*'Q'\s*to\s*break\s*\)\s*----/im;

/** Logout confirm */
const LOGOUT_CONFIRM = /Are you sure to log out\?\s*\(y\/n\)\[n\]\s*:\s*$/im;

/** Espera cualquiera de estos “finales parciales” */
const WAIT_ANY = new RegExp(
  `${PROMPT_ANY.source}|${NEEDS_CR.source}|${MORE_PROMPT.source}|${LOGOUT_CONFIRM.source}`,
  "im"
);

function sanitize(s = "") {
  return String(s)
    .replace(/\x1B\[[0-9;?]*[ -/]*[@-~]/g, "") // ANSI reales
    .replace(/\[\d+[ABCD]/g, "")              // restos tipo [37D
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
      if (this._closing && e?.code === "ECONNRESET") return; // normal Huawei al cerrar
      if (this.debug) console.log("[OLT][ERROR]", e?.message || e);
    });

    if (this.debug) {
      this.connection.on("data", (buf) => {
        const txt = sanitize(buf.toString("utf8"));
        if (txt) console.log("[OLT]", txt);
      });
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

    await sleep(120);
    await this.ensurePrompt();
    return this;
  }

  /**
   * Deja la consola lista.
   * Si quedó en "---- More ----", manda q para volver al prompt.
   */
  async ensurePrompt() {
    try {
      const r = await this.connection.send("", {
        ors: "\r\n",
        waitFor: WAIT_ANY,
        timeout: 2500,
      });

      const t = sanitize(r);

      // si quedó paginado, salir del paging
      if (MORE_PROMPT.test(t)) {
        await this.connection.send("q", {
          ors: "",
          waitFor: PROMPT_ANY,
          timeout: 2500,
        }).catch(() => {});
      }

      // si quedó esperando <cr>, también lo resolvemos
      if (NEEDS_CR.test(t)) {
        await this.connection.send("", {
          ors: "\r\n",
          waitFor: PROMPT_ANY,
          timeout: 2500,
        }).catch(() => {});
      }
    } catch {}
  }

  /**
   * Ejecuta comando y resuelve:
   * - { <cr> }: enviando ENTER
   * - ---- More ----: enviando ENTER hasta prompt
   */
  async exec(cmd) {
    const c = String(cmd || "").trim();
    if (!c) return "";

    await this.ensurePrompt();

    let raw = await this.connection.send(c, {
      ors: "\r\n",
      waitFor: WAIT_ANY,
      timeout: this.timeout,
    });

    let txt = sanitize(raw);

    // loop para resolver interacciones (CR / MORE) hasta llegar al prompt
    const MAX_STEPS = 80;
    let steps = 0;

    while ((NEEDS_CR.test(txt) || MORE_PROMPT.test(txt)) && steps < MAX_STEPS) {
      steps++;

      // 1) si pidió <cr> -> ENTER
      if (NEEDS_CR.test(txt)) {
        const r2 = await this.connection.send("", {
          ors: "\r\n",
          waitFor: WAIT_ANY,
          timeout: this.timeout,
        });
        raw = String(raw) + "\n" + String(r2);
        txt = sanitize(raw);
        continue;
      }

      // 2) si salió "More" -> ENTER (como tú haces manual)
      if (MORE_PROMPT.test(txt)) {
        const r3 = await this.connection.send("", {
          ors: "\r\n",
          waitFor: WAIT_ANY,
          timeout: this.timeout,
        });
        raw = String(raw) + "\n" + String(r3);
        txt = sanitize(raw);
        continue;
      }
    }

    return txt;
  }

  async end() {
    this._closing = true;
    await this.ensurePrompt();

    try {
      const resp = await this.connection.send("quit", {
        ors: "\r\n",
        waitFor: WAIT_ANY,
        timeout: 2500,
      }).catch(() => "");

      const t = sanitize(resp);
      if (LOGOUT_CONFIRM.test(t)) {
        await this.connection.send("y", { ors: "\r\n", timeout: 1500 }).catch(() => {});
      }
    } catch {}

    try { await this.connection.end(); } catch {}
  }

  async destroy() {
    try { await this.connection.destroy(); } catch {}
  }
}

module.exports = { OltClient };
