// Supabase client: accounts, cloud save, profiles, friends, presence, inbox, leaderboards,
// match history, daily challenge, photos, reports, tournaments and the community goal.
import { createClient } from '@supabase/supabase-js';
import { ONLINE } from '../config.js';

export class Cloud {
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.enabled = !!(ONLINE.supabaseUrl && ONLINE.supabaseAnonKey);
    this.sb = this.enabled ? createClient(ONLINE.supabaseUrl, ONLINE.supabaseAnonKey, { auth: { persistSession: true, detectSessionInUrl: true } }) : null;
    this.user = null; this.profile = null; this.friends = []; this.online = new Map(); this.inbox = [];
    if (this.sb) {
      this.sb.auth.onAuthStateChange((_e, session) => { this._setUser(session?.user || null); });
      this.sb.auth.getSession().then(({ data }) => this._setUser(data.session?.user || null));
    }
  }
  get loggedIn() { return !!this.user; }
  get isGuest() { return !!this.user?.is_anonymous; }
  async token() { if (!this.sb) return null; const { data } = await this.sb.auth.getSession(); return data.session?.access_token || null; }

  async _setUser(u) {
    const changed = (u?.id || null) !== (this.user?.id || null);
    this.user = u;
    if (!u) { this.profile = null; this.hooks.auth?.(null); return; }
    if (!changed && this.profile) return;
    await this.ensureProfile();
    this._subscribeInbox();
    this.loadFriends();
    this.hooks.auth?.(this.user);
  }

  // ---------------------------------------------------------------- auth
  async guest() { if (!this.sb) throw new Error('Online is not configured'); const { error } = await this.sb.auth.signInAnonymously(); if (error) throw error; }
  async google() { const { error } = await this.sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } }); if (error) throw error; }
  async email(email) { const { error } = await this.sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } }); if (error) throw error; }
  async phone(phone) { const { error } = await this.sb.auth.signInWithOtp({ phone }); if (error) throw error; }
  async verifyPhone(phone, token) { const { error } = await this.sb.auth.verifyOtp({ phone, token, type: 'sms' }); if (error) throw error; }
  // Upgrade an anonymous guest to a real account, keeping all progress
  async linkGoogle() { const { error } = await this.sb.auth.linkIdentity({ provider: 'google', options: { redirectTo: location.origin + location.pathname } }); if (error) throw error; }
  async linkEmail(email) { const { error } = await this.sb.auth.updateUser({ email }); if (error) throw error; }
  async logout() { await this.sb?.auth.signOut(); this.presence?.unsubscribe(); }

  // ---------------------------------------------------------------- profile
  async ensureProfile() {
    const { data } = await this.sb.from('profiles').select('*').eq('id', this.user.id).maybeSingle();
    if (data) { this.profile = data; return data; }
    const nick = 'Rider' + Math.floor(1000 + Math.random() * 9000);
    const { data: created } = await this.sb.from('profiles').insert({ id: this.user.id, nickname: nick, is_guest: !!this.user.is_anonymous }).select('*').single();
    this.profile = created; return created;
  }
  async setNickname(nick) {
    nick = String(nick).trim();
    if (!/^[A-Za-z0-9_ .-]{3,16}$/.test(nick)) throw new Error('Use 3–16 letters, numbers, spaces, dots or dashes.');
    const { error } = await this.sb.from('profiles').update({ nickname: nick }).eq('id', this.user.id);
    if (error) throw new Error(error.code === '23505' ? 'That nickname is taken.' : error.message);
    this.profile.nickname = nick;
  }
  async updateProfile(fields) { if (!this.user) return; await this.sb.from('profiles').update({ ...fields, last_seen: new Date().toISOString() }).eq('id', this.user.id); Object.assign(this.profile || {}, fields); }
  async getProfile(nickname) { const { data } = await this.sb.from('profiles').select('*').ilike('nickname', nickname).maybeSingle(); return data; }

  // ---------------------------------------------------------------- cloud save (newest wins, other kept as backup)
  async pushSave(profile) {
    if (!this.user) return;
    const data = { ...profile, savedAt: Date.now() };
    const { data: cur } = await this.sb.from('saves').select('data').eq('user_id', this.user.id).maybeSingle();
    await this.sb.from('saves').upsert({ user_id: this.user.id, data, backup: cur?.data || null, device: navigator.userAgent.slice(0, 80), updated_at: new Date().toISOString() });
  }
  async pullSave(localProfile) {
    if (!this.user) return null;
    const { data } = await this.sb.from('saves').select('data,updated_at').eq('user_id', this.user.id).maybeSingle();
    if (!data) return null;
    const remote = data.data;
    return (remote.savedAt || 0) > (localProfile?.savedAt || 0) ? remote : null;
  }

  // ---------------------------------------------------------------- friends & presence
  async loadFriends() {
    if (!this.user) return [];
    const { data } = await this.sb.from('friendships').select('id,status,requester,addressee,a:requester(id,nickname,skill,look),b:addressee(id,nickname,skill,look)').or(`requester.eq.${this.user.id},addressee.eq.${this.user.id}`);
    this.friends = (data || []).map((f) => { const other = f.requester === this.user.id ? f.b : f.a; return { id: f.id, status: f.status, incoming: f.addressee === this.user.id && f.status === 'pending', user: other }; });
    this.hooks.friends?.(this.friends);
    return this.friends;
  }
  async addFriend(nickname) {
    const p = await this.getProfile(nickname);
    if (!p) throw new Error('No rider with that nickname.');
    if (p.id === this.user.id) throw new Error("That's you!");
    const { error } = await this.sb.from('friendships').insert({ requester: this.user.id, addressee: p.id });
    if (error) throw new Error(error.code === '23505' ? 'Request already sent.' : error.message);
    await this.notify(p.id, 'friend', { nickname: this.profile.nickname });
    return this.loadFriends();
  }
  async respondFriend(id, accept) { if (accept) await this.sb.from('friendships').update({ status: 'accepted' }).eq('id', id); else await this.sb.from('friendships').delete().eq('id', id); return this.loadFriends(); }
  async removeFriend(id) { await this.sb.from('friendships').delete().eq('id', id); return this.loadFriends(); }
  async block(userId) { await this.sb.from('blocks').upsert({ blocker: this.user.id, blocked: userId }); }
  async report(userId, reason, context = {}) { await this.sb.from('reports').insert({ reporter: this.user.id, target: userId, reason: String(reason).slice(0, 300), context }); }

  joinPresence(status = 'menu', room = null) {
    if (!this.user) return;
    if (!this.presence) {
      this.presence = this.sb.channel('presence:online', { config: { presence: { key: this.user.id } } });
      this.presence.on('presence', { event: 'sync' }, () => {
        const st = this.presence.presenceState();
        this.online = new Map(Object.entries(st).map(([k, v]) => [k, v[0]]));
        this.hooks.presence?.(this.online);
      });
      this.presence.subscribe(async (s) => { if (s === 'SUBSCRIBED') await this.presence.track({ nickname: this.profile?.nickname, status, room }); });
    } else this.presence.track({ nickname: this.profile?.nickname, status, room });
  }

  // ---------------------------------------------------------------- inbox / notifications
  async notify(toUser, kind, payload) { if (!this.user) return; await this.sb.from('notifications').insert({ to_user: toUser, from_user: this.user.id, kind, payload }); }
  async loadInbox() { if (!this.user) return []; const { data } = await this.sb.from('notifications').select('*').eq('to_user', this.user.id).order('created_at', { ascending: false }).limit(40); this.inbox = data || []; return this.inbox; }
  async markRead(id) { await this.sb.from('notifications').update({ read: true }).eq('id', id); }
  _subscribeInbox() {
    this.inboxCh?.unsubscribe();
    this.inboxCh = this.sb.channel('inbox:' + this.user.id).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `to_user=eq.${this.user.id}` }, (p) => {
      this.inbox.unshift(p.new); this.hooks.notification?.(p.new);
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') new Notification('PHERI', { body: p.new.kind === 'invite' ? `${p.new.payload.nickname} invited you to room ${p.new.payload.code}` : 'You have a new message' });
    }).subscribe();
  }

  // ---------------------------------------------------------------- leaderboards & history
  async leaderboard(kind = 'weekly', mode = 'rush', friendsOnly = false) {
    let q;
    if (kind === 'season') q = this.sb.from('leaderboard_season').select('*').eq('season', new Date().toISOString().slice(0, 7)).order('points', { ascending: false });
    else if (kind === 'daily') q = this.sb.from('leaderboard_daily').select('*').eq('day', istDay()).order('deliveries', { ascending: false }).order('earned', { ascending: false });
    else if (kind === 'area') q = this.sb.from('leaderboard_area').select('*').eq('zone', mode).order('deliveries', { ascending: false });
    else q = this.sb.from(kind === 'all' ? 'leaderboard_all' : 'leaderboard_weekly').select('*').eq('mode', mode).order(mode === 'earner' || mode === 'festival' ? 'earned' : 'deliveries', { ascending: false });
    if (friendsOnly && this.user) q = q.in('user_id', [this.user.id, ...this.friends.filter((f) => f.status === 'accepted').map((f) => f.user.id)]);
    const { data, error } = await q.limit(50);
    if (error) throw error;
    return data || [];
  }
  async history() { if (!this.user) return []; const { data } = await this.sb.from('match_players').select('*, matches(mode,minutes,player_count,created_at,team_totals)').eq('user_id', this.user.id).order('created_at', { ascending: false }).limit(20); return data || []; }
  async matchDetail(id) { const { data } = await this.sb.from('match_players').select('*').eq('match_id', id).order('rank'); return data || []; }

  // ---------------------------------------------------------------- daily challenge, tournaments, community goal
  async submitDaily(score) { const { error } = await this.sb.from('daily_scores').insert({ user_id: this.user.id, deliveries: score.deliveries, earned: score.earned, rating: score.rating }); if (error) throw new Error(error.code === '23505' ? 'You already played today\'s challenge.' : error.message); }
  async playedDaily() { if (!this.user) return false; const { data } = await this.sb.from('daily_scores').select('day').eq('user_id', this.user.id).eq('day', istDay()).maybeSingle(); return !!data; }
  async config() { const { data } = await this.sb.from('admin_config').select('key,value'); const c = {}; for (const r of data || []) c[r.key] = r.value; return c; }
  async tournaments() { const { data } = await this.sb.from('tournaments').select('*').gte('ends_at', new Date().toISOString()).order('starts_at'); return data || []; }
  async joinTournament(id) { const { error } = await this.sb.from('tournament_entries').insert({ tournament_id: id, user_id: this.user.id }); if (error && error.code !== '23505') throw error; }
  async myEntries() { if (!this.user) return []; const { data } = await this.sb.from('tournament_entries').select('tournament_id').eq('user_id', this.user.id); return (data || []).map((r) => r.tournament_id); }
  async standings(id) { const { data } = await this.sb.from('tournament_standings').select('*').eq('tournament_id', id).order('points', { ascending: false }).limit(50); return data || []; }
  async communityGoal() { const { data } = await this.sb.from('community_goals').select('*').eq('active', true).order('id', { ascending: false }).limit(1).maybeSingle(); return data; }

  // ---------------------------------------------------------------- photos & result cards
  async uploadImage(blob, caption = '', kind = 'photo') {
    const path = `${this.user.id}/${Date.now()}.png`;
    const { error } = await this.sb.storage.from('photos').upload(path, blob, { contentType: 'image/png' });
    if (error) throw error;
    await this.sb.from('photos').insert({ user_id: this.user.id, path, caption: String(caption).slice(0, 120), kind });
    return this.sb.storage.from('photos').getPublicUrl(path).data.publicUrl;
  }
  async gallery() {
    const { data } = await this.sb.from('photos').select('id,path,caption,created_at,user_id,profiles(nickname),photo_likes(count)').eq('kind', 'photo').eq('hidden', false).order('created_at', { ascending: false }).limit(30);
    return (data || []).map((p) => ({ ...p, url: this.sb.storage.from('photos').getPublicUrl(p.path).data.publicUrl, likes: p.photo_likes?.[0]?.count || 0 }));
  }
  async like(photoId) { await this.sb.from('photo_likes').upsert({ photo_id: photoId, user_id: this.user.id }); }
}

export function istDay() { return new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10); }
export function seasonTier(skill) { return skill >= 1400 ? 'Thunder' : skill >= 1250 ? 'Falcon' : skill >= 1100 ? 'Kestrel' : 'Sparrow'; }
