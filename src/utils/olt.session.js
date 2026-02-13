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
    this.queue = Promise.resolve();
    this.pending = 0;

    this.idleTimer = null;
    this.idleDeadlineAt = 0;

    this.lastFailAt = 0;
    this.lastUsedAt = null;
    this.mode = "unknown";
  }

  _armIdleClose() {
    if (this.idleTimer) clearTimeout(this.idleTimer);

    this.idleDeadlineAt = Date.now() + IDLE_CLOSE_MS;
    this.idleTimer = setTimeout(() => {
      this.close("idle").catch(() => {});
    }, IDLE_CLOSE_MS);
  }

  _detectMode(out = "") {
    const s = String(out);
    const lines = s.split("\n").map((x) => x.trim()).filter(Boolean);
    const last = [...lines].reverse().find((l) => /MA5800/i.test(l) && /[>#]$/.test(l)) || "";

    if (/\(config-if-gpon/i.test(last)) return "gpon";
    if (/\(config\)#/i.test(last)) return "config";
    if (/#$/.test(last)) return "enable";
    if (/>$/.test(last)) return "user";
    return "unknown";
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
      this.lastUsedAt = new Date().toISOString();
      this._armIdleClose();
    } catch (e) {
      this.lastFailAt = Date.now();
      try { await client.destroy(); } catch {}
      throw e;
    }
  }

  run(cmd, opts = {}) {
    this.pending++;

    this.queue = this.queue
      .then(async () => {
        await this._ensureConnected(opts);

        const out = await this.client.exec(cmd, opts);
        this.lastUsedAt = new Date().toISOString();
        this._armIdleClose();

        const m = this._detectMode(out);
        if (m) this.mode = m;

        return out;
      })
      .finally(() => {
        this.pending = Math.max(0, this.pending - 1);
      });

    return this.queue;
  }

  async ensureConfig(opts = {}) {
    if (this.mode === "config" || this.mode === "gpon") return;

    if (this.mode === "enable") {
      await this.run("config", opts);
      return;
    }

    // user/unknown
    await this.run("enable", opts);
    await this.run("config", opts);
  }

  status() {
    const connected = !!this.client;
    const idleLeftSec = connected
      ? Math.max(0, Math.ceil((this.idleDeadlineAt - Date.now()) / 1000))
      : 0;

    return {
      profile: "default",
      connected,
      busy: this.pending > 0,
      pending: this.pending,
      mode: this.mode,
      idleLeftSec,
      lastUsedAt: this.lastUsedAt,
    };
  }

  async close(_reason = "manual") {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    this.idleDeadlineAt = 0;

    if (!this.client) return;

    const c = this.client;
    this.client = null;
    this.mode = "unknown";

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
