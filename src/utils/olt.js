// src/utils/olt.js
const { Telnet } = require("telnet-client");

// Prompts Huawei
const LOGIN_PROMPT = />>\s*User name:\s*$/im;
const PASS_PROMPT  = />>\s*User password:\s*$/im;

// ✅ Prompt al final (permitiendo bytes/control chars al final)
const SHELL_PROMPT_END =
  /(<[^>]+>|[\w.-]+[>#])[\s\x00-\x1f\x7f-\x9f\u00ff\u00f9]*$/m;

// ✅ Prompt “en cualquier parte” (para waitfor)
const SHELL_PROMPT_ANY =
  /<[^>]+>|[\w.-]+[>#]/m;

class OltClient {
  constructor(opts = {}) {
    this.host = opts.host;
    this.port = Number(opts.port ?? 23);
    this.username = opts.username;
    this.password = opts.password;
    this.timeout = Number(opts.timeout ?? 20000);
    this.debug = !!opts.debug;
    this.conn = null;
  }

  log(...a) {
    if (this.debug) console.log("[OLT]", ...a);
  }

  async connect() {
    this.conn = new Telnet();

    const params = {
      host: this.host,
      port: this.port,

      // ✅ IMPORTANTES para que no corte
      timeout: this.timeout,
      execTimeout: this.timeout,
      sendTimeout: this.timeout,

      negotiationMandatory: false,

      username: this.username,
      password: this.password,
      loginPrompt: LOGIN_PROMPT,
      passwordPrompt: PASS_PROMPT,

      // para que telnet-client sepa cuándo “terminó” una respuesta
      shellPrompt: SHELL_PROMPT_END,

      irs: "\r\n",
      ors: "\r\n",
    };

    this.log("connect()", { host: this.host, port: this.port, t: this.timeout });
    await this.conn.connect(params);
    this.log("connected");
  }

  // ✅ Usa send + waitfor (no anclado) para evitar el bug del prompt + bytes telnet
  async exec(cmd) {
    if (!this.conn) throw new Error("Not connected");
    this.log("exec:", cmd);

    const out = await this.conn.send(cmd, {
      waitfor: SHELL_PROMPT_ANY,
      timeout: this.timeout,
      ors: "\r\n",
    });

    return out;
  }

  async end() {
    if (!this.conn) return;
    try { await this.conn.end(); } catch (_) {}
    this.conn = null;
  }
}

module.exports = { OltClient };
