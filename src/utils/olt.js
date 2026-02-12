// src/utils/olt.js
const { Telnet } = require("telnet-client");

// Prompt Huawei típico: MA5800-X15>
const SHELL_PROMPT =
  /(?:MA5800[^\r\n]*[>#]\s*$|<[^>\r\n]+>\s*$|\[[^\]\r\n]+\]\s*$|[>#]\s*$)/m;

// Prompts de login (Huawei suele mostrar ">>User name:" / ">>User password:")
const LOGIN_PROMPT = /User\s*name\s*:\s*/i;
const PASS_PROMPT = /User\s*password\s*:\s*/i;

// Mensajes típicos de fallo (incluye bloqueo de IP)
const FAILED_LOGIN =
  /Username\s+or\s+password\s+invalid|The IP address has been locked|cannot log on it|locked/i;

// “More” paging (por si aparece)
const PAGE_REGEX = /-+\s*More[\s\S]*?-+/;

function stripAnsiAndControls(s = "") {
  return String(s)
    .replace(/\x1B\[[0-9;?]*[ -/]*[@-~]/g, "") // ANSI
    .replace(/\r\n/g, "\n")
    .trim();
}

function trunc(s = "", max = 1600) {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n…[${s.length - max} chars más]`;
}

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

    this.connection.on("timeout", () => this._log("TIMEOUT"));
    this.connection.on("close", () => this._log("CLOSE"));
    this.connection.on("error", (e) => this._log("ERROR", e?.message || e));

    // Ojo: este 'data' es buffer (sirve para ver si te está llegando prompt/banner)
    this.connection.on("data", (buf) => {
      if (!this.debug) return;
      const txt = stripAnsiAndControls(buf.toString("utf8"));
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
    const visible = JSON.stringify(raw);
    const buf = Buffer.from(raw, "utf8");
    this._log("CREDS", `${label}: visible=${visible} | bytes=${buf.length}`);
  }

  async connect() {
    if (!this.host) throw new Error("OLT_HOST no definido");
    if (!this.username) throw new Error("OLT_USERNAME no definido");
    if (!this.password) throw new Error("OLT_PASSWORD no definido");

    this._log("CONNECT", `${this.host}:${this.port} t=${this.timeout}`);

    this._dumpCred("username", this.username);
    this._dumpCred("password", this.password);

    // ✅ Usa login automático del telnet-client (más robusto)
    // - loginPrompt/passwordPrompt/failedLoginMatch/username/password están soportados por connect(). :contentReference[oaicite:4]{index=4}
    await this.connection.connect({
      host: this.host,
      port: this.port,

      // Socket inactivity timeout
      timeout: this.timeout,

      // Prompts
      shellPrompt: SHELL_PROMPT,
      loginPrompt: LOGIN_PROMPT,
      passwordPrompt: PASS_PROMPT,
      failedLoginMatch: FAILED_LOGIN,

      // Credenciales
      username: this.username,
      password: this.password,

      // CRLF como telnet manual (Huawei suele ir mejor con CRLF)
      irs: "\r\n",
      ors: "\r\n", // por defecto es '\n', aquí lo fijamos :contentReference[oaicite:5]{index=5}

      // Para que no te cierre apenas conecta esperando input
      initialLFCR: true, // soportado por connect() :contentReference[oaicite:6]{index=6}

      // Timeouts de respuesta
      execTimeout: this.timeout, // soportado :contentReference[oaicite:7]{index=7}
      sendTimeout: this.timeout, // soportado :contentReference[oaicite:8]{index=8}

      // Limpieza/format
      stripControls: true,
      newlineReplace: "\n",

      // Paging
      pageSeparator: PAGE_REGEX,
      echoLines: 0,
      stripShellPrompt: false,

      // IMPORTANT: negotiationMandatory por defecto es true; NO lo desactives con OLT. :contentReference[oaicite:9]{index=9}
    });

    this._log("READY", "Sesión lista (con login)");

    // ✅ Quita paginado (si el comando no existe o no tiene permisos, lo ignoramos)
    await this.exec("screen-length 0 temporary").catch(() => {});

    return this;
  }

  async exec(cmd, opts = {}) {
    this._log("EXEC", cmd);

    const raw = await this.connection.exec(cmd, {
      shellPrompt: SHELL_PROMPT,
      irs: "\r\n",
      ors: "\r\n",
      execTimeout: this.timeout,
      ...opts,
    });

    const clean = stripAnsiAndControls(raw);
    if (clean) this._log("OUT", trunc(clean));
    return clean;
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
