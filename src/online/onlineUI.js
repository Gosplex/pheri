// All online screens. Uses the shared #modal card plus a live side panel for the lobby,
// so riders can keep riding around the city while friends join.
import { MODES_UI } from './modes.js';
import { QUICK_CHAT, escapeHtml as E } from './match.js';
import { seasonTier, istDay } from './cloud.js';
import { GAME } from '../config.js';

const $ = (id) => document.getElementById(id);
const rupee = (n) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
const ZONES = [['campus', 'Marwadi University'], ['market', 'Sardar Bazaar'], ['old', 'Juni Pol'], ['resi', 'Society area'], ['outer', 'Gauridad'], ['highway', 'Morbi Road'], ['park', 'Race Course']];

export class OnlineUI {
  constructor(game) { this.g = game; this.feed = []; this.lbKind = 'weekly'; this.lbMode = 'rush'; this.lbFriends = false; }
  get cloud() { return this.g.cloud; }
  get match() { return this.g.match; }
  modal(html, bind) { this.g.ui.modal(html, bind); }
  toast(m, k) { this.g.ui.toast(m, k); }

  // ------------------------------------------------------------------ home
  async home() {
    const c = this.cloud, p = c.profile;
    let goal = null; try { goal = c.enabled ? await c.communityGoal() : null; } catch { /* offline */ }
    const acct = !c.enabled ? `<p class="sub">Online accounts are not configured on this build. You can still play online as a guest.</p>`
      : c.loggedIn ? `<div class="acct"><div><b>${E(p?.nickname || 'Rider')}</b><small>${c.isGuest ? 'Guest account: link Google or email to keep progress on every device' : 'Signed in'} · ${seasonTier(p?.skill || 1000)} tier · skill ${p?.skill || 1000}</small></div><button class="btn ghost" data-m="account">Account</button></div>`
      : `<div class="acct"><div><b>Not signed in</b><small>Sign in to save progress, add friends and climb leaderboards.</small></div><button class="btn" data-m="login">Sign in</button></div>`;
    this.modal(`<h2>Play online</h2><p class="sub">Race friends in the same city, live. Most deliveries wins.</p>${acct}
      ${goal ? `<div class="goal"><b>Community goal</b><span>${E(goal.title)}</span><div class="xp"><i style="width:${Math.min(100, (goal.progress / goal.target) * 100).toFixed(1)}%"></i></div><small>${goal.progress.toLocaleString('en-IN')} / ${goal.target.toLocaleString('en-IN')} · Reward: ${E(goal.reward || '')}</small></div>` : ''}
      <div class="grid-btns">
        <button class="btn" data-m="quick">Quick match</button>
        <button class="btn" data-m="create">Create room</button>
        <div class="join-row"><input id="join-code" maxlength="4" placeholder="Room code" autocomplete="off"><button class="btn ghost" data-m="join">Join</button></div>
      </div>
      <div class="grid-btns small">
        <button class="btn ghost" data-m="daily">Daily challenge</button><button class="btn ghost" data-m="friends">Friends</button>
        <button class="btn ghost" data-m="leaderboards">Leaderboards</button><button class="btn ghost" data-m="history">Match history</button>
        <button class="btn ghost" data-m="tournaments">Tournaments</button><button class="btn ghost" data-m="inbox">Inbox${c.inbox.filter((n) => !n.read).length ? ' •' : ''}</button>
        <button class="btn ghost" data-m="gallery">Rajkot moments</button><button class="btn ghost" data-m="back">Back</button>
      </div>`, (m) => this._homeAction(m));
    const q = new URLSearchParams(location.search).get('room'); if (q) $('join-code').value = q.toUpperCase();
  }
  async _homeAction(m) {
    const need = () => { if (!this.cloud.loggedIn) { this.login(); return true; } return false; };
    try {
      if (m === 'back') return this.g.ui.closeModal();
      if (m === 'login') return this.login();
      if (m === 'account') return this.account();
      if (m === 'quick') { await this.g.goOnline(); this.g.net.send({ type: 'quick' }); this.g.ui.closeModal(); this.openLobby(); }
      if (m === 'create') { await this.g.goOnline(); this.g.net.send({ type: 'create', settings: { mode: 'rush', minutes: 5 } }); this.g.ui.closeModal(); this.openLobby(); }
      if (m === 'join') { const code = $('join-code').value.trim().toUpperCase(); if (code.length !== 4) return this.toast('Enter the 4-letter room code.', 'warn'); await this.g.goOnline(); this.g.net.send({ type: 'join', code }); this.g.ui.closeModal(); this.openLobby(); }
      if (m === 'daily') return this.daily();
      if (m === 'friends') { if (need()) return; return this.friends(); }
      if (m === 'leaderboards') return this.leaderboards();
      if (m === 'history') { if (need()) return; return this.history(); }
      if (m === 'tournaments') return this.tournaments();
      if (m === 'inbox') { if (need()) return; return this.inbox(); }
      if (m === 'gallery') return this.gallery();
    } catch (e) { this.toast(e.message, 'warn'); }
  }

