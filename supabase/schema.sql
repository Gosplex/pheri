-- =====================================================================
-- PHERI online backend (Supabase / Postgres)
-- Run this whole file once in Supabase Dashboard -> SQL Editor -> New query.
-- Then: Authentication -> Providers: enable Anonymous, Email, Google, (optional) Phone.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- helpers ---------------------------------------------------
create table if not exists public.admins (user_id uuid primary key references auth.users on delete cascade, created_at timestamptz default now());
alter table public.admins enable row level security;
drop policy if exists "admins read own" on public.admins;
create policy "admins read own" on public.admins for select using (user_id = auth.uid());
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.admins where user_id = auth.uid()) $$;

-- ---------- profiles --------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  nickname text unique check (char_length(nickname) between 3 and 16 and nickname ~ '^[A-Za-z0-9_ .-]+$'),
  look jsonb default '{}'::jsonb,
  level int default 1,
  rating numeric default 3.8,
  skill int default 1000,
  wins int default 0,
  matches int default 0,
  total_deliveries int default 0,
  best_shift int default 0,
  favourite_bike text default 'sparrow',
  titles text[] default '{}',
  banned boolean default false,
  is_guest boolean default true,
  created_at timestamptz default now(),
  last_seen timestamptz default now()
);
alter table public.profiles enable row level security;
drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles for select using (true);
drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update using (auth.uid() = id or public.is_admin());
-- players may not change their own competitive numbers (only the server's service role can)
create or replace function public.protect_profile() returns trigger language plpgsql as $$
begin
  if auth.role() = 'authenticated' and not public.is_admin() then
    new.skill := old.skill; new.wins := old.wins; new.matches := old.matches; new.total_deliveries := old.total_deliveries; new.banned := old.banned;
  end if;
  return new;
end $$;
drop trigger if exists protect_profile on public.profiles;
create trigger protect_profile before update on public.profiles for each row execute function public.protect_profile();

-- ---------- cloud saves -----------------------------------------------
create table if not exists public.saves (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null,
  backup jsonb,
  device text,
  updated_at timestamptz default now()
);
alter table public.saves enable row level security;
drop policy if exists "saves own" on public.saves;
create policy "saves own" on public.saves for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- friends ---------------------------------------------------
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester uuid references public.profiles on delete cascade,
  addressee uuid references public.profiles on delete cascade,
  status text default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz default now(),
  unique (requester, addressee)
);
alter table public.friendships enable row level security;
drop policy if exists "friend read" on public.friendships;
create policy "friend read" on public.friendships for select using (auth.uid() in (requester, addressee));
drop policy if exists "friend request" on public.friendships;
create policy "friend request" on public.friendships for insert with check (auth.uid() = requester);
drop policy if exists "friend respond" on public.friendships;
create policy "friend respond" on public.friendships for update using (auth.uid() = addressee);
drop policy if exists "friend remove" on public.friendships;
create policy "friend remove" on public.friendships for delete using (auth.uid() in (requester, addressee));

create table if not exists public.blocks (
  blocker uuid references public.profiles on delete cascade,
  blocked uuid references public.profiles on delete cascade,
  created_at timestamptz default now(),
  primary key (blocker, blocked)
);
alter table public.blocks enable row level security;
drop policy if exists "blocks own" on public.blocks;
create policy "blocks own" on public.blocks for all using (auth.uid() = blocker) with check (auth.uid() = blocker);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid references public.profiles on delete set null,
  target uuid references public.profiles on delete cascade,
  reason text check (char_length(reason) <= 300),
  context jsonb,
  status text default 'open' check (status in ('open','dismissed','actioned')),
  created_at timestamptz default now()
);
alter table public.reports enable row level security;
drop policy if exists "report create" on public.reports;
create policy "report create" on public.reports for insert with check (auth.uid() = reporter);
drop policy if exists "report admin" on public.reports;
create policy "report admin" on public.reports for select using (public.is_admin());
drop policy if exists "report admin update" on public.reports;
create policy "report admin update" on public.reports for update using (public.is_admin());

-- ---------- notifications / inbox --------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  to_user uuid references public.profiles on delete cascade,
  from_user uuid references public.profiles on delete set null,
  kind text check (kind in ('invite','friend','season','reward','system','tournament')),
  payload jsonb default '{}'::jsonb,
  read boolean default false,
  created_at timestamptz default now()
);
alter table public.notifications enable row level security;
drop policy if exists "notif read own" on public.notifications;
create policy "notif read own" on public.notifications for select using (auth.uid() = to_user);
drop policy if exists "notif update own" on public.notifications;
create policy "notif update own" on public.notifications for update using (auth.uid() = to_user);
drop policy if exists "notif send" on public.notifications;
create policy "notif send" on public.notifications for insert with check (auth.uid() = from_user or public.is_admin());

