import * as THREE from 'three';
import { Rng } from '../core/rng.js';
import { MeshBuilder } from '../core/geom.js';

// Random events keep every ride slightly different. All are local, short and readable.
export class Events {
  constructor(scene, world, peds, traffic, env, audio, hooks) {
    Object.assign(this, { scene, world, peds, traffic, env, audio, hooks });
    this.net = world.net;
    this.rng = new Rng((Date.now() >> 3) & 0xffff);
    this.timer = 35;
    this.active = [];
    // barricade + cones model for road works
    const b = new MeshBuilder();
    b.box(0, 0.55, 0, 3.2, 0.5, 0.12, 0, 0xf4b400); b.box(0, 0.55, 0.07, 3.2, 0.18, 0.02, 0, 0x14161f);
    b.box(-1.4, 0.3, 0, 0.1, 0.6, 0.6, 0, 0x555555); b.box(1.4, 0.3, 0, 0.1, 0.6, 0.6, 0, 0x555555);
    this.barrierGeo = b.build();
    const c = new MeshBuilder(); c.cylinder(0, 0.35, 0, 0.18, 0.7, 0xff6d00, 8, 0, 0, 0, 0.03); c.box(0, 0.03, 0, 0.45, 0.06, 0.45, 0, 0x222222); c.cylinder(0, 0.42, 0, 0.13, 0.1, 0xffffff, 8);
    this.coneGeo = c.build();
    const d = new MeshBuilder(); d.box(0, 0.4, 0, 2.2, 0.8, 1.6, 0, 0x9e8b6d); d.box(0.3, 0.9, 0.2, 1.2, 0.5, 0.9, 0.3, 0x8d7b5e); // sand/gravel heap
    this.heapGeo = d.build();
  }

  _roadAhead(bike, dist, classes) {
    const fx = Math.sin(bike.heading), fz = Math.cos(bike.heading);
    for (let tries = 0; tries < 6; tries++) {
      const dd = dist + this.rng.float(-20, 30);
      const x = bike.pos.x + fx * dd + this.rng.float(-25, 25), z = bike.pos.z + fz * dd + this.rng.float(-25, 25);
      const n = this.net.nearest(x, z, 60);
      if (n && (!classes || classes.includes(n.e.cls)) && n.s > n.e.trimA + 12 && n.s < n.e.len - n.e.trimB - 12) return n;
    }
    return null;
  }

  update(dt, bike, hour) {
    // lifetime of running events
    for (const ev of this.active) {
      ev.t -= dt;
      if (ev.kind === 'baraat' && this.peds.baraat?.pos) {
        const p = this.peds.baraat.pos;
        this.audio.dhol(Math.hypot(p.x - bike.pos.x, p.z - bike.pos.z));
      }
      if (ev.t <= 0) this._end(ev);
    }
    this.active = this.active.filter((e) => e.t > 0);
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this.rng.float(40, 80);
    const evening = hour >= 18 && hour < 23.5;
    const options = [
      ['cow', 3], ['dog', 1.5], ['works', 1.5], ['jam', hour > 8 && hour < 21 ? 2 : 0.3],
      ['baraat', evening && !this.peds.baraat ? 3 : 0], ['rain', this.env.mode === 'dynamic' && this.env.rain < 0.1 ? 0.6 : 0],
      ['puncture', bike.speed > 6 && !bike.puncture ? 0.5 : 0], ['powercut', hour >= 19 || hour < 5 ? 0.8 : 0],
    ];
    const kind = this.rng.weighted(options, (o) => o[1])[0];
    this.trigger(kind, bike);
  }

