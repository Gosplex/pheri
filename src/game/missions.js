import { Rng, clamp } from '../core/rng.js';
import { FIRST_NAMES, SURNAMES } from '../world/catalog.js';

// Time-of-day menus: what Rajkot actually orders at that hour.
const FOOD = {
  morning: ['Fafda-jalebi with kadhi', 'Poha and masala chai', 'Methi thepla combo', 'Khaman dhokla, 500 g', 'Chai flask for the office'],
  afternoon: ['Kathiyawadi thali', 'Gujarati thali with chaas', 'Aloo paratha combo', 'Sev tameta nu shaak and rotli', 'Pav bhaji, extra butter'],
  evening: ['Rajkot ganthiya with papaya sambharo', 'Dabeli, four pieces', 'Pani puri kit', 'Chai and khari biscuits', 'Sev khamani'],
  night: ['Late-night dabeli', 'Ice cream family pack', 'Masala khichdi and kadhi', 'Kesar pista kulfi', 'Butter-milk and bhajiya'],
};
const PARCEL = ['Phone charger and earphones', 'Medicines from the chemist', 'Groceries: atta, oil, sugar', 'Saree for alteration', 'Tiffin box', 'Printer cartridge', 'Fresh fruit basket', 'Pooja samagri bag'];
const DOCS = ['Printed project report', 'Photocopied lab manual', 'Exam hall tickets', 'Spiral-bound assignment', 'Admission documents'];
const LINES_GOOD = ['Majama! Smooth ride.', 'Nice riding, bhai.', 'That was quick, thank you!'];
const LINES_BAD = ['Dhimu chalavo, bhai! Slow down!', 'Arre, careful!', 'My heart is in my mouth...'];

export function daypart(h) { return h >= 6 && h < 11 ? 'morning' : h >= 11 && h < 16 ? 'afternoon' : h >= 16 && h < 20.5 ? 'evening' : 'night'; }

export class Missions {
  constructor(world, profile, hooks) {
    this.world = world; this.profile = profile; this.hooks = hooks;
    this.rng = new Rng((Date.now() & 0xffff) + 7);
    this.offers = []; this.active = null; this.nextOffer = 2; this.id = 1;
    this.pickupKinds = {
      food: ['restaurant', 'farsan', 'sweets', 'tea', 'icecream'],
      parcel: ['grocery', 'pharmacy', 'mobile', 'cloth', 'hardware', 'electric', 'fruit'],
      docs: ['xerox', 'coaching'],
    };
    this.homes = world.pois.filter((p) => p.kind === 'home' || p.kind === 'hostel');
    this.streak = 0;
  }

  _near(list, x, z, dmin, dmax) {
    const c = list.filter((p) => { const d = Math.hypot(p.x - x, p.z - z); return d >= dmin && d <= dmax; });
    return c.length ? this.rng.pick(c) : null;
  }

  makeOffer(hour, px, pz, forced = null) {
    const r = this.rng, part = daypart(hour);
    const night = part === 'night';
    let type = forced || r.weighted(['food', 'parcel', 'docs', 'passenger', 'tiffin'], (t) => ({
      food: part === 'afternoon' || part === 'evening' ? 4 : 3, parcel: night ? 1 : 3, docs: part === 'morning' ? 2.5 : night ? 0.2 : 1.2, passenger: part === 'evening' ? 3.5 : 2.5,
      tiffin: (hour >= 11 && hour < 14.5) || (hour >= 19 && hour < 21.5) ? 1.6 : 0,
    })[t]);
    if (type === 'tiffin') return this._tiffin(hour, px, pz);
    let from, to, item;
    const open = (p) => !night || p.nightOpen || !p.shop;
    if (type === 'passenger') {
      const starts = this.world.pois.filter((p) => open(p));
      from = this._near(starts, px, pz, 40, 380);
      if (!from) return null;
      to = this._near(this.world.pois, from.x, from.z, 250, 950);
      item = `${r.pick(FIRST_NAMES)} ${r.pick(SURNAMES)}`;
    } else {
      const kinds = this.pickupKinds[type];
      from = this._near(this.world.pois.filter((p) => kinds.includes(p.kind) && open(p)), px, pz, 30, 420);
      if (!from) { type = 'food'; from = this._near(this.world.pois.filter((p) => this.pickupKinds.food.includes(p.kind) && open(p)), px, pz, 30, 600); }
      if (!from) return null;
      const dests = type === 'docs' ? this.world.pois.filter((p) => p.zone === 'campus' || p.kind === 'home') : this.homes;
      to = this._near(dests, from.x, from.z, 180, 900);
      item = type === 'food' ? r.pick(FOOD[part]) : type === 'parcel' ? r.pick(PARCEL) : r.pick(DOCS);
    }
    if (!to || !from) return null;
    // urgent rush jobs: medicines at night, a student late for an exam in the morning
    let rush = false;
    if (type === 'parcel' && night && r.chance(0.18)) { item = 'Urgent medicines for a sick child'; rush = true; }
    if (type === 'passenger' && hour >= 7 && hour < 10.5 && r.chance(0.2)) {
      const campus = this.world.pois.filter((p) => p.zone === 'campus' && p.kind === 'campus');
      if (campus.length) { to = r.pick(campus); item += ' (exam in 20 minutes!)'; rush = true; }
    }
    const dist = Math.hypot(to.x - from.x, to.z - from.z) * 1.3;
    const premium = this.profile.rating >= 4.5 && r.chance(0.25);
    let pay = Math.round((type === 'passenger' ? 35 : 25) + dist * 0.11 + (night ? 15 : 0));
    if (premium) pay = Math.round(pay * 1.5);
    if (rush) pay = Math.round(pay * 1.8);
    pay = Math.round(pay * (this.hooks.payMult?.(hour) ?? 1));
    let timeLimit = Math.round(dist / 7.5 + 50 + (type === 'passenger' ? 0 : 25));
    if (rush) timeLimit = Math.round(timeLimit * 0.75);
    const job = {
      id: this.id++, type, item, from, to, pay, timeLimit, premium, dist, rush,
      customer: `${r.pick(FIRST_NAMES)} ${r.pick(SURNAMES)[0]}.`, expires: 60 + r.float(0, 40),
    };
    return job;
  }

