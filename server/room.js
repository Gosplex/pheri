// PHERI multiplayer rooms. The server is the referee: it creates jobs, checks positions,
// confirms pickups and drops, runs the clock and decides the winner.
import { readFileSync } from 'node:fs';
import agora from 'agora-token';
const { RtcTokenBuilder, RtcRole } = agora;
export const RTC_ENABLED = !!(process.env.AGORA_APP_ID && process.env.AGORA_APP_CERTIFICATE);
// stable 31-bit Agora uid for a player id
function rtcUidFor(id) { let h = 2166136261; for (const c of id) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 1) || 1; }

const WORLD = JSON.parse(readFileSync(new URL('./data/world.json', import.meta.url)));
export const WORLD_HASH = WORLD.hash;
const POIS = WORLD.pois;
const HOMES = POIS.filter((p) => p.kind === 'home' || p.kind === 'hostel');
const PICKUP = {
  food: ['restaurant', 'farsan', 'sweets', 'tea', 'icecream'],
  parcel: ['grocery', 'pharmacy', 'mobile', 'cloth', 'hardware', 'electric', 'fruit'],
  docs: ['xerox', 'coaching'],
};
const ITEMS = {
  food: ['Fafda-jalebi', 'Kathiyawadi thali', 'Rajkot ganthiya', 'Dabeli x4', 'Pav bhaji', 'Ice cream pack', 'Khaman 500 g', 'Masala chai flask'],
  parcel: ['Medicines', 'Phone charger', 'Groceries', 'Saree for alteration', 'Tiffin box', 'Fruit basket'],
  docs: ['Project report', 'Lab manual', 'Hall tickets', 'Assignment'],
  passenger: ['Riya S.', 'Hardik P.', 'Krupa M.', 'Dhruv J.', 'Nidhi T.', 'Imran S.', 'Parth D.', 'Janvi R.'],
};
export const MODES = {
  rush: { name: 'Delivery Rush', metric: 'deliveries' },
  earner: { name: 'Top Earner', metric: 'earned' },
  fivestar: { name: 'Five Star', metric: 'rating' },
  steal: { name: 'Job Steal', metric: 'deliveries', shared: true },
  team: { name: 'Team Rush', metric: 'deliveries', teams: true },
  passenger: { name: 'Passenger Derby', metric: 'deliveries', only: 'passenger' },
  festival: { name: 'Festival Special', metric: 'earned' },
};
const QUICK = ['Kem cho!', 'Jaldi!', 'GG', 'Bhai, wait!', 'Nice one!', 'See you at the chowk'];
const BAD = ['fuck', 'shit', 'bitch', 'bastard', 'chutiya', 'madarchod', 'behenchod', 'bhosdi', 'gandu', 'randi', 'lund', 'harami'];
export const cleanText = (s, max = 80) => {
  let t = String(s || '').replace(/[<>]/g, '').slice(0, max).trim();
  for (const w of BAD) t = t.replace(new RegExp(w, 'gi'), '*'.repeat(w.length));
  return t;
};

function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const MAX_SPEED = 34; // m/s, above the fastest bike with boost

let codeSeq = Math.floor(Math.random() * 9000);
function makeCode(taken) {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) { let c = ''; for (let i = 0; i < 4; i++) c += A[Math.floor(Math.random() * A.length)]; if (!taken.has(c)) return c; }
}

export class Room {
  constructor(server, { isPublic = false, host = null, settings = {} } = {}) {
    this.server = server;
    this.code = makeCode(server.rooms);
    this.players = new Map();
    this.hostId = host;
    this.state = 'lobby';
    this.settings = {
      mode: 'rush', minutes: 5, time: 10, weather: 'clear', festival: 'none', bikeRule: 'own', public: isPublic, textChat: !isPublic, tournamentId: null,
      voice: isPublic ? 'off' : 'all',   // off | all | team | proximity  (private rooms only)
      video: false,                       // camera tiles (private rooms only)
      ...settings,
    };
    this.chatLog = [];
    this.seed = (Date.now() ^ (codeSeq++ * 7919)) >>> 0;
    this.pool = []; this.board = []; this.jobSeq = 1;
    this.createdAt = Date.now();
    this.autoStartAt = 0;
  }

  get size() { return [...this.players.values()].filter((p) => !p.spectator).length; }

