// PHERI admin dashboard: live server stats, analytics, reports, photo moderation,
// tournaments, community goals and live config. Access is limited to rows in public.admins.
import '@fontsource/rajdhani/600.css';
import '@fontsource/rajdhani/700.css';
import { createClient } from '@supabase/supabase-js';
import { ONLINE } from './config.js';
import { serverHttpUrl } from './online/net.js';

const css = `body{margin:0;background:#121a3b;color:#f3ede2;font:16px Rajdhani,system-ui,sans-serif}main{max-width:1100px;margin:0 auto;padding:24px}
h1{color:#f4b400;margin:0 0 4px}h2{margin:28px 0 8px;font-size:22px}section{background:rgba(243,237,226,.06);border:1px solid rgba(243,237,226,.14);border-radius:14px;padding:14px 16px;margin-top:14px}
table{width:100%;border-collapse:collapse}td,th{padding:6px 8px;border-bottom:1px solid rgba(243,237,226,.12);text-align:left;vertical-align:top}th{color:rgba(243,237,226,.6)}
button{font:700 15px Rajdhani,sans-serif;border:0;border-radius:9px;padding:7px 12px;background:#f4b400;color:#14161f;cursor:pointer;margin:2px}button.g{background:transparent;color:#f3ede2;box-shadow:inset 0 0 0 1px rgba(243,237,226,.25)}
input,select{font:600 15px Rajdhani,sans-serif;background:rgba(243,237,226,.08);border:1px solid rgba(243,237,226,.2);border-radius:8px;color:#f3ede2;padding:7px 10px;margin:2px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px}.card{background:rgba(243,237,226,.06);border-radius:12px;padding:12px}.card b{display:block;font-size:28px;color:#f4b400}
img.th{width:160px;border-radius:8px;display:block}.muted{color:rgba(243,237,226,.6)}`;
document.head.insertAdjacentHTML('beforeend', `<style>${css}</style>`);
const app = document.getElementById('app');
const E = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

if (!ONLINE.supabaseUrl) { app.innerHTML = '<h1>PHERI admin</h1><p>Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to use the dashboard.</p>'; throw new Error('not configured'); }
const sb = createClient(ONLINE.supabaseUrl, ONLINE.supabaseAnonKey, { auth: { persistSession: true, detectSessionInUrl: true } });

async function start() {
  const { data } = await sb.auth.getSession();
  const user = data.session?.user;
  if (!user) {
    app.innerHTML = `<h1>PHERI admin</h1><p>Sign in with your admin account.</p><button id="g">Google</button> <input id="em" placeholder="email"><button id="m">Email link</button>`;
    document.getElementById('g').onclick = () => sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.href } });
    document.getElementById('m').onclick = async () => { await sb.auth.signInWithOtp({ email: document.getElementById('em').value, options: { emailRedirectTo: location.href } }); alert('Check your email.'); };
    return;
  }
  const { data: adm } = await sb.from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
  if (!adm) { app.innerHTML = `<h1>PHERI admin</h1><p>${E(user.email || user.id)} is not an admin. Add the user to <code>public.admins</code> in Supabase.</p><button id="o">Sign out</button>`; document.getElementById('o').onclick = () => sb.auth.signOut().then(() => location.reload()); return; }
  render();
}

