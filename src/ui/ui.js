import { BIKES, UPGRADES, COSMETICS } from '../entities/bike.js';
import { ACHIEVEMENTS, xpForLevel } from '../game/progression.js';
import { STATIONS } from '../core/radio.js';

const $ = (id) => document.getElementById(id);
const rupee = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
const fmtTime = (s) => { const neg = s < 0; s = Math.abs(Math.round(s)); return (neg ? '+' : '') + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const fmtDist = (m) => (m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m / 10) * 10 + ' m');
const TYPE_LABEL = { food: 'Food', parcel: 'Parcel', docs: 'Documents', passenger: 'Passenger' };

const WEATHER_SVG = {
  clear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" fill="#f4b400"/><g stroke="#f4b400" stroke-width="2" stroke-linecap="round"><path d="M12 1v3M12 20v3M1 12h3M20 12h3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></g></svg>',
  night: '<svg viewBox="0 0 24 24"><path d="M20 15A8 8 0 0 1 9 4a8 8 0 1 0 11 11z" fill="#f3ede2"/></svg>',
  cloudy: '<svg viewBox="0 0 24 24"><path d="M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.5 3.5 0 0 0 7 18z" fill="#c9ccd6"/></svg>',
  rain: '<svg viewBox="0 0 24 24"><path d="M7 14h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.5 3.5 0 0 0 7 14z" fill="#9aa3b8"/><g stroke="#7fc4ff" stroke-width="2" stroke-linecap="round"><path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3"/></g></svg>',
};

