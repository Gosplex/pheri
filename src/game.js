import * as THREE from 'three';
import { Input } from './core/input.js';
import { AudioEngine } from './core/audio.js';
import { loadProfile, newProfile, saveProfile, hasSave, loadSettings, saveSettings, clearSave } from './core/save.js';
import { clamp, lerp, damp, dampAngle, noise1 } from './core/rng.js';
import { buildWorld } from './world/world.js';
import { Environment } from './world/environment.js';
import { zoneAt } from './world/mapData.js';
import { Bike, BIKES, UPGRADES, COSMETICS } from './entities/bike.js';
import { Traffic } from './entities/traffic.js';
import { Pedestrians } from './entities/pedestrians.js';
import { Missions } from './game/missions.js';
import { Navigation } from './game/navigation.js';
import { Events } from './game/events.js';
import { UI } from './ui/ui.js';
import { Minimap, BigMap, buildMapCanvas } from './ui/minimap.js';
import { Progression } from './game/progression.js';
import { Festivals } from './game/festivals.js';
import { Radio } from './core/radio.js';
import { RING } from './world/mapData.js';
import { Rng } from './core/rng.js';
import { GAME } from './config.js';
import { Cloud } from './online/cloud.js';
import { Net } from './online/net.js';
import { Match } from './online/match.js';
import { OnlineUI } from './online/onlineUI.js';
import { Comms } from './online/comms.js';
import { track } from './analytics.js';

const CAM_MODES = [{ dist: 4.6, h: 1.85, look: 1.25 }, { dist: 7.2, h: 2.8, look: 1.3 }, { dist: 3.0, h: 1.55, look: 1.35 }, { fp: true }];
const PHOTO_FILTERS = [['None', 'none'], ['Warm', 'sepia(0.35) saturate(1.3) contrast(1.05)'], ['Mono', 'grayscale(1) contrast(1.15)'], ['Vintage', 'sepia(0.6) contrast(0.9) brightness(1.05)'], ['Vivid', 'saturate(1.6) contrast(1.1)']];

export class Game {
  constructor() {
    this.settings = loadSettings();
    this.state = 'loading';
    this.input = new Input();
    this.audio = new AudioEngine();
    this.audio.setVolume(this.settings.volume);
    this.clock = { last: performance.now(), t: 0 };
    this.cam = { yaw: 0, pitch: 0.12, orbit: 0, orbitT: 0, mode: 0, trauma: 0, pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 62 };
    this.fpsAcc = { t: 0, n: 0 };
    this.hudT = 0; this.saveT = 0; this.miniT = 0;
    this.challanCd = new Map();
  }

  async init() {
    const q = this.settings.quality;
    const canvas = document.getElementById('game-canvas');
    const renderer = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: q !== 'low', powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.basePR = Math.min(devicePixelRatio, q === 'high' ? 2 : q === 'medium' ? 1.5 : 1); this.pr = this.basePR; this.autoT = { t: 0, n: 0 };
    renderer.setPixelRatio(Math.min(devicePixelRatio, q === 'high' ? 2 : q === 'medium' ? 1.5 : 1));
    renderer.setSize(innerWidth, innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = q !== 'low';
    renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1400);
    addEventListener('resize', () => this.resize());

    this.ui = new UI(this);
    this.ui.startTips();
    document.documentElement.style.setProperty('--ui', this.settings.uiScale || 1);
    const prog = (p, m) => this.ui.loading(p, m);
    this.env = new Environment(this.scene, renderer, q);
    this.env.setWeatherMode(this.settings.weather);
    this.world = await buildWorld(this.scene, prog);
    prog(0.93, 'Starting traffic and people');
    await new Promise((r) => setTimeout(r, 0));

    this.profile = loadProfile() || newProfile();
    this.bike = new Bike(this.scene, this.world.mats, this.profile);
    this.bike.onShift = () => {};
    this.bike.onIndicator = () => this.audio.indicator();
    this.traffic = new Traffic(this.scene, this.world, this.world.mats, this.audio, q);
    this.world.mats.sign.map.needsUpdate = true; // vehicle signage drawn after the atlas upload
    this.peds = new Pedestrians(this.scene, this.world, q);
    this.peds.camPos = this.camera.position;
    this.peds.onBump = () => { if (this.state === 'playing' && this.bike.kmh > 8) { this.ui.say('Arre! Watch where you ride, bhai!'); this.missions.reportImpact(4); } };
    this.nav = new Navigation(this.scene, this.world.net);
    this.missions = new Missions(this.world, this.profile, this._missionHooks());
    this._bindProgression();
    this.festivals = new Festivals(this.scene, this.world, this.peds, this.audio, { toast: (m, k, ms) => this.ui.toast(m, k, ms), say: (t) => this.ui.say(t) });
    this.festivals.mode = this.settings.festival || 'auto';
    this.radio = new Radio(this.audio);
    this.input.tiltEnabled = !!this.settings.tilt;
    this.garages = this.world.pois.filter((p) => p.kind === 'garage');
    this.temples = this.world.props.temples;
    this.audio.engineProfile = BIKES[this.profile.bike]?.sound || 'single';
    this._setupPhoto();
    // ---- online: Supabase accounts + Render game server ----
    this.cloud = new Cloud({
      auth: async (u) => {
        if (!u) return;
        try { const remote = await this.cloud.pullSave(this.profile); if (remote) { this.adoptProfile(remote); this.ui.toast('Loaded your cloud save.', 'good'); } } catch { /* offline */ }
        this.cloud.joinPresence(this.state === 'menu' ? 'menu' : 'playing');
      },
      notification: (n) => { this.audio.ping(); this.ui.toast(n.kind === 'invite' ? `${n.payload.nickname} invited you to room ${n.payload.code}. Open Play online, Inbox.` : n.kind === 'friend' ? `${n.payload.nickname} sent you a friend request.` : 'New message in your inbox.', 'info', 7000); },
    });
    this.net = new Net({ status: (s) => { if (s) this.ui.toast(s, 'info', 3000); } });
    this.match = new Match(this, this.net);
    this.onlineUI = new OnlineUI(this);
    this.comms = new Comms(this);
    this.events = new Events(this.scene, this.world, this.peds, this.traffic, this.env, this.audio, {
      toast: (m, k) => this.ui.toast(m, k),
      puncture: () => { if (this.state !== 'playing' || this.bike.puncture) return; this.bike.puncture = true; this.audio.thud(0.5); this.ui.toast('Puncture! Rear tyre is flat. Find a garage (wrench on the map) and press E to fix it.', 'warn', 7000); },
      powerCut: () => this.festivals.triggerPowerCut(),
    });
    const mapCanvas = buildMapCanvas(this.world);
    this.minimap = new Minimap(document.getElementById('minimap'), mapCanvas, this.world);
    this.bigmap = new BigMap(document.getElementById('bigmap-canvas'), mapCanvas, this.world);
    this._placeAtStart(!!this.profile.pos);
    this.env.time = 17.9; // menu backdrop at golden hour
    this.warmup();
    prog(1, 'Ready');
    setTimeout(() => {
      this.ui.show('loading', false); this.toMenu();
      const q = new URLSearchParams(location.search);
      if (q.get('room')) this.menuAction('online');
      else if (q.get('r')) this.onlineUI.publicProfile(q.get('r'));
    }, 250);
    this.renderer.setAnimationLoop(() => this.frame());
    window.__game = this; // handy for debugging in the console
  }

