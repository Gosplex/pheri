// In-game multiplayer: remote riders, server jobs, countdown, live leaderboard, results.
import * as THREE from 'three';
import { buildVehicleGeometry } from '../entities/vehicleModels.js';
import { makeCanvas } from '../core/textures.js';
import { lerp } from '../core/rng.js';
import { track } from '../analytics.js';

const TYPE = { food: 'Food', parcel: 'Parcel', docs: 'Documents', passenger: 'Passenger' };
export const QUICK_CHAT = ['Kem cho!', 'Jaldi!', 'GG', 'Bhai, wait!', 'Nice one!', 'See you at the chowk'];

function nameTag(text, color = '#f4b400') {
  const c = makeCanvas(256, 64), g = c.getContext('2d');
  g.fillStyle = 'rgba(18,26,59,0.82)'; g.beginPath(); g.roundRect?.(4, 8, 248, 48, 22); if (!g.roundRect) g.rect(4, 8, 248, 48); g.fill();
  g.fillStyle = color; g.beginPath(); g.arc(34, 32, 10, 0, 7); g.fill();
  g.fillStyle = '#f3ede2'; g.font = '700 30px Rajdhani, sans-serif'; g.textBaseline = 'middle'; g.fillText(text.slice(0, 14), 54, 33);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(2.4, 0.6, 1); s.renderOrder = 10; return s;
}
const COLORS = ['#f4b400', '#4fc3f7', '#ef5350', '#66bb6a', '#ab47bc', '#ff7043', '#26c6da', '#ec407a'];

class RemoteRider {
  constructor(scene, mats, info) {
    this.info = info; this.buf = [];
    this.group = new THREE.Group();
    const G = buildVehicleGeometry('bike', (info.slot || 0) % 6, null);
    this.body = new THREE.Mesh(G.body, mats.vehicle); this.body.castShadow = true; this.group.add(this.body);
    if (G.lights) this.group.add(new THREE.Mesh(G.lights, mats.vehLights));
    this.color = COLORS[(info.slot || 0) % COLORS.length];
    this.tag = nameTag(info.name, this.color); this.tag.position.y = 2.3; this.group.add(this.tag);
    scene.add(this.group); this.scene = scene;
    this.x = 0; this.z = 0; this.h = 0; this.s = 0;
  }
  push(t, x, z, h, s, l) { this.buf.push([t, x, z, h, s, l]); if (this.buf.length > 30) this.buf.shift(); }
  update(renderT) {
    const b = this.buf; if (!b.length) return;
    let i = b.length - 1; while (i > 0 && b[i - 1][0] > renderT) i--;
    const a = b[Math.max(0, i - 1)], c = b[i];
    const t = c[0] === a[0] ? 1 : Math.min(1.2, Math.max(0, (renderT - a[0]) / (c[0] - a[0])));
    this.x = lerp(a[1], c[1], t); this.z = lerp(a[2], c[2], t);
    let dh = c[3] - a[3]; if (dh > Math.PI) dh -= Math.PI * 2; if (dh < -Math.PI) dh += Math.PI * 2;
    this.h = a[3] + dh * t; this.s = lerp(a[4], c[4], t);
    this.group.position.set(this.x, 0.03, this.z); this.group.rotation.y = this.h;
    this.body.rotation.z = lerp(a[5], c[5], t) * 0.7;
  }
  dispose() { this.scene.remove(this.group); }
}

