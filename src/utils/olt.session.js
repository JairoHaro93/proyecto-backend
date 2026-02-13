// src/utils/olt.session.js
require("dotenv").config();
const { OltClient } = require("./olt");

const IDLE_CLOSE_MS = Number(process.env.OLT_IDLE_CLOSE_MS || 180000);   // 180s
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
    this.idleTimer = null;
    this.idleUntilAt = null;

    this.lastFailAt = 0;
    this.lastUsedAt = null;

    // tracking simple de modo (solo lo que nosotros hacemos)
    this.mode = "user"; // user | enable | config
  }

  _armIdleClose() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    const until = Date.now() + IDLE_CLOSE_MS;
    this.idleUntilAt = until;

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
      this.mode = "user";
      this._armIdleClose();
    } catch (e) {
      this.lastFailAt = Date.now();
      try { await client.destroy(); } catch {}
      throw e;
    }
  }

  async _ensureMode(target, opts) {
    if (!target) return;
    if (!this.client) return;

    if (target === "config") {
      if (this.mode === "config") return;

      // desde user -> enable -> config
      if (this.mode === "user") {
        await this.client.exec("enable");
        this.mode = "enable";
      }
      if (this.mode === "enable") {
        await this.client.exec("config");
        this.mode = "config";
      }
    }
  }

  run(cmd, opts = {}) {
    this.queue = this.queue.then(async () => {
      await this._ensureConnected(opts);
      await this._ensureMode(opts.mode, opts);

      const out = await this.client.exec(cmd);

      this.lastUsedAt = new Date().toISOString();
      this._armIdleClose();
      return out;
    });

    return this.queue;
  }

  status() {
    const idleLeftMs = this.idleUntilAt ? Math.max(0, this.idleUntilAt - Date.now()) : 0;

    return {
      profile: this.profile,
      connected: !!this.client,
      busy: false,
      pending: 0, // si quieres exacto: puedes mantener un contador interno
      mode: this.mode,
      idleLeftSec: Math.ceil(idleLeftMs / 1000),
      lastUsedAt: this.lastUsedAt,
    };
  }

  async close(_reason = "manual") {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    this.idleUntilAt = null;

    if (!this.client) return;

    const c = this.client;
    this.client = null;
    this.mode = "user";

    try {
      await c.end();
    } finally {
      try { await c.destroy(); } catch {}
    }
  }
}

let singleton = null;
function getOltSession(profile = "default") {
  if (!singleton) singleton = new OltSessionManager(profile);
  return singleton;
}

module.exports = { getOltSession, OltHttpError };
