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

function nowMs() {
  return Date.now();
}

function detectModeFromText(txt = "") {
  const s = String(txt);
  // tomamos la última línea con prompt Huawei
  const lines = s.split("\n").map((x) => x.trim()).filter(Boolean);
  const last = [...lines].reverse().find((l) => /MA5800/i.test(l) && /[>#]$/.test(l));
  const p = last || "";

  if (/\(config-if-gpon/i.test(p)) return "gpon";
  if (/\(config\)#/i.test(p)) return "config";
  if (/#$/.test(p)) return "enable";
  if (/>$/.test(p)) return "user";
  return "unknown";
}

class OltSessionManager {
  constructor(profile = "default") {
    this.profile = profile;
    this.client = null;

    this.queue = Promise.resolve(); // FIFO
    this.pending = 0;

    this.idleTimer = null;
    this.idleDeadlineAt = 0;

    this.lastFailAt = 0;
    this.lastUsedAt = null;

    this.mode = "unknown";
  }

  _armIdleClose() {
    if (this.idleTimer) clearTimeout(this.idleTimer);

    this.idleDeadlineAt = nowMs() + IDLE_CLOSE_MS;
    this.idleTimer = setTimeout(() => {
      this.close("idle").catch(() => {});
    }, IDLE_CLOSE_MS);
  }

  _updateModeFromOut(out) {
    const m = detectModeFromText(out);
    if (m && m !== "unknown") this.mode = m;
  }

  async _ensureConnected({ debug = false } = {}) {
    if (this.client) return;

    const diff = nowMs() - this.lastFailAt;
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
      this.mode = "unknown";
      this.lastUsedAt = new Date().toISOString();
      this._armIdleClose();
    } catch (e) {
      this.lastFailAt = nowMs();
      try { await client.destroy(); } catch {}
      throw e;
    }
  }

  // Ejecuta 1 comando con cola FIFO
  run(cmd, opts = {}) {
    this.pending++;

    this.queue = this.queue
      .then(async () => {
        await this._ensureConnected(opts);
        const out = await this.client.exec(cmd);
        this.lastUsedAt = new Date().toISOString();
        this._armIdleClose();
        this._updateModeFromOut(out);
        return out;
      })
      .finally(() => {
        this.pending = Math.max(0, this.pending - 1);
      });

    return this.queue;
  }

  // Helpers de vista: user -> enable -> config -> interface gpon
  async ensureConfig(opts = {}) {
    // si ya estamos en config o gpon, ok
    if (this.mode === "config" || this.mode === "gpon") return;

    // si estamos en enable, solo config
    if (this.mode === "enable") {
      await this.run("config", opts);
      return;
    }

    // user/unknown: enable + config
    await this.run("enable", opts);
    await this.run("config", opts);
  }

  async enterGponView(frameSlot /* "0/1" */, opts = {}) {
    await this.ensureConfig(opts);
    await this.run(`interface gpon ${frameSlot}`, opts);
    // quedamos en gpon
  }

  async exitOneLevel(opts = {}) {
    // sale de config-if a config
    await this.run("quit", opts);
  }

  status() {
    const connected = !!this.client;
    const idleLeftSec = connected ? Math.max(0, Math.ceil((this.idleDeadlineAt - nowMs()) / 1000)) : 0;

    return {
      profile: this.profile,
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

// singleton por perfil (si luego creas más OLTs)
const sessions = new Map();
function getOltSession(profile = "default") {
  const key = String(profile || "default");
  if (!sessions.has(key)) sessions.set(key, new OltSessionManager(key));
  return sessions.get(key);
}

module.exports = { getOltSession, OltHttpError };
