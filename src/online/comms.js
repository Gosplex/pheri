// Live communication during multiplayer: text chat panel, Agora voice (room, team or proximity),
// camera tiles, push-to-talk, per-player mute, report, and a one-time safety consent.
import { Voice } from './rtc.js';
import { QUICK_CHAT, escapeHtml as E } from './match.js';
import { track } from '../analytics.js';

const $ = (id) => document.getElementById(id);
const CONSENT_KEY = 'pheri-rtc-consent-v1';

export class Comms {
  constructor(game) {
    this.g = game;
    this.msgs = [];
    this.unread = 0;
    this.collapsed = false;
    this.media = new Map(); // playerId -> { mic, cam }
    this.voice = new Voice({
      change: () => this.renderBar(),
      levels: () => this.renderSpeaking(),
      allowAudio: (uid) => this._allowAudio(uid),
      videoOn: (uid, track) => this._videoOn(uid, track),
      videoOff: (uid) => this._videoOff(uid),
      renewToken: () => this._token(),
      state: (s) => { this.state = s; this.renderBar(); },
    });
    const net = game.net;
    net.on('chatHistory', (m) => { this.msgs = m.list.slice(-40); this.renderChat(); });
    net.on('rtcToken', (m) => { const r = this._pendingToken; this._pendingToken = null; if (r) (m.error ? r.reject(new Error(m.error)) : r.resolve(m)); });
    net.on('media', (m) => { this.media.set(m.from, { mic: m.mic, cam: m.cam }); this.renderTiles(); });
    this._bindDom();
  }

  get match() { return this.g.match; }
  get room() { return this.match?.room; }
  get settings() { return this.room?.settings || {}; }
  playerByUid(uid) { return this.room?.players.find((p) => p.rtcUid === uid); }

  // ------------------------------------------------------------------ chat
  onChat(m) {
    this.msgs.push(m); if (this.msgs.length > 40) this.msgs.shift();
    if (this.collapsed) this.unread++;
    this.renderChat();
  }
  send(text) {
    text = String(text || '').trim(); if (!text) return;
    const teamOnly = this.settings.mode === 'team' && (this._teamOnly || text.startsWith('/t '));
    this.g.net.send({ type: 'chat', text: text.replace(/^\/t /, ''), teamOnly });
  }
  renderChat() {
    const box = $('chat'); if (!box) return;
    const inRoom = !!this.room;
    box.classList.toggle('hidden', !inRoom);
    if (!inRoom) return;
    const S = this.settings;
    const myBlocks = this.g.cloud?.blocked || new Set();
    $('chat-log').innerHTML = this.msgs.filter((m) => !myBlocks.has(m.from) && !this.voice.localMuted.has('chat:' + m.from)).map((m) => `<div class="cm${m.from === this.match.me ? ' mine' : ''}${m.quick ? ' quick' : ''}"><button class="cn" data-from="${E(m.from)}">${E(m.name)}${m.teamOnly ? ' (team)' : ''}</button><span>${E(m.text)}</span></div>`).join('');
    $('chat-log').scrollTop = 1e9;
    $('chat-form').classList.toggle('hidden', !S.textChat);
    $('chat-quick').innerHTML = QUICK_CHAT.map((q, i) => `<button data-q="${i}" title="Key ${i + 1}">${q}</button>`).join('');
    $('chat-team').classList.toggle('hidden', S.mode !== 'team');
    $('chat-team').textContent = this._teamOnly ? 'Team' : 'All';
    $('chat-badge').textContent = this.unread ? String(this.unread) : '';
    box.classList.toggle('collapsed', this.collapsed);
  }

