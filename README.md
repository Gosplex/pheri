# PHERI · ફેરી

*Ride. Deliver. Race.*

A third-person Indian motorcycle delivery game set in a Rajkot-inspired city, with live online races. Solo play works fully offline; online play adds accounts, friends, live multiplayer matches, leaderboards, seasons, tournaments and more.

The game name lives in `src/config.js` (`GAME.name`, `GAME.nameGu`). Change it there. Check that the name is free to use before you publish.

## Architecture

| Service | Job | Folder |
|---|---|---|
| **Vercel** | Hosts the game website (Vite build) and the admin dashboard at `/admin` | `index.html`, `admin.html`, `src/` |
| **Render** | Always-on Node.js WebSocket game server: rooms, live positions, jobs, timer, scoring, anti-cheat | `server/` |
| **Supabase** | Accounts, cloud save, profiles, friends, presence, inbox, match history, leaderboards, seasons, tournaments, photos | `supabase/schema.sql` |

The flow: a player opens the game on Vercel and signs in with Supabase. Joining a match opens a WebSocket to Render, which checks the Supabase login. At full time Render writes the verified results to Supabase, and leaderboards update.

**Single-service option:** the Render server can also serve the game itself (`SERVE_STATIC=true`), so Render plus Supabase is enough. Vercel is optional.

## Run locally

```bash
npm install
npm run build              # builds dist/ (game + admin)
npm start                  # http://localhost:8080 serves the game AND multiplayer
```

For development with hot reload:

```bash
npm run dev:server         # terminal 1: game server on :8080 (no static files)
VITE_SERVER_URL=http://localhost:8080 npm run dev   # terminal 2: game on :5173
```

Other scripts:
- `npm run build:single`: `dist-single/index.html`, one offline file with solo play only.
- `npm run smoke`: headless world, traffic and physics test.
- `npm run export:pois`: regenerates `server/data/world.json` after you change the map.

Without Supabase keys, online play still works as guest-only: rooms, live races and results all work, but nothing is saved.

## Deploy

### 1. Supabase

**Automated:** fill in `.env` (see `.env.example` and the comments at the top of `supabase.js`), then run:

```bash
npm run supabase:setup                    # applies supabase/schema.sql + auth settings
npm run supabase:admin -- you@example.com # after signing in once in the game
npm run supabase:check                    # verifies tables, storage, login and security rules
npm run supabase:env                      # prints the variables for Render and Vercel
```

**Manual:**
1. Create a project, choosing the **Mumbai (ap-south-1)** region for India.
2. In **SQL Editor**, paste all of `supabase/schema.sql` and run it. This creates the tables, security rules, views, functions and the `photos` storage bucket.
3. Under **Authentication, Providers**, enable **Anonymous** (guest play), **Email**, **Google**, and optionally **Phone** (needs an SMS provider).
4. Under **Authentication, URL Configuration**, add your Vercel and Render URLs to the redirect list.
5. Copy the **Project URL**, the **anon public key** and the **service_role key** (server only).
6. To make yourself an admin, sign in to the game once, then run:
   `insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';`

### 2. Render (game server)
1. Push this folder to GitHub.
2. In Render, choose **New, Blueprint**, then select the repo. `render.yaml` sets everything up, in the Singapore region.
3. Fill in the environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `ALLOWED_ORIGINS`: your Vercel URL
4. The free plan sleeps after about 15 minutes idle; the game shows "Waking up the server…" while it starts. The **Starter** plan stays awake and is recommended for public matches.
5. Check `https://YOUR-SERVICE.onrender.com/health`.

### 3. Vercel (game website)
1. Import the repo. `vercel.json` already sets Vite, `npm run build` and the `dist` output.
2. Add these environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_SERVER_URL=https://YOUR-SERVICE.onrender.com`
3. Deploy. The admin dashboard is at `/admin`.

See `.env.example` for every variable. **Never put the service_role key in Vercel or in the client.**

## Features

### Solo game
- **Riding:** arcade physics, lean, gears, rain grip, speed breakers, potholes, punctures, wear and servicing, and five bikes including an electric one and a 350 cruiser.
- **City:** a compressed Rajkot-inspired map with Marwadi University, Madhapar Chowk, Sardar Bazaar and Juni Pol, weathered plaster facades with chajjas, and a day/night cycle with weather.
- **People:** Indian people in real attire with a jointed skeleton and animations. Traffic keeps left, obeys signals, and includes proper auto-rickshaws.
- **Jobs:** food, parcels, documents, passengers, multi-drop tiffin rounds and urgent rush jobs, with rating and tips.
- **Festivals:** Navratri garba, Uttarayan kites and Diwali diyas with fireworks.
- **City life:** power cuts, waterlogging, traffic police, gully cricket and temple bells.
- **Progression:** levels, perks, daily challenges, achievements and a best-shift leaderboard.
- **Extras:** Pheri FM radio, helmet cam, photo mode, lens rain, auto resolution and tilt steering.

### Vercel Analytics (2.3)
- Page views and visitors through **Vercel Web Analytics** (`@vercel/analytics`), with no cookies and no personal data.
- It switches on automatically in builds made on Vercel. For other hosts, build with `VITE_VERCEL_ANALYTICS=true`. It is never included in the offline single-file build.
- **Custom events:** `ride_start`, `job_complete`, `purchase`, `photo_taken`, `online_connect`, `match_start`, `match_finish`, `voice_join`. Vercel shows custom events on plans that include them (Pro and above); page views work on every plan.
- **To turn it on:** Vercel project, **Analytics** tab, **Enable**, then redeploy. Data appears after the first visits. Ad blockers can hide some visitors.

