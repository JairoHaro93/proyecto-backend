// src/utils/olt.js
const { Telnet } = require("telnet-client");

const LOGIN_PROMPT = />>\s*User name:\s*$/im;
const PASS_PROMPT  = />>\s*User password:\s*$|password:\s*$/im;

// Huawei suele quedar como:  <MA5800-X15>  o  MA5800-X15>  o  MA5800-X15#
const SHELL_PROMPT = /<[^>]+>\s*$|[\w.-]+[>#]\s*$/m;

class OltClient {
  constructor(opts = {}) {
    this.host = opts.host;
    this.port = opts.port ?? 23;
    this.username = opts.username;
    this.password = opts.password;
    this.timeout = opts.timeout ?? 20000;
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
      timeout: this.timeout,

      // Telnet negotiation (Huawei envía IAC al inicio)
      negotiationMandatory: false,

      // Autologin
      username: this.username,
      password: this.password,
      loginPrompt: LOGIN_PROMPT,
      passwordPrompt: PASS_PROMPT,

      // “Listo” cuando detecta el prompt del sistema
      shellPrompt: SHELL_PROMPT,

      // muy importante para Huawei: CRLF
      ors: "\r\n",
      irs: "\r\n",

      // opcional
      initialLFCR: false,
    };

    this.log("connect()", { host: this.host, port: this.port });
    await this.conn.connect(params);
    this.log("connected");
  }

  async exec(cmd) {
    if (!this.conn) throw new Error("Not connected");
    this.log("exec:", cmd);

    return await this.conn.exec(cmd, {
      timeout: this.timeout,
      shellPrompt: SHELL_PROMPT,
    });
  }

  async end() {
    if (!this.conn) return;
    try {
      await this.conn.end();
    } catch (_) {}
    this.conn = null;
  }
}

module.exports = { OltClient };