  // ------------------------------------------------------------------ auth
  login() {
    if (!this.cloud.enabled) return this.toast('Online accounts are not configured. Add Supabase keys to enable them.', 'warn');
    this.modal(`<h2>Sign in</h2><p class="sub">Keep your garage, level and wins on every device.</p>
      <div class="grid-btns"><button class="btn" data-m="google">Continue with Google</button><button class="btn ghost" data-m="guest">Play as guest</button></div>
      <div class="set-row"><span>Email link</span><div class="join-row"><input id="li-email" type="email" placeholder="you@example.com"><button class="btn ghost" data-m="email">Send link</button></div></div>
      <div class="set-row"><span>Phone OTP</span><div class="join-row"><input id="li-phone" placeholder="+91 98xxxxxx"><button class="btn ghost" data-m="phone">Send OTP</button></div></div>
      <div class="set-row"><span>OTP code</span><div class="join-row"><input id="li-otp" placeholder="123456" maxlength="6"><button class="btn ghost" data-m="verify">Verify</button></div></div>
      <div class="modal-actions"><button class="btn ghost" data-m="back">Back</button></div>`, async (m) => {
      const c = this.cloud;
      try {
        if (m === 'google') await c.google();
        if (m === 'guest') { await c.guest(); this.toast('Signed in as a guest.', 'good'); setTimeout(() => this.home(), 600); }
        if (m === 'email') { await c.email($('li-email').value.trim()); this.toast('Check your email for the sign-in link.', 'good'); }
        if (m === 'phone') { await c.phone($('li-phone').value.replace(/\s/g, '')); this.toast('OTP sent by SMS.', 'good'); }
        if (m === 'verify') { await c.verifyPhone($('li-phone').value.replace(/\s/g, ''), $('li-otp').value.trim()); this.toast('Signed in.', 'good'); setTimeout(() => this.home(), 600); }
        if (m === 'back') this.home();
      } catch (e) { this.toast(e.message, 'warn'); }
    });
  }
  account() {
    const c = this.cloud, p = c.profile || {};
    const link = `${location.origin}${location.pathname}?r=${encodeURIComponent(p.nickname || '')}`;
    this.modal(`<h2>Your rider profile</h2>
      <div class="stat-row"><div><b>${p.wins || 0}</b><span>wins</span></div><div><b>${p.matches || 0}</b><span>matches</span></div><div><b>${p.total_deliveries || 0}</b><span>online deliveries</span></div><div><b>${seasonTier(p.skill || 1000)}</b><span>skill ${p.skill || 1000}</span></div></div>
      <div class="set-row"><span>Nickname</span><div class="join-row"><input id="nick" value="${E(p.nickname || '')}" maxlength="16"><button class="btn ghost" data-m="nick">Save</button></div></div>
      ${c.isGuest ? `<div class="set-row"><span>Keep your progress<small>Link this guest account</small></span><div class="join-row"><button class="btn ghost" data-m="linkg">Link Google</button></div></div>
      <div class="set-row"><span>Or link email</span><div class="join-row"><input id="lk-email" type="email" placeholder="you@example.com"><button class="btn ghost" data-m="linke">Link</button></div></div>` : ''}
      <div class="set-row"><span>Profile link</span><button class="btn ghost" data-m="copy">Copy link</button></div>
      <div class="set-row"><span>Browser notifications<small>Get told when a friend invites you</small></span><button class="btn ghost" data-m="notif">Allow</button></div>
      <div class="set-row"><span>Cloud save</span><div class="join-row"><button class="btn ghost" data-m="push">Save now</button><button class="btn ghost" data-m="pull">Load cloud save</button></div></div>
      <div class="modal-actions"><button class="btn" data-m="back">Done</button><button class="btn ghost" data-m="logout">Sign out</button></div>`, async (m) => {
      try {
        if (m === 'nick') { await c.setNickname($('nick').value); this.toast('Nickname saved.', 'good'); }
        if (m === 'linkg') await c.linkGoogle();
        if (m === 'linke') { await c.linkEmail($('lk-email').value.trim()); this.toast('Confirm the email we sent to finish linking.', 'good'); }
        if (m === 'copy') { await navigator.clipboard.writeText(link); this.toast('Profile link copied.', 'good'); }
        if (m === 'notif' && 'Notification' in window) { const r = await Notification.requestPermission(); this.toast(r === 'granted' ? 'Notifications on.' : 'Notifications blocked in the browser.', 'info'); }
        if (m === 'push') { await c.pushSave(this.g.profile); this.toast('Saved to the cloud.', 'good'); }
        if (m === 'pull') { const r = await c.pullSave({ savedAt: 0 }); if (r) { this.g.adoptProfile(r); this.toast('Cloud save loaded.', 'good'); } else this.toast('No cloud save yet.', 'info'); }
        if (m === 'logout') { await c.logout(); this.toast('Signed out.', 'info'); this.home(); }
        if (m === 'back') this.home();
      } catch (e) { this.toast(e.message, 'warn'); }
    });
  }
  async publicProfile(nick) {
    if (!this.cloud.enabled) return;
    const p = await this.cloud.getProfile(nick); if (!p) return;
    this.modal(`<div class="gu">${GAME.nameGu}</div><h2>${E(p.nickname)}</h2><p class="sub">${seasonTier(p.skill)} tier rider · level ${p.level}</p>
      <div class="stat-row"><div><b>${p.wins}</b><span>wins</span></div><div><b>${p.matches}</b><span>matches</span></div><div><b>${p.total_deliveries}</b><span>deliveries</span></div><div><b>${p.skill}</b><span>skill</span></div></div>
      <div class="modal-actions"><button class="btn" data-m="add">Add friend</button><button class="btn ghost" data-m="close">Close</button></div>`,
    async (m) => { if (m === 'add') { if (!this.cloud.loggedIn) return this.login(); try { await this.cloud.addFriend(p.nickname); this.toast('Friend request sent.', 'good'); } catch (e) { this.toast(e.message, 'warn'); } } else this.g.ui.closeModal(); });
  }