export class Match {
  constructor(game, net) {
    this.g = game; this.net = net;
    this.room = null; this.remotes = new Map(); this.offers = []; this.job = null; this.board = []; this.metric = 'deliveries';
    this.sendT = 0; this.results = null; this.spectator = false; this.specIdx = 0;
    const on = (t, f) => net.on(t, f);
    on('room', (m) => this._room(m));
    on('countdown', (m) => this._countdown(m));
    on('offers', (m) => { this.offers = m.list; this.shared = !!m.shared; if (this.g.state === 'phone') this.g.ui.renderPhone(); });
    on('job', (m) => this._job(m.job));
    on('jobDone', (m) => this._done(m));
    on('jobLost', () => this.g.ui.toast('Someone else grabbed that job first!', 'warn'));
    on('jobCancelled', () => { this.job = null; this.g.missions.active = null; this.g.nav.setTarget(null); });
    on('arriveRejected', (m) => { this._arriveSent = false; this.g.ui.toast(m.reason, 'warn', 2000); });
    on('score', (m) => { this.board = m.board; this.metric = m.metric; this._renderBoard(); });
    on('feed', (m) => { if (this.inMatch) this.g.ui.toast(m.text, 'info', 2500); this.g.onlineUI?.lobbyFeed(m.text); });
    on('chat', (m) => { this.g.comms?.onChat(m); if (this.g.comms?.collapsed) this.g.ui.toast(`${m.name}: ${m.text}`, 'info', 3000); });
    on('horn', (m) => { const r = this.remotes.get(m.from); if (r) { const b = this.g.bike.pos; const d = Math.hypot(r.x - b.x, r.z - b.z); this.g.audio.npcHorn('bike', 0, d); } });
    on('snap', (m) => this._snap(m));
    on('correct', (m) => { this.g.bike.pos.x = m.x; this.g.bike.pos.z = m.z; this.g.bike.speed = 0; });
    on('warn30', () => { this.g.ui.toast('30 seconds left!', 'warn', 3000); this._tick = true; });
    on('spectate', () => { this.spectator = true; this.g.ui.toast('Match in progress: you are spectating. You will join the next round.', 'info', 5000); });
    on('results', (m) => this._results(m));
    on('kicked', () => { this.g.ui.toast('You were removed from the room.', 'warn'); this.leaveLocal(); });
    on('left', () => this.leaveLocal());
    on('error', (m) => this.g.ui.toast(m.msg, 'warn', 5000));
  }

  get inMatch() { return this.room && (this.room.state === 'playing' || this.room.state === 'countdown'); }
  get me() { return this.net.me?.id; }
  get isHost() { return this.room?.hostId === this.me; }

  _room(m) {
    const prev = this.room?.state;
    this.room = m;
    for (const [id, r] of this.remotes) if (!m.players.find((p) => p.id === id && p.connected && !p.spectator)) { r.dispose(); this.remotes.delete(id); }
    for (const p of m.players) if (p.id !== this.me && p.connected && !p.spectator && !this.remotes.has(p.id)) this.remotes.set(p.id, new RemoteRider(this.g.scene, this.g.world.mats, p));
    const meP = m.players.find((p) => p.id === this.me); this.spectator = !!meP?.spectator;
    if (m.state === 'lobby' && prev && prev !== 'lobby') this._endLocalMatch();
    this.g.onlineUI?.renderLobby();
    this.g.comms?.onRoom();
    document.getElementById('mp-hud').classList.toggle('hidden', !(m.state === 'playing' || m.state === 'countdown'));
    this.g.cloud?.joinPresence(m.state === 'playing' ? 'in-match' : 'lobby', m.code);
  }

  _countdown(m) {
    const g = this.g, S = this.room.settings;
    this.startsAt = m.startsAt; this.endsAt = m.endsAt; this.results = null;
    track('match_start', { mode: S.mode, minutes: S.minutes, players: this.room.players.length });
    const mine = m.spawn.find((s) => s.id === this.me);
    if (mine) { g.bike.place(mine.x, mine.z, g.world.campus.spawn.heading); g.cam.yaw = g.bike.heading; g.cam.pos.set(0, 0, 0); }
    g.env.time = S.time; g.env.setWeatherMode(S.weather === 'dynamic' ? 'dynamic' : S.weather);
    if (S.weather !== 'dynamic') { g.env.forceWeather(S.weather); g.env.rain = S.weather === 'rain' ? 1 : 0; g.env.wet = S.weather === 'rain' ? 0.8 : 0; }
    g.festivals.mode = S.festival === 'none' ? 'off' : S.festival;
    // fair start: everyone on the Sparrow 110, or your own bike
    if (S.bikeRule === 'sparrow') { this._savedBike = { bike: g.profile.bike, up: g.profile.owned.upgrades }; g.profile.bike = 'sparrow'; g.profile.owned.upgrades = []; g._rebuildBike(); }
    g.bike.fuel = 100; g.bike.puncture = false;
    g.missions.active = null; g.missions.offers = []; this.job = null; this.offers = [];
    g.onlineUI?.closeLobby();
    if (g.state !== 'playing') { g.ui.closeModal(); g.ui.show('phone', false); g.state = 'playing'; g.ui.show('hud', true); g.ui.show('menu', false); }
    this._countdownShown = -1;
    document.getElementById('mp-hud').classList.remove('hidden');
  }

