// src/utils/olt.session.js
require("dotenv").config();
const { OltClient } = require("./olt");

const IDLE_CLOSE_MS = Number(process.env.OLT_IDLE_CLOSE_MS || 180000);
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
    this.queue = Promise.resolve(); // FIFO
    this.idleTimer = null;
    this.lastFailAt = 0;
  }

  _armIdleClose() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
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
      this._armIdleClose();
    } catch (e) {
      this.lastFailAt = Date.now();
      try { await client.destroy(); } catch {}
      throw e;
    }
  }

  run(cmd, opts = {}) {
    this.queue = this.queue.then(async () => {
      await this._ensureConnected(opts);
      const out = await this.client.exec(cmd);
      this._armIdleClose();
      return out;
    });

    return this.queue;
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