-- ---------- matches (written by the game server with the service role) --
create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  mode text default 'rush',
  minutes int default 5,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reward text,
  created_by uuid references public.profiles,
  created_at timestamptz default now()
);
alter table public.tournaments enable row level security;
drop policy if exists "tourn read" on public.tournaments;
create policy "tourn read" on public.tournaments for select using (true);
drop policy if exists "tourn admin" on public.tournaments;
create policy "tourn admin" on public.tournaments for all using (public.is_admin()) with check (public.is_admin());

create table if not exists public.tournament_entries (
  tournament_id uuid references public.tournaments on delete cascade,
  user_id uuid references public.profiles on delete cascade,
  created_at timestamptz default now(),
  primary key (tournament_id, user_id)
);
alter table public.tournament_entries enable row level security;
drop policy if exists "entries read" on public.tournament_entries;
create policy "entries read" on public.tournament_entries for select using (true);
drop policy if exists "entries join" on public.tournament_entries;
create policy "entries join" on public.tournament_entries for insert with check (auth.uid() = user_id);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  room_code text,
  mode text,
  minutes int,
  settings jsonb,
  player_count int,
  team_totals jsonb,
  tournament_id uuid references public.tournaments on delete set null,
  flagged boolean default false,
  created_at timestamptz default now()
);
alter table public.matches enable row level security;
drop policy if exists "matches read" on public.matches;
create policy "matches read" on public.matches for select using (true);

create table if not exists public.match_players (
  id bigserial primary key,
  match_id uuid references public.matches on delete cascade,
  user_id uuid references public.profiles on delete set null,
  name text,
  rank int,
  team text,
  deliveries int,
  earned int,
  rating numeric,
  crashes int,
  near_misses int,
  comfort numeric,
  zone_counts jsonb,
  flags int default 0,
  points int default 0,
  created_at timestamptz default now()
);
create index if not exists match_players_user on public.match_players (user_id, created_at desc);
alter table public.match_players enable row level security;
drop policy if exists "mp read" on public.match_players;
create policy "mp read" on public.match_players for select using (true);

-- ---------- daily challenge (solo, one attempt per day) ------------------
create table if not exists public.daily_scores (
  user_id uuid references public.profiles on delete cascade,
  day date default (now() at time zone 'Asia/Kolkata')::date,
  deliveries int check (deliveries between 0 and 30),
  earned int check (earned between 0 and 6000),
  rating numeric,
  created_at timestamptz default now(),
  primary key (user_id, day)
);
alter table public.daily_scores enable row level security;
drop policy if exists "daily read" on public.daily_scores;
create policy "daily read" on public.daily_scores for select using (true);
drop policy if exists "daily submit" on public.daily_scores;
create policy "daily submit" on public.daily_scores for insert with check (auth.uid() = user_id and day = (now() at time zone 'Asia/Kolkata')::date);

-- ---------- community goal ----------------------------------------------
create table if not exists public.community_goals (
  id serial primary key,
  title text,
  target int,
  progress int default 0,
  reward text,
  starts_at timestamptz default now(),
  ends_at timestamptz default now() + interval '7 days',
  active boolean default true
);
alter table public.community_goals enable row level security;
drop policy if exists "goals read" on public.community_goals;
create policy "goals read" on public.community_goals for select using (true);
drop policy if exists "goals admin" on public.community_goals;
create policy "goals admin" on public.community_goals for all using (public.is_admin()) with check (public.is_admin());
create or replace function public.bump_community_goal(amount int) returns void language sql security definer set search_path = public as
$$ update public.community_goals set progress = least(target, progress + amount) where active and now() between starts_at and ends_at $$;
revoke execute on function public.bump_community_goal(int) from anon, authenticated;
insert into public.community_goals (title, target, reward)
  select 'Rajkot delivers 10,000 orders this week', 10000, 'Marigold community helmet for everyone'
  where not exists (select 1 from public.community_goals);

-- ---------- photos gallery -------------------------------------------------
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles on delete cascade,
  path text not null,
  caption text check (char_length(caption) <= 120),
  kind text default 'photo' check (kind in ('photo','card')),
  hidden boolean default false,
  created_at timestamptz default now()
);
alter table public.photos enable row level security;
drop policy if exists "photos read" on public.photos;
create policy "photos read" on public.photos for select using (not hidden or auth.uid() = user_id or public.is_admin());
drop policy if exists "photos insert" on public.photos;
create policy "photos insert" on public.photos for insert with check (auth.uid() = user_id);
drop policy if exists "photos delete" on public.photos;
create policy "photos delete" on public.photos for delete using (auth.uid() = user_id or public.is_admin());
drop policy if exists "photos admin" on public.photos;
create policy "photos admin" on public.photos for update using (public.is_admin());

