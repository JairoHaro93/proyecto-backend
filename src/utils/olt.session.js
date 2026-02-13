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
  constructor(profile = "default") {
    this.profile = profile;

    this.client = null;

    // cola FIFO para ejecutar comandos uno por uno
    this.queue = Promise.resolve();

    // métricas para status()
    this.busy = 0;      // comandos en ejecución
    this.pending = 0;   // comandos en cola (incluye el actual)
    this.lastUsedAt = 0;

    // idle close
    this.idleTimer = null;

    // cooldown tras fallo
    this.lastFailAt = 0;
  }

  _armIdleClose() {
    if (this.idleTimer) clearTimeout(this.idleTimer);

    // si no hay cliente, no armamos nada
    if (!this.client) return;

    this.idleTimer = setTimeout(async () => {
      // si justo está ejecutando algo, rearmamos y salimos
      if (this.busy > 0 || this.pending > 0) {
        this._armIdleClose();
        return;
      }
      await this.close("idle").catch(() => {});
    }, IDLE_CLOSE_MS);
  }

  async _ensureConnected({ debug = false } = {}) {
    if (this.client) return;

    const now = Date.now();
    const diff = now - this.lastFailAt;
    if (diff < FAIL_COOLDOWN_MS) {
      const s = Math.ceil((FAIL_COOLDOWN_MS - diff) / 1000);
      throw new OltHttpError(429, `OLT: espera ${s}s antes de reintentar`);
    }

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
      try {
        await client.destroy();
      } catch {}
      throw e;
    }
  }

  /**
   * Ejecuta un comando en la OLT en cola FIFO.
   * Retorna la salida del comando.
   */
  run(cmd, opts = {}) {
    this.pending++;

    const task = this.queue.then(async () => {
      this.busy++;
      try {
        await this._ensureConnected(opts);

        const out = await this.client.exec(cmd);

        this.lastUsedAt = Date.now();
        this._armIdleClose();
        return out;
      } catch (e) {
        // marca fallo para cooldown y resetea sesión
        this.lastFailAt = Date.now();
        await this.close("error").catch(() => {});
        throw e;
      } finally {
        this.busy = Math.max(0, this.busy - 1);
        this.pending = Math.max(0, this.pending - 1);
        // si queda conectada, rearmamos idle close
        this._armIdleClose();
      }
    });

    // importante: mantener viva la cola aunque el task falle
    this.queue = task.catch(() => {});

    return task;
  }

  status() {
    const connected = !!this.client;
    const now = Date.now();
    const last = this.lastUsedAt || 0;

    const idleLeftMs = connected ? Math.max(0, IDLE_CLOSE_MS - (now - last)) : 0;

    return {
      profile: this.profile,
      connected,
      busy: this.busy > 0,
      pending: this.pending,
      idleLeftSec: connected ? Math.ceil(idleLeftMs / 1000) : 0,
      lastUsedAt: last ? new Date(last).toISOString() : null,
    };
  }

  async close(_reason = "manual") {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;

    if (!this.client) return;

    const c = this.client;
    this.client = null;

    try {
      await c.end();
    } finally {
      try {
        await c.destroy();
      } catch {}
    }
  }
}

// ✅ singleton por profile (aunque hoy uses solo 1 usuario OLT)
const sessions = new Map();
function getOltSession(profile = "default") {
  const key = String(profile || "default");
  if (!sessions.has(key)) sessions.set(key, new OltSessionManager(key));
  return sessions.get(key);
}

module.exports = { getOltSession, OltHttpError };
