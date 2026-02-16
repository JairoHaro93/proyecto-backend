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

    this.queue = Promise.resolve(); // FIFO
    this.pending = 0;
    this.busy = false;

    this.idleTimer = null;
    this.idleCloseAt = 0;

    this.lastUsedAt = null;
    this.lastFailAt = 0;
    this.consecutiveFailures = 0; // ✅ NUEVO: contador de fallos consecutivos
  }

  _armIdleClose() {
    if (this.idleTimer) clearTimeout(this.idleTimer);

    this.idleCloseAt = Date.now() + IDLE_CLOSE_MS;
    this.idleTimer = setTimeout(() => {
      this.close("idle").catch(() => {});
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
      this.lastUsedAt = new Date();
      this.consecutiveFailures = 0; // ✅ Reset contador
      this._armIdleClose();
    } catch (e) {
      this.lastFailAt = Date.now();
      this.consecutiveFailures++;
      try {
        await client.destroy();
      } catch {}
      throw e;
    }
  }

  run(cmd, opts = {}) {
    this.pending++;

    const job = async () => {
      this.pending = Math.max(0, this.pending - 1);
      this.busy = true;

      try {
        await this._ensureConnected(opts);
        const out = await this.client.exec(cmd);
        this.lastUsedAt = new Date();
        this.consecutiveFailures = 0; // ✅ Reset en éxito
        this._armIdleClose();
        return out;
      } catch (e) {
        this.lastFailAt = Date.now();
        this.consecutiveFailures++;

        // ✅ AUTO-CORRECCIÓN: Forzar reconexión inmediata y reintentar
        console.log(
          `[OLT SESSION] ⚠️  Fallo detectado, forzando reconexión y reintento...`,
        );
        await this.close("auto_recovery").catch(() => {});

        // ✅ Reintentar el comando con nueva conexión
        try {
          await this._ensureConnected(opts);
          const out = await this.client.exec(cmd);
          this.lastUsedAt = new Date();
          this.consecutiveFailures = 0;
          this._armIdleClose();
          console.log(
            `[OLT SESSION] ✅ Reintento exitoso después de reconexión`,
          );
          return out;
        } catch (retryError) {
          // Si el reintento también falla, lanzar el error
          this.consecutiveFailures++;
          throw retryError;
        }
      } finally {
        this.busy = false;
      }
    };

    const p = this.queue.then(job, job);
    // mantener la cola viva aunque una llamada falle
    this.queue = p.then(
      () => undefined,
      () => undefined,
    );
    return p;
  }

  status() {
    const idleLeftMs = this.idleCloseAt
      ? Math.max(0, this.idleCloseAt - Date.now())
      : 0;

    return {
      profile: this.profile,
      connected: !!this.client,
      busy: !!this.busy,
      pending: Number(this.pending || 0),
      mode: this.client?.mode || "unknown",
      idleLeftSec: Math.ceil(idleLeftMs / 1000),
      lastUsedAt: this.lastUsedAt ? this.lastUsedAt.toISOString() : null,
      consecutiveFailures: this.consecutiveFailures,
    };
  }

  async close(_reason = "manual") {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    this.idleCloseAt = 0;

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

let singleton = null;
function getOltSession(profile = "default") {
  if (!singleton) singleton = new OltSessionManager(profile);
  return singleton;
}

module.exports = { getOltSession, OltHttpError };