  // ---------------------------------------------------------------- membership
  add(p) {
    const spectator = this.state === 'playing' || this.state === 'countdown';
    const slot = [...this.players.values()].length;
    const player = {
      id: p.id, name: p.name, look: p.look, userId: p.userId, ws: p.ws, ready: false, spectator, connected: true, slot, rtcUid: rtcUidFor(p.id),
      team: this.size % 2 === 0 ? 'A' : 'B',
      pos: { x: WORLD.spawn.x, z: WORLD.spawn.z }, h: 0, s: 0, lastT: 0, flags: 0,
      offers: [], poolIdx: 0, job: null, deliveries: 0, earned: 0, ratings: [], crashes: 0, near: 0, comfort: [], jobTimes: [], zones: {},
    };
    this.players.set(p.id, player);
    if (!this.hostId || !this.players.get(this.hostId)) this.hostId = p.id;
    this.feed(`${p.name} joined`);
    this.broadcastRoom();
    if (spectator) this.send(player, { type: 'spectate' });
    if (this.chatLog.length) this.send(player, { type: 'chatHistory', list: this.chatLog });
    return player;
  }
  remove(id, reason = 'left') {
    const p = this.players.get(id); if (!p) return;
    this.players.delete(id);
    if (p.job && this.settings.mode === 'steal') p.job = null;
    if (this.hostId === id) { const next = [...this.players.values()].find((x) => x.connected); this.hostId = next ? next.id : null; if (next) this.feed(`${next.name} is now the host`); }
    this.feed(`${p.name} ${reason}`);
    this.broadcastRoom();
  }
  disconnected(id) { const p = this.players.get(id); if (!p) return; p.connected = false; p.dropAt = Date.now(); this.broadcastRoom(); }
  reattach(id, ws) { const p = this.players.get(id); if (!p) return null; p.ws = ws; p.connected = true; this.broadcastRoom(); this._sendJobState(p); return p; }

