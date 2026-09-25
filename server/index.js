// PHERI game server for Render: static game files (optional) + WebSocket multiplayer on one port.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join as pjoin, normalize } from 'node:path';
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { Room, WORLD_HASH, MODES, cleanText, RTC_ENABLED } from './room.js';
import { Store } from './store.js';

export const VERSION = '2.3.0';
const PORT = +process.env.PORT || 8080;
const ORIGINS = (process.env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim());
const DIST = new URL('../dist/', import.meta.url).pathname;
const SERVE_STATIC = process.env.SERVE_STATIC !== 'false';
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const started = Date.now();

const server = { rooms: new Map(), clients: new Map(), store: new Store(), config: { payMult: 1 } };
server.store.loadConfig().then((c) => Object.assign(server.config, c)).catch(() => {});
setInterval(() => server.store.loadConfig().then((c) => Object.assign(server.config, c)).catch(() => {}), 60000);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
function cors(req, res) {
  const o = req.headers.origin;
  if (o && (ORIGINS.includes('*') || ORIGINS.includes(o))) res.setHeader('Access-Control-Allow-Origin', o);
  res.setHeader('Access-Control-Allow-Headers', 'content-type,x-admin-key');
}
function stats(full) {
  const rooms = [...server.rooms.values()];
  const base = { ok: true, version: VERSION, worldHash: WORLD_HASH, uptime: Math.round((Date.now() - started) / 1000), rooms: rooms.length, players: server.clients.size, inMatch: rooms.filter((r) => r.state === 'playing').reduce((a, r) => a + r.size, 0), store: server.store.enabled, rtc: RTC_ENABLED };
  if (full) base.list = rooms.map((r) => ({ code: r.code, state: r.state, mode: r.settings.mode, public: r.settings.public, players: [...r.players.values()].map((p) => p.name) }));
  return base;
}

const httpServer = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok: true, version: VERSION })); }
  if (url.pathname === '/stats') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(stats(ADMIN_KEY && req.headers['x-admin-key'] === ADMIN_KEY))); }
  if (!SERVE_STATIC) { res.writeHead(404); return res.end('PHERI game server'); }
  try {
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    if (p.endsWith('/')) p += 'index.html';
    let file = pjoin(DIST, p);
    let st = await stat(file).catch(() => null);
    if (!st || st.isDirectory()) { file = pjoin(DIST, p.startsWith('/admin') ? 'admin.html' : 'index.html'); st = await stat(file).catch(() => null); }
    if (!st) { res.writeHead(404); return res.end('Build the game first: npm run build'); }
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': file.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
    res.end(await readFile(file));
  } catch { res.writeHead(500); res.end(); }
});

const wss = new WebSocketServer({ server: httpServer, path: '/ws', maxPayload: 16 * 1024 });
wss.on('connection', (ws, req) => {
  const o = req.headers.origin;
  if (o && !ORIGINS.includes('*') && !ORIGINS.includes(o)) { ws.close(1008, 'origin'); return; }
  ws.budget = 80; ws.player = null; ws.roomCode = null;
  const send = (m) => ws.readyState === 1 && ws.send(JSON.stringify(m));
  ws.on('message', async (buf) => {
    if (--ws.budget < 0) return; // rate limit
    let m; try { m = JSON.parse(buf); } catch { return; }
    if (m.type === 'ping') return send({ type: 'pong', t: m.t, serverTime: Date.now() });
    if (m.type === 'hello') return hello(ws, m, send);
    if (!ws.player) return;
    const room = ws.roomCode && server.rooms.get(ws.roomCode);
    switch (m.type) {
      case 'create': { leave(ws); const r = new Room(server, { host: ws.player.id, settings: {} }); server.rooms.set(r.code, r); r._applySettings(m.settings || {}); join(ws, r); break; }
      case 'join': {
        const r = server.rooms.get(String(m.code || '').toUpperCase().trim());
        if (!r) return send({ type: 'error', msg: 'No room with that code. Check the code and try again.' });
        if (r.players.size >= 8 && r.state === 'lobby') return send({ type: 'error', msg: 'That room is full (8 riders).' });
        leave(ws); join(ws, r); break;
      }
      case 'quick': {
        leave(ws);
        let r = [...server.rooms.values()].find((x) => x.settings.public && x.state === 'lobby' && x.players.size < 8 && (!m.mode || x.settings.mode === m.mode));
        if (!r) { r = new Room(server, { isPublic: true, settings: { mode: MODES[m.mode] ? m.mode : 'rush', minutes: 5 } }); server.rooms.set(r.code, r); }
        join(ws, r); r._checkAuto(); break;
      }
      case 'leave': leave(ws); send({ type: 'left' }); break;
      default: if (room) room.handle(room.players.get(ws.player.id) || {}, m);
    }
  });
  ws.on('close', () => {
    server.clients.delete(ws);
    const room = ws.roomCode && server.rooms.get(ws.roomCode);
    if (room && ws.player) room.disconnected(ws.player.id);
  });
});

async function hello(ws, m, send) {
  if (m.hash && m.hash !== WORLD_HASH) return send({ type: 'error', code: 'version', msg: 'A new version of PHERI is available. Refresh the page to update.' });
  let user = null;
  if (m.token) user = await server.store.verify(m.token).catch(() => null);
  if (user?.banned) { send({ type: 'error', msg: 'This account is suspended.' }); return ws.close(); }
  const id = user ? 'u:' + user.id : 'g:' + String(m.guestId || randomUUID()).slice(0, 40);
  const name = cleanText(user?.nickname || m.name || 'Rider', 16) || 'Rider';
  const look = { helmet: +m.look?.helmet || 0xb8322a, paint: +m.look?.paint || 0xb71c1c, bike: String(m.look?.bike || 'sparrow').slice(0, 12) };
  ws.player = { id, name, look, userId: user?.id || null, ws };
  server.clients.set(ws, ws.player);
  send({ type: 'welcome', id, name, version: VERSION, serverTime: Date.now(), verified: !!user, motd: server.config.motd || '' });
  // reconnect into a room we were in
  for (const r of server.rooms.values()) {
    if (r.players.has(id)) { ws.roomCode = r.code; r.reattach(id, ws); send(r.publicView()); break; }
  }
}
function join(ws, room) { ws.roomCode = room.code; room.add(ws.player); }
function leave(ws) {
  const room = ws.roomCode && server.rooms.get(ws.roomCode);
  if (room && ws.player) room.remove(ws.player.id);
  ws.roomCode = null;
}

// Main loop: snapshots at 15 Hz, housekeeping, rate-limit refill
setInterval(() => {
  const now = Date.now();
  for (const [code, r] of server.rooms) {
    r.tick(now);
    if (r.players.size === 0 && now - r.createdAt > 5000) server.rooms.delete(code);
  }
}, 1000 / 15);
setInterval(() => { for (const ws of server.clients.keys()) ws.budget = 80; }, 1000);

httpServer.listen(PORT, () => console.log(`PHERI server v${VERSION} on :${PORT} (static: ${SERVE_STATIC}, world ${WORLD_HASH}, voice/video: ${RTC_ENABLED ? 'on' : 'off'})`));