  _bindProgression() {
    this.prog = new Progression(this.profile, { toast: (m, k, ms) => this.ui.toast(m, k, ms), chime: () => this.audio.chime() });
  }

  _fuelPrice() { const ev = BIKES[this.profile.bike]?.style === 'ev'; return 1.1 * (ev ? 0.35 : 1) * (1 - this.prog.perks.fuelDiscount); }

  // ---------------------------------------------------------------- photo mode
  _setupPhoto() {
    this.photo = { yaw: 0, pitch: 0.25, dist: 5, filter: 0, caption: true };
    const c = document.getElementById('game-canvas');
    c.addEventListener('wheel', (e) => { if (this.state === 'photo') { e.preventDefault(); this.photo.dist = Math.min(25, Math.max(1.6, this.photo.dist * (e.deltaY > 0 ? 1.1 : 0.9))); } }, { passive: false });
    document.getElementById('ph-shot').onclick = () => this.takePhoto();
    document.getElementById('ph-filter').onclick = (e) => { this.photo.filter = (this.photo.filter + 1) % PHOTO_FILTERS.length; e.target.textContent = 'Filter: ' + PHOTO_FILTERS[this.photo.filter][0]; c.style.filter = PHOTO_FILTERS[this.photo.filter][1]; };
    document.getElementById('ph-cap').onclick = (e) => { this.photo.caption = !this.photo.caption; e.target.textContent = 'Caption: ' + (this.photo.caption ? 'On' : 'Off'); };
    document.getElementById('ph-exit').onclick = () => this.togglePhoto();
    document.getElementById('ph-share').onclick = async () => {
      if (!this.cloud.loggedIn) return this.ui.toast('Sign in from Play online to share photos to the gallery.', 'warn');
      if (!this._lastPhoto) this.takePhoto();
      const blob = await new Promise((r) => this._lastPhoto.toBlob(r, 'image/png'));
      try { await this.cloud.uploadImage(blob, `${this.zoneName || 'Rajkot'}, ${this.env.hourString}`); this.ui.toast('Shared to Rajkot moments.', 'good'); } catch (e) { this.ui.toast(e.message, 'warn'); }
    };
  }
  togglePhoto() {
    const c = document.getElementById('game-canvas');
    if (this.state === 'photo') { this.state = 'playing'; this.ui.show('photo', false); this.ui.show('hud', true); c.style.filter = ''; return; }
    if (this.state !== 'playing') return;
    this.state = 'photo'; this.ui.show('photo', true); this.ui.show('hud', false);
    this.photo.yaw = this.bike.heading + 2.4; this.photo.pitch = 0.2; this.photo.dist = 5;
    c.style.filter = PHOTO_FILTERS[this.photo.filter][1];
  }
  takePhoto() {
    this.renderer.render(this.scene, this.camera);
    const src = this.renderer.domElement;
    const out = document.createElement('canvas'); out.width = src.width; out.height = src.height;
    const g = out.getContext('2d');
    g.filter = PHOTO_FILTERS[this.photo.filter][1]; g.drawImage(src, 0, 0); g.filter = 'none';
    if (this.photo.caption) {
      const s = out.height / 720;
      g.fillStyle = 'rgba(18,26,59,0.78)'; g.fillRect(0, out.height - 70 * s, out.width, 70 * s);
      g.fillStyle = '#f4b400'; g.font = `800 ${34 * s}px "Baloo Bhai 2", sans-serif`; g.textBaseline = 'middle';
      g.fillText(GAME.nameGu + '  ' + GAME.name, 24 * s, out.height - 36 * s);
      g.fillStyle = '#f3ede2'; g.font = `600 ${20 * s}px Rajdhani, sans-serif`; g.textAlign = 'right';
      g.fillText(`${this.zoneName || 'Rajkot'} · ${this.env.hourString} · Day ${this.env.day}${this.festivals.info.name ? ' · ' + this.festivals.info.name : ''}`, out.width - 24 * s, out.height - 36 * s);
    }
    const a = document.createElement('a'); a.download = `pheri-${Date.now()}.png`; a.href = out.toDataURL('image/png'); a.click();
    this.audio.click(); this.ui.toast('Photo saved to your downloads.', 'good');
    this._lastPhoto = out;
    track('photo_taken');
  }
  _photoCamera(dt) {
    const ph = this.photo, i = this.input;
    if (i.mouse.dx) ph.yaw -= i.mouse.dx * 0.006;
    if (i.mouse.dy) ph.pitch = clamp(ph.pitch + i.mouse.dy * 0.004, -0.1, 1.3);
    const b = this.bike.pos;
    this.camera.position.set(b.x + Math.sin(ph.yaw) * Math.cos(ph.pitch) * ph.dist, 1 + Math.sin(ph.pitch) * ph.dist, b.z + Math.cos(ph.yaw) * Math.cos(ph.pitch) * ph.dist);
    this.camera.lookAt(b.x, 1.0, b.z);
  }

  guestId() { let id = localStorage.getItem('pheri-guest'); if (!id) { id = crypto.randomUUID?.() || String(Math.random()).slice(2); try { localStorage.setItem('pheri-guest', id); } catch { /* private mode */ } } return id; }
  async goOnline() {
    if (this.net.connected) return;
    this.ui.toast('Connecting to the game server…', 'info', 2500);
    const p = this.profile;
    await this.net.connect({
      token: await this.cloud.token(), guestId: this.guestId(), name: this.cloud.profile?.nickname || localStorage.getItem('pheri-name') || 'Rider' + this.guestId().slice(0, 3),
      look: { helmet: COSMETICS[p.equip.helmet]?.color, paint: COSMETICS[p.equip.paint]?.color, bike: p.bike },
    });
    if (this.net.me?.motd) this.ui.toast(this.net.me.motd, 'info', 4000);
    track('online_connect', { signedIn: !!this.cloud?.loggedIn });
  }
  adoptProfile(remote) {
    this.profile = { ...newProfile(), ...remote };
    this.missions.profile = this.profile; this.bike.applyProfile(this.profile); this._bindProgression();
    saveProfile(this.profile);
  }

