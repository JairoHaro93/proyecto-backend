// src/utils/olt.session.js
require("dotenv").config();
const { OltClient } = require("./olt");

const IDLE_CLOSE_MS = Number(process.env.OLT_IDLE_CLOSE_MS || 180000); // 180s
const FAIL_COOLDOWN_MS = Number(process.env.OLT_FAIL_COOLDOWN_MS || 30000);

class OltHttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.name = "OltHttpError";
  }
}

class OltSessionManager {
  constructor() {
    this.client = null;

    // cola FIFO “resiliente”
    this._tail = Promise.resolve();

    this.idleTimer = null;
    this.lastFailAt = 0;

    this.busy = 0;           // comandos ejecutándose (debería ser 0/1 por la cola)
    this.pending = 0;        // cuántos están en cola (incluye el actual)
    this.lastUsedAt = 0;     // ms epoch del último uso (para idleLeft)
  }

  _clearIdle() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  _armIdleClose() {
    this._clearIdle();
    // solo armar cuando está conectado y NO está ejecutando
    if (!this.client || this.busy > 0) return;

    const now = Date.now();
    const base = this.lastUsedAt || now;
    const left = Math.max(0, IDLE_CLOSE_MS - (now - base));

    this.idleTimer = setTimeout(() => {
      // si justo se puso busy, reprograma
      if (this.busy > 0) return this._armIdleClose();
      this.close("idle").catch(() => {});
    }, left || 1);
  }

  _cooldownCheck() {
    const now = Date.now();
    const diff = now - this.lastFailAt;
    if (diff < FAIL_COOLDOWN_MS) {
      const s = Math.ceil((FAIL_COOLDOWN_MS - diff) / 1000);
      throw new OltHttpError(429, `OLT: espera ${s}s antes de reintentar`);
    }
  }

  async _ensureConnected({ debug = false } = {}) {
    if (this.client) return;

    this._cooldownCheck();

    const client = new OltClient({
      host: process.env.OLT_HOST,
      port: Number(process.env.OLT_PORT || 8090),
      username: process.env.OLT_USERNAME,
      password: process.env.OLT_PASSWORD,
      timeout: Number(process.env.OLT_TIMEOUT_MS || 20000),
      debug: !!debug,
    });

    try {
      await client.connect();
      this.client = client;
      this.lastUsedAt = Date.now();
      this._armIdleClose();
    } catch (e) {
      this.lastFailAt = Date.now();
      try { await client.destroy(); } catch {}
      throw e;
    }
  }

  /**
   * Ejecuta un comando en cola FIFO.
   * Importante: si un run falla, la cola NO se rompe (tail queda “vivo”).
   */
  run(cmd, opts = {}) {
    this.pending++;

    const task = this._tail.then(async () => {
      this.busy++;
      this._clearIdle();

      try {
        await this._ensureConnected(opts);
        const out = await this.client.exec(cmd);
        this.lastUsedAt = Date.now();
        return out;
      } catch (e) {
        // si algo falla, ponemos cooldown y cerramos sesión para dejar limpio
        this.lastFailAt = Date.now();
        await this.close("error").catch(() => {});
        throw e;
      } finally {
        this.busy--;
        this.pending--;
        this._armIdleClose();
      }
    });

    // 🔒 clave: mantener el tail siempre resuelto aunque task falle
    this._tail = task.catch(() => {});
    return task;
  }

  status() {
    const connected = !!this.client;
    const now = Date.now();
    const idleLeftMs = connected
      ? Math.max(0, IDLE_CLOSE_MS - (now - (this.lastUsedAt || now)))
      : 0;

    return {
      connected,
      busy: this.busy > 0,
      pending: this.pending,
      idleLeftSec: Math.ceil(idleLeftMs / 1000),
      lastUsedAt: this.lastUsedAt ? new Date(this.lastUsedAt).toISOString() : null,
    };
  }

  async close(_reason = "manual") {
    this._clearIdle();
    if (!this.client) return;

    const c = this.client;
    this.client = null;

    try {
      await c.end();
    } finally {
      try { await c.destroy(); } catch {}
    }
  }
}

let singleton = null;
function getOltSession() {
  if (!singleton) singleton = new OltSessionManager();
  return singleton;
}

module.exports = { getOltSession, OltHttpError };