  trigger(kind, bike) {
    if (kind === 'cow') {
      const n = this._roadAhead(bike, 80, ['highway', 'arterial', 'street', 'lane']);
      if (!n) return;
      const p = this.net.sample(n.e, n.s);
      if (this.peds.cowCrossing(p.x, p.z, n.e)) this.hooks.toast?.('A cow is crossing ahead. Slow down and let her pass.', 'info');
    } else if (kind === 'dog') {
      const n = this._roadAhead(bike, 50, null); if (!n) return;
      const p = this.net.sample(n.e, n.s); this.peds.dogChase(p.x, p.z);
    } else if (kind === 'works') {
      const n = this._roadAhead(bike, 140, ['arterial', 'street', 'highway']); if (!n || n.e.blocked) return;
      const e = n.e, dir = this.rng.int(0, e.oneway ? 0 : 1);
      const lane = e.spec.lanes - 1;
      const s0 = Math.max(e.trimA + 8, (dir === 0 ? n.s : e.len - n.s) - 10), s1 = s0 + 22;
      e.blocked = { dir, lane, s0, s1 };
      const group = new THREE.Group();
      const lat = this.net.laneOffset(e, lane);
      for (let s = s0; s < s1; s += 3) {
        const p = this.net.lanePoint(e, dir, s, lat + e.spec.laneW * 0.45, {});
        const cone = new THREE.Mesh(this.coneGeo, this.world.mats.vehicle); cone.position.set(p.x, 0, p.z); group.add(cone);
      }
      for (const s of [s0, s1]) {
        const p = this.net.lanePoint(e, dir, s, lat, {});
        const bar = new THREE.Mesh(this.barrierGeo, this.world.mats.vehicle); bar.position.set(p.x, 0, p.z); bar.rotation.y = Math.atan2(p.tx, p.tz); bar.castShadow = true; group.add(bar);
      }
      const mid = this.net.lanePoint(e, dir, (s0 + s1) / 2, lat, {});
      const heap = new THREE.Mesh(this.heapGeo, this.world.mats.vehicle); heap.position.set(mid.x, 0, mid.z); heap.rotation.y = Math.atan2(mid.tx, mid.tz); group.add(heap);
      this.scene.add(group);
      const colliders = [];
      for (const s of [s0, (s0 + s1) / 2, s1]) { const p = this.net.lanePoint(e, dir, s, lat, {}); colliders.push({ x: p.x, z: p.z, r: 1.3 }); }
      this.active.push({ kind, t: 240, e, group, colliders });
      this.hooks.toast?.(`Road work on ${e.name}. One lane closed.`, 'warn');
    } else if (kind === 'jam') {
      const n = this._roadAhead(bike, 180, ['arterial', 'ring', 'highway']); if (!n) return;
      n.e.jam = 1;
      this.traffic.density = 1.35;
      this.active.push({ kind, t: 75, e: n.e });
      this.hooks.toast?.(`Heavy traffic on ${n.e.name}. Expect delays.`, 'warn');
    } else if (kind === 'baraat') {
      const n = this._roadAhead(bike, 150, ['street', 'arterial']); if (!n) return;
      const b = this.peds.startBaraat(n.e, n.e.oneway ? 0 : this.rng.int(0, 1));
      if (b) { this.active.push({ kind, t: 150 }); this.hooks.toast?.(`A baraat is dancing down ${n.e.name}. Hear the dhol?`, 'info'); }
    } else if (kind === 'puncture') {
      this.hooks.puncture?.();
    } else if (kind === 'powercut') {
      this.hooks.powerCut?.();
    } else if (kind === 'rain') {
      this.env.forceWeather('rain');
      this.hooks.toast?.('Dark clouds over Rajkot. Roads get slippery in rain.', 'warn');
    }
  }

  // extra static obstacles (road works) for the player
  collidePlayer(c, r) {
    let hit = null;
    for (const ev of this.active) {
      if (!ev.colliders) continue;
      for (const o of ev.colliders) {
        const dx = c.x - o.x, dz = c.z - o.z, d = Math.hypot(dx, dz), R = r + o.r;
        if (d < R && d > 1e-4) { const nx = dx / d, nz = dz / d; c.x += nx * (R - d); c.z += nz * (R - d); hit = { nx, nz, depth: R - d }; }
      }
    }
    return hit;
  }

  _end(ev) {
    if (ev.group) { this.scene.remove(ev.group); }
    if (ev.kind === 'works') ev.e.blocked = null;
    if (ev.kind === 'jam') { ev.e.jam = 0; this.traffic.density = 1; }
    if (ev.kind === 'baraat') this.peds.endBaraat();
  }
}