async function render() {
  app.innerHTML = `<h1>PHERI admin</h1><p class="muted">Server: ${E(serverHttpUrl())}</p>
  <h2>Live server</h2><section id="srv"><input id="ak" placeholder="ADMIN_KEY (optional, shows rooms)" value="${E(sessionStorage.getItem('ak') || '')}"><button id="refresh">Refresh</button><div id="srvout"></div></section>
  <h2>Analytics</h2><section id="ana"></section>
  <h2>Reports</h2><section id="rep"></section>
  <h2>Photos</h2><section id="pho"></section>
  <h2>Tournaments</h2><section id="tou"></section>
  <h2>Community goal</h2><section id="goal"></section>
  <h2>Live config</h2><section id="cfg"></section>
  <h2>Send a message</h2><section id="msg"><input id="mn" placeholder="rider nickname"><input id="mt" placeholder="message" style="width:50%"><button id="ms">Send</button></section>`;
  document.getElementById('refresh').onclick = serverStats; serverStats();
  analytics(); reports(); photos(); tournaments(); goal(); config();
  document.getElementById('ms').onclick = async () => {
    const { data: p } = await sb.from('profiles').select('id').ilike('nickname', document.getElementById('mn').value).maybeSingle();
    if (!p) return alert('No such rider');
    const { data: me } = await sb.auth.getUser();
    await sb.from('notifications').insert({ to_user: p.id, from_user: me.user.id, kind: 'system', payload: { text: document.getElementById('mt').value } });
    alert('Sent');
  };
}
async function serverStats() {
  const key = document.getElementById('ak').value; sessionStorage.setItem('ak', key);
  try {
    const r = await fetch(serverHttpUrl() + '/stats', { headers: key ? { 'x-admin-key': key } : {} }); const s = await r.json();
    document.getElementById('srvout').innerHTML = `<div class="grid"><div class="card"><b>${s.players}</b>connected</div><div class="card"><b>${s.rooms}</b>rooms</div><div class="card"><b>${s.inMatch}</b>in a match</div><div class="card"><b>${Math.round(s.uptime / 60)}m</b>uptime · v${E(s.version)}</div></div>
      ${s.list ? `<table><tr><th>Room</th><th>State</th><th>Mode</th><th>Players</th></tr>${s.list.map((r) => `<tr><td>${r.code}</td><td>${r.state}</td><td>${r.mode}${r.public ? ' (public)' : ''}</td><td>${E(r.players.join(', '))}</td></tr>`).join('')}</table>` : ''}`;
  } catch { document.getElementById('srvout').innerHTML = '<p>Server not reachable (it may be asleep).</p>'; }
}
async function analytics() {
  const { data, error } = await sb.rpc('admin_stats');
  const el = document.getElementById('ana');
  if (error) { el.textContent = error.message; return; }
  el.innerHTML = `<div class="grid">${Object.entries(data || {}).map(([k, v]) => `<div class="card"><b>${v ?? 0}</b>${E(k.replace(/_/g, ' '))}</div>`).join('')}</div>`;
}
async function reports() {
  const { data } = await sb.from('reports').select('*, target_p:target(nickname,banned), reporter_p:reporter(nickname)').eq('status', 'open').order('created_at', { ascending: false }).limit(50);
  const el = document.getElementById('rep');
  el.innerHTML = (data || []).length ? `<table><tr><th>When</th><th>Reported</th><th>By</th><th>Reason</th><th></th></tr>${data.map((r) => `<tr><td>${new Date(r.created_at).toLocaleString()}</td><td>${E(r.target_p?.nickname)}${r.target_p?.banned ? ' (banned)' : ''}</td><td>${E(r.reporter_p?.nickname)}</td><td>${E(r.reason)}</td><td><button data-ban="${r.target}" data-id="${r.id}">Ban</button><button class="g" data-dis="${r.id}">Dismiss</button></td></tr>`).join('')}</table>` : '<p class="muted">No open reports.</p>';
  el.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.ban) { await sb.from('profiles').update({ banned: true }).eq('id', b.dataset.ban); await sb.from('reports').update({ status: 'actioned' }).eq('id', b.dataset.id); }
    if (b.dataset.dis) await sb.from('reports').update({ status: 'dismissed' }).eq('id', b.dataset.dis);
    reports();
  };
}
async function photos() {
  const { data } = await sb.from('photos').select('id,path,caption,hidden,created_at,profiles(nickname)').order('created_at', { ascending: false }).limit(40);
  const el = document.getElementById('pho');
  el.innerHTML = `<div class="grid">${(data || []).map((p) => `<div class="card"><img class="th" src="${sb.storage.from('photos').getPublicUrl(p.path).data.publicUrl}"><span class="muted">${E(p.profiles?.nickname)} · ${E(p.caption)}</span><br><button data-h="${p.id}" data-v="${!p.hidden}">${p.hidden ? 'Unhide' : 'Hide'}</button></div>`).join('') || '<p class="muted">No photos.</p>'}</div>`;
  el.onclick = async (e) => { const b = e.target.closest('button'); if (!b) return; await sb.from('photos').update({ hidden: b.dataset.v === 'true' }).eq('id', b.dataset.h); photos(); };
}
async function tournaments() {
  const { data } = await sb.from('tournaments').select('*').order('starts_at', { ascending: false }).limit(20);
  const el = document.getElementById('tou');
  el.innerHTML = `<div><input id="tn" placeholder="Name, e.g. Weekend Rush Cup"><select id="tm"><option value="rush">Delivery Rush</option><option value="earner">Top Earner</option><option value="fivestar">Five Star</option><option value="team">Team Rush</option></select><select id="tl"><option>5</option><option>3</option><option>10</option></select>
    <input id="ts" type="datetime-local"><input id="te" type="datetime-local"><input id="tr" placeholder="Reward"><button id="tc">Create</button></div>
    <table><tr><th>Name</th><th>Mode</th><th>Starts</th><th>Ends</th><th></th></tr>${(data || []).map((t) => `<tr><td>${E(t.name)}</td><td>${t.mode} · ${t.minutes}m</td><td>${new Date(t.starts_at).toLocaleString()}</td><td>${new Date(t.ends_at).toLocaleString()}</td><td><button class="g" data-del="${t.id}">Delete</button></td></tr>`).join('')}</table>`;
  document.getElementById('tc').onclick = async () => {
    const v = (id) => document.getElementById(id).value;
    const { error } = await sb.from('tournaments').insert({ name: v('tn'), mode: v('tm'), minutes: +v('tl'), starts_at: new Date(v('ts')).toISOString(), ends_at: new Date(v('te')).toISOString(), reward: v('tr') });
    if (error) alert(error.message); tournaments();
  };
  el.onclick = async (e) => { const b = e.target.closest('button[data-del]'); if (b && confirm('Delete tournament?')) { await sb.from('tournaments').delete().eq('id', b.dataset.del); tournaments(); } };
}
async function goal() {
  const { data } = await sb.from('community_goals').select('*').order('id', { ascending: false }).limit(5);
  const el = document.getElementById('goal');
  el.innerHTML = `<table>${(data || []).map((g) => `<tr><td>${E(g.title)}</td><td>${g.progress}/${g.target}</td><td>${g.active ? 'active' : 'off'}</td><td><button class="g" data-t="${g.id}" data-a="${!g.active}">${g.active ? 'Stop' : 'Activate'}</button></td></tr>`).join('')}</table>
    <input id="gt" placeholder="Title"><input id="gn" type="number" placeholder="Target" value="10000"><input id="gr" placeholder="Reward"><button id="gc">New goal (7 days)</button>`;
  document.getElementById('gc').onclick = async () => { await sb.from('community_goals').update({ active: false }).eq('active', true); await sb.from('community_goals').insert({ title: document.getElementById('gt').value, target: +document.getElementById('gn').value, reward: document.getElementById('gr').value }); goal(); };
  el.onclick = async (e) => { const b = e.target.closest('button[data-t]'); if (b) { await sb.from('community_goals').update({ active: b.dataset.a === 'true' }).eq('id', b.dataset.t); goal(); } };
}
async function config() {
  const { data } = await sb.from('admin_config').select('*').order('key');
  const el = document.getElementById('cfg');
  el.innerHTML = `<p class="muted">job_pay_mult scales online job pay (server reloads every minute). motd is shown when players connect.</p><table>${(data || []).map((c) => `<tr><td>${E(c.key)}</td><td><input data-k="${E(c.key)}" value="${E(c.value)}" style="width:100%"></td><td><button data-save="${E(c.key)}">Save</button></td></tr>`).join('')}</table>`;
  el.onclick = async (e) => { const b = e.target.closest('button[data-save]'); if (!b) return; const v = el.querySelector(`input[data-k="${b.dataset.save}"]`).value; await sb.from('admin_config').upsert({ key: b.dataset.save, value: v, updated_at: new Date().toISOString() }); b.textContent = 'Saved'; };
}
start();
