/* =============================================================================
 * PHERI · Supabase setup
 * =============================================================================
 * PHERI uses Supabase (not Firebase) for accounts, cloud saves, friends, inbox,
 * leaderboards, tournaments, photos and the admin dashboard.
 *
 * This file is two things:
 *   A) The full manual setup guide (read the comments below, steps 1–10).
 *   B) A script that automates most of it:
 *
 *        node supabase.js setup          -> applies schema + auth settings
 *        node supabase.js admin <email>  -> makes that account an admin
 *        node supabase.js check          -> verifies everything works
 *        node supabase.js env            -> prints the env vars for Render/Vercel
 *
 * Put this file in the root of the pheri/ project (next to package.json)
 * and run it with Node 20+ (the project already includes @supabase/supabase-js).
 *
 * -----------------------------------------------------------------------------
 * STEP 1 · Create the project
 * -----------------------------------------------------------------------------
 *   1. Go to https://supabase.com -> Sign in -> New project.
 *   2. Name: pheri   ·   Region: South Asia (Mumbai) ap-south-1   ·   set a DB password.
 *   3. Wait ~2 minutes until the project is ready.
 *
 * -----------------------------------------------------------------------------
 * STEP 2 · Collect your keys
 * -----------------------------------------------------------------------------
 *   Project Settings -> API (Data API / API Keys):
 *     SUPABASE_URL              e.g. https://abcdxyz.supabase.co
 *     SUPABASE_ANON_KEY         "anon / public" key  (safe for the browser)
 *     SUPABASE_SERVICE_ROLE_KEY "service_role" key   (SECRET: Render server only)
 *   Project ref = the "abcdxyz" part of the URL.
 *
 *   For the automated script you also need a personal access token:
 *     https://supabase.com/dashboard/account/tokens -> Generate new token
 *     SUPABASE_ACCESS_TOKEN     (SECRET: only used on your computer by this script)
 *
 * -----------------------------------------------------------------------------
 * STEP 3 · Create a .env file (never commit it)
 * -----------------------------------------------------------------------------
 *   SUPABASE_URL=https://abcdxyz.supabase.co
 *   SUPABASE_ANON_KEY=eyJ...
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *   SUPABASE_ACCESS_TOKEN=sbp_...
 *   SITE_URL=https://your-game.vercel.app
 *   EXTRA_REDIRECTS=https://pheri-server.onrender.com,http://localhost:5173,http://localhost:8080
 *   # optional, for Google sign-in (see step 6)
 *   GOOGLE_CLIENT_ID=
 *   GOOGLE_CLIENT_SECRET=
 *
 *   Then run:  node --env-file=.env supabase.js setup
 *
 * -----------------------------------------------------------------------------
 * STEP 4 · Database schema  (automated by `setup`)
 * -----------------------------------------------------------------------------
 *   Manual way: Dashboard -> SQL Editor -> New query -> paste all of
 *   supabase/schema.sql -> Run. It creates:
 *     profiles, saves, friendships, blocks, reports, notifications, tournaments,
 *     tournament_entries, matches, match_players, daily_scores, community_goals,
 *     photos, photo_likes, admin_config, admins
 *     + security rules (RLS), leaderboard views, admin_stats(), bump_community_goal(),
 *     the public "photos" storage bucket, and realtime on notifications.
 *   It is safe to run again (uses "if not exists" / "drop policy if exists").
 *
 * -----------------------------------------------------------------------------
 * STEP 5 · Authentication settings  (automated by `setup`)
 * -----------------------------------------------------------------------------
 *   Manual way: Authentication -> Sign In / Providers:
 *     - Allow anonymous sign-ins: ON   (guest play)
 *     - Email: ON (magic link)
 *   Authentication -> URL Configuration:
 *     - Site URL: your Vercel URL
 *     - Redirect URLs: your Vercel URL, Render URL, http://localhost:5173, http://localhost:8080
 *
 * -----------------------------------------------------------------------------
 * STEP 6 · Google sign-in (optional)
 * -----------------------------------------------------------------------------
 *   1. https://console.cloud.google.com -> APIs & Services -> OAuth consent screen
 *      -> External -> fill app name "PHERI", support email -> Save.
 *   2. Credentials -> Create credentials -> OAuth client ID -> Web application.
 *   3. Authorized redirect URI:  https://<project-ref>.supabase.co/auth/v1/callback
 *   4. Copy Client ID + Secret into .env (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)
 *      and run `setup` again, or paste them in Authentication -> Providers -> Google.
 *
 * -----------------------------------------------------------------------------
 * STEP 7 · Phone OTP sign-in (optional)
 * -----------------------------------------------------------------------------
 *   Authentication -> Providers -> Phone -> ON, then choose an SMS provider
 *   (Twilio, MessageBird, Vonage or Textlocal) and paste its credentials.
 *   SMS costs money per message; skip this if you don't need it.
 *
 * -----------------------------------------------------------------------------
 * STEP 8 · Make yourself an admin  (automated by `admin <email>`)
 * -----------------------------------------------------------------------------
 *   1. Open the game, Play online -> Sign in (Google or email) once.
 *   2. Run:  node --env-file=.env supabase.js admin you@example.com
 *      Manual SQL:  insert into public.admins (user_id)
 *                   select id from auth.users where email = 'you@example.com';
 *   3. Open https://your-game.vercel.app/admin
 *
 * -----------------------------------------------------------------------------
 * STEP 9 · Connect Render and Vercel  (`env` prints these for you)
 * -----------------------------------------------------------------------------
 *   Render (game server) -> Environment:
 *     SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ALLOWED_ORIGINS, ADMIN_KEY,
 *     VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (only if Render also serves the game)
 *   Vercel (website) -> Settings -> Environment Variables:
 *     VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_SERVER_URL
 *   Redeploy both after adding variables.
 *
 * -----------------------------------------------------------------------------
 * STEP 10 · Verify  (`check`)
 * -----------------------------------------------------------------------------
 *   Checks tables, views, storage bucket, anonymous sign-in and the security rules
 *   (e.g. that a player cannot raise their own skill rating).
 *
 * Good to know
 *   - Free plan: 500 MB database, 1 GB storage; free projects pause after about a
 *     week without activity (Dashboard -> Restore to wake it).
 *   - Never ship SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ACCESS_TOKEN to the browser.
 *   - If the Management API calls fail (Supabase occasionally changes them), do
 *     steps 4 and 5 by hand in the dashboard; `check` still works.
 * ============================================================================= */