  // Multi-drop tiffin round: one kitchen, three homes close together
  _tiffin(hour, px, pz) {
    const r = this.rng;
    const from = this._near(this.world.pois.filter((p) => p.kind === 'restaurant'), px, pz, 30, 450);
    if (!from) return null;
    const first = this._near(this.homes, from.x, from.z, 150, 600); if (!first) return null;
    const drops = [first];
    for (let i = 0; i < 2; i++) { const n = this._near(this.homes.filter((h) => !drops.includes(h)), drops[drops.length - 1].x, drops[drops.length - 1].z, 40, 220); if (n) drops.push(n); }
    if (drops.length < 2) return null;
    let dist = Math.hypot(first.x - from.x, first.z - from.z);
    for (let i = 1; i < drops.length; i++) dist += Math.hypot(drops[i].x - drops[i - 1].x, drops[i].z - drops[i - 1].z);
    dist *= 1.3;
    const pay = Math.round((50 + dist * 0.12 + drops.length * 15) * (this.hooks.payMult?.(hour) ?? 1));
    return {
      id: this.id++, type: 'food', item: `Tiffin round: ${drops.length} dabbas`, from, to: drops[0], drops, dropIndex: 0, pay,
      timeLimit: Math.round(dist / 7 + 60 + drops.length * 25), premium: false, dist, customer: 'three families', expires: 70,
    };
  }

  refreshOffers(dt, hour, px, pz) {
    for (const o of this.offers) o.expires -= dt;
    this.offers = this.offers.filter((o) => o.expires > 0);
    this.nextOffer -= dt;
    if (this.nextOffer <= 0 && this.offers.length < 4) {
      this.nextOffer = this.rng.float(10, 22);
      const o = this.makeOffer(hour, px, pz);
      if (o) { this.offers.push(o); if (!this.active) this.hooks.newOffer?.(o); }
    }
  }

  accept(id, hour) {
    const o = this.offers.find((x) => x.id === id); if (!o || this.active) return false;
    this.offers = this.offers.filter((x) => x !== o);
    this.active = { ...o, stage: 'pickup', timer: 0, hold: 0, crashes: 0, comfort: 100, bumps: 0, event: null, waitCall: 0, changed: false };
    // pre-roll small story events
    const r = this.rng;
    if (o.type !== 'passenger' && r.chance(0.15)) this.active.notAnswering = true;
    if (o.type === 'passenger' && r.chance(0.14)) this.active.willChange = r.float(0.3, 0.6);
    this.hooks.accepted?.(this.active);
    return true;
  }

  cancel() {
    if (!this.active) return;
    const a = this.active; this.active = null;
    this.addRating(2);
    this.streak = 0;
    this.hooks.cancelled?.(a);
  }

  addRating(stars) {
    const p = this.profile;
    p.ratings.push(stars); if (p.ratings.length > 25) p.ratings.shift();
    const base = 3.8 * 3; // weight of the starting rating
    p.rating = Math.round(((base + p.ratings.reduce((a, b) => a + b, 0)) / (3 + p.ratings.length)) * 100) / 100;
  }