  _job(j) {
    const P = this.g.world.pois;
    const from = P[j.from], to = P[j.to];
    this.job = j;
    const a = this.g.missions.active && this.g.missions.active.id === j.id ? this.g.missions.active : { timer: 0, hold: 0, comfort: 100, crashes: 0 };
    Object.assign(a, { id: j.id, type: j.type, item: j.type === 'passenger' ? j.item : j.item, from, to, pay: j.pay, timeLimit: j.timeLimit, stage: j.stage, customer: 'customer', online: true });
    this.g.missions.active = a; this._arriveSent = false; a.hold = 0;
    this.g.nav.setTarget(j.stage === 'pickup' ? from : to, j.stage === 'pickup' ? 0xf4b400 : 0xb8322a);
    if (j.stage === 'drop') { this.g.audio.ping(); if (j.type === 'passenger') { this.g.bike.setPillion(j.id); this.g.bike.pillion.visible = true; } else this.g.bike.backpack.visible = true; }
  }
  _done(m) {
    const g = this.g;
    g.audio.coin();
    g.ui.toast(`Delivered ${'★'.repeat(Math.floor(m.stars))}${m.stars % 1 ? '½' : ''}  ₹${m.pay}${m.tip ? ' + ₹' + m.tip + ' tip' : ''}${m.late ? ' (late)' : ''}`, 'good', 3500);
    this.job = null; g.missions.active = null; g.nav.setTarget(null);
    g.bike.pillion.visible = false; g.bike.backpack.visible = false;
  }
  accept(id) { this.net.send({ type: 'accept', jobId: id }); }
  cancel() { this.net.send({ type: 'cancel' }); }

  _snap(m) {
    for (const row of m.p) {
      const [id, x, z, h, s, l] = row;
      if (id === this.me) continue;
      const r = this.remotes.get(id); if (r) r.push(m.t, x, z, h, s, l);
    }
  }

  _results(m) {
    this.results = m;
    track('match_finish', { mode: m.mode, players: m.rows.length });
    this.g.missions.active = null; this.job = null; this.g.nav.setTarget(null);
    document.getElementById('mp-hud').classList.add('hidden');
    const mine = m.rows.find((r) => r.id === this.me);
    if (mine) { // rewards into the single-player garage
      const p = this.g.profile;
      const coins = Math.round(mine.earned * 0.5 + (mine.rank === 1 && m.rows.length > 1 ? 150 : 0));
      p.money += coins; this.g.prog.addXp(20 + mine.deliveries * 12 + (mine.rank === 1 ? 50 : 0));
      p.online = p.online || { wins: 0, matches: 0, podiums: 0 };
      p.online.matches++; if (mine.rank === 1 && m.rows.length > 1) p.online.wins++; if (mine.rank <= 3) p.online.podiums++;
      if (p.online.wins === 1) this.g.ui.toast('Achievement: First online win!', 'good', 5000);
      m.coins = coins;
    }
    this._restoreBike();
    this.g.onlineUI?.showResults(m);
  }

  _endLocalMatch() { document.getElementById('mp-hud').classList.add('hidden'); this.g.missions.active = null; this.g.nav.setTarget(null); this._restoreBike(); this.g.input.enabled = true; }
  _restoreBike() { if (this._savedBike) { this.g.profile.bike = this._savedBike.bike; this.g.profile.owned.upgrades = this._savedBike.up; this._savedBike = null; this.g._rebuildBike(); } }
  leaveLocal() {
    for (const r of this.remotes.values()) r.dispose(); this.remotes.clear();
    this._endLocalMatch(); this.room = null; this.results = null; this.offers = [];
    this.g.comms?.onLeave();
    this.g.festivals.mode = this.g.settings.festival || 'auto'; this.g.env.setWeatherMode(this.g.settings.weather);
    this.g.onlineUI?.closeLobby();
    this.g.cloud?.joinPresence('playing');
  }
  leave() { this.net.send({ type: 'leave' }); this.leaveLocal(); }

  // collision with other riders: soft push apart
  collide(c, r) {
    let hit = null;
    for (const o of this.remotes.values()) {
      const dx = c.x - o.x, dz = c.z - o.z, d = Math.hypot(dx, dz), R = r + 0.5;
      if (d < R && d > 1e-4) { const nx = dx / d, nz = dz / d; c.x += nx * (R - d) * 0.5; c.z += nz * (R - d) * 0.5; hit = { nx, nz, depth: (R - d) * 0.5 }; }
    }
    return hit;
  }