create table if not exists public.photo_likes (
  photo_id uuid references public.photos on delete cascade,
  user_id uuid references public.profiles on delete cascade,
  primary key (photo_id, user_id)
);
alter table public.photo_likes enable row level security;
drop policy if exists "likes read" on public.photo_likes;
create policy "likes read" on public.photo_likes for select using (true);
drop policy if exists "likes own" on public.photo_likes;
create policy "likes own" on public.photo_likes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- admin config (edited from the admin dashboard) ------------------
create table if not exists public.admin_config (key text primary key, value text, updated_at timestamptz default now());
alter table public.admin_config enable row level security;
drop policy if exists "config read" on public.admin_config;
create policy "config read" on public.admin_config for select using (true);
drop policy if exists "config admin" on public.admin_config;
create policy "config admin" on public.admin_config for all using (public.is_admin()) with check (public.is_admin());
insert into public.admin_config (key, value) values ('job_pay_mult', '1'), ('motd', 'Welcome to PHERI online!'), ('daily_seed_override', '')
  on conflict (key) do nothing;

-- ---------- leaderboards ---------------------------------------------------
create or replace view public.leaderboard_all as
  select mp.user_id, p.nickname, m.mode, sum(mp.deliveries) deliveries, sum(mp.earned) earned, count(*) filter (where mp.rank = 1 and m.player_count > 1) wins, count(*) matches
  from public.match_players mp join public.matches m on m.id = mp.match_id join public.profiles p on p.id = mp.user_id
  where mp.user_id is not null and not m.flagged and not p.banned
  group by mp.user_id, p.nickname, m.mode;
create or replace view public.leaderboard_weekly as
  select mp.user_id, p.nickname, m.mode, sum(mp.deliveries) deliveries, sum(mp.earned) earned, count(*) filter (where mp.rank = 1 and m.player_count > 1) wins, count(*) matches
  from public.match_players mp join public.matches m on m.id = mp.match_id join public.profiles p on p.id = mp.user_id
  where mp.user_id is not null and not m.flagged and not p.banned and mp.created_at > date_trunc('week', now())
  group by mp.user_id, p.nickname, m.mode;
create or replace view public.leaderboard_season as
  select mp.user_id, p.nickname, to_char(mp.created_at, 'YYYY-MM') season, sum(mp.points) points, sum(mp.deliveries) deliveries, max(p.skill) skill
  from public.match_players mp join public.matches m on m.id = mp.match_id join public.profiles p on p.id = mp.user_id
  where mp.user_id is not null and not m.flagged and not p.banned
  group by mp.user_id, p.nickname, to_char(mp.created_at, 'YYYY-MM');
create or replace view public.leaderboard_area as
  select mp.user_id, p.nickname, z.key zone, sum(z.value::int) deliveries
  from public.match_players mp join public.profiles p on p.id = mp.user_id, jsonb_each_text(coalesce(mp.zone_counts, '{}'::jsonb)) z
  where mp.user_id is not null and not p.banned
  group by mp.user_id, p.nickname, z.key;
create or replace view public.leaderboard_daily as
  select d.user_id, p.nickname, d.day, d.deliveries, d.earned, d.rating from public.daily_scores d join public.profiles p on p.id = d.user_id where not p.banned;
create or replace view public.tournament_standings as
  select m.tournament_id, mp.user_id, p.nickname, sum(mp.points) points, count(*) matches
  from public.match_players mp join public.matches m on m.id = mp.match_id join public.profiles p on p.id = mp.user_id
  where m.tournament_id is not null and not m.flagged group by m.tournament_id, mp.user_id, p.nickname;
create or replace function public.admin_stats() returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  return json_build_object(
    'matches_24h', (select count(*) from public.matches where created_at > now() - interval '1 day'),
    'matches_7d', (select count(*) from public.matches where created_at > now() - interval '7 days'),
    'players_24h', (select count(distinct user_id) from public.match_players where created_at > now() - interval '1 day'),
    'total_players', (select count(*) from public.profiles),
    'avg_match_minutes', (select round(avg(minutes), 1) from public.matches where created_at > now() - interval '7 days'),
    'open_reports', (select count(*) from public.reports where status = 'open'),
    'flagged_matches_7d', (select count(*) from public.matches where flagged and created_at > now() - interval '7 days'));
end $$;

-- ---------- storage buckets (photos and result cards) --------------------------
insert into storage.buckets (id, name, public) values ('photos', 'photos', true) on conflict (id) do nothing;
drop policy if exists "photo upload own folder" on storage.objects;
create policy "photo upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "photo delete own" on storage.objects;
create policy "photo delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
drop policy if exists "photo public read" on storage.objects;
create policy "photo public read" on storage.objects for select using (bucket_id = 'photos');

-- ---------- realtime for inbox ---------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when others then null; end $$;

-- To make yourself an admin after signing in once:
--   insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';
