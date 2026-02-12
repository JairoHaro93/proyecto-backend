// src/utils/olt.js
const { Telnet } = require("telnet-client");

const LOGIN_PROMPT = />>\s*User name:\s*$/im;
const PASS_PROMPT  = />>\s*User password:\s*$/im;

// Ajusta si tu prompt final es distinto
const SHELL_PROMPT = /<[^>]+>\s*$/m;

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

      // ✅ IMPORTANTES (si no, exec() se queda en 2s)
      execTimeout: this.timeout,
      sendTimeout: this.timeout,
      timeout: this.timeout,

      negotiationMandatory: false,

      username: this.username,
      password: this.password,
      loginPrompt: LOGIN_PROMPT,
      passwordPrompt: PASS_PROMPT,
      shellPrompt: SHELL_PROMPT,

      irs: "\r\n",
      ors: "\r\n",
    };

    this.log("connect()", { host: this.host, port: this.port, t: this.timeout });
    await this.conn.connect(params);
    this.log("connected");
  }

  async exec(cmd) {
    if (!this.conn) throw new Error("Not connected");
    this.log("exec:", cmd);

    // ✅ refuerza timeouts también aquí
    return await this.conn.exec(cmd, {
      shellPrompt: SHELL_PROMPT,
      execTimeout: this.timeout,
      timeout: this.timeout,
    });
  }

  async end() {
    if (!this.conn) return;
    try { await this.conn.end(); } catch (_) {}
    this.conn = null;
  }
}

module.exports = { OltClient };