import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = process.env;
const URL_ = (env.SUPABASE_URL || '').replace(/\/$/, '');
const REF = (URL_.match(/https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1];
const API = 'https://api.supabase.com/v1';
const SCHEMA = env.SCHEMA_PATH || 'supabase/schema.sql';

const ok = (m) => console.log('  \u2714 ' + m);
const bad = (m) => console.log('  \u2718 ' + m);
const info = (m) => console.log('  \u2022 ' + m);
function need(...keys) {
  const missing = keys.filter((k) => !env[k]);
  if (missing.length) { console.error(`\nMissing in .env: ${missing.join(', ')}\nRun with:  node --env-file=.env supabase.js <command>\n`); process.exit(1); }
  if (!REF) { console.error('SUPABASE_URL should look like https://<ref>.supabase.co'); process.exit(1); }
}

// Supabase Management API helper (needs SUPABASE_ACCESS_TOKEN)
async function mgmt(method, path, body) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { return text; }
}
const sql = (query) => mgmt('POST', `/projects/${REF}/database/query`, { query });

// ---------------------------------------------------------------------------
async function setup() {
  need('SUPABASE_URL', 'SUPABASE_ACCESS_TOKEN');
  console.log(`\nSetting up Supabase project ${REF}\n`);

  // Step 4: schema
  console.log('Step 4 · Database schema');
  if (!existsSync(SCHEMA)) { bad(`Cannot find ${SCHEMA}. Run this from the pheri/ folder or set SCHEMA_PATH.`); process.exit(1); }
  try { await sql(readFileSync(SCHEMA, 'utf8')); ok('schema.sql applied (tables, security rules, views, functions, storage bucket)'); }
  catch (e) { bad('Could not apply schema automatically: ' + e.message); info('Paste supabase/schema.sql into Dashboard -> SQL Editor and run it.'); }

  // Step 5 + 6: auth settings
  console.log('\nStep 5 · Authentication');
  const site = env.SITE_URL || 'http://localhost:5173';
  const redirects = [site, ...(env.EXTRA_REDIRECTS || 'http://localhost:5173,http://localhost:8080').split(',')].map((s) => s.trim()).filter(Boolean);
  const auth = {
    site_url: site,
    uri_allow_list: [...new Set(redirects.flatMap((u) => [u, u.replace(/\/$/, '') + '/**']))].join(','),
    external_anonymous_users_enabled: true,
    external_email_enabled: true,
    mailer_otp_exp: 3600,
  };
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    Object.assign(auth, { external_google_enabled: true, external_google_client_id: env.GOOGLE_CLIENT_ID, external_google_secret: env.GOOGLE_CLIENT_SECRET });
  }
  try {
    await mgmt('PATCH', `/projects/${REF}/config/auth`, auth);
    ok(`Site URL: ${site}`);
    ok(`Redirect URLs: ${redirects.join(', ')}`);
    ok('Anonymous (guest) sign-in: ON · Email magic link: ON');
    if (auth.external_google_enabled) ok('Google sign-in: ON'); else info('Google sign-in skipped (add GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET, see step 6)');
  } catch (e) { bad('Could not update auth settings: ' + e.message); info('Set them by hand: Authentication -> Providers and URL Configuration (step 5).'); }
  info(`Google OAuth redirect URI to use in Google Cloud: ${URL_}/auth/v1/callback`);
  info('Phone OTP needs an SMS provider; set it up by hand if you want it (step 7).');

  console.log('\nNext: sign in once in the game, then run  node --env-file=.env supabase.js admin you@example.com');
  console.log('Then: node --env-file=.env supabase.js check\n');
}

