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

    // Cola FIFO robusta (continúa aunque una tarea falle)
    this.queue = Promise.resolve();

    this.idleTimer = null;
    this.idleCloseAt = 0;

    this.lastFailAt = 0;
    this.lastUsedAt = null;

    this.pendingCount = 0;
    this.executing = false;
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

    const c = new OltClient({
      host: process.env.OLT_HOST,
      port: Number(process.env.OLT_PORT || 8090),
      username: process.env.OLT_USERNAME,
      password: process.env.OLT_PASSWORD,
      timeout: Number(process.env.OLT_TIMEOUT_MS || 20000),
      debug: !!debug,
    });

    try {
      await c.connect();
      this.client = c;
      this._armIdleClose();
    } catch (e) {
      this.lastFailAt = Date.now();
      try {
        await c.destroy();
      } catch {}
      throw e;
    }
  }

  run(cmd, opts = {}) {
    this.pendingCount++;

    const job = async () => {
      this.executing = true;
      await this._ensureConnected(opts);

      try {
        const out = await this.client.exec(cmd);
        this.lastUsedAt = new Date().toISOString();
        this._armIdleClose();
        return out;
      } finally {
        this.executing = false;
      }
    };

    // Importante: si una tarea falla, igual dejamos seguir la cola
    this.queue = this.queue.then(job, job).finally(() => {
      this.pendingCount = Math.max(0, this.pendingCount - 1);
    });

    return this.queue;
  }

  status() {
    const now = Date.now();
    const idleLeftMs = this.client ? Math.max(0, this.idleCloseAt - now) : 0;

    return {
      profile: "default",
      connected: !!this.client,
      busy: !!this.executing,
      pending: Math.max(0, this.pendingCount - (this.executing ? 1 : 0)),
      idleLeftSec: Math.ceil(idleLeftMs / 1000),
      lastUsedAt: this.lastUsedAt,
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
function getOltSession() {
  if (!singleton) singleton = new OltSessionManager();
  return singleton;
}

module.exports = { getOltSession, OltHttpError };