### Live chat, voice and video (2.2)
- **Chat panel** in every online room: press Enter to type, and the bike stops taking input while you type. Chat history is shown to riders who join late, there is a team-only channel in Team Rush (type `/t message` or use the All/Team button), quick-chat buttons and number keys 1–6, and a profanity filter.
- **Voice:** live voice through **Agora**, with four modes set by the host:
  - Off
  - Room (everyone)
  - Team (only your team)
  - Nearby (proximity voice: riders close to you in the city sound louder)
- **Talking controls:** open mic or push-to-talk (hold **V**), deafen, device picker, speaking indicators on tiles, the mic button and name tags.
- **Video:** camera tiles during matches, 240p to stay light while riding. Press **N** to turn your camera on or off.
- **Safety:**
  - Voice, video and free text chat are only possible in private rooms; public quick matches always use quick chat only.
  - A consent screen appears the first time, and the camera always starts off.
  - Per-player mute for voice and for chat, report (with the recent chat attached) and block.
- **Security:** the Agora App Certificate stays on the Render server, which issues short-lived tokens per room channel (`pheri-<ROOM>`). The Agora SDK (about 1.5 MB) downloads only when someone turns voice on, and the offline file never loads it.

**Agora setup:**
1. Create a project at console.agora.io with **Secured mode: APP ID + Token**.
2. Copy the **App ID** and **App Certificate**.
3. On Render, set `AGORA_APP_ID` and `AGORA_APP_CERTIFICATE`, then redeploy. `/stats` then shows `"rtc": true`.
4. Agora's free tier includes 10,000 minutes a month. Video minutes count more than audio, and usage beyond the free tier is billed by Agora.

### Interface (2.1)
- Redesigned menu with your level, wallet, rating, bike and sign-in status, plus arrow-key navigation.
- Loading tips, job progress steps (Pick up → Deliver), floating money gains and losses, fuel or battery %, a rush glow on the speedometer, toast icons.
- Online status chip with ping and room code, a first-ride controls strip, a close button and Esc on every dialog, phone header with your wallet.
- Interface size setting (S, M, L, XL), number keys 1–6 for quick chat in online matches, a pause button on touch screens.

### Online (2.0)
- **Accounts:** guest play, Google, email magic link, phone OTP, and upgrading a guest to a full account without losing progress.
- **Cloud save:** syncs across devices; the newest save wins and the older one is kept as a backup.
- **Profiles:** nickname, skill tier (Sparrow, Kestrel, Falcon, Thunder), wins, matches, deliveries, and shareable profile links (`?r=nickname`).
- **Friends:** requests, accept or decline, remove, block, report, online presence, and invites straight into your room.
- **Rooms:** private rooms with a 4-letter code, invite links (`?room=CODE`), WhatsApp or native share, and a public quick match that auto-starts.
- **Lobby:** a live side panel so you can keep riding. It shows ready checks, host settings (mode, 3/5/10/15 minutes, time, weather, festival, own bikes or all Sparrow 110, public or private, text chat), kick, host transfer, team pick and quick chat.
- **Modes:**
  - Delivery Rush
  - Top Earner
  - Five Star
  - Job Steal (a shared board)
  - Team Rush
  - Passenger Derby
  - Festival Special
- **Live play:**
  - Other riders shown with name tags and smoothed movement.
  - Server-issued jobs, with pickup and drop confirmed by the server.
  - "3, 2, 1, Chalo!" countdown with inputs frozen until go.
  - Live leaderboard, a feed of other players' deliveries, a final-30-seconds warning, horn emotes and soft rider bumps.
  - Reconnect within 30 seconds, and spectating for late joiners.
- **Fair play:** the server generates jobs from a shared seeded pool, checks speed and teleports, checks distance and minimum travel time for every delivery, and writes all results itself. Players cannot edit competitive stats (enforced by a database trigger). Rate limits apply, and suspicious matches are flagged.
- **Results:** podium, titles (Fastest, Safest, Near Miss King, Comfort King), team totals, rewards into your garage, rematch, and a shareable result card image.
- **Leaderboards:** weekly, all-time, monthly season points, daily challenge and by area, each for everyone or friends only.
- **Daily challenge:** a 5-minute solo run with the same seed for everyone, one scored attempt per day.
- **Tournaments:** register, play tournament rooms while they're live, and follow the standings.
- **Community goal:** a city-wide delivery target with a progress bar.
- **Inbox:** invites, friend requests and system messages in realtime, plus browser notifications when the tab is hidden.
- **Rajkot moments:** share photo mode shots to a public gallery with likes and reporting.
- **Admin dashboard (`/admin`):** live server stats, analytics, reports (ban or dismiss), photo moderation, tournament creation, community goals, live config (job pay multiplier, message of the day) and direct messages to players.

## Limits and costs (honest)
- **Render free:** sleeps when idle, with a 30–60 second wake-up. Starter costs about $7 a month. One Starter instance handles roughly 20–40 rooms of 8 players.
- **Supabase free:** 500 MB database, 1 GB storage, and the project pauses after a week of inactivity.
- **Anti-cheat:** it is solid for a friends-and-community game. It is not tournament-grade against determined cheaters, because the physics still run in the browser.
- **Location:** the geography is compressed and stylised. All businesses and brands in the game are fictional, and there is no affiliation with Marwadi University or any company.

## Code map
```
src/                 game client (Three.js); src/online/ = cloud.js, net.js, match.js, onlineUI.js, modes.js
src/admin.js         admin dashboard
server/              index.js (HTTP + WebSocket), room.js (referee), store.js (Supabase writes), data/world.json
supabase/schema.sql  database, security rules, views, functions, storage
tools/               smoke test, POI export, headless browser tests (mp_e2e.py)
render.yaml, vercel.json, .env.example
```
