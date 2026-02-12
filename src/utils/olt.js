// src/utils/olt.js
const { Telnet } = require("telnet-client");

// ===============================
// Prompts Huawei / Telnet
// ===============================

// Login prompts (Huawei suele mostrar: ">>User name:" / ">>User password:")
const LOGIN_PROMPT =
  /(?:>{2}\s*)?(?:User\s+name|Login(?:\s+username)?)\s*:\s*$/im;

const PASS_PROMPT =
  /(?:>{2}\s*)?(?:User\s+password|Password)\s*:\s*$/im;

// ✅ Prompt del sistema (Huawei suele ser: <MA5800-X15> o algo con > o #)
// ⚠️ IMPORTANTE: Huawei/Telnet a veces manda bytes de control al final (GA/IAC),
// por eso permitimos tail de bytes no imprimibles y 0xF9 (GA) en unicode.
const SHELL_PROMPT_END =
  /(?:<[^>\r\n]+>|\[[^\]\r\n]+\]|[A-Z0-9-]+>|[\w.-]+[>#]|[>#])[\s\x00-\x1f\x7f-\x9f\u00f9\u00ff]*$/m;

// Prompt “en cualquier parte” (para waitfor) — más tolerante
const SHELL_PROMPT_ANY =
  /<[^>\r\n]+>|\[[^\]\r\n]+\]|[\w.-]+[>#]|[>#]/m;

// Paginación tipo "---- More ----" (varía)
// Si tu OLT usa otra cadena, ajústala.
const PAGE_REGEX = /-+\s*More[\s\S]*?-+/i;

// ===============================
// Helpers
// ===============================
function sanitize(out = "") {
  return String(out)
    .replace(/\x1B\[[0-9;?]*[ -/]*[@-~]/g, "") // quita ANSI
    .replace(/\r\n/g, "\n")
    .trim();
}

function trunc(s = "", max = 2000) {
  s = String(s || "");
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
    timeout = 20000,
    debug = false,
    showCreds = false,

    // Controles de escritura / fin de línea
    userEol = "CRLF", // "CRLF" | "CR" | "LF"
    passEol = "CRLF", // "CRLF" | "CR" | "LF"
    typeMsUser = 0,   // retardo (ms) entre caracteres del username
    typeMsPass = 0,   // retardo (ms) entre caracteres del password
  } = {}) {
    this.connection = new Telnet();

    this.host = host;
    this.port = Number(port);
    this.username = username ?? "";
    this.password = password ?? "";

    this.timeout = Number(timeout) || 20000;
    this.debug = !!debug;
    this.showCreds = !!showCreds;

    this.userEol = pickEOL(userEol);
    this.passEol = pickEOL(passEol);
    this.typeMsUser = Number(typeMsUser) || 0;
    this.typeMsPass = Number(typeMsPass) || 0;

    // logs útiles de lifecycle
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

 async _typeAndWait({ text, eol, waitfor, typeMs }) {
  const toType = String(text ?? "");
  const ms = Number(typeMs) || 0;

  if (ms > 0) {
    for (const ch of toType) {
      await this.connection.send(ch, { ors: "" }); // no añadir enter aquí
      await sleep(ms);
    }
    // manda SOLO el enter (ors=eol)
    return this.connection.send("", { waitfor, timeout: this.timeout, ors: eol });
  }

  // manda texto y que telnet-client agregue el enter (ors=eol)
  return this.connection.send(toType, {
    waitfor,
    timeout: this.timeout,
    ors: eol,
  });
}

  async connect() {
    if (!this.host) throw new Error("OLT host requerido (OLT_HOST).");
    if (!this.port) throw new Error("OLT port requerido (OLT_PORT).");

    this._log("CONNECT", `${this.host}:${this.port}`);

    // Conecta socket Telnet y prepara prompts
    await this.connection.connect({
      host: this.host,
      port: this.port,

      // ✅ IMPORTANTES: si no, telnet-client usa timeouts cortos en send/exec
      timeout: this.timeout,
      execTimeout: this.timeout,
      sendTimeout: this.timeout,

      shellPrompt: SHELL_PROMPT_END,
      negotiationMandatory: false,

      irs: "\r\n",
      ors: "\r\n",

      stripShellPrompt: false,
      pageSeparator: PAGE_REGEX,
    });

    this._dumpCred("username", this.username);
    this._dumpCred("password", this.password);

    // “despertar” el banner / prompt
    this._log("WAIT", "loginPrompt");
    await this.connection.send("\r\n", {
      waitfor: LOGIN_PROMPT,
      timeout: this.timeout,
      ors: "\r\n",
    });
    this._log("PROMPT", "login");

    // USERNAME
    this._log(
      "SEND",
      `username="${this.showCreds ? this.username : "***"}" eol=${JSON.stringify(
        this.userEol
      )} typeMs=${this.typeMsUser}`
    );

    const afterUser = await this._typeAndWait({
      text: this.username,
      eol: this.userEol,
      waitfor: PASS_PROMPT,
      typeMs: this.typeMsUser,
    });

    if (afterUser) this._log("AFTER_USER", trunc(sanitize(afterUser)));

    // PASSWORD
    this._log(
      "SEND",
      `password="***" (len=${this.password.length}) eol=${JSON.stringify(
        this.passEol
      )} typeMs=${this.typeMsPass}`
    );

    // ✅ NO tragar errores: si no llega el prompt, debe fallar aquí
    const afterPass = await this._typeAndWait({
      text: this.password,
      eol: this.passEol,
      waitfor: SHELL_PROMPT_ANY,
      typeMs: this.typeMsPass,
    });

    const text = sanitize(afterPass || "");

    const locked =
  /IP address has been locked/i.test(text) ||
  /you cannot log on it/i.test(text) ||
  /please retry to log on/i.test(text);

if (locked) {
  throw new Error("OLT: la IP del servidor está bloqueada por intentos. Desbloquear en OLT o esperar expiración.");
}


    if (text) this._log("AFTER_PASS", trunc(text));

    // ¿re-pidió login? => credenciales incorrectas o modo raro
    const failed =
      /Username\s+or\s+password\s+invalid/i.test(text) ||
      LOGIN_PROMPT.test(text) ||
      PASS_PROMPT.test(text);

    if (failed) {
      this._log("AUTH", "Credenciales inválidas (OLT re-pidió login).");
      throw new Error("Autenticación OLT fallida: usuario/contraseña inválidos.");
    }

    // ✅ Desactiva paginación (si responde lento, ahora ya no corta por prompt)
    await this.exec("screen-length 0 temporary");

    this._log("READY", "Sesión autenticada y lista");
    return this;
  }

  async exec(cmd, opts = {}) {
    const command = String(cmd || "").trim();
    if (!command) return "";

    this._log("EXEC", command);

    // ✅ send + waitfor es más estable que exec() en Huawei/Telnet
    const raw = await this.connection.send(command, {
      waitfor: SHELL_PROMPT_ANY,
      timeout: this.timeout,
      ors: "\r\n",
      ...opts,
    });

    const clean = sanitize(raw);
    if (clean) this._log("OUTPUT", trunc(clean));
    return clean;
  }

  async end() {
    // intenta salir “bien”
    try {
      await this.connection.send("quit", {
        waitfor: /./m,
        timeout: 1500,
        ors: "\r\n",
      });
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