  // Report rough riding to the active job
  reportImpact(impact) { if (this.active && this.active.stage === 'drop') { this.active.crashes += impact > 7.5 ? 1 : 0; this.active.comfort -= impact * 3; this._react(false); } }
  reportBump(hard) { if (this.active && this.active.stage === 'drop' && this.active.type === 'passenger') { this.active.comfort -= hard ? 12 : 3; if (hard) this._react(false); } }
  _react(good) {
    const a = this.active; if (!a || a.type !== 'passenger') return;
    const now = performance.now();
    if (this._lastReact && now - this._lastReact < 4000) return;
    this._lastReact = now;
    this.hooks.say?.(good ? this.rng.pick(LINES_GOOD) : this.rng.pick(LINES_BAD));
  }

  update(dt, bike, env) {
    const a = this.active; if (!a) return;
    a.timer += dt;
    // passenger comfort from riding style
    if (a.type === 'passenger' && a.stage === 'drop') {
      const kmh = bike.kmh;
      if (kmh > 62) { a.comfort -= dt * 2.5; if (kmh > 70) this._react(false); }
      if (bike.accelSmoothed < -7.5) { a.comfort -= dt * 14; this._react(false); }
      if (Math.abs(bike.lean) > 0.55) a.comfort -= dt * 5;
      a.comfort = clamp(a.comfort + dt * 0.4, 0, 100);
      if (a.willChange && !a.changed && a.timer > a.timeLimit * a.willChange) {
        const nt = this._near(this.world.pois, a.to.x, a.to.z, 120, 400);
        if (nt) { a.to = nt; a.changed = true; a.pay += 20; a.timeLimit += 45; this.hooks.destChanged?.(a); }
      }
    }
    const target = a.stage === 'pickup' ? a.from : a.to;
    const d = Math.hypot(bike.pos.x - target.x, bike.pos.z - target.z);
    a.distToTarget = d;
    if (d < 8 && bike.kmh < 9) {
      if (a.stage === 'drop' && a.notAnswering && a.waitCall < 6) {
        a.waitCall += dt;
        if (!a._calling) { a._calling = true; this.hooks.say?.(`Calling ${a.customer}... no answer yet.`); }
        if (a.waitCall >= 6) this.hooks.say?.(`${a.customer} is coming down. Thanks for waiting!`);
        return;
      }
      a.hold += dt;
      if (a.hold > 1.0) {
        a.hold = 0;
        if (a.stage === 'pickup') { a.stage = 'drop'; a.pickedAt = a.timer; this.hooks.pickedUp?.(a); }
        else if (a.drops && a.dropIndex < a.drops.length - 1) {
          a.dropIndex++; a.to = a.drops[a.dropIndex]; a.notAnswering = false;
          this.hooks.dropProgress?.(a);
        } else this._complete(a);
      }
    } else a.hold = Math.max(0, a.hold - dt * 2);
  }

  _complete(a) {
    const late = Math.max(0, a.timer - a.timeLimit);
    let stars = 5;
    if (late > 0) stars -= 1 + Math.min(2, late / 60);
    stars -= a.crashes * 1.2;
    if (a.type === 'passenger') stars -= (100 - a.comfort) / 35;
    stars = clamp(Math.round(stars * 2) / 2, 1, 5);
    let pay = a.pay;
    if (late > 0) pay = Math.round(pay * 0.65);
    pay = Math.round(pay * (1 + (this.hooks.levelPay?.() ?? 0)));
    if (a.crashes && a.type === 'food') pay = Math.round(pay * 0.8);
    if (this.profile.owned.upgrades.includes('box') && (a.type === 'food' || a.type === 'parcel')) pay = Math.round(pay * 1.1);
    let tip = 0;
    if (stars >= 4.5 && this.rng.chance(0.55 + (this.hooks.tipBonus?.() ?? 0))) tip = this.rng.int(10, a.type === 'passenger' ? 40 : 25);
    if (stars >= 4.5) this.streak++; else this.streak = 0;
    const streakBonus = this.streak > 0 && this.streak % 3 === 0 ? 30 : 0;
    this.addRating(stars);
    this.active = null;
    const result = { job: a, stars, pay, tip, streakBonus, late, total: pay + tip + streakBonus, streak: this.streak };
    if (a.type === 'passenger') this.hooks.say?.(stars >= 4 ? this.rng.pick(LINES_GOOD) : 'Hmm. Next time, gently please.');
    this.hooks.completed?.(result);
    return result;
  }
}