  // ---------------------------------------------------------------- messages
  send(p, msg) { if (p.ws && p.connected && p.ws.readyState === 1) p.ws.send(JSON.stringify(msg)); }
  broadcast(msg, except = null) { const s = JSON.stringify(msg); for (const p of this.players.values()) if (p !== except && p.connected && p.ws?.readyState === 1) p.ws.send(s); }
  feed(text) { this.broadcast({ type: 'feed', text }); }
  publicView() {
    return {
      type: 'room', code: this.code, hostId: this.hostId, settings: this.settings, state: this.state, startsAt: this.startsAt, endsAt: this.endsAt,
      autoStartAt: this.autoStartAt || 0, modes: MODES, rtc: RTC_ENABLED,
      players: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, look: p.look, ready: p.ready, team: p.team, spectator: p.spectator, connected: p.connected, slot: p.slot, userId: p.userId || null, rtcUid: p.rtcUid })),
    };
  }
  broadcastRoom() { this.broadcast(this.publicView()); }

  handle(p, m) {
    const host = p.id === this.hostId;
    switch (m.type) {
      case 'settings': if (host && this.state === 'lobby') { this._applySettings(m.settings || {}); this.broadcastRoom(); } break;
      case 'ready': if (this.state === 'lobby') { p.ready = !!m.on; this.broadcastRoom(); this._checkAuto(); } break;
      case 'team': if (this.state === 'lobby' && ['A', 'B'].includes(m.team)) { p.team = m.team; this.broadcastRoom(); } break;
      case 'kick': if (host && m.id !== p.id) { const t = this.players.get(m.id); if (t) { this.send(t, { type: 'kicked' }); this.remove(m.id, 'was removed by the host'); t.ws?.roomCode && (t.ws.roomCode = null); } } break;
      case 'host': if (host && this.players.get(m.id)) { this.hostId = m.id; this.broadcastRoom(); } break;
      case 'start': if (host && this.state === 'lobby') { if (this.size < 1) break; this.start(); } break;
      case 'state': this._state(p, m); break;
      case 'accept': this._accept(p, m.jobId); break;
      case 'arrive': this._arrive(p, m); break;
      case 'cancel': if (p.job) { this.send(p, { type: 'jobCancelled', jobId: p.job.id }); if (this.settings.mode === 'steal') this._refillBoard(); p.job = null; this._sendOffers(p); } break;
      case 'crash': if (this.state === 'playing') { p.crashes++; if (p.job) p.job.crashes = (p.job.crashes || 0) + 1; } break;
      case 'near': if (this.state === 'playing' && (p._nearT || 0) < Date.now()) { p._nearT = Date.now() + 2000; p.near++; if (this.settings.mode === 'earner' || this.settings.mode === 'festival') { p.earned += 5; this._scores(); } } break;
      case 'comfort': if (p.job) p.job.comfort = Math.max(0, Math.min(100, +m.v || 0)); break;
      case 'chat': this._chat(p, m); break;
      case 'horn': if ((p._hornT || 0) < Date.now()) { p._hornT = Date.now() + 700; this.broadcast({ type: 'horn', from: p.id }, p); } break;
      case 'rtcToken': this._rtcToken(p); break;
      case 'media': if ((p._mediaT || 0) < Date.now()) { p._mediaT = Date.now() + 300; p.mic = !!m.mic; p.cam = !!m.cam; this.broadcast({ type: 'media', from: p.id, mic: p.mic, cam: p.cam }, p); } break;
      case 'rematch': if (this.state === 'results') { p.ready = true; if (host || [...this.players.values()].every((x) => x.ready || !x.connected)) this.reset(); else this.broadcastRoom(); } break;
      case 'debugEnd': if (process.env.DEBUG_END === '1' && this.state === 'playing') this.finish(); break;
      default: break;
    }
  }

  _applySettings(s) {
    const S = this.settings;
    if (MODES[s.mode]) S.mode = s.mode;
    if ([3, 5, 10, 15].includes(+s.minutes)) S.minutes = +s.minutes;
    if (s.time !== undefined) S.time = Math.max(0, Math.min(23.9, +s.time || 10));
    if (['clear', 'cloudy', 'rain', 'dynamic'].includes(s.weather)) S.weather = s.weather;
    if (['none', 'navratri', 'uttarayan', 'diwali'].includes(s.festival)) S.festival = s.festival;
    if (['own', 'sparrow'].includes(s.bikeRule)) S.bikeRule = s.bikeRule;
    if (s.public !== undefined) S.public = !!s.public;
    if (s.textChat !== undefined) S.textChat = !!s.textChat && !S.public;
    if (['off', 'all', 'team', 'proximity'].includes(s.voice)) S.voice = s.voice;
    if (s.video !== undefined) S.video = !!s.video;
    if (S.public) { S.voice = 'off'; S.video = false; S.textChat = false; } // strangers: quick chat only
    if (typeof s.tournamentId === 'string' && /^[0-9a-f-]{36}$/i.test(s.tournamentId)) S.tournamentId = s.tournamentId;
    if (S.mode === 'festival' && S.festival === 'none') S.festival = 'navratri';
  }

  _checkAuto() {
    if (!this.settings.public || this.state !== 'lobby') return;
    const n = this.size;
    const allReady = [...this.players.values()].filter((p) => !p.spectator).every((p) => p.ready);
    if (n >= 2 && allReady) this.start();
    else if (n >= 2 && !this.autoStartAt) { this.autoStartAt = Date.now() + 25000; this.broadcastRoom(); }
    else if (n < 2) { this.autoStartAt = 0; }
  }

  // ---------------------------------------------------------------- match lifecycle
  start() {
    this.state = 'countdown';
    this.autoStartAt = 0;
    this.seed = (this.seed * 1103515245 + 12345) >>> 0;
    this.rng = mulberry(this.seed);
    this.pool = []; this.board = []; this.jobSeq = 1;
    let i = 0;
    for (const p of this.players.values()) {
      if (p.spectator) continue;
      Object.assign(p, { offers: [], poolIdx: 0, job: null, deliveries: 0, earned: 0, ratings: [], crashes: 0, near: 0, comfort: [], jobTimes: [], zones: {}, flags: 0, lastT: 0 });
      const ox = (i % 4) * 2.2 - 3.3, oz = Math.floor(i / 4) * 3;
      p.pos = { x: WORLD.spawn.x + ox, z: WORLD.spawn.z + oz }; p.spawn = { ...p.pos }; i++;
    }
    this.startsAt = Date.now() + 4000;
    this.endsAt = this.startsAt + this.settings.minutes * 60000;
    this.broadcastRoom();
    this.broadcast({ type: 'countdown', startsAt: this.startsAt, endsAt: this.endsAt, seed: this.seed, spawn: [...this.players.values()].filter((p) => !p.spectator).map((p) => ({ id: p.id, ...p.spawn })) });
    setTimeout(() => {
      if (this.state !== 'countdown') return;
      this.state = 'playing';
      if (MODES[this.settings.mode].shared) this._refillBoard();
      for (const p of this.players.values()) if (!p.spectator) this._sendOffers(p);
      this.broadcastRoom();
      this._scores();
    }, this.startsAt - Date.now());
  }

  tick(now) {
    // drop players who have been away too long
    for (const p of [...this.players.values()]) if (!p.connected && now - p.dropAt > 30000) this.remove(p.id, 'disconnected');
    if (this.state === 'lobby' && this.autoStartAt && now > this.autoStartAt && this.size >= 2) this.start();
    if (this.state === 'playing') {
      if (now >= this.endsAt) this.finish();
      else if (!this._warned && this.endsAt - now < 30000) { this._warned = true; this.broadcast({ type: 'warn30' }); }
      // snapshot of every rider, ~15 per second (called by the server loop)
    }
    if (this.state === 'playing' || this.state === 'countdown' || this.state === 'lobby') {
      const rows = [];
      for (const p of this.players.values()) if (!p.spectator && p.connected) rows.push([p.id, +p.pos.x.toFixed(2), +p.pos.z.toFixed(2), +p.h.toFixed(3), +p.s.toFixed(2), +(p.l || 0).toFixed(2)]);
      if (rows.length) this.broadcast({ type: 'snap', t: now, p: rows });
    }
  }

  reset() {
    this.state = 'lobby'; this._warned = false;
    for (const p of this.players.values()) { p.ready = false; p.spectator = false; p.job = null; }
    this.broadcastRoom();
  }

  async finish() {
    this.state = 'results';
    const mode = MODES[this.settings.mode];
    const players = [...this.players.values()].filter((p) => !p.spectator);
    const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    const rows = players.map((p) => {
      const rating = p.ratings.length >= (this.settings.mode === 'fivestar' ? 3 : 1) ? avg(p.ratings) : 0;
      return {
        id: p.id, userId: p.userId || null, name: p.name, team: p.team, deliveries: p.deliveries, earned: Math.round(p.earned), rating: +rating.toFixed(2),
        crashes: p.crashes, near: p.near, comfort: +avg(p.comfort).toFixed(1), avgTime: +avg(p.jobTimes).toFixed(1), zones: p.zones, flags: p.flags,
      };
    });
    const metric = (r) => (mode.metric === 'deliveries' ? r.deliveries * 100000 + r.earned : mode.metric === 'earned' ? r.earned * 100 + r.deliveries : r.rating * 1000 + r.deliveries);
    rows.sort((a, b) => metric(b) - metric(a));
    rows.forEach((r, i) => { r.rank = i + 1; });
    const titles = [];
    const withJobs = rows.filter((r) => r.deliveries > 0);
    if (withJobs.length) {
      const fastest = [...withJobs].sort((a, b) => a.avgTime - b.avgTime)[0]; titles.push({ title: 'Fastest Rider', id: fastest.id });
      const safest = [...withJobs].sort((a, b) => a.crashes - b.crashes || b.deliveries - a.deliveries)[0]; titles.push({ title: 'Safest Rider', id: safest.id });
    }
    const nearKing = [...rows].sort((a, b) => b.near - a.near)[0]; if (nearKing && nearKing.near > 0) titles.push({ title: 'Near Miss King', id: nearKing.id });
    const comfy = rows.filter((r) => r.comfort > 0).sort((a, b) => b.comfort - a.comfort)[0]; if (comfy) titles.push({ title: 'Comfort King', id: comfy.id });
    let teamTotals = null;
    if (mode.teams) {
      teamTotals = { A: 0, B: 0 };
      for (const r of rows) teamTotals[r.team] += r.deliveries;
      const win = teamTotals.A === teamTotals.B ? null : teamTotals.A > teamTotals.B ? 'A' : 'B';
      teamTotals.winner = win;
    }
    for (const p of this.players.values()) p.ready = false;
    const payload = { type: 'results', mode: this.settings.mode, modeName: mode.name, minutes: this.settings.minutes, rows, titles, teamTotals, matchId: null };
    try { payload.matchId = await this.server.store.saveMatch(this, rows, teamTotals); } catch (e) { console.error('saveMatch', e.message); }
    this.broadcast(payload);
    this.broadcastRoom();
  }

  // ---------------------------------------------------------------- movement validation
  _state(p, m) {
    if (p.spectator) return;
    const now = Date.now();
    const x = +m.x, z = +m.z;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    if (this.state === 'countdown' || this.state === 'lobby') { if (this.state === 'countdown') { p.pos = { ...p.spawn }; } else p.pos = { x, z }; p.h = +m.h || 0; return; }
    const dt = p.lastT ? (now - p.lastT) / 1000 : 0.1;
    const d = Math.hypot(x - p.pos.x, z - p.pos.z);
    if (dt > 0 && d > MAX_SPEED * Math.max(dt, 0.05) * 1.35 + 3) {
      p.flags++;
      this.send(p, { type: 'correct', x: p.pos.x, z: p.pos.z });
      p.lastT = now;
      return;
    }
    p.pos = { x, z }; p.h = +m.h || 0; p.s = Math.max(-2, Math.min(40, +m.s || 0)); p.l = Math.max(-1, Math.min(1, +m.l || 0)); p.lastT = now;
  }

  // ---------------------------------------------------------------- jobs
  _genJob() {
    const r = this.rng, S = this.settings;
    const only = MODES[S.mode].only;
    const h = S.time;
    const night = h < 6 || h >= 20.5;
    const types = only ? [only] : ['food', 'food', 'parcel', 'passenger', night ? 'food' : 'docs'];
    const type = types[Math.floor(r() * types.length)];
    let from, to;
    const pick = (arr) => arr[Math.floor(r() * arr.length)];
    for (let tries = 0; tries < 20; tries++) {
      if (type === 'passenger') from = pick(POIS);
      else { const ks = PICKUP[type]; const cand = POIS.filter((q) => ks.includes(q.kind) && (!night || q.nightOpen)); from = pick(cand.length ? cand : POIS); }
      const dests = type === 'docs' ? POIS.filter((q) => q.zone === 'campus' || q.kind === 'home') : type === 'passenger' ? POIS : HOMES;
      to = pick(dests);
      const d = dist(from, to);
      if (d > 180 && d < 900) break;
    }
    const d = dist(from, to) * 1.3;
    const mult = this.server.config.payMult || 1;
    let pay = Math.round(((type === 'passenger' ? 35 : 25) + d * 0.11 + (night ? 15 : 0)) * mult * (S.mode === 'festival' ? 1.25 : 1));
    const timeLimit = Math.round(d / 7.5 + 50 + (type === 'passenger' ? 0 : 25));
    return { id: this.jobSeq++, type, from: from.i, to: to.i, pay, timeLimit, dist: Math.round(d), item: pick(ITEMS[type]) };
  }
  _poolJob(i) { while (this.pool.length <= i) this.pool.push(this._genJob()); return this.pool[i]; }
  _sendOffers(p) {
    if (this.state !== 'playing') return;
    if (MODES[this.settings.mode].shared) { this.send(p, { type: 'offers', list: this.board, shared: true }); return; }
    while (p.offers.length < 3) p.offers.push({ ...this._poolJob(p.poolIdx++) });
    this.send(p, { type: 'offers', list: p.offers });
  }
  _refillBoard() {
    while (this.board.length < Math.max(3, this.size + 1)) this.board.push(this._genJob());
    for (const q of this.players.values()) if (!q.spectator) this.send(q, { type: 'offers', list: this.board, shared: true });
  }
  _accept(p, jobId) {
    if (this.state !== 'playing' || p.job || p.spectator) return;
    const shared = MODES[this.settings.mode].shared;
    const list = shared ? this.board : p.offers;
    const k = list.findIndex((j) => j.id === jobId);
    if (k < 0) { this.send(p, { type: 'jobLost', jobId }); return; }
    const job = list.splice(k, 1)[0];
    p.job = { ...job, stage: 'pickup', acceptedAt: Date.now(), crashes: 0, comfort: 100 };
    this.send(p, { type: 'job', job: p.job });
    if (shared) { this.feed(`${p.name} grabbed a job`); this._refillBoard(); } else this._sendOffers(p);
  }
  _sendJobState(p) { if (p.job) this.send(p, { type: 'job', job: p.job }); this._sendOffers(p); }
  _arrive(p, m) {
    const j = p.job; if (!j || j.id !== m.jobId || this.state !== 'playing') return;
    const target = POIS[j.stage === 'pickup' ? j.from : j.to];
    const d = dist(p.pos, target);
    if (d > 14 || Math.abs(p.s) > 4.5) { this.send(p, { type: 'arriveRejected', jobId: j.id, reason: d > 14 ? 'Too far from the marker' : 'Stop at the marker' }); return; }
    const now = Date.now();
    if (j.stage === 'pickup') {
      j.stage = 'drop'; j.pickedAt = now;
      this.send(p, { type: 'job', job: j });
      return;
    }
    // minimum plausible travel time from pickup to drop
    const minT = (dist(POIS[j.from], POIS[j.to]) / MAX_SPEED) * 1000;
    if (now - j.pickedAt < minT) { p.flags++; this.send(p, { type: 'arriveRejected', jobId: j.id, reason: 'Delivery rejected' }); return; }
    const elapsed = (now - j.acceptedAt) / 1000;
    const late = Math.max(0, elapsed - j.timeLimit);
    let stars = 5 - (late > 0 ? 1 + Math.min(2, late / 60) : 0) - (j.crashes || 0) * 1.2;
    if (j.type === 'passenger') stars -= (100 - (j.comfort ?? 100)) / 35;
    stars = Math.max(1, Math.min(5, Math.round(stars * 2) / 2));
    let pay = late > 0 ? Math.round(j.pay * 0.65) : j.pay;
    const tip = stars >= 4.5 && this.rng() < 0.55 ? 10 + Math.floor(this.rng() * 25) : 0;
    p.deliveries++; p.earned += pay + tip; p.ratings.push(stars); p.jobTimes.push(elapsed);
    if (j.type === 'passenger') p.comfort.push(j.comfort ?? 100);
    const zone = POIS[j.to].zone || 'city'; p.zones[zone] = (p.zones[zone] || 0) + 1;
    p.job = null;
    this.send(p, { type: 'jobDone', jobId: j.id, pay, tip, stars, late: late > 0 });
    this.feed(`${p.name} delivered at ${POIS[j.to].name}`);
    this._sendOffers(p);
    this._scores();
  }
  _scores() {
    const mode = MODES[this.settings.mode];
    const board = [...this.players.values()].filter((p) => !p.spectator).map((p) => ({
      id: p.id, name: p.name, team: p.team, deliveries: p.deliveries, earned: Math.round(p.earned),
      rating: p.ratings.length ? +(p.ratings.reduce((a, b) => a + b, 0) / p.ratings.length).toFixed(2) : 0,
    }));
    const key = mode.metric === 'deliveries' ? 'deliveries' : mode.metric === 'earned' ? 'earned' : 'rating';
    board.sort((a, b) => b[key] - a[key] || b.earned - a.earned);
    this.broadcast({ type: 'score', board, metric: key });
  }

  // Agora RTC token for this room's channel (the App Certificate never leaves the server)
  _rtcToken(p) {
    if (!RTC_ENABLED) return this.send(p, { type: 'rtcToken', error: 'Voice and video are not configured on this server (set AGORA_APP_ID and AGORA_APP_CERTIFICATE).' });
    if (this.settings.voice === 'off' && !this.settings.video) return this.send(p, { type: 'rtcToken', error: 'The host has turned voice and video off for this room.' });
    const channel = 'pheri-' + this.code;
    const expire = 2 * 3600;
    const token = RtcTokenBuilder.buildTokenWithUid(process.env.AGORA_APP_ID, process.env.AGORA_APP_CERTIFICATE, channel, p.rtcUid, RtcRole.PUBLISHER, expire, expire);
    this.send(p, { type: 'rtcToken', appId: process.env.AGORA_APP_ID, channel, uid: p.rtcUid, token, expiresAt: Date.now() + expire * 1000 });
  }

  _chat(p, m) {
    const now = Date.now();
    if ((p._chatT || 0) > now) return;
    p._chatT = now + 700;
    let text;
    if (Number.isInteger(m.q) && QUICK[m.q]) text = QUICK[m.q];
    else if (this.settings.textChat && typeof m.text === 'string') text = cleanText(m.text, 140);
    if (!text) return;
    const msg = { type: 'chat', from: p.id, name: p.name, text, t: now, team: p.team, quick: Number.isInteger(m.q) };
    if (m.teamOnly && this.settings.mode === 'team') { for (const q of this.players.values()) if (q.team === p.team) this.send(q, { ...msg, teamOnly: true }); return; }
    this.chatLog.push(msg); if (this.chatLog.length > 40) this.chatLog.shift();
    this.broadcast(msg);
  }
}
