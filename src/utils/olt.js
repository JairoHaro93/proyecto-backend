// src/utils/olt.js
const { Telnet } = require("telnet-client");

// ===== Prompts Huawei MA5800 =====
const LOGIN_PROMPT = />>\s*User\s+name:\s*$/im;
const PASS_PROMPT  = />>\s*User\s+password:\s*$/im;

// Prompt final (tu OLT muestra: MA5800-X15>)
const SHELL_PROMPT_ANY = /(MA5800-X15[>#])|(<[^>\r\n]+>)|([\w.-]+[>#])|([>#])/m;

// Prompt al final (tolerante a bytes/control chars telnet al final)
const SHELL_PROMPT_END =
  /((MA5800-X15[>#])|(<[^>\r\n]+>)|([\w.-]+[>#])|([>#]))[\s\x00-\x1f\x7f-\x9f\u00f9\u00ff]*$/m;

// (Opcional) paginación
const PAGE_REGEX = /-+\s*More[\s\S]*?-+/i;

// ===== Helpers =====
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sanitize(out = "") {
  return String(out)
    .replace(/\x1B\[[0-9;?]*[ -/]*[@-~]/g, "") // ANSI
    .replace(/\r\n/g, "\n")
    .trim();
}

function pickEOL(mode) {
  const m = String(mode || "CRLF").toUpperCase();
  if (m === "CR") return "\r";
  if (m === "LF") return "\n";
  return "\r\n";
}

class OltClient {
  constructor({
    host,
    port = 23,
    username,
    password,
    timeout = 20000,
    debug = false,

    userEol = "CRLF",
    passEol = "CRLF",
    typeMsUser = 0,
    typeMsPass = 0,
  } = {}) {
    this.connection = new Telnet();

    this.host = host;
    this.port = Number(port);
    this.username = String(username ?? "");
    this.password = String(password ?? "");
    this.timeout = Number(timeout) || 20000;
    this.debug = !!debug;

    this.userEol = pickEOL(userEol);
    this.passEol = pickEOL(passEol);
    this.typeMsUser = Number(typeMsUser) || 0;
    this.typeMsPass = Number(typeMsPass) || 0;

    this.connection.on("error", (e) => this._log("ERROR", e?.message || e));
    this.connection.on("close", () => this._log("CLOSE"));
    this.connection.on("timeout", () => this._log("TIMEOUT"));
  }

  _log(tag, msg = "") {
    if (!this.debug) return;
    const ts = new Date().toISOString();
    console.log(`[OLT][${ts}][${tag}] ${msg}`);
  }

  async _send(text, { waitfor, ors, timeout } = {}) {
    return this.connection.send(text ?? "", {
      waitfor,
      ors: ors ?? "\r\n",
      timeout: timeout ?? this.timeout,
    });
  }

  async _typeAndWait(text, { waitfor, eol, typeMs } = {}) {
    const toType = String(text ?? "");
    const ms = Number(typeMs) || 0;
    const ors = eol ?? "\r\n";

    // tecleo char-by-char si se requiere
    if (ms > 0) {
      for (const ch of toType) {
        await this._send(ch, { ors: "" });
        await sleep(ms);
      }
      // manda solo el Enter
      return this._send("", { waitfor, ors });
    }

    // manda texto y telnet-client agrega el enter (ors)
    return this._send(toType, { waitfor, ors });
  }

  async connect() {
    if (!this.host) throw new Error("OLT_HOST requerido");
    if (!this.port) throw new Error("OLT_PORT requerido");

    this._log("CONNECT", `${this.host}:${this.port}`);

    await this.connection.connect({
      host: this.host,
      port: this.port,

      timeout: this.timeout,
      execTimeout: this.timeout,
      sendTimeout: this.timeout,

      negotiationMandatory: false,
      irs: "\r\n",
      ors: "\r\n",

      shellPrompt: SHELL_PROMPT_END,
      stripShellPrompt: false,
      pageSeparator: PAGE_REGEX,
    });

    // 1) despertar banner / pedir prompt login
    this._log("WAIT", "loginPrompt");
    const wake = await this._send("", { waitfor: LOGIN_PROMPT, ors: "\r\n" });
    if (wake) this._log("WAKE", sanitize(wake));

    // 2) username
    this._log("SEND", `username (eol=${JSON.stringify(this.userEol)} typeMs=${this.typeMsUser})`);
    const afterUser = await this._typeAndWait(this.username, {
      waitfor: PASS_PROMPT,
      eol: this.userEol,
      typeMs: this.typeMsUser,
    });
    if (afterUser) this._log("AFTER_USER", sanitize(afterUser));

    // 3) password
    this._log("SEND", `password (len=${this.password.length} eol=${JSON.stringify(this.passEol)} typeMs=${this.typeMsPass})`);
    const afterPass = await this._typeAndWait(this.password, {
      waitfor: SHELL_PROMPT_ANY,  // esperamos prompt final
      eol: this.passEol,
      typeMs: this.typeMsPass,
    });

    const text = sanitize(afterPass || "");
    if (text) this._log("AFTER_PASS", text);

    // detecta errores típicos Huawei
    if (/Username\s+or\s+password\s+invalid/i.test(text) || LOGIN_PROMPT.test(text) || PASS_PROMPT.test(text)) {
      throw new Error("Autenticación OLT fallida: usuario/contraseña inválidos.");
    }
    if (/IP address has been locked/i.test(text) || /you cannot log on/i.test(text)) {
      throw new Error("OLT: la IP del servidor está bloqueada por intentos. Desbloquear en OLT o esperar expiración.");
    }

    // opcional: desactiva paginación
    await this.exec("screen-length 0 temporary");

    this._log("READY", "Sesión lista");
    return this;
  }

  async exec(cmd) {
    const command = String(cmd || "").trim();
    if (!command) return "";

    this._log("EXEC", command);

    const raw = await this._send(command, {
      waitfor: SHELL_PROMPT_ANY,
      ors: "\r\n",
      timeout: this.timeout,
    });

    const clean = sanitize(raw);
    if (clean) this._log("OUT", clean);
    return clean;
  }

  async end() {
    try {
      await this._send("quit", { timeout: 1500 });
    } catch {}
    try {
      this._log("END", "closing");
      await this.connection.end();
    } catch {}
  }
}

module.exports = { OltClient };