  // Daily challenge: 5 minutes, a date-seeded job sequence that is the same for everyone
  startDaily(scored) {
    const day = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
    const seed = [...day].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    if (this.state !== 'playing') { this.startPlaying(); }
    const sp = this.world.campus.spawn; this.bike.place(sp.x, sp.z, sp.heading); this.cam.yaw = sp.heading; this.cam.pos.set(0, 0, 0);
    this.env.time = 10; this.env.setWeatherMode('clear'); this.env.forceWeather('clear'); this.env.rain = 0; this.env.wet = 0; this.festivals.mode = 'off';
    this.bike.fuel = 100; this.bike.puncture = false;
    this.missions.active = null; this.missions.offers = []; this.missions.rng = new Rng(seed); this.missions.nextOffer = 0.5; this.nav.setTarget(null);
    this.daily = { endsAt: this.clock.t + 300, deliveries: 0, earned: 0, ratings: [], scored, day };
    document.getElementById('mp-hud').classList.remove('hidden');
    document.getElementById('mp-board').innerHTML = '<div class="mp-row me"><b>1</b><span>Daily challenge</span><em>0 jobs</em></div>';
    this.ui.toast(`Daily challenge ${day}: most deliveries in 5 minutes. Go!`, 'good', 4000);
  }
  _dailyTick() {
    const d = this.daily; if (!d) return;
    const left = Math.max(0, d.endsAt - this.clock.t);
    document.getElementById('mp-timer').textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    if (left > 0) return;
    this.daily = null;
    document.getElementById('mp-hud').classList.add('hidden');
    this.festivals.mode = this.settings.festival || 'auto'; this.env.setWeatherMode(this.settings.weather);
    this.missions.active = null; this.nav.setTarget(null);
    const rating = d.ratings.length ? d.ratings.reduce((a, b) => a + b, 0) / d.ratings.length : 0;
    const score = { deliveries: d.deliveries, earned: Math.round(d.earned), rating: +rating.toFixed(2) };
    this.ui.modal(`<div class="gu">Daily challenge</div><h2>${score.deliveries} deliveries</h2><p class="sub">${d.day} · ₹${score.earned} earned · rating ${score.rating || '–'}</p><p class="sub" id="daily-status">${d.scored ? 'Submitting your score…' : 'Practice run: not scored.'}</p><div class="modal-actions"><button class="btn" data-m="board">Leaderboard</button><button class="btn ghost" data-m="close">Keep riding</button></div>`,
      (m) => { if (m === 'board') { this.onlineUI.lbKind = 'daily'; this.onlineUI.leaderboards(); } else this.ui.closeModal(); });
    if (d.scored) this.cloud.submitDaily(score).then(() => { const el = document.getElementById('daily-status'); if (el) el.textContent = 'Score submitted to today\'s leaderboard.'; }).catch((e) => { const el = document.getElementById('daily-status'); if (el) el.textContent = e.message; });
  }

  warmup() { for (let i = 0; i < 90; i++) { this.traffic.update(1 / 30, this.bike, this.cam, this.env.time, 0); this.peds.update(1 / 30, this.bike, this.env.time, this.traffic); } }

  resize() {
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    if (this.state === 'map') { this.bigmap.resize(); this.bigmap.draw(); }
  }

  _placeAtStart(useSaved) {
    const sp = this.world.campus.spawn;
    if (useSaved && this.profile.pos) this.bike.place(this.profile.pos.x, this.profile.pos.z, this.profile.pos.h);
    else this.bike.place(sp.x, sp.z, sp.heading);
    this.cam.yaw = this.bike.heading;
    this.bike.fuel = this.profile.fuel;
  }

