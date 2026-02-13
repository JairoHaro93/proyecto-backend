// src/utils/olt.js
const { Telnet } = require("telnet-client");

/** Prompt típico Huawei: MA5800-X15>  MA5800-X15#  MA5800-X15(config)# ... */
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

// ✅ paginado Huawei
const MORE_PROMPT = /----\s*More\s*\(\s*Press\s*'Q'\s*to\s*break\s*\)\s*----/im;

// Espera prompt o {<cr>} o "More"
const WAIT_PROMPT_OR_CR_OR_MORE = new RegExp(
  `${PROMPT_ANY.source}|${NEEDS_CR.source}|${MORE_PROMPT.source}`,
  "im"
);

// Espera prompt o "More" (para continuar páginas)
const WAIT_PROMPT_OR_MORE = new RegExp(
  `${PROMPT_ANY.source}|${MORE_PROMPT.source}`,
  "im"
);

function sanitize(s = "") {
  return String(s)
    // ANSI ESC sequences
    .replace(/\x1B\[[0-9;?]*[ -/]*[@-~]/g, "")
    // a veces queda algo como "[37D" (cursor-left) sin ESC visible
    .replace(/\[\d{1,4}D/g, "")
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
      // Huawei suele tirar ECONNRESET al cerrar (normal)
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

    // Huawei a veces termina banners un poco después
    await sleep(120);
    await this.ensurePrompt();

    // Opcional: intenta desactivar paginado si existe (no rompe si no existe)
    await this.connection.send("screen-length 0 temporary", {
      ors: "\r\n",
      waitFor: WAIT_PROMPT_OR_MORE,
      timeout: 1500,
    }).catch(() => {});
    await this.connection.send("scroll", {
      ors: "\r\n",
      waitFor: WAIT_PROMPT_OR_MORE,
      timeout: 1500,
    }).catch(() => {});

    await this.ensurePrompt();
    return this;
  }

  /** Deja la consola lista en prompt (ENTER vacío) */
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
   * Ejecuta comando y maneja:
   *  - "{ <cr> ... }:"  -> manda ENTER extra
   *  - "---- More ----" -> manda SPACE hasta terminar
   */
  async exec(cmd, opts = {}) {
    const c = String(cmd || "").trim();
    if (!c) return "";

    await this.ensurePrompt();

    // 1) manda comando esperando prompt / <cr> / more
    let raw = await this.connection.send(c, {
      ors: "\r\n",
      waitFor: WAIT_PROMPT_OR_CR_OR_MORE,
      timeout: this.timeout,
      ...opts,
    });

    let acc = String(raw);

    // 2) si pidió <cr>, manda ENTER y sigue esperando (puede caer en more también)
    if (NEEDS_CR.test(acc)) {
      const raw2 = await this.connection.send("", {
        ors: "\r\n",
        waitFor: WAIT_PROMPT_OR_CR_OR_MORE,
        timeout: this.timeout,
      });
      acc += "\n" + String(raw2);
    }

    // 3) si hay "More", manda SPACE hasta que termine y aparezca prompt
    let guard = 0;
    while (MORE_PROMPT.test(acc) && guard < 80) {
      guard++;
      const more = await this.connection.send(" ", {
        ors: "", // 👈 tecla, no comando
        waitFor: WAIT_PROMPT_OR_MORE,
        timeout: this.timeout,
      });
      acc += "\n" + String(more);
    }

    return sanitize(acc);
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
}

module.exports = { OltClient };
