// Rider progression: XP and levels with perks, achievements, daily challenges and a local leaderboard.

export const ACHIEVEMENTS = [
  { id: 'first', name: 'Pehli Pheri', desc: 'Complete your first job' },
  { id: 'ten', name: 'Regular Rider', desc: 'Complete 10 jobs' },
  { id: 'fifty', name: 'Rajkot Veteran', desc: 'Complete 50 jobs' },
  { id: 'chowk', name: 'Madhapar Chowk Master', desc: 'Ride 3 full laps of Madhapar Chowk' },
  { id: 'monsoon', name: 'Monsoon Rider', desc: 'Complete 3 jobs in the rain' },
  { id: 'night', name: 'Night Owl of Juni Pol', desc: 'Deliver in Juni Pol after 10 PM' },
  { id: 'ganthiya', name: 'Ganthiya Express', desc: 'Deliver 5 farsan orders' },
  { id: 'smooth', name: 'Butter Smooth', desc: 'Finish a passenger ride with 95+ comfort' },
  { id: 'streak', name: 'Five Star Streak', desc: 'Get 5 five-star jobs in a row' },
  { id: 'km25', name: 'Silver Jubilee', desc: 'Ride 25 km in total' },
  { id: 'rich', name: 'Dus Hazaar', desc: 'Earn ₹10,000 in total' },
  { id: 'utsav', name: 'Utsav Rider', desc: 'Deliver during a festival' },
  { id: 'near', name: 'Close Shave', desc: 'Pull off 10 near misses' },
  { id: 'tiffin', name: 'Dabba Round', desc: 'Complete a multi-drop tiffin round' },
  { id: 'rush', name: 'Life Saver', desc: 'Finish an urgent rush job on time' },
  { id: 'clean', name: 'Clean Record', desc: 'End a shift of 5+ jobs with no crashes or challans' },
];

const DAILY = [
  { id: 'food', desc: 'Deliver 3 food orders', target: 3, reward: 120 },
  { id: 'pass', desc: 'Complete 2 passenger rides', target: 2, reward: 100 },
  { id: 'earn', desc: 'Earn ₹400 today', target: 400, reward: 120 },
  { id: 'near', desc: 'Pull off 5 near misses', target: 5, reward: 80 },
  { id: 'old', desc: 'Deliver 2 jobs in Juni Pol', target: 2, reward: 110 },
  { id: 'five', desc: 'Finish 3 jobs with 5 stars', target: 3, reward: 150 },
  { id: 'refuel', desc: 'Refuel at Saurashtra Fuels', target: 1, reward: 40 },
  { id: 'km', desc: 'Ride 5 km', target: 5000, reward: 90 },
];

export function xpForLevel(l) { return Math.round(120 * Math.pow(l, 1.45)); }

export class Progression {
  constructor(profile, hooks) {
    this.p = profile; this.hooks = hooks;
    if (!profile.prog) profile.prog = { xp: 0, level: 1, ach: [], daily: null, best: [], rainJobs: 0, farsan: 0, near: 0, laps: 0, shiftCrashes: 0, shiftChallans: 0 };
    this.g = profile.prog;
  }
  get level() { return this.g.level; }
  get perks() { const l = this.g.level; return { pay: Math.min(0.2, (l - 1) * 0.02), tip: Math.min(0.2, (l - 1) * 0.025), fuelDiscount: l >= 5 ? 0.1 : 0 }; }

  addXp(n) {
    this.g.xp += n;
    while (this.g.xp >= xpForLevel(this.g.level)) {
      this.g.xp -= xpForLevel(this.g.level); this.g.level++;
      this.hooks.toast?.(`Level ${this.g.level}! Pay +${Math.round(this.perks.pay * 100)}%, tips more likely${this.g.level === 5 ? ', 10% off fuel' : ''}.`, 'good', 6000);
      this.hooks.levelUp?.(this.g.level);
    }
  }