  update(dt) {
    const g = this.g, b = g.bike;
    const now = this.net.now();
    for (const r of this.remotes.values()) r.update(now - 130);
    if (!this.room) return;
    // countdown freeze
    const counting = this.room.state === 'countdown' || (this.startsAt && now < this.startsAt);
    g.input.enabled = !counting && !this.spectator;
    const cd = document.getElementById('mp-count');
    if (counting && this.startsAt) {
      const s = Math.ceil((this.startsAt - now) / 1000);
      cd.classList.remove('hidden'); cd.textContent = s > 0 ? String(s) : 'Chalo!';
      if (s !== this._countdownShown) { this._countdownShown = s; if (s > 0) g.audio.click(); else g.audio.coin(); }
    } else if (this.room.state === 'playing' && now - this.startsAt < 900) { cd.classList.remove('hidden'); cd.textContent = 'Chalo!'; }
    else cd.classList.add('hidden');
    // state to server ~15 Hz
    this.sendT -= dt;
    if (this.sendT <= 0 && !this.spectator) { this.sendT = 1 / 15; this.net.send({ type: 'state', x: +b.pos.x.toFixed(2), z: +b.pos.z.toFixed(2), h: +b.heading.toFixed(3), s: +b.speed.toFixed(2), l: +b.lean.toFixed(2) }); }
    if (b.hornPressed && !this._hornWas) this.net.send({ type: 'horn' });
    this._hornWas = b.hornPressed;
    // timer
    if (this.room.state === 'playing') {
      const left = Math.max(0, (this.endsAt - now) / 1000);
      document.getElementById('mp-timer').textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
      document.getElementById('mp-timer').classList.toggle('late', left < 30);
      if (this._tick && Math.floor(left) !== this._lastSec) { this._lastSec = Math.floor(left); if (left < 30) g.audio.indicator(); }
    }
    // job arrival -> ask the server to confirm
    const a = g.missions.active;
    if (a && a.online && this.job) {
      a.timer += dt;
      const t = this.job.stage === 'pickup' ? a.from : a.to;
      const d = Math.hypot(b.pos.x - t.x, b.pos.z - t.z); a.distToTarget = d;
      if (d < 8 && b.kmh < 9) { a.hold += dt; if (a.hold > 0.9 && !this._arriveSent) { this._arriveSent = true; this.net.send({ type: 'arrive', jobId: this.job.id }); } }
      else { a.hold = Math.max(0, a.hold - dt * 2); if (d > 12) this._arriveSent = false; }
      if (a.type === 'passenger' && this.job.stage === 'drop') { this._cT = (this._cT || 0) - dt; if (this._cT <= 0) { this._cT = 2; this.net.send({ type: 'comfort', v: Math.round(a.comfort) }); } }
    }
    // spectator camera follows a rider
    if (this.spectator && this.remotes.size) {
      if (g.input.wasPressed('camera')) this.specIdx++;
      const list = [...this.remotes.values()]; const r = list[this.specIdx % list.length];
      b.place(r.x, r.z, r.h); b.root.visible = false;
    } else b.root.visible = true;
  }

  _renderBoard() {
    const el = document.getElementById('mp-board'); if (!el) return;
    const unit = this.metric === 'earned' ? (r) => '₹' + r.earned : this.metric === 'rating' ? (r) => '★ ' + r.rating.toFixed(2) : (r) => r.deliveries + ' jobs';
    const team = this.room?.settings.mode === 'team';
    let h = '';
    if (team) { const A = this.board.filter((r) => r.team === 'A').reduce((s, r) => s + r.deliveries, 0), B = this.board.filter((r) => r.team === 'B').reduce((s, r) => s + r.deliveries, 0); h += `<div class="mp-row team"><span>Team A ${A}</span><span>Team B ${B}</span></div>`; }
    this.board.slice(0, 8).forEach((r, i) => { h += `<div class="mp-row${r.id === this.me ? ' me' : ''}"><b>${i + 1}</b><span>${escapeHtml(r.name)}${team ? ' (' + r.team + ')' : ''}</span><em>${unit(r)}</em></div>`; });
    el.innerHTML = h;
  }
}
export function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
export { TYPE };
