// Supabase persistence for the game server (service role). Everything is optional:
// without SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY the server runs fine and simply skips saving.
import { createClient } from '@supabase/supabase-js';

export class Store {
  constructor() {
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    this.db = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
    if (!this.db) console.log('[store] Supabase not configured: matches will not be saved');
  }
  get enabled() { return !!this.db; }

  // Verify a player's Supabase access token; returns { id, nickname, banned } or null
  async verify(token) {
    if (!this.db || !token) return null;
    const { data, error } = await this.db.auth.getUser(token);
    if (error || !data?.user) return null;
    const { data: prof } = await this.db.from('profiles').select('nickname,banned,skill').eq('id', data.user.id).maybeSingle();
    return { id: data.user.id, nickname: prof?.nickname || null, banned: !!prof?.banned, skill: prof?.skill ?? 1000 };
  }

  async loadConfig() {
    if (!this.db) return {};
    const { data } = await this.db.from('admin_config').select('key,value');
    const cfg = {}; for (const r of data || []) cfg[r.key] = r.value;
    return { payMult: +cfg.job_pay_mult || 1, motd: cfg.motd || '' };
  }

  async saveMatch(room, rows, teamTotals) {
    if (!this.db) return null;
    const s = room.settings;
    const { data: match, error } = await this.db.from('matches').insert({
      room_code: room.code, mode: s.mode, minutes: s.minutes, settings: s, player_count: rows.length,
      team_totals: teamTotals, tournament_id: s.tournamentId || null, flagged: rows.some((r) => r.flags > 5),
    }).select('id').single();
    if (error) throw error;
    const players = rows.map((r) => ({
      match_id: match.id, user_id: r.userId, name: r.name, rank: r.rank, team: r.team, deliveries: r.deliveries, earned: r.earned,
      rating: r.rating, crashes: r.crashes, near_misses: r.near, comfort: r.comfort, zone_counts: r.zones, flags: r.flags,
      points: Math.max(0, rows.length - r.rank + 1) * 10 + r.deliveries,
    }));
    await this.db.from('match_players').insert(players);
    // skill rating (simple Elo against the field), wins and totals
    const users = rows.filter((r) => r.userId);
    if (users.length) {
      const { data: profs } = await this.db.from('profiles').select('id,skill,wins,matches,total_deliveries').in('id', users.map((u) => u.userId));
      const byId = new Map((profs || []).map((p) => [p.id, p]));
      for (const r of users) {
        const me = byId.get(r.userId); if (!me) continue;
        let delta = 0;
        for (const o of users) {
          if (o === r) continue; const opp = byId.get(o.userId); if (!opp) continue;
          const exp = 1 / (1 + 10 ** ((opp.skill - me.skill) / 400));
          const score = r.rank < o.rank ? 1 : r.rank > o.rank ? 0 : 0.5;
          delta += 24 * (score - exp);
        }
        await this.db.from('profiles').update({
          skill: Math.round(me.skill + delta), wins: me.wins + (r.rank === 1 && rows.length > 1 ? 1 : 0), matches: me.matches + 1,
          total_deliveries: me.total_deliveries + r.deliveries, last_seen: new Date().toISOString(),
        }).eq('id', r.userId);
      }
    }
    // community goal progress
    const total = rows.reduce((a, r) => a + r.deliveries, 0);
    if (total > 0) await this.db.rpc('bump_community_goal', { amount: total });
    return match.id;
  }
}