  unlock(id) {
    if (this.g.ach.includes(id)) return;
    this.g.ach.push(id);
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    this.hooks.toast?.(`Achievement unlocked: ${a.name}`, 'good', 6000);
    this.hooks.chime?.();
    this.addXp(60);
  }

  ensureDaily(day) {
    if (this.g.daily && this.g.daily.day === day) return;
    const pool = [...DAILY];
    const list = [];
    let seed = day * 9301 + 49297;
    for (let i = 0; i < 3; i++) { seed = (seed * 9301 + 49297) % 233280; const k = Math.floor((seed / 233280) * pool.length); const d = pool.splice(k, 1)[0]; list.push({ ...d, count: 0, done: false }); }
    this.g.daily = { day, list };
    if (day > 1) this.hooks.toast?.('New daily challenges on the Pheri app.', 'info');
  }
  _daily(id, n = 1) {
    const d = this.g.daily; if (!d) return;
    for (const c of d.list) {
      if (c.id !== id || c.done) continue;
      c.count += n;
      if (c.count >= c.target) { c.done = true; this.p.money += c.reward; this.hooks.toast?.(`Daily challenge done: ${c.desc}. +₹${c.reward}`, 'good', 5000); this.hooks.chime?.(); this.addXp(50); }
    }
  }

  onJob(r, ctx) {
    const s = this.p.stats, j = r.job;
    this.addXp(Math.round(20 + r.stars * 8 + (j.rush ? 25 : 0) + (j.drops ? 30 : 0)));
    if (ctx.raining) this.g.rainJobs++;
    if (j.from.kind === 'farsan') this.g.farsan++;
    if (s.jobs >= 1) this.unlock('first');
    if (s.jobs >= 10) this.unlock('ten');
    if (s.jobs >= 50) this.unlock('fifty');
    if (this.g.rainJobs >= 3) this.unlock('monsoon');
    if (this.g.farsan >= 5) this.unlock('ganthiya');
    if (ctx.zone === 'old' && (ctx.hour >= 22 || ctx.hour < 4)) this.unlock('night');
    if (j.type === 'passenger' && j.comfort >= 95) this.unlock('smooth');
    if (r.streak >= 5) this.unlock('streak');
    if (s.earned >= 10000) this.unlock('rich');
    if (ctx.festival) this.unlock('utsav');
    if (j.drops) this.unlock('tiffin');
    if (j.rush && !r.late) this.unlock('rush');
    if (j.type === 'food') this._daily('food');
    if (j.type === 'passenger') this._daily('pass');
    this._daily('earn', r.total);
    if (ctx.zone === 'old') this._daily('old');
    if (r.stars >= 5) this._daily('five');
  }
  onNearMiss() { this.g.near++; this._daily('near'); if (this.g.near >= 10) this.unlock('near'); this.addXp(3); }
  onLap() { this.g.laps++; if (this.g.laps >= 3) this.unlock('chowk'); }
  onRefuel() { this._daily('refuel'); }
  onDistance(m) {
    this._kmAcc = (this._kmAcc || 0) + m;
    if (this._kmAcc > 100) { this._daily('km', this._kmAcc); this._kmAcc = 0; }
    if (this.p.stats.distance >= 25000) this.unlock('km25');
  }
  onCrash() { this.g.shiftCrashes++; }
  onChallan() { this.g.shiftChallans++; }
  onShiftEnd(stats, rating) {
    if (stats.shiftJobs >= 5 && !this.g.shiftCrashes && !this.g.shiftChallans) this.unlock('clean');
    if (stats.shiftJobs > 0) {
      this.g.best.push({ earned: Math.round(stats.shiftEarned), jobs: stats.shiftJobs, km: +(stats.shiftDistance / 1000).toFixed(1), rating: +rating.toFixed(2), date: new Date().toLocaleDateString('en-IN') });
      this.g.best.sort((a, b) => b.earned - a.earned); this.g.best = this.g.best.slice(0, 5);
    }
    this.g.shiftCrashes = 0; this.g.shiftChallans = 0;
  }
}