  // ------------------------------------------------------------------ voice & video
  _allowAudio(uid) {
    const S = this.settings;
    if (S.voice === 'off') return false;
    if (S.voice === 'team') { const p = this.playerByUid(uid), me = this.room?.players.find((q) => q.id === this.match.me); return !!(p && me && p.team === me.team); }
    return true;
  }
  _token() {
    return new Promise((resolve, reject) => {
      this._pendingToken = { resolve, reject };
      this.g.net.send({ type: 'rtcToken' });
      setTimeout(() => { if (this._pendingToken) { this._pendingToken = null; reject(new Error('The game server did not answer. Try again.')); } }, 8000);
    });
  }
  async joinVoice() {
    if (!Voice.supported()) return this.g.ui.toast('This browser cannot do voice chat. Try the latest Chrome, Edge, Firefox or Safari.', 'warn');
    if (!this.room) return;
    if (!localStorage.getItem(CONSENT_KEY)) return this._consent(() => this.joinVoice());
    try {
      this.g.audio.start();
      const cred = await this._token();
      await this.voice.join(cred, { mic: this.settings.voice !== 'off' });
      this.g.net.send({ type: 'media', mic: this.voice.micOn, cam: false });
      track('voice_join', { mode: this.settings.voice });
      this.g.ui.toast(this.voice.pushToTalk ? 'Voice on. Hold V to talk.' : 'Voice on. Press V to mute or unmute.', 'good');
    } catch (e) {
      const msg = /Permission|NotAllowed/i.test(e.message || e.name) ? 'Microphone permission was blocked. Allow it in the browser address bar and try again.' : e.message;
      this.g.ui.toast(msg, 'warn', 6000);
    }
    this.renderBar(); this.renderTiles();
  }
  async leaveVoice() { await this.voice.leave(); this.g.net.send({ type: 'media', mic: false, cam: false }); $('rtc-tiles').innerHTML = ''; this.renderBar(); }
  async toggleMic() { if (!this.voice.joined) return this.joinVoice(); await this.voice.setMic(!this.voice.micOn); this.g.net.send({ type: 'media', mic: this.voice.micOn, cam: this.voice.camOn }); }
  async toggleCam() {
    if (!this.settings.video) return this.g.ui.toast('The host has not enabled video in this room.', 'info');
    if (!this.voice.joined) await this.joinVoice();
    if (!this.voice.joined) return;
    try {
      this.renderTiles(true);
      await this.voice.setCamera(!this.voice.camOn, $('tile-local-video'));
      this.g.net.send({ type: 'media', mic: this.voice.micOn, cam: this.voice.camOn });
    } catch (e) { this.g.ui.toast(/Permission|NotAllowed/i.test(e.message || e.name) ? 'Camera permission was blocked.' : e.message, 'warn'); }
    this.renderTiles();
  }
  _consent(then) {
    this.g.ui.modal(`<h2>Voice and video chat</h2>
      <p class="sub">Voice and video go live to other riders in this room. Only turn them on with people you know and trust.</p>
      <ul class="consent"><li>Your camera always starts off. Nothing is recorded by ${'PHERI'}.</li><li>You can mute anyone, report players and leave voice at any time.</li><li>Public quick matches never have voice or video.</li><li>If you are under 18, ask a parent or guardian before using voice or video.</li></ul>
      <div class="set-row"><span>Talk mode</span><div class="seg"><button data-m="open" class="on">Open mic</button><button data-m="ptt">Push to talk (V)</button></div></div>
      <div class="modal-actions"><button class="btn" data-m="ok">Turn on voice</button><button class="btn ghost" data-m="no">Not now</button></div>`, async (m, b) => {
      if (m === 'open' || m === 'ptt') { b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); this._pttChoice = m === 'ptt'; return; }
      if (m === 'ok') { try { localStorage.setItem(CONSENT_KEY, '1'); } catch { /* private mode */ } this.voice.pushToTalk = !!this._pttChoice; this.g.ui.closeModal(); then(); }
      if (m === 'no') this.g.ui.closeModal();
    });
  }

  _videoOn(uid) { this.renderTiles(); const r = this.voice.remote.get(uid); const el = document.querySelector(`[data-tile="${uid}"] .tv`); if (r?.video && el) r.video.play(el); }
  _videoOff() { this.renderTiles(); }

  renderTiles(forceLocal = false) {
    const el = $('rtc-tiles'); if (!el) return;
    if (!this.voice.joined || !this.room) { el.innerHTML = ''; return; }
    const tiles = [];
    const me = this.room.players.find((p) => p.id === this.match.me);
    if (this.voice.camOn || forceLocal) tiles.push(`<div class="tile me" data-tile="local"><div class="tv" id="tile-local-video"></div><span>${E(me?.name || 'You')}</span></div>`);
    for (const [uid, r] of this.voice.remote) {
      const p = this.playerByUid(uid); if (!p) continue;
      const muted = this.voice.localMuted.has(uid);
      const med = this.media.get(p.id) || {};
      tiles.push(`<div class="tile${r.video ? '' : ' novideo'}" data-tile="${uid}"><div class="tv">${r.video ? '' : `<b>${E(p.name.slice(0, 1).toUpperCase())}</b>`}</div><span>${E(p.name)}${med.mic === false ? ' · mic off' : ''}</span><button data-mute="${uid}" title="Mute for me">${muted ? 'Unmute' : 'Mute'}</button></div>`);
    }
    // Keep existing video elements playing: only rebuild if the tile set changed
    const sig = tiles.map((t) => t.slice(0, 60)).join('|');
    if (sig !== this._tileSig) {
      this._tileSig = sig; el.innerHTML = tiles.join('');
      if (this.voice.camOn && this.voice.cam) this.voice.cam.play($('tile-local-video'), { mirror: true });
      for (const [uid, r] of this.voice.remote) { const v = el.querySelector(`[data-tile="${uid}"] .tv`); if (r.video && v) r.video.play(v); }
    }
  }
  renderSpeaking() {
    for (const [uid, lvl] of this.voice.speaking) {
      const t = document.querySelector(`[data-tile="${uid === 'me' ? 'local' : uid}"]`);
      if (t) t.classList.toggle('speaking', lvl > 0.12);
      if (uid !== 'me') { const p = this.playerByUid(uid); const rr = p && this.match.remotes.get(p.id); if (rr) rr.tag.material.opacity = lvl > 0.12 ? 1 : 0.8, rr.speaking = lvl > 0.12; }
    }
    const meL = this.voice.speaking.get('me') || 0;
    $('mb-mic')?.classList.toggle('speaking', meL > 0.12 && this.voice.micOn);
  }
  renderBar() {
    const bar = $('media-bar'); if (!bar) return;
    const S = this.settings, v = this.voice;
    const show = !!this.room && (S.voice !== 'off' || S.video);
    bar.classList.toggle('hidden', !show);
    if (!show) { if (v.joined && this.room) this.leaveVoice(); return; }
    const rtcReady = this.room?.rtc !== false;
    const mode = { all: 'Room voice', team: 'Team voice', proximity: 'Proximity voice' }[S.voice] || 'Video only';
    bar.innerHTML = !v.joined
      ? `<span class="mb-label">${mode}</span><button class="mb-btn primary" data-a="join" ${rtcReady ? '' : 'disabled title="Voice is not configured on the server"'}>${v.joining ? 'Connecting…' : 'Join voice'}</button>`
      : `<span class="mb-label">${mode}${this.state && this.state !== 'CONNECTED' ? ' · ' + this.state.toLowerCase() : ''}</span>
         <button class="mb-btn${v.micOn ? ' on' : ''}" id="mb-mic" data-a="mic" title="Mic (V)">${v.micOn ? (v.pushToTalk ? (v.pttHeld ? 'Talking' : 'Hold V') : 'Mic on') : 'Mic off'}</button>
         ${S.video ? `<button class="mb-btn${v.camOn ? ' on' : ''}" data-a="cam" title="Camera (N)">${v.camOn ? 'Cam on' : 'Cam off'}</button>` : ''}
         <button class="mb-btn${v.deafened ? ' on warn' : ''}" data-a="deaf">${v.deafened ? 'Deafened' : 'Sound'}</button>
         <button class="mb-btn" data-a="ptt">${v.pushToTalk ? 'Push to talk' : 'Open mic'}</button>
         <button class="mb-btn" data-a="dev">Devices</button>
         <button class="mb-btn" data-a="leave">Leave</button>`;
  }
  async devices() {
    const d = await this.voice.devices();
    this.g.ui.modal(`<h2>Voice devices</h2>
      <div class="set-row"><span>Microphone</span><select id="dev-mic">${d.mics.map((m) => `<option value="${m.deviceId}">${E(m.label || 'Microphone')}</option>`).join('')}</select></div>
      <div class="set-row"><span>Camera</span><select id="dev-cam">${d.cams.map((m) => `<option value="${m.deviceId}">${E(m.label || 'Camera')}</option>`).join('') || '<option>No camera</option>'}</select></div>
      <div class="modal-actions"><button class="btn" data-m="ok">Done</button></div>`, async (m) => {
      if (m === 'ok') { await this.voice.useMic($('dev-mic').value).catch(() => {}); if (this.voice.cam) await this.voice.useCam($('dev-cam').value).catch(() => {}); this.g.ui.closeModal(); }
    });
  }

  // ------------------------------------------------------------------ per-frame
  update() {
    if (!this.room) { if (this.voice.joined) this.leaveVoice(); return; }
    const v = this.voice;
    // push-to-talk / mute key and camera key
    const inp = this.g.input;
    if (v.joined) {
      if (v.pushToTalk) v.ptt(inp.down.has('ptt'));
      else if (inp.wasPressed('ptt')) this.toggleMic();
      if (inp.wasPressed('cam')) this.toggleCam();
    } else if (inp.wasPressed('ptt') && (this.settings.voice !== 'off')) this.joinVoice();
    // proximity voice: nearby riders are louder
    if (v.joined && this.settings.voice === 'proximity') {
      const b = this.g.bike.pos;
      for (const uid of v.remote.keys()) {
        const p = this.playerByUid(uid); const r = p && this.match.remotes.get(p.id);
        const d = r ? Math.hypot(r.x - b.x, r.z - b.z) : 999;
        v.setGain(uid, Math.max(0, Math.min(1, 1 - (d - 12) / 90)));
      }
    } else if (v.joined && this._lastVoiceMode === 'proximity') for (const uid of v.remote.keys()) v.setGain(uid, 1);
    if (v.joined && this._lastVoiceMode !== this.settings.voice) { this._lastVoiceMode = this.settings.voice; v.refreshAudioPolicy(); }
    this._lastVoiceMode = this.settings.voice;
  }

  onRoom() { this.renderChat(); this.renderBar(); this.renderTiles(); if (this.voice.joined) this.voice.refreshAudioPolicy(); }
  onLeave() { this.msgs = []; this.unread = 0; this.media.clear(); this.leaveVoice(); this.renderChat(); this.renderBar(); }

  // ------------------------------------------------------------------ DOM
  _bindDom() {
    const input = $('chat-input');
    $('chat-form').addEventListener('submit', (e) => { e.preventDefault(); this.send(input.value); input.value = ''; input.blur(); });
    input.addEventListener('focus', () => { this.g.input.enabled = false; this.g.input.down.clear(); this.unread = 0; this.renderChat(); });
    input.addEventListener('blur', () => { this.g.input.enabled = true; });
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { input.value = ''; input.blur(); e.stopPropagation(); } });
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !this.room || !this.settings.textChat) return;
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
      if (!document.getElementById('modal').classList.contains('hidden')) return;
      e.preventDefault(); this.collapsed = false; input.focus();
    });
    $('chat').addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.q !== undefined) this.g.net.send({ type: 'chat', q: +b.dataset.q });
      if (b.id === 'chat-toggle') { this.collapsed = !this.collapsed; this.unread = 0; this.renderChat(); }
      if (b.id === 'chat-team') { this._teamOnly = !this._teamOnly; this.renderChat(); }
      if (b.dataset.from && b.dataset.from !== this.match.me) this._playerMenu(b.dataset.from, b);
    });
    $('media-bar').addEventListener('click', (e) => {
      const a = e.target.closest('button')?.dataset.a; if (!a) return;
      if (a === 'join') this.joinVoice();
      if (a === 'mic') this.toggleMic();
      if (a === 'cam') this.toggleCam();
      if (a === 'deaf') this.voice.setDeafened(!this.voice.deafened);
      if (a === 'ptt') this.voice.setPushToTalk(!this.voice.pushToTalk);
      if (a === 'dev') this.devices();
      if (a === 'leave') this.leaveVoice();
    });
    $('rtc-tiles').addEventListener('click', (e) => { const b = e.target.closest('button[data-mute]'); if (b) { this.voice.toggleLocalMute(+b.dataset.mute); this._tileSig = ''; this.renderTiles(); } });
  }
  _playerMenu(playerId, anchor) {
    document.querySelector('.pmenu')?.remove();
    const p = this.room.players.find((x) => x.id === playerId); if (!p) return;
    const key = 'chat:' + playerId;
    const menu = document.createElement('div'); menu.className = 'pmenu panel';
    const r = anchor.getBoundingClientRect(); menu.style.left = r.left + 'px'; menu.style.top = (r.top - 110) + 'px';
    menu.innerHTML = `<b>${E(p.name)}</b><button data-x="mutechat">${this.voice.localMuted.has(key) ? 'Show messages' : 'Hide messages'}</button>${p.rtcUid ? `<button data-x="mutevoice">${this.voice.localMuted.has(p.rtcUid) ? 'Unmute voice' : 'Mute voice'}</button>` : ''}${p.userId && this.g.cloud?.loggedIn ? '<button data-x="report">Report</button><button data-x="block">Block</button>' : ''}<button data-x="close">Close</button>`;
    document.body.appendChild(menu);
    menu.onclick = async (e) => {
      const x = e.target.closest('button')?.dataset.x; if (!x) return;
      if (x === 'mutechat') { if (this.voice.localMuted.has(key)) this.voice.localMuted.delete(key); else this.voice.localMuted.add(key); this.renderChat(); }
      if (x === 'mutevoice') this.voice.toggleLocalMute(p.rtcUid);
      if (x === 'report') { const why = prompt(`Report ${p.name}: what happened?`); if (why) { await this.g.cloud.report(p.userId, why, { room: this.room.code, chat: this.msgs.filter((m) => m.from === playerId).slice(-5) }); this.g.ui.toast('Report sent. Thank you.', 'good'); } }
      if (x === 'block') { await this.g.cloud.block(p.userId); (this.g.cloud.blocked ||= new Set()).add(playerId); this.voice.toggleLocalMute(p.rtcUid); this.renderChat(); this.g.ui.toast(`${p.name} blocked.`, 'info'); }
      menu.remove();
    };
  }
}
