// WebSocket connection to the Render game server, with wake-up handling for sleeping free
// instances, automatic reconnect and a server-clock offset for synced timers.
import { ONLINE, WORLD_HASH } from '../config.js';

export function serverHttpUrl() { return (ONLINE.serverUrl || location.origin).replace(/\/$/, ''); }
export function serverWsUrl() { return serverHttpUrl().replace(/^http/, 'ws') + '/ws'; }

export class Net {
  constructor(hooks = {}) { this.hooks = hooks; this.ws = null; this.handlers = new Map(); this.offset = 0; this.connected = false; this.helloMsg = null; this.want = false; this.backoff = 1000; this.me = null; }
  on(type, fn) { this.handlers.set(type, fn); return this; }
  now() { return Date.now() + this.offset; }
  send(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }

  async wake() {
    const url = serverHttpUrl() + '/health';
    const t0 = Date.now();
    for (let i = 0; i < 30; i++) {
      try {
        const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 8000);
        const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' }); clearTimeout(to);
        if (r.ok) return true;
      } catch { /* sleeping */ }
      this.hooks.status?.(Date.now() - t0 > 2500 ? 'Waking up the server… free servers sleep when idle, this can take up to a minute.' : 'Connecting…');
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error('The game server is not responding. Try again in a minute.');
  }

  async connect(hello) {
    this.helloMsg = { type: 'hello', hash: WORLD_HASH, ...hello };
    this.want = true;
    await this.wake();
    return new Promise((resolve, reject) => {
      this._open(resolve, reject);
    });
  }
  _open(resolve, reject) {
    const ws = this.ws = new WebSocket(serverWsUrl());
    let welcomed = false;
    ws.onopen = () => { ws.send(JSON.stringify(this.helloMsg)); this._ping(); };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.type === 'welcome') { welcomed = true; this.connected = true; this.backoff = 1000; this.me = m; this.offset = m.serverTime - Date.now(); resolve?.(m); resolve = null; this.hooks.status?.(null); }
      if (m.type === 'pong') { const rtt = Date.now() - m.t; this.rtt = rtt; this.offset = m.serverTime + rtt / 2 - Date.now(); }
      if (m.type === 'error' && !welcomed) { reject?.(new Error(m.msg)); reject = null; }
      const h = this.handlers.get(m.type); if (h) h(m);
      this.hooks.message?.(m);
    };
    ws.onclose = () => {
      const was = this.connected; this.connected = false; clearInterval(this._pi);
      if (!welcomed && reject) { reject(new Error('Could not connect to the game server.')); reject = null; }
      if (this.want && was) { this.hooks.status?.('Connection lost. Reconnecting…'); setTimeout(() => this._open(), this.backoff); this.backoff = Math.min(8000, this.backoff * 1.6); }
      this.hooks.closed?.(was);
    };
    ws.onerror = () => {};
  }
  _ping() { clearInterval(this._pi); this._pi = setInterval(() => this.send({ type: 'ping', t: Date.now() }), 4000); this.send({ type: 'ping', t: Date.now() }); }
  close() { this.want = false; clearInterval(this._pi); this.ws?.close(); this.connected = false; }
}