  // ---------------------------------------------------------------- states
  _menuProfile() {
    const p = this.profile, el = document.getElementById('menu-profile'); if (!el || !p) return;
    const lvl = p.prog?.level || 1;
    el.innerHTML = `<span>Level <b>${lvl}</b></span><span><b>₹${Math.round(p.money).toLocaleString('en-IN')}</b></span><span>★ <b>${p.rating.toFixed(2)}</b></span><span>${BIKES[p.bike]?.name || ''}</span>${this.cloud?.loggedIn ? `<span class="on">${this.cloud.profile?.nickname || 'Signed in'}</span>` : ''}`;
    document.getElementById('menu-ver').textContent = `${GAME.name} v${GAME.version}`;
  }
  toMenu() {
    this.state = 'menu';
    this.ui.stopTips(); this._menuProfile();
    if (!this._menuNav) {
      this._menuNav = true;
      document.getElementById('menu').addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        const btns = [...document.querySelectorAll('#menu-actions button:not(.hidden)')];
        const i = btns.indexOf(document.activeElement);
        btns[(i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length].focus(); e.preventDefault();
      });
    }
    document.getElementById('btn-continue').classList.toggle('hidden', !hasSave());
    this.ui.show('menu', true); this.ui.show('hud', false); this.ui.show('phone', false); this.ui.show('bigmap', false); this.ui.closeModal();
    this.nav.setTarget(null);
    setTimeout(() => document.querySelector('#menu-actions button:not(.hidden)')?.focus(), 50);
  }

  menuAction(a) {
    this.audio.start(); this.audio.click();
    if (a === 'continue' || a === 'new') {
      if (a === 'new') { clearSave(); this.profile = newProfile(); this.missions.profile = this.profile; this.missions.active = null; this.missions.offers = []; this.bike.applyProfile(this.profile); this._bindProgression(); this._placeAtStart(false); }
      else { this._placeAtStart(true); }
      this.env.time = this.profile.time; this.env.day = this.profile.day;
      this.startPlaying();
    } else if (a === 'online') { if (this.state === 'menu') { this._placeAtStart(!!this.profile.pos); this.env.time = this.profile.time; this.startPlaying(); } this.onlineUI.home(); }
    else if (a === 'settings') this.ui.settings(() => this.ui.closeModal());
    else if (a === 'controls') this.ui.controls(() => this.ui.closeModal());
  }

  startPlaying() {
    this.state = 'playing';
    track('ride_start', { returning: !!this.profile.tutorialDone, quality: this.settings.quality });
    this.ui.show('menu', false); this.ui.show('hud', true); this.ui.closeModal();
    this.ui.fps(this.settings.showFps ? '' : null);
    document.getElementById('game-canvas').focus();
    this.cloud?.joinPresence('playing');
    { // snap the chase camera behind the bike (no swoop from the menu camera)
      const b = this.bike, fx = Math.sin(b.heading), fz = Math.cos(b.heading);
      this.cam.yaw = b.heading; this.cam.orbit = 0;
      this.cam.pos.set(b.pos.x - fx * 4.6, 1.9, b.pos.z - fz * 4.6);
      this.cam.look.set(b.pos.x + fx * 3, 1.25, b.pos.z + fz * 3);
      this.camera.position.copy(this.cam.pos); this.camera.lookAt(this.cam.look);
    }
    const hs = document.getElementById('hint-strip'); hs.classList.remove('hidden', 'fade');
    clearTimeout(this._hintT); this._hintT = setTimeout(() => hs.classList.add('fade'), this.profile.tutorialDone ? 9000 : 45000);
    if (!this.profile.tutorialDone) this._tutorial(0);
    else this.ui.toast(`Welcome back. ${this.env.phaseName} in Rajkot.`, 'info');
  }

  _tutorial(step) {
    this.tut = step;
    const msgs = [
      'Hold W to ride, A and D to steer. Head for the main gate.',
      'Nice. Press P to open the Pheri app and accept your first job.',
      'Follow the marigold route. Stop at the marker to collect.',
    ];
    if (msgs[step]) this.ui.toast(msgs[step], 'info', 7000);
    if (step === 1 && !this.missions.offers.length) {
      const xerox = this.world.pois.find((p) => p.name === 'Campus Xerox & Stationery');
      const o = this.missions.makeOffer(this.env.time, this.bike.pos.x, this.bike.pos.z, 'docs');
      if (o) { if (xerox) o.from = xerox; o.item = 'Printed project report'; o.expires = 999; o.pay += 20; this.missions.offers.unshift(o); }
    }
  }

  pause() { if (this.state !== 'playing') return; this.state = 'paused'; this.ui.pauseMenu(); }
  resume() { this.ui.closeModal(); this.state = 'playing'; }
  quitToMenu() { this.saveNow(); this.ui.closeModal(); this.toMenu(); }

  togglePhone() {
    if (this.state === 'phone') { this.state = 'playing'; this.ui.show('phone', false); return; }
    if (this.state !== 'playing') return;
    this.state = 'phone'; this.ui.show('phone', true); this.ui.renderPhone(); this.audio.click();
  }
  toggleMap() {
    if (this.state === 'map') { this.state = 'playing'; this.ui.show('bigmap', false); return; }
    if (this.state !== 'playing') return;
    this.state = 'map'; this.ui.show('bigmap', true);
    this.bigmap.open(this.bike);
    this.bigmap.draw(this._mapExtras());
  }

  _mapExtras() {
    const t = [];
    const j = this.missions.active;
    if (j) t.push({ x: (j.stage === 'pickup' ? j.from : j.to).x, z: (j.stage === 'pickup' ? j.from : j.to).z, color: j.stage === 'pickup' ? '#f4b400' : '#b8322a' });
    return { route: this.nav.poly, targets: t };
  }

  // ---------------------------------------------------------------- missions glue
  _missionHooks() {
    return {
      newOffer: (o) => { if (this.state === 'playing') { this.audio.ping(); this.ui.toast(`New ${o.type === 'passenger' ? 'ride' : 'job'} on Pheri: ₹${o.pay}. Press P.`, 'info', 3500); } },
      accepted: (a) => {
        this.nav.setTarget(a.from, 0xf4b400);
        if (a.type === 'passenger') { const n = this.world.net.nearest(a.from.x, a.from.z); const h = n ? Math.atan2(-(n.lat), 1) : 0; this._waiting = this.peds.spawnWaiting(a.from.x, a.from.z, h); }
        this.ui.toast(`Accepted. Head to ${a.from.name}.`, 'good');
        if (this.tut === 1) this._tutorial(2);
      },
      pickedUp: (a) => {
        this.audio.ping();
        this.nav.setTarget(a.to, 0xb8322a);
        if (a.type === 'passenger') {
          if (this._waiting) { this.peds.despawn(this._waiting); this._waiting = null; }
          this.bike.setPillion(a.id); this.bike.pillion.visible = true;
          this.ui.say(`Kem cho! ${a.to.name}, please.`);
        } else { this.bike.backpack.visible = !this.bike.rearBox.visible; this.ui.toast(`Collected. Deliver to ${a.to.name}.`, 'good'); }
      },
      destChanged: (a) => { this.nav.setTarget(a.to, 0xb8322a); this.ui.say(`Actually, bhai, drop me at ${a.to.name} instead. I'll add ₹20.`); this.audio.ping(); },
      completed: (r) => {
        const p = this.profile;
        if (this.daily) { this.daily.deliveries++; this.daily.earned += r.total; this.daily.ratings.push(r.stars); document.getElementById('mp-board').innerHTML = `<div class="mp-row me"><b>1</b><span>Daily challenge</span><em>${this.daily.deliveries} jobs</em></div>`; }
        p.money += r.total; p.stats.jobs++; p.stats.earned += r.total; p.stats.shiftJobs++; p.stats.shiftEarned += r.total;
        p.stats.bestStreak = Math.max(p.stats.bestStreak, r.streak);
        this.audio.coin();
        const parts = [`₹${r.pay}`]; if (r.tip) parts.push(`₹${r.tip} tip`); if (r.streakBonus) parts.push(`₹${r.streakBonus} streak bonus`);
        this.ui.toast(`Delivered ${'★'.repeat(Math.floor(r.stars))}${r.stars % 1 ? '½' : ''}  ${parts.join(' + ')}${r.late ? ' (late)' : ''}`, 'good', 5000);
        this.bike.pillion.visible = false; this.bike.backpack.visible = false;
        this.nav.setTarget(null);
        track('job_complete', { type: r.job.type, stars: r.stars });
        this.prog.onJob(r, { hour: this.env.time, zone: zoneAt(this.bike.pos.x, this.bike.pos.z).id, raining: this.env.rain > 0.4, festival: this.festivals.isActiveNow(this.env.time) });
        if (!p.tutorialDone) { p.tutorialDone = true; this.tut = null; setTimeout(() => this.ui.toast('First job done! More offers will keep arriving. Fuel up at Saurashtra Fuels when low.', 'info', 7000), 2500); }
        this.saveNow();
      },
      cancelled: () => { this.nav.setTarget(null); this.bike.pillion.visible = false; this.bike.backpack.visible = false; if (this._waiting) { this.peds.despawn(this._waiting); this._waiting = null; } this.ui.toast('Job cancelled. Your rating took a small hit.', 'warn'); },
      say: (t) => this.ui.say(t),
      payMult: (h) => this.festivals ? this.festivals.payMultiplier(h) : 1,
      tipBonus: () => this.prog?.perks.tip || 0,
      levelPay: () => this.prog?.perks.pay || 0,
      dropProgress: (a) => { this.audio.coin(); this.nav.setTarget(a.to, 0xb8322a); this.ui.toast(`Dabba ${a.dropIndex} of ${a.drops.length} delivered. Next: ${a.to.name}.`, 'good'); },
    };
  }
  acceptJob(id) { if (this.match.room?.state === 'playing') { this.match.accept(id); if (this.state === 'phone') this.togglePhone(); return; } if (this.missions.accept(id, this.env.time)) { this.audio.click(); if (this.state === 'phone') this.togglePhone(); } }
  cancelJob() { if (this.match.room?.state === 'playing') { this.match.cancel(); return; } this.missions.cancel(); }

  buy(kind, id) {
    const p = this.profile;
    const price = kind === 'bike' ? BIKES[id].price : kind === 'upgrade' ? UPGRADES[id].price : COSMETICS[id].price;
    if (p.money < price) { this.audio.error(); return; }
    p.money -= price; this.audio.coin();
    track('purchase', { kind, item: id });
    if (kind === 'bike') { p.owned.bikes.push(id); p.bike = id; }
    else if (kind === 'upgrade') p.owned.upgrades.push(id);
    else { p.owned.cosmetics.push(id); p.equip[COSMETICS[id].slot] = id; }
    this._rebuildBike();
    this.ui.toast(`Bought ${kind === 'bike' ? BIKES[id].name : kind === 'upgrade' ? UPGRADES[id].name : COSMETICS[id].name}.`, 'good');
    this.saveNow();
  }
  equipBike(id) { this.profile.bike = id; this._rebuildBike(); this.saveNow(); }
  equip(id) { this.profile.equip[COSMETICS[id].slot] = id; this._rebuildBike(); this.saveNow(); }
  _rebuildBike() {
    const vis = { p: this.bike.pillion.visible, b: this.bike.backpack.visible };
    this.bike.applyProfile(this.profile);
    this.audio.engineProfile = BIKES[this.profile.bike]?.sound || 'single';
    if (CAM_MODES[this.cam.mode].fp) this.bike.setFirstPerson(true);
    this.bike.pillion.visible = vis.p; this.bike.backpack.visible = vis.b;
  }

  endShift() {
    this.state = 'summary'; this.ui.show('phone', false);
    this.prog.onShiftEnd(this.profile.stats, this.profile.rating);
    this.ui.summary(this.profile.stats, this.profile.rating);
  }
  startShift() {
    const s = this.profile.stats; s.shiftJobs = 0; s.shiftEarned = 0; s.shiftDistance = 0;
    this.saveNow(); this.ui.closeModal(); this.state = 'playing';
    this.ui.toast('New shift started. Offers are coming in.', 'good');
  }

  applySetting(k, v) {
    this.settings[k] = v; saveSettings(this.settings);
    if (k === 'volume') this.audio.setVolume(v);
    if (k === 'weather') this.env.setWeatherMode(v);
    if (k === 'showFps') this.ui.fps(v ? '' : null);
    if (k === 'uiScale') document.documentElement.style.setProperty('--ui', v);
    if (k === 'festival' && this.festivals) this.festivals.mode = v;
    if (k === 'tilt') { this.input.tiltEnabled = v; if (v && typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) DeviceOrientationEvent.requestPermission().catch(() => {}); }
    if (k === 'autoRes' && !v) { this.pr = this.basePR; this.renderer.setPixelRatio(this.pr); }
  }

  saveNow() {
    const p = this.profile;
    p.fuel = this.bike.fuel; p.time = this.env.time; p.day = this.env.day;
    p.pos = { x: this.bike.pos.x, z: this.bike.pos.z, h: this.bike.heading };
    saveProfile(p);
    if (this.cloud?.loggedIn && (!this._cloudT || performance.now() - this._cloudT > 60000)) { this._cloudT = performance.now(); p.savedAt = Date.now(); this.cloud.pushSave(p).catch(() => {}); }
  }

  // ---------------------------------------------------------------- frame
  // Fast-forward the simulation without rendering (used by automated tests: __game.simulate(10)).
  simulate(seconds, dt = 1 / 30) { for (let t = 0; t < seconds; t += dt) this.update(dt); this.input.endFrame(); }

  frame() {
    const now = performance.now();
    const realDt = (now - this.clock.last) / 1000; this.clock.last = now;
    const dt = Math.min(realDt, 1 / 20);
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
    if (this.settings.autoRes && this.state === 'playing') {
      this.autoT.t += realDt; this.autoT.n++;
      if (this.autoT.t > 2) {
        const fps = this.autoT.n / this.autoT.t; this.autoT.t = 0; this.autoT.n = 0;
        let pr = this.pr;
        if (fps < 42) pr = Math.max(0.6, pr - 0.15); else if (fps > 58) pr = Math.min(this.basePR, pr + 0.1);
        if (Math.abs(pr - this.pr) > 0.01) { this.pr = pr; this.renderer.setPixelRatio(pr); }
      }
    }
    if (this.settings.showFps && this.state === 'playing') {
      this.fpsAcc.t += realDt; this.fpsAcc.n++;
      if (this.fpsAcc.t > 0.5) { const info = this.renderer.info.render; this.ui.fps(`${Math.round(this.fpsAcc.n / this.fpsAcc.t)} fps · ${info.calls} calls`); this.fpsAcc.t = 0; this.fpsAcc.n = 0; }
    }
    this.input.endFrame();
  }

  update(dt) {
    this.clock.t += dt;
    const input = this.input;
    input.poll();

    // global keys
    if (input.wasPressed('pause') && this.ui.modalOpen && this.state !== 'paused' && this.state !== 'summary') { this.ui.dismissModal(); input.pressed.delete('pause'); }
    if (input.wasPressed('pause')) {
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
      else if (this.state === 'phone') this.togglePhone();
      else if (this.state === 'map') this.toggleMap();
    }
    if (input.wasPressed('phone') && (this.state === 'playing' || this.state === 'phone')) this.togglePhone();
    if (input.wasPressed('map') && (this.state === 'playing' || this.state === 'map')) this.toggleMap();
    if (input.wasPressed('photo') && (this.state === 'playing' || this.state === 'photo')) this.togglePhoto();
    if (this.match?.room && this.state === 'playing') for (let k = 1; k <= 6; k++) if (input.wasPressed('chat' + k)) this.net.send({ type: 'chat', q: k - 1 });
    if (input.wasPressed('radio') && this.radio && (this.state === 'playing' || this.state === 'phone')) { this.audio.start(); const st = this.radio.cycle(); this.ui.toast(st.id === 'off' ? 'Radio off' : `Now playing: ${st.name}, ${st.sub}`, 'info', 2500); if (this.state === 'phone') this.ui.renderPhone(); }

    const playing = this.state === 'playing' || this.state === 'phone';
    const timeScale = this.state === 'playing' ? 1 : this.state === 'phone' ? 0.3 : this.state === 'menu' ? 0.6 : 0;
    const sdt = dt * timeScale;

    if (this.state !== 'loading') {
      const hoursPerSec = 24 / (this.settings.dayMinutes * 60);
      const env = this.env.update(sdt, this.state === 'menu' ? hoursPerSec * 0.3 : hoursPerSec, this.camera.position);
      this.world.update(sdt, this.env, this.clock.t);
      if (sdt > 0) {
        if (playing) this._playUpdate(sdt);
        this.traffic.update(sdt, this.bike, this.cam, this.env.time, env.night);
        this.peds.update(sdt, this.bike, this.env.time, this.traffic);
        this.world.net.updateSignals(sdt);
      }
      if (this.debugCam) { /* camera driven externally (screenshots) */ } else if (this.state === 'menu') this._menuCamera(dt); else if (this.state === 'photo') this._photoCamera(dt); else this._chaseCamera(dt);
      if (this.comms && this.match?.room) this.comms.update();
      if (this.radio) this.radio.setDuck(this.state === 'paused' || this.state === 'menu' || this.state === 'summary');
      this._audio(dt);
      if (this.state === 'playing' || this.state === 'phone') {
        this.hudT += dt; if (this.hudT > 0.08) { this.hudT = 0; this.ui.updateHud(dt); }
        this.miniT += dt; if (this.miniT > 1 / 30) { this.miniT = 0; this._drawMinimap(); }
      }
      if (this.state === 'map' && this.clock.t % 0.5 < dt) this.bigmap.draw(this._mapExtras());
    }
  }

  _playUpdate(dt) {
    const bike = this.bike, input = this.input, p = this.profile;
    const inputAllowed = this.state === 'playing';
    const fakeInput = inputAllowed ? input : { axes: { steer: 0, throttle: 0, brake: 0 }, isDown: () => false, wasPressed: () => false };
    bike.hornPressed = inputAllowed && input.isDown('horn');
    bike.update(dt, fakeInput, this.world, this.env, (c, r) => this.traffic.collidePlayer(c, r) || this.peds.collidePlayer(c, r) || this.events.collidePlayer(c, r) || this.match.collide(c, r));
    const online = !!(this.match.room && this.match.room.state !== 'lobby');
    this.match.update(dt);
    if (bike.lastImpact > 2.5) {
      this.audio.thud(Math.min(1, bike.lastImpact / 10));
      this.cam.trauma = Math.min(1, this.cam.trauma + bike.lastImpact / 12);
      this.missions.reportImpact(bike.lastImpact);
      if (bike.lastImpact > 7.5) { this.prog.onCrash(); if (online) this.net.send({ type: 'crash' }); }
      if (bike.lastImpact > 7.5) this.ui.say(this.missions.active?.type === 'passenger' ? 'Aaah! Bhai, what are you doing?!' : 'Ouch. Careful with the cargo!');
    }
    if (inputAllowed && input.wasPressed('camera')) { this.cam.mode = (this.cam.mode + 1) % CAM_MODES.length; this.audio.click(); }

    // speed breakers and potholes
    const fx = Math.sin(bike.heading), fz = Math.cos(bike.heading);
    for (const b of this.world.roads.breakers) {
      const dx = bike.pos.x - b.x, dz = bike.pos.z - b.z;
      if (dx * dx + dz * dz > 100) { b._side = undefined; continue; }
      const along = dx * b.tx + dz * b.tz, lat = Math.abs(dx * b.tz - dz * b.tx);
      const side = Math.sign(along);
      if (b._side !== undefined && side !== b._side && lat < b.hw + 0.5) {
        const v = Math.abs(bike.speed);
        const hard = v > 7;
        bike.susV += Math.min(v, 14) * 0.35;
        this.audio.bump(hard ? 1 : 0.5);
        if (hard) { this.cam.trauma = Math.min(1, this.cam.trauma + 0.35); bike.speed *= 0.82; this.missions.reportBump(true); if (!this._breakerTip) { this._breakerTip = true; this.ui.toast('Speed breaker! Slow down below 25 km/h to cross smoothly.', 'warn'); } }
        else this.missions.reportBump(false);
      }
      b._side = side;
    }
    for (const ph of this.world.roads.potholes) {
      const d = Math.hypot(bike.pos.x - ph.x, bike.pos.z - ph.z);
      if (d < ph.r + 0.2 && !ph._hit && Math.abs(bike.speed) > 3) { ph._hit = true; bike.susV -= Math.min(Math.abs(bike.speed), 12) * 0.25; this.audio.bump(0.6); this.cam.trauma = Math.min(1, this.cam.trauma + 0.15); this.missions.reportBump(Math.abs(bike.speed) > 10); }
      else if (d > ph.r + 2) ph._hit = false;
    }

    // distance + stats
    p.stats.distance += bike.distanceThisFrame; p.stats.shiftDistance += bike.distanceThisFrame;
    if (bike.fuel <= 0 && !this._fuelWarned) { this._fuelWarned = true; this.ui.toast('Out of fuel! Push the bike to a Saurashtra Fuels pump (see the map).', 'warn', 7000); }
    if (bike.fuel > 5) this._fuelWarned = false;
    if (bike.fuel < 15 && bike.fuel > 0 && !this._lowWarned) { this._lowWarned = true; this.ui.toast('Fuel low. Nearest pumps: Morbi Road and 80 Ft Road.', 'warn'); }
    if (bike.fuel > 30) this._lowWarned = false;

    // refuelling
    let promptText = null;
    for (const fz2 of this.world.props.fuelZones) {
      if (Math.hypot(bike.pos.x - fz2.x, bike.pos.z - fz2.z) < 11) {
        const need = 100 - bike.fuel;
        const cost = Math.ceil(need * this._fuelPrice());
        if (need < 1) promptText = 'Tank is full';
        else if (bike.kmh > 4) promptText = 'Stop to refuel';
        else {
          promptText = this._refuelling ? `Filling... ₹${Math.ceil(this._refuelSpent || 0)}` : `Refuel (₹${cost})`;
          if (this.state === 'playing' && input.wasPressed('interact')) {
            if (p.money < 1) { this.audio.error(); this.ui.toast('Not enough money for fuel. Finish a job first.', 'warn'); }
            else { this._refuelling = true; this._refuelSpent = 0; }
          }
        }
      }
    }
    if (this._refuelling) {
      const add = Math.min(dt * 14, 100 - bike.fuel);
      const cost = add * this._fuelPrice();
      if (add <= 0.001 || p.money < cost || bike.kmh > 4) { this._refuelling = false; if (this._refuelSpent > 0) { this.prog.onRefuel(); this.ui.toast(`Refuelled for ₹${Math.ceil(this._refuelSpent)}. Thank you, visit again!`, 'good'); this.audio.coin(); } }
      else { bike.fuel += add; p.money -= cost; this._refuelSpent += cost; if ((this._ft = (this._ft || 0) + dt) > 0.15) { this._ft = 0; this.audio.fuelTick(); } }
    }
    // garages: puncture repair and servicing
    for (const gpoi of this.garages) {
      if (Math.abs(gpoi.x - bike.pos.x) > 10 || Math.abs(gpoi.z - bike.pos.z) > 10) continue;
      if (Math.hypot(gpoi.x - bike.pos.x, gpoi.z - bike.pos.z) > 9) continue;
      const wear = p.wear || 0;
      const cost = bike.puncture ? 60 : Math.round(wear * 450);
      if (bike.kmh > 4) promptText = `${gpoi.name}: stop for service`;
      else if (!bike.puncture && wear < 0.15) promptText = 'Mechanic: bike is in good shape';
      else {
        promptText = bike.puncture ? `Fix puncture (₹${cost})` : `Service bike (₹${cost}, wear ${Math.round(wear * 100)}%)`;
        if (this.state === 'playing' && input.wasPressed('interact')) {
          if (p.money < cost) { this.audio.error(); this.ui.toast('Not enough money for the mechanic.', 'warn'); }
          else { p.money -= cost; const wasFlat = bike.puncture; if (wasFlat) bike.puncture = false; else p.wear = 0; this.audio.coin(); this.ui.toast(wasFlat ? 'Puncture fixed in five minutes flat. Ride on!' : 'Serviced. The mechanic says: "Ekdum first class, bhai!"', 'good'); }
        }
      }
    }
    if ((p.wear || 0) > 0.8 && !this._wearWarned) { this._wearWarned = true; this.ui.toast('Your bike feels sluggish. Get it serviced at any garage.', 'warn', 6000); }
    if ((p.wear || 0) < 0.5) this._wearWarned = false;

    const job = this.missions.active;
    if (!promptText && job && job.distToTarget < 14 && job.distToTarget >= 8) promptText = job.stage === 'pickup' ? 'Stop at the marker to collect' : 'Stop at the marker to hand over';
    this.ui.prompt(promptText);

    // e-challan for red lights (Rajkot has CCTV signal cameras)
    const near = this.world.net.nearest(bike.pos.x, bike.pos.z, 30);
    if (near && near.d < near.e.hw + 1) this._lastEdge = near.e;
    for (const n of this.world.net.signals) {
      const d = Math.hypot(n.x - bike.pos.x, n.z - bike.pos.z);
      if (d < n.radius - 1 && this._lastEdge && (this._lastEdge.a === n || this._lastEdge.b === n) && bike.kmh > 12) {
        const light = this.world.net.signalFor(n, this._lastEdge);
        const cd = this.challanCd.get(n.id) || 0;
        if (light === 'red' && this.clock.t > cd) {
          this.challanCd.set(n.id, this.clock.t + 25);
          const fine = 200;
          p.money = Math.max(0, p.money - fine); p.stats.fines += fine; this.prog.onChallan();
          this.ui.toast(`E-challan: red light jumped on ${this._lastEdge.name}. ₹${fine} fine.`, 'warn', 5000);
          this.audio.error();
        }
      }
    }

    // festivals, power cuts, waterlogging
    this.festivals.update(dt, this.env, bike, this.clock.t);
    this.world.powerCut = this.festivals.powerCut > 0;
    const pd = this.festivals.puddleAt(bike.pos.x, bike.pos.z);
    if (pd && !bike.puddleDrag) { this.audio.splash(); this.cam.trauma = Math.min(1, this.cam.trauma + 0.2); if (bike.kmh > 30) { bike.speed *= 0.55; this.missions.reportBump(true); } if (!this._puddleTip) { this._puddleTip = true; this.ui.toast(`Waterlogged road on ${pd.name}. Go slow through the water.`, 'warn'); } }
    bike.puddleDrag = !!pd;

    // near misses: brush past traffic at speed without touching
    if (bike.kmh > 38) {
      for (const v of this.traffic.vehicles) {
        const dx = bike.pos.x - v.x, dz = bike.pos.z - v.z;
        if (dx * dx + dz * dz > 36) continue;
        const fx2 = Math.sin(v.heading), fz2 = Math.cos(v.heading);
        const half = Math.max(0, v.spec.len / 2 - v.spec.wid / 2);
        const t2 = clamp(dx * fx2 + dz * fz2, -half, half);
        const d = Math.hypot(bike.pos.x - (v.x + fx2 * t2), bike.pos.z - (v.z + fz2 * t2)) - v.spec.wid / 2;
        if (d < 0.9 && d > 0.25 && (v._nearCd || 0) < this.clock.t) {
          v._nearCd = this.clock.t + 8;
          p.money += 5; this.prog.onNearMiss(); if (online) this.net.send({ type: 'near' });
          this.ui.toast('Near miss! +₹5', 'good', 1500);
        }
      }
    }
    // laps of Madhapar Chowk
    const rdx = bike.pos.x - RING.x, rdz = bike.pos.z - RING.z, rd = Math.hypot(rdx, rdz);
    if (rd < 32 && rd > 16) {
      const ang = Math.atan2(rdz, rdx);
      if (this._ringAng !== undefined) { let da = ang - this._ringAng; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI; this._ringAcc = (this._ringAcc || 0) + da; if (Math.abs(this._ringAcc) > Math.PI * 2) { this._ringAcc = 0; this.prog.onLap(); this.ui.toast('Full lap of Madhapar Chowk!', 'info', 2000); } }
      this._ringAng = ang;
    } else { this._ringAng = undefined; this._ringAcc = 0; }
    // aarti bells at dawn and dusk near temples
    const h = this.env.time;
    if ((h > 6 && h < 6.4) || (h > 19 && h < 19.4)) {
      for (const tp of this.temples) if (Math.hypot(tp.x - bike.pos.x, tp.z - bike.pos.z) < 70 && (this._bellT || 0) < this.clock.t) { this._bellT = this.clock.t + 2.5; this.audio.bell(); }
    }
    this.prog.ensureDaily(this.env.day);
    this.prog.onDistance(bike.distanceThisFrame);

    // world systems (online matches take jobs from the server and switch off random events)
    if (!online) {
      this.missions.refreshOffers(dt, this.env.time, bike.pos.x, bike.pos.z);
      this.missions.update(dt, bike, this.env);
      this.events.update(dt, bike, this.env.time);
    } else if (this.missions.active?.type === 'passenger') this.missions.update(0, { ...bike, pos: { x: 1e9, z: 1e9 }, kmh: bike.kmh }, this.env);
    this.nav.update(dt, bike, this.clock.t);
    if (this.daily) this._dailyTick();
    this.zoneName = zoneAt(bike.pos.x, bike.pos.z).name;

    // tutorial progression
    if (this.tut === 0 && Math.hypot(bike.pos.x - 20, bike.pos.z + 600) < 40) this._tutorial(1);
    if (this.tut === 0 && this.clock.t > 50 && !this._tutNudge) { this._tutNudge = true; this._tutorial(1); }

    this.saveT += dt; if (this.saveT > 30) { this.saveT = 0; this.saveNow(); }
  }

  _drawMinimap() {
    const j = this.missions.active;
    const targets = [];
    if (j) { const t = j.stage === 'pickup' ? j.from : j.to; targets.push({ x: t.x, z: t.z, color: j.stage === 'pickup' ? '#f4b400' : '#b8322a' }); }
    if (this.bike.fuel < 25) for (const f of this.world.props.fuelZones) targets.push({ x: f.x, z: f.z, color: '#1aa36f', small: true });
    if (this.bike.puncture || (this.profile.wear || 0) > 0.7) {
      const b = this.bike.pos;
      [...this.garages].sort((a, c) => Math.hypot(a.x - b.x, a.z - b.z) - Math.hypot(c.x - b.x, c.z - b.z)).slice(0, 3).forEach((gp) => targets.push({ x: gp.x, z: gp.z, color: '#9e9e9e', small: true }));
    }
    this.minimap.draw(this.bike, this.cam.yaw, this.nav.poly, targets, this.traffic.vehicles);
  }

  _chaseCamera(dt) {
    const bike = this.bike, c = this.cam, input = this.input;
    const mode = CAM_MODES[c.mode];
    const sp = Math.abs(bike.speed);
    if (!!mode.fp !== !!bike.fp) bike.setFirstPerson(!!mode.fp);
    if (mode.fp) {
      if (input.mouse.dx) { c.orbit -= input.mouse.dx * 0.005; c.orbitT = 1.2; }
      c.orbitT -= dt; if (c.orbitT <= 0) c.orbit = damp(c.orbit, 0, 4, dt);
      c.yaw = bike.heading;
      const fx = Math.sin(bike.heading), fz = Math.cos(bike.heading);
      const rx = -Math.cos(bike.heading), rz = Math.sin(bike.heading);
      const h = 1.7 + bike.root.position.y;
      const roll = bike.lean;
      this.camera.position.set(bike.pos.x + fx * 0.32 - rx * Math.sin(roll) * h, h * Math.cos(roll) * 0.98, bike.pos.z + fz * 0.32 - rz * Math.sin(roll) * h);
      const ly = c.yaw + c.orbit;
      c.look.set(this.camera.position.x + Math.sin(ly) * 10, this.camera.position.y - 0.75, this.camera.position.z + Math.cos(ly) * 10);
      this.camera.lookAt(c.look);
      this.camera.rotation.z += -roll * 0.9;
      c.pos.copy(this.camera.position);
      const fov = 70 + clamp(sp / 28, 0, 1) * 10;
      c.fov = damp(c.fov, fov, 3, dt);
      if (Math.abs(this.camera.fov - c.fov) > 0.05) { this.camera.fov = c.fov; this.camera.updateProjectionMatrix(); }
      return;
    }
    // mouse / right stick orbit, recentres after a moment
    if (input.mouse.dx) { c.orbit -= input.mouse.dx * 0.005; c.orbitT = 1.6; }
    if (input.mouse.dy) c.pitch = clamp(c.pitch + input.mouse.dy * 0.003, -0.05, 0.6);
    c.orbitT -= dt;
    if (c.orbitT <= 0) { c.orbit = damp(c.orbit, 0, 3, dt); c.pitch = damp(c.pitch, 0.12, 2, dt); }
    const headingTarget = bike.speed < -0.2 ? bike.heading : bike.heading;
    c.yaw = dampAngle(c.yaw, headingTarget, sp > 1 ? 4.5 : 2.5, dt);
    const yaw = c.yaw + c.orbit;
    const dist = mode.dist + clamp(sp / 25, 0, 1) * 1.3 + (bike.boosting ? 0.4 : 0);
    const h = mode.h + clamp(sp / 25, 0, 1) * 0.25 + c.pitch * dist * 0.6;
    const target = new THREE.Vector3(bike.pos.x, mode.look + bike.root.position.y, bike.pos.z);
    const bx = Math.sin(yaw), bz = Math.cos(yaw);
    let want = new THREE.Vector3(bike.pos.x - bx * dist, h, bike.pos.z - bz * dist);
    // keep buildings from blocking the view
    const t = this.world.collision.segment(bike.pos.x, bike.pos.z, want.x, want.z, 2.2);
    if (t < 1) { const k = Math.max(0.15, t - 0.06); want.x = bike.pos.x + (want.x - bike.pos.x) * k; want.z = bike.pos.z + (want.z - bike.pos.z) * k; want.y = lerp(h + 2.2, h, k); }
    c.pos.x = damp(c.pos.x || want.x, want.x, 12, dt); c.pos.z = damp(c.pos.z || want.z, want.z, 12, dt); c.pos.y = damp(c.pos.y || want.y, want.y, 8, dt);
    if (Math.hypot(c.pos.x - want.x, c.pos.z - want.z) > 12) c.pos.copy(want);
    const look = target.clone().add(new THREE.Vector3(Math.sin(bike.heading) * 3, 0, Math.cos(bike.heading) * 3));
    c.look.lerp(look, 1 - Math.exp(-14 * dt));
    this.camera.position.copy(c.pos);
    // shake
    c.trauma = Math.max(0, c.trauma - dt * 1.6);
    const roughRoad = bike.surface === 'dirt' || bike.surface === 'grass' ? Math.min(0.25, sp / 60) : 0;
    const shake = this.settings.cameraShake ? c.trauma * c.trauma + roughRoad * 0.3 : 0;
    const tt = this.clock.t * 25;
    this.camera.position.x += noise1(tt) * shake * 0.35; this.camera.position.y += noise1(tt + 50) * shake * 0.25;
    this.camera.lookAt(c.look);
    this.camera.rotation.z += -bike.lean * 0.12;
    const fov = 60 + clamp(sp / 28, 0, 1) * 12 + (bike.boosting ? 5 : 0);
    c.fov = damp(c.fov, fov, 3, dt);
    if (Math.abs(this.camera.fov - c.fov) > 0.05) { this.camera.fov = c.fov; this.camera.updateProjectionMatrix(); }
  }

  _menuCamera(dt) {
    // slow orbit around the Marwadi University gate
    const t = this.clock.t * 0.05;
    const cx = 60, cz = -600;
    this.camera.position.set(cx + Math.sin(t) * 70, 26 + Math.sin(t * 0.7) * 4, cz + Math.cos(t) * 70);
    this.camera.lookAt(cx - 10, 4, cz);
    if (this.camera.fov !== 55) { this.camera.fov = 55; this.camera.updateProjectionMatrix(); }
    this.cam.yaw = this.bike.heading; this.cam.pos.set(0, 0, 0);
  }

  _audio(dt) {
    const b = this.bike, env = this.env;
    const z = zoneAt(b.pos.x, b.pos.z).id;
    let crowd = 0; for (const p of this.peds.peds) if (Math.abs(p.x - b.pos.x) < 30 && Math.abs(p.z - b.pos.z) < 30) crowd++;
    this.audio.update(dt, {
      rpm: b.rpm, throttle: this.state === 'playing' ? this.input.axes.throttle : 0, engineOn: this.state !== 'menu' && this.state !== 'loading',
      paused: this.state === 'paused' || this.state === 'map' || this.state === 'summary', horn: b.hornPressed, speed: Math.abs(b.speed), skid: b.skid,
      night: env.state.night, trafficNear: Math.min(1, (this.traffic.nearCount || 0) / 12), crowdNear: Math.min(1, crowd / 12), rain: env.rain,
      morning: env.state.morning, greenery: z === 'campus' || z === 'park' ? 1 : 0.35,
    });
  }
}
