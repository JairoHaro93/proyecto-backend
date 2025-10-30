const { Telnet } = require("telnet-client");

// Prompts tolerantes
const SHELL_PROMPT =
  /(?:<[^>\r\n]+>\s*$|\[[^\]\r\n]+\]\s*$|[A-Z0-9-]+>\s*$|[>#]\s*$)/m;
const LOGIN_PROMPT =
  /(?:>{2}\s*)?(?:User\s+name|Login(?:\s+username)?)\s*:\s*$/im;
const PASS_PROMPT = /(?:>{2}\s*)?User\s+password\s*:\s*$/im;
const PAGE_REGEX = /-+\s*More[\s\S]*?-+/;

function sanitize(out = "") {
  return out
    .replace(/\x1B\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
}
function trunc(s = "", max = 1200) {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n…[${s.length - max} chars más]`;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pickEOL(mode) {
  const m = String(mode || "CRLF").toUpperCase();
  if (m === "CR") return "\r";
  if (m === "LF") return "\n";
  return "\r\n"; // CRLF por defecto
}

class OltClient {
  constructor({
    host,
    port = 23,
    username,
    password,
    timeout = 8000,
    debug = false,
    showCreds = false,

    // ✅ NUEVO: controles de escritura y fin de línea
    userEol = "CRLF", // "CRLF" | "CR" | "LF"
    passEol = "CRLF", // "CRLF" | "CR" | "LF"
    typeMsUser = 0, // retardo (ms) entre caracteres de username
    typeMsPass = 0, // retardo (ms) entre caracteres de password
  }) {
    this.connection = new Telnet();
    this.host = host;
    this.port = port;
    this.username = username ?? "";
    this.password = password ?? "";
    this.timeout = timeout;
    this.debug = debug;
    this.showCreds = showCreds;

    this.userEol = pickEOL(userEol);
    this.passEol = pickEOL(passEol);
    this.typeMsUser = Number(typeMsUser) || 0;
    this.typeMsPass = Number(typeMsPass) || 0;

    this.connection.on("timeout", () => this._log("TIMEOUT"));
    this.connection.on("close", () => this._log("CLOSE"));
    this.connection.on("error", (e) => this._log("ERROR", e?.message || e));
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
    const hexSpaced = buf.toString("hex").replace(/(..)/g, "$1 ").trim();
    const codepoints = Array.from(raw)
      .map((ch) => ch.codePointAt(0).toString(16).padStart(4, "0"))
      .join(" ");
    this._log(
      "CREDS",
      `${label}: visible=${visible} | len_bytes=${buf.length} | hex=${hexSpaced} | ucs4=${codepoints}`
    );
  }

  async _typeAndWait(text, eol, waitfor) {
    // escribe char-por-char si typeMs>0, si no, manda de una
    const ms = waitfor === PASS_PROMPT ? this.typeMsUser : this.typeMsPass; // heurística
    const toType = String(text ?? "");
    if (ms > 0) {
      for (const ch of toType) {
        await this.connection.send(ch); // sin waitfor aquí
        await sleep(ms);
      }
      return this.connection.send(eol, { waitfor, timeout: this.timeout });
    }
    // envío directo
    return this.connection.send(toType + eol, {
      waitfor,
      timeout: this.timeout,
    });
  }

  async connect() {
    this._log("CONNECT", `${this.host}:${this.port}`);

    await this.connection.connect({
      host: this.host,
      port: this.port,
      shellPrompt: SHELL_PROMPT,
      timeout: this.timeout,
      irs: "\r\n",
      ors: "\r\n",
      negotiationMandatory: false,
      stripShellPrompt: false, // ver prompt/banners tal cual
      pageSeparator: PAGE_REGEX,
    });

    // muestra exactamente lo que cargó Node
    this._dumpCred("username", this.username);
    this._dumpCred("password", this.password);

    this._log("WAIT", "loginPrompt");
    await this.connection.send("\r\n", {
      waitfor: LOGIN_PROMPT,
      timeout: this.timeout,
    });
    this._log("PROMPT", ">>User name:");

    // USER
    this._log(
      "SEND",
      `username="${this.username}" eol=${JSON.stringify(this.userEol)} typeMs=${
        this.typeMsUser
      }`
    );
    const afterUser = await this._typeAndWait(
      this.username,
      this.userEol,
      PASS_PROMPT
    );
    if (afterUser) this._log("AFTER_USER", trunc(sanitize(afterUser)));

    // PASS
    this._log(
      "SEND",
      `password="***" (len=${this.password.length}) eol=${JSON.stringify(
        this.passEol
      )} typeMs=${this.typeMsPass}`
    );
    const afterPass = await this._typeAndWait(
      this.password,
      this.passEol,
      SHELL_PROMPT
    ).catch(() => "");

    const text = sanitize(String(afterPass || ""));
    if (text) this._log("AFTER_PASS", trunc(text));

    // ¿falló?
    const failed =
      /Username\s+or\s+password\s+invalid/i.test(text) ||
      LOGIN_PROMPT.test(text) ||
      PASS_PROMPT.test(text);

    if (failed) {
      this._log("AUTH", "Credenciales inválidas (la OLT re-pidió login).");
      throw new Error(
        "Autenticación OLT fallida: usuario/contraseña inválidos."
      );
    }

    await this._execAndLog("screen-length 0 temporary");
    this._log("READY", "Sesión autenticada y lista");
    return this;
  }

  async _execAndLog(cmd, opts = {}) {
    this._log("EXEC", cmd);
    const raw = await this.connection.exec(cmd, {
      shellPrompt: SHELL_PROMPT,
      ors: "\r\n",
      execTimeout: this.timeout,
      ...opts,
    });
    const clean = sanitize(raw);
    if (clean) this._log("OUTPUT", trunc(clean));
    return clean;
  }

  async exec(cmd, opts = {}) {
    return this._execAndLog(cmd, opts);
  }

  async end() {
    try {
      this._log("EXEC", "quit");
      await this.connection.exec("quit", { execTimeout: 1500 });
    } catch {}
    try {
      this._log("END", "Cerrando socket");
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