// ---------------------------------------------------------------------------
async function admin(email) {
  need('SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY');
  if (!email) { console.error('Usage: node supabase.js admin you@example.com'); process.exit(1); }
  const db = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  let user = null;
  for (let page = 1; page <= 20 && !user; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) { bad(error.message); process.exit(1); }
    user = data.users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
    if (data.users.length < 200) break;
  }
  if (!user) { bad(`No account with ${email}. Sign in once in the game first (Play online -> Sign in).`); process.exit(1); }
  const { error } = await db.from('admins').upsert({ user_id: user.id });
  if (error) { bad(error.message); process.exit(1); }
  ok(`${email} is now an admin. Open /admin on your site.`);
}

// ---------------------------------------------------------------------------
async function check() {
  need('SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY');
  console.log(`\nChecking Supabase project ${REF}\n`);
  const svc = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const anon = createClient(URL_, env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  let failures = 0;
  const fail = (m) => { failures++; bad(m); };

  console.log('Tables');
  const tables = ['profiles', 'saves', 'friendships', 'blocks', 'reports', 'notifications', 'tournaments', 'tournament_entries', 'matches', 'match_players', 'daily_scores', 'community_goals', 'photos', 'photo_likes', 'admin_config', 'admins'];
  for (const t of tables) { const { error } = await svc.from(t).select('*', { head: true, count: 'exact' }).limit(1); error ? fail(`${t}: ${error.message}`) : ok(t); }

  console.log('\nLeaderboard views');
  for (const v of ['leaderboard_all', 'leaderboard_weekly', 'leaderboard_season', 'leaderboard_area', 'leaderboard_daily', 'tournament_standings']) {
    const { error } = await anon.from(v).select('*').limit(1); error ? fail(`${v}: ${error.message}`) : ok(v);
  }

  console.log('\nStorage');
  const { data: buckets, error: be } = await svc.storage.listBuckets();
  if (be) fail(be.message); else buckets.some((b) => b.id === 'photos' && b.public) ? ok('public "photos" bucket') : fail('photos bucket missing or not public');

  console.log('\nConfig & community goal');
  const { data: cfg } = await anon.from('admin_config').select('key');
  (cfg || []).length ? ok(`admin_config readable (${cfg.map((c) => c.key).join(', ')})`) : fail('admin_config empty or unreadable');
  const { data: goal } = await anon.from('community_goals').select('title').eq('active', true).limit(1);
  (goal || []).length ? ok(`community goal: ${goal[0].title}`) : info('no active community goal (create one in /admin)');

  console.log('\nAuth & security rules');
  const { data: s, error: ae } = await anon.auth.signInAnonymously();
  if (ae) fail('anonymous sign-in failed: ' + ae.message + ' (enable it in Authentication -> Providers)');
  else {
    ok('anonymous (guest) sign-in works');
    const uid = s.user.id;
    const nick = 'Check' + Math.floor(Math.random() * 9e4 + 1e4);
    const { error: pe } = await anon.from('profiles').insert({ id: uid, nickname: nick });
    pe ? fail('guest could not create a profile: ' + pe.message) : ok('guest can create own profile');
    await anon.from('profiles').update({ skill: 9999, wins: 999 }).eq('id', uid);
    const { data: p } = await svc.from('profiles').select('skill,wins').eq('id', uid).single();
    p && p.skill === 1000 && p.wins === 0 ? ok('players cannot edit their own skill or wins (trigger works)') : fail('profile protection trigger is not working');
    const { error: se } = await anon.from('saves').upsert({ user_id: uid, data: { test: true } });
    se ? fail('cloud save failed: ' + se.message) : ok('cloud save works');
    const { error: me } = await anon.from('matches').insert({ mode: 'rush' });
    me ? ok('players cannot write match results (server only)') : fail('players CAN write matches: check RLS');
    const { error: re } = await anon.rpc('admin_stats');
    re ? ok('admin_stats blocked for non-admins') : fail('admin_stats is open to everyone');
    // clean up the test user
    await svc.auth.admin.deleteUser(uid).catch(() => {});
    info('test guest account removed');
  }

  console.log(failures ? `\n${failures} problem(s) found. Fix them, then run check again.\n` : '\nAll good! Supabase is ready for PHERI.\n');
  process.exit(failures ? 1 : 0);
}

// ---------------------------------------------------------------------------
function printEnv() {
  need('SUPABASE_URL', 'SUPABASE_ANON_KEY');
  const site = env.SITE_URL || 'https://your-game.vercel.app';
  console.log(`
# ---- Vercel -> Project -> Settings -> Environment Variables ----
VITE_SUPABASE_URL=${URL_}
VITE_SUPABASE_ANON_KEY=${env.SUPABASE_ANON_KEY}
VITE_SERVER_URL=https://pheri-server.onrender.com   # your Render URL

# ---- Render -> pheri-server -> Environment ----
SUPABASE_URL=${URL_}
SUPABASE_SERVICE_ROLE_KEY=${env.SUPABASE_SERVICE_ROLE_KEY ? '(your service_role key; keep it secret)' : '(paste your service_role key)'}
ALLOWED_ORIGINS=${site}
ADMIN_KEY=${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}
VITE_SUPABASE_URL=${URL_}
VITE_SUPABASE_ANON_KEY=${env.SUPABASE_ANON_KEY}
SERVE_STATIC=true
`);
}

// ---------------------------------------------------------------------------
const [cmd, arg] = process.argv.slice(2);
const run = { setup, admin: () => admin(arg), check, env: printEnv }[cmd];
if (!run) {
  console.log(`
PHERI Supabase setup
  node --env-file=.env supabase.js setup          apply schema + auth settings
  node --env-file=.env supabase.js admin <email>  make an account admin
  node --env-file=.env supabase.js check          verify everything
  node --env-file=.env supabase.js env            print env vars for Render and Vercel
Read the comments at the top of this file for the full step-by-step guide.
`);
} else {
  Promise.resolve(run()).catch((e) => { console.error('\n' + e.message); process.exit(1); });
}