export class UI {
  constructor(game) {
    this.g = game;
    this.toastEls = [];
    this.phoneTab = 'jobs';
    this._buildRpm();
    this._last = {};
    document.querySelectorAll('.phone-tabs button').forEach((b) => b.addEventListener('click', () => { this.phoneTab = b.dataset.tab; this.renderPhone(); game.audio.click(); }));
    $('menu-actions').addEventListener('click', (e) => { const a = e.target.closest('button')?.dataset.act; if (a) game.menuAction(a); });
    // touch controls
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      $('touch').classList.remove('hidden'); document.body.classList.add('touch-mode');
      $('touch').querySelectorAll('button').forEach((b) => {
        const act = b.dataset.t;
        const on = (e) => { e.preventDefault(); game.input.setTouch(act, true); };
        const off = (e) => { e.preventDefault(); game.input.setTouch(act, false); };
        b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
      });
    }
  }

  _buildRpm() {
    const svg = $('rpm'); let h = '';
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (1 - i / (n - 1)) * 0.9 + Math.PI * 0.05;
      const r1 = 80, r2 = i >= n - 3 ? 95 : 92;
      const x1 = 100 + Math.cos(a) * r1, y1 = 100 - Math.sin(a) * r1, x2 = 100 + Math.cos(a) * r2, y2 = 100 - Math.sin(a) * r2;
      h += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke-width="7" stroke-linecap="round" data-i="${i}"/>`;
    }
    svg.innerHTML = h;
    this.rpmTicks = [...svg.querySelectorAll('line')];
  }

  startTips() {
    const tips = [
      '<b>Kem cho!</b> Stop at the glowing marker to collect or hand over an order.',
      'Slow down below <b>25 km/h</b> for speed breakers, or your passenger will complain.',
      'Autos stop without warning. Give them space, or <b>honk</b> with H.',
      'Refuel at <b>Saurashtra Fuels</b> on Morbi Road or 80 Ft Road.',
      'Rain makes roads slippery. Brake early and fit <b>monsoon tyres</b>.',
      'Jumping a red light gets you an <b>e-challan</b>. Rajkot has cameras!',
      'Press <b>R</b> for Pheri FM, <b>O</b> for photo mode, <b>C</b> for helmet cam.',
      'Race friends in <b>Play online</b>. Most deliveries in 5 minutes wins.',
    ];
    let i = Math.floor(Math.random() * tips.length);
    const el = $('load-tip'); if (!el) return;
    const show = () => { el.style.opacity = 0; setTimeout(() => { el.innerHTML = tips[i++ % tips.length]; el.style.opacity = 1; }, 300); };
    show(); this._tipT = setInterval(show, 3200);
  }
  stopTips() { clearInterval(this._tipT); }

  loading(p, msg) { $('load-fill').style.width = Math.round(p * 100) + '%'; $('load-msg').textContent = msg; }

  show(id, on = true) { $(id).classList.toggle('hidden', !on); }

  // ------------------------------------------------------------------ HUD
  updateHud(dt) {
    const g = this.g, bike = g.bike, p = g.profile, env = g.env;
    const set = (id, v) => { if (this._last[id] !== v) { this._last[id] = v; $(id).textContent = v; } };
    set('speed', String(Math.round(bike.kmh)));
    set('gear', bike.pushing ? 'R' : bike.kmh < 1 ? 'N' : String(bike.gear));
    const rn = Math.min(1, (bike.rpm - 900) / (bike.model.redline - 900));
    const lit = Math.round(rn * this.rpmTicks.length);
    if (this._last.rpm !== lit) {
      this._last.rpm = lit;
      this.rpmTicks.forEach((t, i) => t.setAttribute('stroke', i < lit ? (i >= this.rpmTicks.length - 3 ? '#b8322a' : i >= this.rpmTicks.length - 6 ? '#f4b400' : '#f3ede2') : 'rgba(243,237,226,0.16)'));
    }
    const fuel = Math.max(0, bike.fuel);
    $('fuel-fill').style.width = fuel.toFixed(1) + '%';
    $('fuel-fill').classList.toggle('low', fuel < 15);
    $('boost-fill').style.width = (bike.boost * 100).toFixed(0) + '%';
    set('clock-time', env.hourString);
    const fest = g.festivals?.info?.name;
    set('clock-phase', `${env.phaseName} · Day ${env.day}${fest ? ' · ' + fest : ''}${g.world.powerCut ? ' · Power cut' : ''}`);
    document.getElementById('fx-speed').style.opacity = Math.max(0, Math.min(0.9, (bike.kmh - 45) / 40)).toFixed(2);
    document.getElementById('fx-lens').style.opacity = (env.rain * (bike.fp ? 1 : 0.55)).toFixed(2);
    set('money', rupee(p.money));
    if (this._lastMoney !== undefined && Math.round(p.money) !== this._lastMoney) {
      const d = Math.round(p.money) - this._lastMoney;
      if (Math.abs(d) >= 1) { const el = $('money-pop'); el.textContent = (d > 0 ? '+' : '−') + rupee(Math.abs(d)); el.className = ''; void el.offsetWidth; el.className = d > 0 ? 'up' : 'down'; }
    }
    this._lastMoney = Math.round(p.money);
    set('fuel-pct', `${bike.model?.style === 'ev' ? 'Battery' : 'Fuel'} ${Math.round(Math.max(0, bike.fuel))}%`);
    set('bike-name', bike.model?.name || '');
    $('speedo').classList.toggle('rush', !!bike.boosting);
    const nc = $('net-chip');
    if (g.net?.connected || g.net?.want) {
      nc.classList.remove('hidden'); nc.classList.toggle('bad', !g.net.connected);
      set('net-chip', g.net.connected ? `Online${g.net.rtt ? ' · ' + Math.round(g.net.rtt) + ' ms' : ''}${g.match?.room ? ' · Room ' + g.match.room.code : ''}` : 'Reconnecting…');
    } else nc.classList.add('hidden');
    set('rating', '★ ' + p.rating.toFixed(2));
    const w = env.rain > 0.3 ? 'rain' : env.cloud > 0.5 ? 'cloudy' : env.state.night > 0.5 ? 'night' : 'clear';
    if (this._last.w !== w) { this._last.w = w; $('weather-icon').innerHTML = WEATHER_SVG[w]; }
    set('zone-name', g.zoneName || '');
    $('compass-n').style.transform = `translate(-50%, -50%)`;
    // compass N rides the minimap rim
    const a = g.cam.yaw + Math.PI;
    const R = 104, nx = 110 + Math.sin(-a) * -R * 0 + (-Math.sin(a)) * 0;
    const vx = 0 * Math.cos(a) - (-1) * Math.sin(a), vy = 0 * Math.sin(a) + (-1) * Math.cos(a);
    const cx = 110 + vx * R, cy = 130 + vy * R;
    const el = $('compass-n'); el.style.left = cx + 'px'; el.style.top = Math.max(-2, Math.min(222, cy)) + 'px';
    void nx;

    // job card
    const job = g.missions.active;
    $('job-card').classList.toggle('hidden', !job);
    if (job) {
      set('job-type', job.rush ? 'Urgent' : (job.premium ? '★ ' : '') + (job.drops ? 'Tiffin round' : TYPE_LABEL[job.type]));
      $('job-type').classList.toggle('rush', !!job.rush);
      const left = job.timeLimit - job.timer;
      set('job-timer', left >= 0 ? fmtTime(left) : 'Late ' + fmtTime(left));
      $('job-timer').classList.toggle('late', left < 0);
      set('job-title', job.type === 'passenger' ? `Ride for ${job.item}` : job.item);
      set('job-stage', job.stage === 'pickup' ? (job.type === 'passenger' ? 'Pick up at' : 'Collect from') : job.type === 'passenger' ? 'Drop at' : job.drops ? `Dabba ${job.dropIndex + 1} of ${job.drops.length} to` : 'Deliver to');
      set('job-place', job.stage === 'pickup' ? job.from.name : job.to.name);
      set('job-dist', fmtDist(job.distToTarget ?? 0));
      set('job-pay', rupee(job.pay));
      const extra = job.type === 'passenger' && job.stage === 'drop' ? `Comfort <span class="comfort"><i style="width:${Math.max(0, job.comfort).toFixed(0)}%"></i></span>` : job.stage === 'drop' ? `For ${job.customer}` : 'Stop at the marker to collect';
      if (this._last.extra !== extra) { this._last.extra = extra; $('job-extra').innerHTML = extra; }
      $('job-hold').firstElementChild.style.width = Math.min(100, job.hold * 100) + '%';
      const steps = $('job-steps');
      if (this._last.step !== job.stage) {
        this._last.step = job.stage;
        steps.classList.toggle('drop', job.stage === 'drop');
        steps.querySelector('[data-s="pickup"]').className = job.stage === 'pickup' ? 'on' : 'done';
        steps.querySelector('[data-s="drop"]').className = job.stage === 'drop' ? 'on' : '';
      }
    }
  }

  toast(msg, kind = 'info', ms = 4200) {
    const el = document.createElement('div');
    el.className = 'toast ' + kind; el.textContent = msg;
    $('toasts').appendChild(el);
    this.toastEls.push(el);
    while (this.toastEls.length > 3) this.toastEls.shift().remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => { el.remove(); this.toastEls = this.toastEls.filter((x) => x !== el); }, 420); }, ms);
  }

  say(text, ms = 3500) {
    const el = $('speech'); el.textContent = text; el.classList.remove('hidden');
    clearTimeout(this._sayT); this._sayT = setTimeout(() => el.classList.add('hidden'), ms);
  }

  prompt(text) {
    if (!text) { $('prompt').classList.add('hidden'); return; }
    $('prompt').classList.remove('hidden');
    if (this._last.prompt !== text) { this._last.prompt = text; $('prompt-text').textContent = text; }
  }

  fps(v) { const el = $('fps'); if (v === null) el.classList.add('hidden'); else { el.classList.remove('hidden'); el.textContent = v; } }

  // ------------------------------------------------------------------ Phone
  renderPhone() {
    const g = this.g, p = g.profile, M = g.missions;
    document.querySelectorAll('.phone-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === this.phoneTab));
    $('phone-time').textContent = g.env.hourString;
    $('phone-money').textContent = rupee(p.money);
    const body = $('phone-body');
    let h = '';
    if (this.phoneTab === 'jobs' && g.match?.room?.state === 'playing') {
      const Mt = g.match, P = g.world.pois;
      if (M.active) h += `<h3>Current job</h3><div class="job"><div class="job-h"><b>${TYPE_LABEL[M.active.type]}</b><span class="pay">${rupee(M.active.pay)}</span></div><p class="meta">${M.active.from.name} → ${M.active.to.name}</p><button class="secondary" data-cancel="1">Cancel job</button></div>`;
      h += `<h3>${Mt.shared ? 'Shared job board: first to accept wins' : 'Match jobs'}</h3>`;
      for (const o of Mt.offers) {
        const f = P[o.from], t = P[o.to]; const d = Math.hypot(f.x - g.bike.pos.x, f.z - g.bike.pos.z);
        h += `<div class="job"><div class="job-h"><b>${TYPE_LABEL[o.type]}</b><span class="pay">${rupee(o.pay)}</span></div><p>${o.item}</p><p class="meta">${f.name} → ${t.name}<br>${fmtDist(d)} to pickup · trip ${fmtDist(o.dist)}</p><button data-accept="${o.id}" ${M.active ? 'disabled style="opacity:.4"' : ''}>Accept</button></div>`;
      }
      if (!Mt.offers.length) h += '<p class="empty">Waiting for jobs from the server…</p>';
    } else if (this.phoneTab === 'jobs') {
      if (M.active) {
        const j = M.active;
        h += `<h3>Current job</h3><div class="job${j.premium ? ' premium' : ''}"><div class="job-h"><b>${TYPE_LABEL[j.type]}${j.type === 'passenger' ? ': ' + j.item : ''}</b><span class="pay">${rupee(j.pay)}</span></div>
          <p>${j.type === 'passenger' ? 'Passenger ride' : j.item}</p><p class="meta">${j.from.name} → ${j.to.name}</p>
          <button class="secondary" data-cancel="1">Cancel job (hurts rating)</button></div>`;
      }
      h += `<h3>${M.active ? 'Queued offers' : 'Available near you'}</h3>`;
      if (!M.offers.length) h += `<p class="empty">No offers right now. New requests come in every few seconds while you ride, so keep moving through busy areas.</p>`;
      for (const o of M.offers) {
        const d = Math.hypot(o.from.x - g.bike.pos.x, o.from.z - g.bike.pos.z);
        h += `<div class="job${o.premium ? ' premium' : ''}"><div class="job-h"><b>${o.premium ? '★ Premium ' : ''}${TYPE_LABEL[o.type]}</b><span class="pay">${rupee(o.pay)}</span></div>
          <p>${o.type === 'passenger' ? `${o.item} needs a ride` : o.item}</p>
          <p class="meta">${o.from.name} → ${o.to.name}<br>${fmtDist(d)} to pickup · trip ${fmtDist(o.dist)} · ${fmtTime(o.timeLimit)} limit</p>
          <button data-accept="${o.id}" ${M.active ? 'disabled style="opacity:.4"' : ''}>Accept</button></div>`;
      }
    } else if (this.phoneTab === 'garage') {
      h += `<h3>Your wallet: ${rupee(p.money)}</h3><h3>Bikes</h3>`;
      for (const [id, b] of Object.entries(BIKES)) {
        const owned = p.owned.bikes.includes(id), eq = p.bike === id;
        h += `<div class="item"><span class="sw" style="background:#1e2a5a"></span><span class="txt">${b.name}<small>${b.blurb} Top ${Math.round(b.top * 3.6)} km/h</small></span>
          ${eq ? '<button class="row-btn secondary" disabled>Riding</button>' : owned ? `<button class="row-btn" data-bike="${id}">Ride</button>` : `<button class="row-btn" data-buybike="${id}" ${p.money < b.price ? 'disabled' : ''}>${rupee(b.price)}</button>`}</div>`;
      }
      h += `<h3>Upgrades</h3>`;
      for (const [id, u] of Object.entries(UPGRADES)) {
        const owned = p.owned.upgrades.includes(id);
        const locked = u.requires && !p.owned.upgrades.includes(u.requires);
        h += `<div class="item"><span class="sw" style="background:#f4b400"></span><span class="txt">${u.name}<small>${u.desc}</small></span>
          ${owned ? '<button class="row-btn secondary" disabled>Fitted</button>' : `<button class="row-btn" data-up="${id}" ${p.money < u.price || locked ? 'disabled' : ''}>${rupee(u.price)}</button>`}</div>`;
      }
      h += `<h3>Style</h3>`;
      for (const [id, c] of Object.entries(COSMETICS)) {
        const owned = p.owned.cosmetics.includes(id), eq = p.equip[c.slot] === id;
        h += `<div class="item"><span class="sw" style="background:#${c.color.toString(16).padStart(6, '0')}"></span><span class="txt">${c.name}<small>${c.slot}</small></span>
          ${eq ? '<button class="row-btn secondary" disabled>On</button>' : owned ? `<button class="row-btn" data-equip="${id}">Wear</button>` : `<button class="row-btn" data-cos="${id}" ${p.money < c.price ? 'disabled' : ''}>${rupee(c.price)}</button>`}</div>`;
      }
    } else if (this.phoneTab === 'profile') {
      const G = p.prog, need = xpForLevel(G.level);
      const pk = g.prog.perks;
      h += `<h3>Rider level</h3><div class="stat"><b>Level ${G.level}</b><div class="xp"><i style="width:${Math.min(100, (G.xp / need) * 100).toFixed(0)}%"></i></div><span>${G.xp} / ${need} XP · pay +${Math.round(pk.pay * 100)}% · tips +${Math.round(pk.tip * 100)}%${pk.fuelDiscount ? ' · fuel −10%' : ''}</span></div>`;
      h += `<h3>Today's challenges (Day ${g.env.day})</h3>`;
      for (const c of G.daily?.list || []) h += `<div class="daily${c.done ? ' done' : ''}">${c.done ? '✓ ' : ''}${c.desc}<small>${c.id === 'km' ? (c.count / 1000).toFixed(1) + ' / 5 km' : c.id === 'earn' ? '₹' + Math.round(c.count) + ' / ₹' + c.target : Math.min(c.count, c.target) + ' / ' + c.target} · reward ₹${c.reward}</small></div>`;
      const fest = g.festivals.info;
      if (fest.name) h += `<h3>Festival</h3><div class="daily">${fest.name} <span style="font-family:var(--gu)">${fest.gu}</span><small>${fest.blurb}</small></div>`;
      h += `<h3>Achievements (${G.ach.length}/${ACHIEVEMENTS.length})</h3><div class="ach">${ACHIEVEMENTS.map((a) => `<div class="${G.ach.includes(a.id) ? 'got' : 'locked'}"><b>${a.name}</b>${a.desc}</div>`).join('')}</div>`;
      h += `<h3>Best shifts</h3>`;
      if (!G.best.length) h += `<p class="empty">End a shift from the Stats tab to record it here.</p>`;
      G.best.forEach((b, i) => { h += `<div class="daily">#${i + 1} ${rupee(b.earned)} · ${b.jobs} jobs<small>${b.km} km · ★ ${b.rating} · ${b.date}</small></div>`; });
    } else if (this.phoneTab === 'radio') {
      h += `<h3>Pheri FM</h3><p class="empty" style="padding-top:0">Press <b>R</b> while riding to switch stations.</p>`;
      for (const st of STATIONS) h += `<button class="station${g.radio.station === st.id ? ' on' : ''}" data-station="${st.id}">${st.name}${st.sub ? `<small>${st.sub}</small>` : ''}</button>`;
    } else {
      const s = p.stats;
      const stars = p.rating;
      h += `<h3>Rider rating</h3><div class="stat"><b>★ ${stars.toFixed(2)}</b><span>${stars >= 4.5 ? 'Premium jobs unlocked' : 'Reach 4.50 to unlock premium jobs (+50% pay)'}</span></div>
        <h3>This shift</h3><div class="stat-grid"><div class="stat"><b>${s.shiftJobs}</b><span>jobs done</span></div><div class="stat"><b>${rupee(s.shiftEarned)}</b><span>earned</span></div>
        <div class="stat"><b>${(s.shiftDistance / 1000).toFixed(1)}</b><span>km ridden</span></div><div class="stat"><b>${g.missions.streak}</b><span>5★ streak</span></div></div>
        <h3>All time</h3><div class="stat-grid"><div class="stat"><b>${s.jobs}</b><span>jobs</span></div><div class="stat"><b>${rupee(s.earned)}</b><span>earned</span></div>
        <div class="stat"><b>${(s.distance / 1000).toFixed(1)}</b><span>km</span></div><div class="stat"><b>${rupee(s.fines)}</b><span>e-challans paid</span></div></div>
        <button class="row-btn" data-endshift="1" style="width:100%;margin-top:16px">End shift and see summary</button>
        <button class="row-btn secondary" data-online="1" style="width:100%;margin-top:8px">Play online</button>`;
    }
    body.innerHTML = h;
    body.onclick = (e) => {
      const t = e.target.closest('button'); if (!t || t.disabled) return;
      const d = t.dataset;
      if (d.accept) g.acceptJob(+d.accept);
      else if (d.cancel) g.cancelJob();
      else if (d.buybike) g.buy('bike', d.buybike);
      else if (d.bike) g.equipBike(d.bike);
      else if (d.up) g.buy('upgrade', d.up);
      else if (d.cos) g.buy('cosmetic', d.cos);
      else if (d.equip) g.equip(d.equip);
      else if (d.endshift) g.endShift();
      else if (d.station) { g.audio.start(); g.radio.set(d.station); }
      else if (d.online) { g.togglePhone(); g.onlineUI.home(); return; }
      this.renderPhone();
    };
  }

  // ------------------------------------------------------------------ Modals
  modal(html, bind, onClose = null) {
    $('modal-card').innerHTML = `<button class="modal-x" data-m="__close" aria-label="Close">✕</button>` + html; this.show('modal', true);
    this._onClose = onClose;
    $('modal-card').onclick = (e) => { const b = e.target.closest('[data-m]'); if (!b) return; if (b.dataset.m === '__close') { this.dismissModal(); return; } bind(b.dataset.m, b); };
    setTimeout(() => $('modal-card').querySelector('button')?.focus(), 30);
  }
  closeModal() { this.show('modal', false); this._onClose = null; }
  get modalOpen() { return !$('modal').classList.contains('hidden'); }
  // Close button / Esc: run the screen's own close action if it has one
  dismissModal() { const f = this._onClose; this.closeModal(); if (f) f(); }

  pauseMenu() {
    this.modal(`<h2>Paused</h2><p class="sub">${this.g.env.hourString}, ${this.g.zoneName || 'Rajkot'}</p>
      <div class="modal-actions"><button class="btn" data-m="resume">Resume</button><button class="btn ghost" data-m="settings">Settings</button><button class="btn ghost" data-m="controls">Controls</button><button class="btn ghost" data-m="quit">Save and quit to menu</button></div>`,
    (m) => { if (m === 'resume') this.g.resume(); else if (m === 'settings') this.settings(() => this.pauseMenu()); else if (m === 'controls') this.controls(() => this.pauseMenu()); else if (m === 'quit') this.g.quitToMenu(); }, () => this.g.resume());
  }

  settings(back) {
    const s = this.g.settings;
    const seg = (key, opts) => `<div class="seg" data-key="${key}">${opts.map(([v, l]) => `<button data-m="set" data-k="${key}" data-v="${v}" class="${String(s[key]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    this.modal(`<h2>Settings</h2><p class="sub">Changes apply straight away. Graphics quality applies on the next start.</p>
      <div class="set-row"><span>Graphics quality<small>Shadows, traffic, crowd size</small></span>${seg('quality', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']])}</div>
      <div class="set-row"><span>Volume</span><input type="range" min="0" max="1" step="0.05" value="${s.volume}" id="vol"></div>
      <div class="set-row"><span>Day length<small>Real minutes per game day</small></span>${seg('dayMinutes', [[12, '12'], [24, '24'], [48, '48']])}</div>
      <div class="set-row"><span>Weather</span>${seg('weather', [['dynamic', 'Dynamic'], ['clear', 'Clear'], ['cloudy', 'Cloudy'], ['rain', 'Rain']])}</div>
      <div class="set-row"><span>Festivals<small>Auto rotates Navratri, Uttarayan, Diwali by day</small></span>${seg('festival', [['auto', 'Auto'], ['off', 'Off'], ['navratri', 'Navratri'], ['uttarayan', 'Kites'], ['diwali', 'Diwali']])}</div>
      <div class="set-row"><span>Auto resolution<small>Lowers render scale to keep the game smooth</small></span>${seg('autoRes', [[true, 'On'], [false, 'Off']])}</div>
      ${'ontouchstart' in window || navigator.maxTouchPoints > 0 ? `<div class="set-row"><span>Tilt steering<small>Steer by tilting your phone</small></span>${seg('tilt', [[true, 'On'], [false, 'Off']])}</div>` : ''}
      <div class="set-row"><span>Camera shake</span>${seg('cameraShake', [[true, 'On'], [false, 'Off']])}</div>
      <div class="set-row"><span>Interface size<small>Scales the HUD, phone and menus</small></span>${seg('uiScale', [[0.85, 'S'], [1, 'M'], [1.15, 'L'], [1.3, 'XL']])}</div>
      <div class="set-row"><span>Show FPS</span>${seg('showFps', [[true, 'On'], [false, 'Off']])}</div>
      <div class="modal-actions"><button class="btn" data-m="back">Done</button></div>`,
    (m, b) => {
      if (m === 'set') { let v = b.dataset.v; if (v === 'true') v = true; else if (v === 'false') v = false; else if (!isNaN(+v)) v = +v; this.g.applySetting(b.dataset.k, v); this.settings(back); }
      if (m === 'back') back();
    }, back);
    $('vol').oninput = (e) => this.g.applySetting('volume', +e.target.value);
  }

  controls(back) {
    this.modal(`<h2>Controls</h2><p class="sub">Keyboard, gamepad or touch. Bikes have no reverse: holding brake at a stop walks the bike backwards.</p>
      <div class="keys"><kbd>W / ↑</kbd><span>Throttle</span><kbd>S / ↓</kbd><span>Brake, walk back when stopped</span><kbd>A D / ← →</kbd><span>Steer</span>
      <kbd>Space</kbd><span>Rear brake slide</span><kbd>Shift</kbd><span>Rush (short burst, uses more fuel)</span><kbd>H</kbd><span>Horn (people and traffic make way)</span>
      <kbd>E</kbd><span>Refuel at a pump</span><kbd>P / Tab</kbd><span>Pheri phone: jobs, garage, stats</span><kbd>M</kbd><span>Full map</span>
      <kbd>C</kbd><span>Camera (near, far, low, helmet cam)</span><kbd>R</kbd><span>Radio station</span><kbd>Enter</kbd><span>Chat (online rooms)</span><kbd>V</kbd><span>Voice: mute/unmute, or hold to talk</span><kbd>N</kbd><span>Camera on/off (video rooms)</span><kbd>1–6</kbd><span>Quick chat</span><kbd>O</kbd><span>Photo mode</span><kbd>Mouse drag</kbd><span>Look around</span><kbd>L</kbd><span>Indicator</span><kbd>F</kbd><span>High beam</span><kbd>Esc</kbd><span>Pause</span></div>
      <div class="modal-actions"><button class="btn" data-m="back">Got it</button></div>`, (m) => { if (m === 'back') back(); }, back);
  }

  summary(s, rating) {
    const stars = '★'.repeat(Math.round(rating)) + '☆'.repeat(5 - Math.round(rating));
    this.modal(`<div class="gu">શાબાશ! Shift complete</div><h2>Shift summary</h2><p class="sub">Day ${this.g.env.day}, ${this.g.env.hourString}</p>
      <div class="summary-grid"><div><b>${s.shiftJobs}</b><span>jobs completed</span></div><div><b>${rupee(s.shiftEarned)}</b><span>earned this shift</span></div>
      <div><b>${(s.shiftDistance / 1000).toFixed(1)} km</b><span>ridden</span></div><div><b class="stars">${stars}</b><span>rating ${rating.toFixed(2)}</span></div></div>
      <div class="modal-actions"><button class="btn" data-m="new">Start next shift</button><button class="btn ghost" data-m="menu">Main menu</button></div>`,
    (m) => { if (m === 'new') this.g.startShift(); else this.g.quitToMenu(); }, () => this.g.startShift());
  }
}
