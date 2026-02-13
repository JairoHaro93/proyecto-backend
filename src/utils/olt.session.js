// src/utils/olt.session.js
const { OltClient } = require("./olt");

class OltSessionManager {
  constructor({
    host,
    port,
    username,
    password,
    timeoutMs = 20000,
    idleCloseMs = 60_000,
  }) {
    this.cfg = { host, port, username, password, timeoutMs };
    this.idleCloseMs = idleCloseMs;

    this.client = null;
    this.connected = false;

    // Cola FIFO (1 job a la vez)
    this._chain = Promise.resolve();

    this._idleTimer = null;
    this._lastUsedAt = 0;
  }

  _touch() {
    this._lastUsedAt = Date.now();
    this._scheduleIdleClose();
  }

  _scheduleIdleClose() {
    if (this._idleTimer) clearTimeout(this._idleTimer);

    this._idleTimer = setTimeout(() => {
      const idleFor = Date.now() - this._lastUsedAt;
      if (idleFor >= this.idleCloseMs) {
        this.close().catch(() => {});
      }
    }, this.idleCloseMs + 250);
  }

  async _connectIfNeeded({ debug = false, showCreds = false } = {}) {
    if (this.connected && this.client) {
      this.client.debug = !!debug;
      this.client.showCreds = !!showCreds;
      return;
    }

    this.client = new OltClient({
      host: this.cfg.host,
      port: this.cfg.port,
      username: this.cfg.username,
      password: this.cfg.password,
      timeout: this.cfg.timeoutMs,
      debug: !!debug,
      showCreds: !!showCreds,
    });

    await this.client.connect();
    this.connected = true;
    this._touch();
  }

  run(command, { debug = false, showCreds = false } = {}) {
    const job = async () => {
      await this._connectIfNeeded({ debug, showCreds });
      this._touch();

      try {
        const raw = await this.client.exec(command);
        this._touch();
        return raw;
      } catch (err) {
        await this.close().catch(() => {});
        throw err;
      }
    };

    this._chain = this._chain.then(job, job);
    return this._chain;
  }

  async close() {
    if (this._idleTimer) clearTimeout(this._idleTimer);
    this._idleTimer = null;

    if (!this.client) {
      this.connected = false;
      return;
    }

    try {
      await this.client.end();
    } catch (_) {
      // Huawei suele cerrar con ECONNRESET, normal
    } finally {
      this.client = null;
      this.connected = false;
    }
  }
}

let singleton = null;

function getOltSession() {
  if (singleton) return singleton;

  singleton = new OltSessionManager({
    host: process.env.OLT_HOST,
    port: Number(process.env.OLT_PORT || 8090),
    username: process.env.OLT_USERNAME,
    password: process.env.OLT_PASSWORD,
    timeoutMs: Number(process.env.OLT_TIMEOUT_MS || 20000),
    idleCloseMs: Number(process.env.OLT_IDLE_CLOSE_MS || 60_000),
  });

  return singleton;
}

module.exports = { getOltSession, OltSessionManager };