  // ------------------------------------------------------------------ lobby (live side panel)
  openLobby() { $('lobby').classList.remove('hidden'); this.renderLobby(); }
  closeLobby() { $('lobby').classList.add('hidden'); }
  lobbyFeed(t) { this.feed.push(t); if (this.feed.length > 6) this.feed.shift(); const el = $('lobby-feed'); if (el) el.innerHTML = this.feed.map((x) => `<div>${E(x)}</div>`).join(''); }
  renderLobby() {
    const M = this.match, r = M?.room, el = $('lobby-body');
    if (!r) { el.innerHTML = '<p class="empty">Connecting to the game server…</p>'; return; }
    if (r.state === 'playing' || r.state === 'countdown') { this.closeLobby(); return; }
    if (r.state === 'results') return;
    $('lobby').classList.remove('hidden');
    const host = M.isHost, S = r.settings;
    const seg = (key, opts) => `<div class="seg">${opts.map(([v, l]) => `<button data-set="${key}" data-v="${v}" class="${String(S[key]) === String(v) ? 'on' : ''}" ${host ? '' : 'disabled'}>${l}</button>`).join('')}</div>`;
    const me = r.players.find((p) => p.id === M.me);
    const auto = r.autoStartAt ? Math.max(0, Math.ceil((r.autoStartAt - M.net.now()) / 1000)) : 0;
    el.innerHTML = `
      <div class="lobby-code"><span>Room</span><b>${r.code}</b><button class="btn ghost" data-l="share">Invite</button></div>
      <p class="sub">${S.public ? 'Public quick match' : 'Private room'} · ${MODES_UI[S.mode].name} · ${S.minutes} min${auto ? ` · starts in ${auto}s` : ''}</p>
      <div class="lobby-players">${r.players.map((p) => `<div class="lp${p.id === M.me ? ' me' : ''}"><i style="background:#${(p.look?.helmet ?? 0xb8322a).toString(16).padStart(6, '0')}"></i><span>${E(p.name)}${p.id === r.hostId ? ' (host)' : ''}${p.spectator ? ' · watching' : ''}${!p.connected ? ' · reconnecting' : ''}${S.mode === 'team' ? ' · Team ' + p.team : ''}</span><em>${p.ready ? 'Ready' : ''}</em>${host && p.id !== M.me ? `<button data-l="kick" data-id="${p.id}">✕</button><button data-l="host" data-id="${p.id}">♛</button>` : ''}</div>`).join('')}</div>
      ${host ? `<div class="lobby-set">
        <label>Mode</label>${seg('mode', Object.entries(MODES_UI).map(([k, v]) => [k, v.short]))}
        <label>Length</label>${seg('minutes', [[3, '3 min'], [5, '5'], [10, '10'], [15, '15']])}
        <label>Time</label>${seg('time', [[8, 'Morning'], [13, 'Noon'], [18, 'Evening'], [21, 'Night']])}
        <label>Weather</label>${seg('weather', [['clear', 'Clear'], ['cloudy', 'Cloudy'], ['rain', 'Rain']])}
        <label>Festival</label>${seg('festival', [['none', 'None'], ['navratri', 'Navratri'], ['uttarayan', 'Kites'], ['diwali', 'Diwali']])}
        <label>Bikes</label>${seg('bikeRule', [['own', 'Own bikes'], ['sparrow', 'All Sparrow 110']])}
        <label>Room</label>${seg('public', [[false, 'Private'], [true, 'Public']])}
        ${!S.public ? `<label>Text chat</label>${seg('textChat', [[false, 'Quick chat only'], [true, 'Allow text']])}
        <label>Voice</label>${seg('voice', [['off', 'Off'], ['all', 'Room'], ['team', 'Team'], ['proximity', 'Nearby']])}
        <label>Video</label>${seg('video', [[false, 'Off'], [true, 'Camera tiles']])}` : '<label>Voice</label><span class="sub small">Off in public rooms (strangers)</span>'}
      </div>` : `<p class="sub">${MODES_UI[S.mode].desc}</p>`}
      ${S.mode === 'team' ? `<div class="join-row"><button class="btn ghost" data-l="teamA">Join Team A</button><button class="btn ghost" data-l="teamB">Join Team B</button></div>` : ''}
      ${S.voice !== 'off' || S.video ? `<p class="sub small">${S.voice !== 'off' ? `${{ all: 'Room', team: 'Team', proximity: 'Nearby' }[S.voice]} voice is on` : 'Voice off'}${S.video ? ' · camera tiles allowed' : ''}. Use the bar at the bottom or press V to join.</p>` : ''}
      <div id="lobby-feed" class="lobby-feed"></div>
      <div class="modal-actions">${host ? '<button class="btn" data-l="start">Start match</button>' : ''}<button class="btn ${host ? 'ghost' : ''}" data-l="ready">${me?.ready ? 'Not ready' : 'Ready'}</button><button class="btn ghost" data-l="leave">Leave</button></div>
      <p class="sub small">Ride around while you wait. Everyone starts together at the Marwadi University parking.</p>`;
    this.lobbyFeed('');
    el.onclick = async (e) => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      const net = this.g.net;
      if (b.dataset.set) { let v = b.dataset.v; v = v === 'true' ? true : v === 'false' ? false : isNaN(+v) ? v : +v; net.send({ type: 'settings', settings: { [b.dataset.set]: v } }); }
      const l = b.dataset.l;
      if (l === 'start') net.send({ type: 'start' });
      if (l === 'ready') net.send({ type: 'ready', on: !me?.ready });
      if (l === 'leave') { this.match.leave(); this.closeLobby(); }
      if (l === 'kick') net.send({ type: 'kick', id: b.dataset.id });
      if (l === 'host') net.send({ type: 'host', id: b.dataset.id });
      if (l === 'teamA' || l === 'teamB') net.send({ type: 'team', team: l.slice(-1) });
      if (l === 'q') net.send({ type: 'chat', q: +b.dataset.i });
      if (l === 'say') { net.send({ type: 'chat', text: $('lobby-text').value }); $('lobby-text').value = ''; }
      if (l === 'share') this.share(r.code);
    };
  }
  async share(code) {
    const url = `${location.origin}${location.pathname}?room=${code}`;
    const text = `Race me on ${GAME.name}! Room ${code}: ${url}`;
    if (this.cloud.loggedIn && this.cloud.friends.some((f) => f.status === 'accepted')) return this.inviteFriends(code);
    if (navigator.share) { try { await navigator.share({ title: GAME.name, text, url }); return; } catch { /* cancelled */ } }
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
  }
  inviteFriends(code) {
    const c = this.cloud;
    const fr = c.friends.filter((f) => f.status === 'accepted');
    const box = document.createElement('div'); box.className = 'invite-pop panel';
    box.innerHTML = `<b>Invite friends to ${code}</b>${fr.map((f) => `<button data-u="${f.user.id}">${E(f.user.nickname)}${c.online.has(f.user.id) ? ' · online' : ''}</button>`).join('')}<button data-w="1">Share on WhatsApp</button><button data-x="1">Close</button>`;
    document.body.appendChild(box);
    box.onclick = async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.u) { await c.notify(b.dataset.u, 'invite', { code, nickname: c.profile.nickname }); b.textContent += ' ✓'; }
      if (b.dataset.w) window.open('https://wa.me/?text=' + encodeURIComponent(`Race me on ${GAME.name}! Room ${code}: ${location.origin}${location.pathname}?room=${code}`), '_blank');
      if (b.dataset.x) box.remove();
    };
  }

  // ------------------------------------------------------------------ results
  showResults(m) {
    const me = this.match.me;
    const podium = m.rows.slice(0, 3).map((r) => `<div class="pod p${r.rank}"><b>${r.rank}</b><span>${E(r.name)}</span><em>${m.mode === 'earner' || m.mode === 'festival' ? rupee(r.earned) : m.mode === 'fivestar' ? '★ ' + r.rating : r.deliveries + ' jobs'}</em></div>`).join('');
    const titles = m.titles.map((t) => `<span class="title-chip">${t.title}: ${E(m.rows.find((r) => r.id === t.id)?.name || '')}</span>`).join('');
    const table = m.rows.map((r) => `<tr class="${r.id === me ? 'me' : ''}"><td>${r.rank}</td><td>${E(r.name)}</td><td>${r.deliveries}</td><td>${rupee(r.earned)}</td><td>${r.rating || '–'}</td><td>${r.crashes}</td></tr>`).join('');
    const mine = m.rows.find((r) => r.id === me);
    this.modal(`<div class="gu">${mine?.rank === 1 ? 'શાબાશ! You won' : 'Match over'}</div><h2>${m.modeName} results</h2>
      ${m.teamTotals ? `<p class="sub">Team A ${m.teamTotals.A} · Team B ${m.teamTotals.B} · ${m.teamTotals.winner ? 'Team ' + m.teamTotals.winner + ' wins' : 'Draw'}</p>` : ''}
      <div class="podium">${podium}</div><div class="titles">${titles}</div>
      <div class="tbl-wrap"><table class="tbl"><tr><th>#</th><th>Rider</th><th>Jobs</th><th>Earned</th><th>Rating</th><th>Crashes</th></tr>${table}</table></div>
      ${m.coins ? `<p class="sub">+${rupee(m.coins)} added to your garage wallet.</p>` : ''}
      <div class="modal-actions"><button class="btn" data-m="rematch">Rematch</button><button class="btn ghost" data-m="card">Share result card</button><button class="btn ghost" data-m="leave">Leave room</button></div>`,
    async (a) => {
      if (a === 'rematch') { this.g.net.send({ type: 'rematch' }); this.g.ui.closeModal(); this.openLobby(); }
      if (a === 'leave') { this.match.leave(); this.g.ui.closeModal(); }
      if (a === 'card') this.resultCard(m);
    });
  }
  async resultCard(m) {
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1080; const g = c.getContext('2d');
    g.fillStyle = '#121a3b'; g.fillRect(0, 0, 1080, 1080);
    for (let i = 0; i < 1080; i += 36) { g.fillStyle = i / 36 % 2 ? '#b8322a' : '#1e2a5a'; g.fillRect(0, i, 28, 36); }
    g.fillStyle = '#f4b400'; g.font = '800 120px "Baloo Bhai 2", sans-serif'; g.fillText(GAME.nameGu, 80, 190);
    g.fillStyle = '#f3ede2'; g.font = '700 54px Rajdhani, sans-serif'; g.fillText(`${GAME.name} · ${m.modeName} · ${m.minutes} min`, 80, 270);
    m.rows.slice(0, 6).forEach((r, i) => {
      const y = 380 + i * 105;
      g.fillStyle = i === 0 ? '#f4b400' : 'rgba(243,237,226,0.1)'; g.fillRect(80, y - 60, 920, 88);
      g.fillStyle = i === 0 ? '#14161f' : '#f3ede2'; g.font = '700 52px Rajdhani, sans-serif';
      g.fillText(`${r.rank}. ${r.name}`, 110, y); g.textAlign = 'right'; g.fillText(`${r.deliveries} jobs · ₹${r.earned}`, 980, y); g.textAlign = 'left';
    });
    g.fillStyle = 'rgba(243,237,226,0.7)'; g.font = '600 34px Rajdhani, sans-serif'; g.fillText(`Race me: ${location.host}`, 80, 1030);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const file = new File([blob], 'pheri-result.png', { type: 'image/png' });
    if (this.cloud.loggedIn) { try { await this.cloud.uploadImage(blob, `${m.modeName} result`, 'card'); } catch { /* optional */ } }
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: GAME.name, text: `My ${GAME.name} result` }); return; } catch { /* cancelled */ } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'pheri-result.png'; a.click();
  }

  // ------------------------------------------------------------------ friends
  async friends() {
    const c = this.cloud; await c.loadFriends();
    const row = (f) => `<div class="item"><span class="txt">${E(f.user?.nickname || '?')}<small>${f.status === 'pending' ? (f.incoming ? 'wants to be friends' : 'request sent') : c.online.has(f.user.id) ? 'Online · ' + (c.online.get(f.user.id).status || '') : 'Offline'}</small></span>
      ${f.incoming ? `<button class="row-btn" data-m="acc" data-id="${f.id}">Accept</button><button class="row-btn secondary" data-m="dec" data-id="${f.id}">Decline</button>` : `<button class="row-btn secondary" data-m="rem" data-id="${f.id}">Remove</button><button class="row-btn secondary" data-m="rep" data-u="${f.user?.id}">Report</button><button class="row-btn secondary" data-m="blk" data-u="${f.user?.id}">Block</button>`}</div>`;
    this.modal(`<h2>Friends</h2><div class="join-row"><input id="fr-nick" placeholder="Rider nickname"><button class="btn" data-m="add">Add friend</button></div>
      <div class="list">${c.friends.map(row).join('') || '<p class="empty">No friends yet. Add riders you race with by their nickname.</p>'}</div>
      <div class="modal-actions"><button class="btn ghost" data-m="back">Back</button></div>`, async (m, b) => {
      try {
        if (m === 'add') { await c.addFriend($('fr-nick').value.trim()); this.toast('Friend request sent.', 'good'); return this.friends(); }
        if (m === 'acc' || m === 'dec') { await c.respondFriend(b.dataset.id, m === 'acc'); return this.friends(); }
        if (m === 'rem') { await c.removeFriend(b.dataset.id); return this.friends(); }
        if (m === 'rep') { const why = prompt('What happened? (short description)'); if (why) { await c.report(b.dataset.u, why); this.toast('Report sent. Thank you.', 'good'); } }
        if (m === 'blk') { await c.block(b.dataset.u); this.toast('Blocked.', 'info'); }
        if (m === 'back') this.home();
      } catch (e) { this.toast(e.message, 'warn'); }
    });
  }

  // ------------------------------------------------------------------ leaderboards
  async leaderboards() {
    const c = this.cloud;
    if (!c.enabled) return this.modal('<h2>Leaderboards</h2><p class="sub">Leaderboards need the Supabase backend configured.</p><div class="modal-actions"><button class="btn" data-m="back">Back</button></div>', () => this.home());
    let rows = [], err = '';
    try { rows = await c.leaderboard(this.lbKind, this.lbMode, this.lbFriends); } catch (e) { err = e.message; }
    const kinds = [['weekly', 'This week'], ['all', 'All time'], ['season', 'Season'], ['daily', 'Daily challenge'], ['area', 'By area']];
    const modes = this.lbKind === 'area' ? ZONES : Object.entries(MODES_UI).map(([k, v]) => [k, v.short]);
    const val = (r) => this.lbKind === 'season' ? `${r.points} pts · ${seasonTier(r.skill)}` : this.lbKind === 'area' || this.lbKind === 'daily' ? `${r.deliveries} jobs` : this.lbMode === 'earner' || this.lbMode === 'festival' ? rupee(r.earned) : `${r.deliveries} jobs · ${r.wins} wins`;
    this.modal(`<h2>Leaderboards</h2>
      <div class="seg wrap">${kinds.map(([k, l]) => `<button data-m="k" data-v="${k}" class="${this.lbKind === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${this.lbKind !== 'season' && this.lbKind !== 'daily' ? `<div class="seg wrap">${modes.map(([k, l]) => `<button data-m="md" data-v="${k}" class="${this.lbMode === k ? 'on' : ''}">${l}</button>`).join('')}</div>` : ''}
      <div class="seg"><button data-m="fr" data-v="0" class="${!this.lbFriends ? 'on' : ''}">Everyone</button><button data-m="fr" data-v="1" class="${this.lbFriends ? 'on' : ''}">Friends</button></div>
      <div class="tbl-wrap"><table class="tbl">${rows.map((r, i) => `<tr class="${r.user_id === c.user?.id ? 'me' : ''}"><td>${i + 1}</td><td>${E(r.nickname || '?')}</td><td>${val(r)}</td></tr>`).join('') || `<tr><td>${err ? E(err) : 'No scores yet. Play a match to get on the board.'}</td></tr>`}</table></div>
      <div class="modal-actions"><button class="btn ghost" data-m="back">Back</button></div>`, (m, b) => {
      if (m === 'k') { this.lbKind = b.dataset.v; if (this.lbKind === 'area') this.lbMode = 'campus'; else if (!MODES_UI[this.lbMode]) this.lbMode = 'rush'; return this.leaderboards(); }
      if (m === 'md') { this.lbMode = b.dataset.v; return this.leaderboards(); }
      if (m === 'fr') { this.lbFriends = b.dataset.v === '1'; return this.leaderboards(); }
      if (m === 'back') this.home();
    });
  }

  // ------------------------------------------------------------------ history
  async history() {
    const rows = await this.cloud.history();
    this.modal(`<h2>Match history</h2><div class="list">${rows.map((r) => `<button class="item btnlike" data-m="d" data-id="${r.match_id}"><span class="txt">#${r.rank} · ${MODES_UI[r.matches?.mode]?.name || r.matches?.mode} · ${r.matches?.minutes} min<small>${new Date(r.created_at).toLocaleString('en-IN')} · ${r.deliveries} jobs · ${rupee(r.earned)} · ${r.matches?.player_count} riders</small></span></button>`).join('') || '<p class="empty">No online matches yet.</p>'}</div>
      <div class="modal-actions"><button class="btn ghost" data-m="back">Back</button></div>`, async (m, b) => {
      if (m === 'back') return this.home();
      if (m === 'd') {
        const d = await this.cloud.matchDetail(b.dataset.id);
        this.modal(`<h2>Match details</h2><div class="tbl-wrap"><table class="tbl"><tr><th>#</th><th>Rider</th><th>Jobs</th><th>Earned</th><th>Rating</th><th>Areas</th></tr>${d.map((r) => `<tr><td>${r.rank}</td><td>${E(r.name)}</td><td>${r.deliveries}</td><td>${rupee(r.earned)}</td><td>${r.rating}</td><td>${Object.entries(r.zone_counts || {}).map(([z, n]) => `${z} ${n}`).join(', ')}</td></tr>`).join('')}</table></div><div class="modal-actions"><button class="btn ghost" data-m="back">Back</button></div>`, () => this.history());
      }
    });
  }

  // ------------------------------------------------------------------ tournaments
  async tournaments() {
    const c = this.cloud;
    if (!c.enabled) return this.modal('<h2>Tournaments</h2><p class="sub">Tournaments need the Supabase backend configured.</p><div class="modal-actions"><button class="btn" data-m="back">Back</button></div>', () => this.home());
    const [list, mine] = await Promise.all([c.tournaments(), c.myEntries()]);
    const now = Date.now();
    this.modal(`<h2>Tournaments</h2><p class="sub">Register, then play tournament rooms while it's live. Points: placing plus deliveries.</p>
      <div class="list">${list.map((t) => { const live = now >= +new Date(t.starts_at); const joined = mine.includes(t.id); return `<div class="item"><span class="txt">${E(t.name)}<small>${MODES_UI[t.mode]?.name || t.mode} · ${t.minutes} min · ${new Date(t.starts_at).toLocaleString('en-IN')} to ${new Date(t.ends_at).toLocaleString('en-IN')}${t.reward ? ' · ' + E(t.reward) : ''}</small></span>
        ${joined ? (live ? `<button class="row-btn" data-m="play" data-id="${t.id}" data-mode="${t.mode}" data-min="${t.minutes}">Play</button>` : '<button class="row-btn secondary" disabled>Registered</button>') : `<button class="row-btn" data-m="reg" data-id="${t.id}">Register</button>`}<button class="row-btn secondary" data-m="st" data-id="${t.id}">Standings</button></div>`; }).join('') || '<p class="empty">No tournaments scheduled. Check back at the weekend.</p>'}</div>
      <div class="modal-actions"><button class="btn ghost" data-m="back">Back</button></div>`, async (m, b) => {
      try {
        if (m === 'back') return this.home();
        if (m === 'reg') { if (!c.loggedIn) return this.login(); await c.joinTournament(b.dataset.id); this.toast('Registered!', 'good'); return this.tournaments(); }
        if (m === 'play') { await this.g.goOnline(); this.g.net.send({ type: 'create', settings: { mode: b.dataset.mode, minutes: +b.dataset.min, tournamentId: b.dataset.id } }); this.g.ui.closeModal(); this.openLobby(); }
        if (m === 'st') { const s = await c.standings(b.dataset.id); this.modal(`<h2>Standings</h2><div class="tbl-wrap"><table class="tbl">${s.map((r, i) => `<tr><td>${i + 1}</td><td>${E(r.nickname)}</td><td>${r.points} pts</td><td>${r.matches} matches</td></tr>`).join('') || '<tr><td>No results yet.</td></tr>'}</table></div><div class="modal-actions"><button class="btn ghost" data-m="back">Back</button></div>`, () => this.tournaments()); }
      } catch (e) { this.toast(e.message, 'warn'); }
    });
  }

  // ------------------------------------------------------------------ inbox
  async inbox() {
    const list = await this.cloud.loadInbox();
    const label = (n) => n.kind === 'invite' ? `${E(n.payload.nickname)} invited you to room ${E(n.payload.code)}` : n.kind === 'friend' ? `${E(n.payload.nickname)} sent a friend request` : E(n.payload.text || n.kind);
    this.modal(`<h2>Inbox</h2><div class="list">${list.map((n) => `<div class="item${n.read ? '' : ' unread'}"><span class="txt">${label(n)}<small>${new Date(n.created_at).toLocaleString('en-IN')}</small></span>${n.kind === 'invite' ? `<button class="row-btn" data-m="join" data-code="${E(n.payload.code)}" data-id="${n.id}">Join</button>` : ''}${n.kind === 'friend' ? `<button class="row-btn" data-m="friends" data-id="${n.id}">Open</button>` : ''}</div>`).join('') || '<p class="empty">No messages.</p>'}</div>
      <div class="modal-actions"><button class="btn ghost" data-m="back">Back</button></div>`, async (m, b) => {
      if (b?.dataset.id) this.cloud.markRead(b.dataset.id);
      if (m === 'join') { await this.g.goOnline(); this.g.net.send({ type: 'join', code: b.dataset.code }); this.g.ui.closeModal(); this.openLobby(); }
      if (m === 'friends') this.friends();
      if (m === 'back') this.home();
    });
  }

  // ------------------------------------------------------------------ gallery
  async gallery() {
    const c = this.cloud;
    if (!c.enabled) return this.modal('<h2>Rajkot moments</h2><p class="sub">The photo gallery needs the Supabase backend configured.</p><div class="modal-actions"><button class="btn" data-m="back">Back</button></div>', () => this.home());
    const list = await c.gallery();
    this.modal(`<h2>Rajkot moments</h2><p class="sub">Photos shared from photo mode (press O while riding).</p>
      <div class="gallery">${list.map((p) => `<figure><img src="${p.url}" loading="lazy" alt="${E(p.caption || 'Photo')}"><figcaption>${E(p.profiles?.nickname || '')}${p.caption ? ' · ' + E(p.caption) : ''}<button data-m="like" data-id="${p.id}">♥ ${p.likes}</button>${c.loggedIn && p.user_id !== c.user.id ? `<button data-m="rep" data-u="${p.user_id}" data-id="${p.id}">Report</button>` : ''}</figcaption></figure>`).join('') || '<p class="empty">No photos yet. Be the first!</p>'}</div>
      <div class="modal-actions"><button class="btn ghost" data-m="back">Back</button></div>`, async (m, b) => {
      try {
        if (m === 'like') { if (!c.loggedIn) return this.login(); await c.like(b.dataset.id); b.textContent = '♥ ✓'; }
        if (m === 'rep') { await c.report(b.dataset.u, 'Inappropriate photo', { photo: b.dataset.id }); this.toast('Reported.', 'good'); }
        if (m === 'back') this.home();
      } catch (e) { this.toast(e.message, 'warn'); }
    });
  }

  // ------------------------------------------------------------------ daily challenge (solo, same seed for everyone)
  async daily() {
    const c = this.cloud;
    const played = c.loggedIn ? await c.playedDaily().catch(() => false) : false;
    this.modal(`<h2>Daily challenge</h2><p class="sub">${istDay()} · 5 minutes · same start, weather and jobs for everyone today. One scored attempt per day.</p>
      ${played ? '<p class="sub">You have already played today. You can practise, but it will not be scored.</p>' : ''}
      ${!c.loggedIn ? '<p class="sub">Sign in to put your score on the daily leaderboard.</p>' : ''}
      <div class="modal-actions"><button class="btn" data-m="go">Start</button><button class="btn ghost" data-m="board">Today's leaderboard</button><button class="btn ghost" data-m="back">Back</button></div>`,
    (m) => { if (m === 'go') { this.g.ui.closeModal(); this.g.startDaily(!played && c.loggedIn); } if (m === 'board') { this.lbKind = 'daily'; this.leaderboards(); } if (m === 'back') this.home(); });
  }
}
