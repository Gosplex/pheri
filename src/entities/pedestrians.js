import * as THREE from 'three';
import { Rng, clamp, damp } from '../core/rng.js';
import { buildCowGeometry, buildDogGeometry, buildHorseGeometry } from './vehicleModels.js';
import { HumanRenderer, makeOutfit } from './humans.js';
import { zoneAt } from '../world/mapData.js';

const SHIRTS = [0xffffff, 0xf5f5f5, 0x1565c0, 0xc62828, 0x2e7d32, 0xf9a825, 0x6a1b9a, 0x37474f, 0xef6c00, 0x00838f, 0x8d6e63, 0x90caf9, 0xa5d6a7];
const SAREES = [0xd81b60, 0xf4511e, 0x8e24aa, 0x00897b, 0xfdd835, 0xc62828, 0x3949ab, 0xff7043, 0x43a047];
const PANTS = [0x263238, 0x3e2723, 0x1a237e, 0x4e342e, 0x212121, 0xbcaaa4, 0xf5f5f5];
const SKIN = [0x8d5524, 0xa0673a, 0xc68642, 0x7a4a26, 0xb57a4b, 0x9c6b43];

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

export class Pedestrians {
  constructor(scene, world, quality) {
    this.scene = scene; this.world = world; this.net = world.net;
    this.rng = new Rng(8080);
    this.max = quality === 'low' ? 60 : quality === 'high' ? 170 : 115;
    this.peds = [];
    this.humans = new HumanRenderer(scene, this.max + 40, quality);
    const lampGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    this.lampMat = new THREE.MeshBasicMaterial({ color: 0xffe08a, toneMapped: false });
    this.lamps = new THREE.InstancedMesh(lampGeo, this.lampMat, 24); this.lamps.count = 0; this.lamps.frustumCulled = false; scene.add(this.lamps);
    this.walkPaths = world.roads.walkPaths.filter((w) => !w.shoulder || this.rng.chance(0.3));
    this.special = []; // passengers waiting etc.
    this.baraat = null;
    this.onBump = null;

    // animals
    this.animals = [];
    this.cowGeos = [0, 1, 2, 3].map((i) => buildCowGeometry(i));
    this.dogGeos = [0, 1, 2].map((i) => buildDogGeometry(i));
    this.animalMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    this.horseGeo = buildHorseGeometry();
    this._spawnAnimals();
    // traffic police at the busiest signals
    for (const n of this.net.signals.slice(0, 5)) {
      const e = n.edges[0]; const d = this.net.dirAtNode(e, n);
      const p = this._newPed(n.x + d.z * (n.radius + 1.5) + d.x * 3, n.z - d.x * (n.radius + 1.5) + d.z * 3, 'idle', { persistent: true, kind: 'guard' });
      p.act = 'hips'; p.heading = Math.atan2(n.x - p.x, n.z - p.z);
    }
    // gully cricket in the society lanes
    this.cricket = [];
    const lanes = this.net.edges.filter((e) => e.cls === 'street' && zoneAt((e.a.x + e.b.x) / 2, (e.a.z + e.b.z) / 2).id === 'resi' && e.len > 90);
    for (let i = 0; i < 4 && lanes.length; i++) {
      const e = lanes[(i * 7) % lanes.length];
      const s = e.len * 0.5, q = this.net.sample(e, s);
      this.cricket.push({ e, s, x: q.x, z: q.z, tx: q.tx, tz: q.tz, members: [], props: null });
    }
    // campus security guards in khaki at the main gate
    for (const g of world.campus.guardPoints || []) {
      const p = this._newPed(g.x, g.z, 'idle', { persistent: true, kind: 'guard' });
      p.act = 'hips'; p.heading = -Math.PI / 2;
    }
  }

  _newPed(x, z, mode, extra = {}) {
    const r = this.rng;
    const zone = zoneAt(x, z).id;
    const outfit = extra.outfit || makeOutfit(r, { zone, hour: this.hour ?? 12, kind: extra.kind || null });
    const p = {
      x, z, heading: r.float(0, Math.PI * 2), speed: 0, mode, phase: r.float(0, 6), outfit, female: outfit.female,
      dodge: 0, dodgeX: 0, dodgeZ: 0, stumble: 0, idleT: r.float(0, 10), wave: 0, alive: true,
      act: mode === 'idle' ? r.weighted(['talk', 'phone', 'chai', 'hips', 'none'], (a) => ({ talk: 4, phone: 2.5, chai: 1.5, hips: 1, none: 1.5 })[a]) : 'none',
      ...extra,
    };
    this.peds.push(p);
    return p;
  }

  _spawnWalker(px, pz, near = false) {
    const r = this.rng;
    for (let a = 0; a < 10; a++) {
      const w = r.pick(this.walkPaths);
      const s = r.float(w.s0, w.s1);
      const side = r.chance(0.5) ? 1 : -1;
      const p = this.net.lanePoint(w.e, 0, s, side * w.lat, {});
      const d = Math.hypot(p.x - px, p.z - pz);
      if (d > 130 || d < (near ? 12 : 26)) continue;
      const h = this.hour;
      if ((h < 6 || h > 22.5) && r.chance(0.7)) continue;
      return this._newPed(p.x, p.z, 'walk', { w, s, side, dir: r.chance(0.5) ? 1 : -1, speed: r.float(1.0, 1.5) });
    }
    return null;
  }

  _spawnIdleGroup(x, z, n = 3) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const p = this._newPed(x + Math.cos(a) * 0.9, z + Math.sin(a) * 0.9, 'idle', { group: { x, z } });
      if (this._chaiGroup) p.act = this.rng.chance(0.7) ? 'chai' : 'talk';
      p.heading = Math.atan2(x - p.x, z - p.z);
    }
  }

  _spawnAnimals() {
    const r = this.rng;
    const spots = [];
    for (const e of this.net.edges) {
      if (e.cls === 'campus' || e.cls === 'ring') continue;
      if (r.chance(e.cls === 'highway' || e.cls === 'lane' || e.cls === 'street' ? 0.25 : 0.12)) {
        const s = r.float(e.trimA + 5, Math.max(e.trimA + 6, e.len - e.trimB - 5));
        const side = r.chance(0.5) ? 1 : -1;
        const p = this.net.lanePoint(e, 0, s, side * (e.hw + (e.spec.sidewalk > 0 ? e.spec.sidewalk + 1.2 : 1.8)), {});
        spots.push({ x: p.x, z: p.z, heading: Math.atan2(p.tx, p.tz) + (r.chance(0.5) ? 0 : Math.PI), e });
      }
    }
    spots.slice(0, 22).forEach((sp, i) => {
      const cow = i % 3 !== 2;
      const mesh = new THREE.Mesh(cow ? this.cowGeos[i % 4] : this.dogGeos[i % 3], this.animalMat);
      mesh.castShadow = true;
      mesh.position.set(sp.x, 0, sp.z); mesh.rotation.y = sp.heading;
      this.scene.add(mesh);
      this.animals.push({ kind: cow ? 'cow' : 'dog', mesh, x: sp.x, z: sp.z, heading: sp.heading, home: { x: sp.x, z: sp.z }, state: cow ? (r.chance(0.4) ? 'lie' : 'graze') : 'idle', t: r.float(0, 10), speed: 0, target: null, r: cow ? 1.0 : 0.4, tail: 0 });
      if (cow && this.animals[this.animals.length - 1].state === 'lie') mesh.position.y = -0.45;
    });
  }

  // Make a cow walk across a road near a point (random event)
  cowCrossing(x, z, e) {
    const a = this.animals.filter((q) => q.kind === 'cow').sort((p, q) => Math.hypot(p.x - x, p.z - z) - Math.hypot(q.x - x, q.z - z))[0];
    if (!a) return null;
    const near = this.net.nearest(x, z);
    const p = this.net.lanePoint(near.e, 0, near.s, near.e.hw + 2, {});
    const q = this.net.lanePoint(near.e, 0, near.s, -(near.e.hw + 2), {});
    a.x = p.x; a.z = p.z; a.state = 'cross'; a.target = { x: q.x, z: q.z }; a.speed = 0.7; a.mesh.position.y = 0;
    a.heading = Math.atan2(q.x - p.x, q.z - p.z);
    return a;
  }
  dogChase(x, z) {
    const d = this.animals.find((q) => q.kind === 'dog' && Math.hypot(q.x - x, q.z - z) < 180) || this.animals.find((q) => q.kind === 'dog');
    if (!d) return null;
    const near = this.net.nearest(x, z);
    const p = this.net.lanePoint(near.e, 0, near.s, near.e.hw + 2, {}), q = this.net.lanePoint(near.e, 0, near.s, -(near.e.hw + 3), {});
    d.x = p.x; d.z = p.z; d.state = 'dash'; d.target = { x: q.x, z: q.z }; d.speed = 5.5; d.heading = Math.atan2(q.x - p.x, q.z - p.z);
    return d;
  }

  // Wedding procession: dancers, light bearers and the decorated horse, moving along a road.
  startBaraat(e, dir) {
    if (this.baraat) return null;
    const horse = new THREE.Mesh(this.horseGeo, this.animalMat); horse.castShadow = true; this.scene.add(horse);
    const members = [];
    const s0 = dir === 0 ? e.trimA + 6 : e.trimB + 6;
    for (let i = 0; i < 18; i++) {
      const kind = i >= 14 ? 'worker' : i % 2 ? 'groomParty' : (i % 4 === 0 ? 'chaniya' : 'saree');
      this._newPed(0, 0, 'baraat', { bs: s0 + (i % 6) * 0.9, blat: -1.6 + Math.floor(i / 6) * 1.1 + this.rng.float(-0.3, 0.3), lampBearer: i >= 14, kind });
      members.push(p);
    }
    this.baraat = { e, dir, s: s0 + 8, horse, members, t: 0 };
    return this.baraat;
  }
  endBaraat() {
    if (!this.baraat) return;
    this.scene.remove(this.baraat.horse);
    for (const m of this.baraat.members) m.alive = false;
    this.baraat = null;
  }

  // Passenger waiting at a pickup spot, waving
  spawnWaiting(x, z, heading) {
    const p = this._newPed(x, z, 'waiting', { persistent: true });
    p.heading = heading; return p;
  }
  despawn(p) { p.alive = false; }

  update(dt, player, hour, traffic) {
    this.hour = hour;
    const P = player.pos;
    const pSpeed0 = player.speed;
    const night = hour < 6 || hour > 21;
    const target = Math.round(this.max * (night ? 0.35 : hour < 8 ? 0.6 : 1));
    // cull far or dead
    this.peds = this.peds.filter((p) => p.alive && (p.persistent || p.mode === 'baraat' || Math.hypot(p.x - P.x, p.z - P.z) < 170));
    let n = 0;
    while (this.peds.length < target && n < 4) {
      const r = this.rng.next();
      if (r < 0.8) this._spawnWalker(P.x, P.z, this.peds.length < 10);
      else {
        // idle groups near shops / stalls / campus
        const cands = [...this.world.pois.filter((q) => q.shop || q.kind === 'campus' || q.kind === 'hostel'), ...this.world.props.stalls.filter((s) => !s.night || night)];
        const q = this.rng.pick(cands);
        const d = Math.hypot(q.x - P.x, q.z - P.z);
        this._chaiGroup = !!q.kind && (q.kind === 'tea' || q.kind === 'chai' || q.kind === 'food');
        if (d < 130 && d > 16) this._spawnIdleGroup(q.x + this.rng.float(-2, 2), q.z + this.rng.float(-2, 2), this.rng.int(2, 4));
      }
      n++;
    }

    // gully cricket: kids play in the daytime, run off the road for the rider
    for (const c of this.cricket) {
      const on = hour > 8 && hour < 18.5 && Math.hypot(c.x - P.x, c.z - P.z) < 160;
      if (on && !c.members.length) {
        const kinds = ['schoolboy', 'student', 'schoolboy', 'schoolboy', 'student'];
        for (let i = 0; i < 5; i++) {
          const along = [0, 14, 6, -5, 20][i], side = [0, 0, 3, -2.5, 2][i];
          const x = c.x + c.tx * along + c.tz * side, z = c.z + c.tz * along - c.tx * side;
          const m = this._newPed(x, z, i === 1 ? 'bowl' : 'idle', { persistent: true, kind: kinds[i], cricket: c, home: { x, z } });
          m.act = i === 0 ? 'bat' : 'field'; m.heading = Math.atan2(c.tx, c.tz) + (i === 0 ? 0 : Math.PI);
          c.members.push(m);
        }
        const g = new THREE.Group();
        for (const along of [-0.6, 17]) for (let k = -1; k <= 1; k++) {
          const st = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 5), this.animalMat);
          st.position.set(c.x + c.tx * along + c.tz * k * 0.1, 0.35, c.z + c.tz * along - c.tx * k * 0.1); g.add(st);
        }
        this.scene.add(g); c.props = g;
      } else if (!on && c.members.length) { for (const m of c.members) m.alive = false; c.members = []; if (c.props) this.scene.remove(c.props); c.props = null; }
      for (const m of c.members) {
        if (m.mode === 'bowl') {
          m.bowlT = (m.bowlT || 0) + dt;
          const ph = (m.bowlT % 6) / 6; // walk back, run in, deliver
          const along = ph < 0.5 ? 14 + ph * 2 * 6 : 20 - (ph - 0.5) * 2 * 8;
          m.x = c.x + c.tx * along; m.z = c.z + c.tz * along;
          m.speed = ph < 0.5 ? 1.0 : 3.2;
          m.heading = Math.atan2(c.tx, c.tz) + (ph < 0.5 ? 0 : Math.PI);
        }
        // step off the road when the rider comes close
        const dd = Math.hypot(m.x - P.x, m.z - P.z);
        if (dd < 12 && Math.abs(pSpeed0) > 2 && m.mode !== 'bowl') { m.dodge = 0.3; m.dodgeX = c.tz; m.dodgeZ = -c.tx; }
      }
    }

    const obstacles = [];
    const pfx = Math.sin(player.heading), pfz = Math.cos(player.heading);
    const pSpeed = player.speed;
    for (const p of this.peds) {
      p.phase += dt * (p.speed * 5.5 + 0.1);
      if (p.stumble > 0) { p.stumble -= dt; continue; }
      // react to the rider: step aside when he comes fast, jump when he honks
      const dx = p.x - P.x, dz = p.z - P.z, d = Math.hypot(dx, dz);
      if (d < 14 && pSpeed > 2.5) {
        const f = dx * pfx + dz * pfz, l = dx * pfz - dz * pfx;
        if (f > 0 && f < 12 && Math.abs(l) < 1.6 && (player.hornPressed || f < 6)) {
          const side = l >= 0 ? 1 : -1;
          p.dodge = 0.6; p.dodgeX = pfz * side; p.dodgeZ = -pfx * side;
        }
      }
      if (p.dodge > 0) { p.dodge -= dt; p.x += p.dodgeX * 3.2 * dt; p.z += p.dodgeZ * 3.2 * dt; }

      if (p.mode === 'walk') {
        const w = p.w;
        p.s += p.dir * p.speed * dt;
        if (p.s > w.s1 || p.s < w.s0) {
          p.dir *= -1; p.s = clamp(p.s, w.s0, w.s1);
          if (this.rng.chance(0.35) && w.e.cls !== 'highway') { // cross the road
            p.mode = 'cross'; p.crossT = 0; p.crossFrom = p.side * w.lat; p.crossTo = -p.side * w.lat; p.speed = 1.3;
          }
        }
        if (p.mode === 'walk' && p.dodge <= 0) {
          const q = this.net.lanePoint(w.e, 0, p.s, p.side * w.lat, {});
          p.x = damp(p.x, q.x, 8, dt); p.z = damp(p.z, q.z, 8, dt);
          p.heading = Math.atan2(q.tx * p.dir, q.tz * p.dir);
        }
      } else if (p.mode === 'cross') {
        const w = p.w;
        const span = Math.abs(p.crossTo - p.crossFrom);
        p.crossT += (p.speed * dt) / span;
        // wait if a vehicle is close
        const lat = p.crossFrom + (p.crossTo - p.crossFrom) * clamp(p.crossT, 0, 1);
        const q = this.net.lanePoint(w.e, 0, p.s, lat, {});
        p.x = q.x; p.z = q.z;
        p.heading = Math.atan2(q.tz * Math.sign(p.crossFrom - p.crossTo), -q.tx * Math.sign(p.crossFrom - p.crossTo));
        obstacles.push({ x: p.x, z: p.z, r: 0.5 });
        if (p.crossT >= 1) { p.mode = 'walk'; p.side = -p.side; p.speed = this.rng.float(1.0, 1.5); }
      } else if (p.mode === 'idle' || p.mode === 'waiting') {
        p.speed = 0; p.idleT += dt;
        if (p.mode === 'waiting') p.wave += dt;
      } else if (p.mode === 'baraat') {
        p.speed = 0.4;
      }
      if (d < 3 && p.mode !== 'baraat') obstacles.push({ x: p.x, z: p.z, r: 0.4 });
    }

    // Baraat procession moves slowly and plays dhol
    if (this.baraat) {
      const B = this.baraat;
      B.t += dt;
      B.s += 0.9 * dt;
      const e = B.e;
      const endS = B.dir === 0 ? e.len - e.trimB : e.len - e.trimA;
      if (B.s > endS + 6 || B.t > 150) this.endBaraat();
      else {
        const hp = this.net.lanePoint(e, B.dir, Math.min(B.s, endS), this.net.laneOffset(e, e.spec.lanes - 1), {});
        B.horse.position.set(hp.x, Math.abs(Math.sin(B.t * 3)) * 0.05, hp.z); B.horse.rotation.y = Math.atan2(hp.tx, hp.tz);
        B.pos = { x: hp.x, z: hp.z };
        obstacles.push({ x: hp.x, z: hp.z, r: 2.5 });
        for (const m of B.members) {
          const q = this.net.lanePoint(e, B.dir, Math.min(B.s - 3 - m.bs + (B.dir === 0 ? e.trimA : e.trimB), endS), this.net.laneOffset(e, e.spec.lanes - 1) + m.blat, {});
          m.x = q.x + Math.sin(B.t * 2 + m.phase) * 0.3; m.z = q.z; m.heading = Math.atan2(q.tx, q.tz) + Math.sin(B.t * 3 + m.phase) * 0.8;
          m.phase += dt * 6;
        }
        const back = this.net.lanePoint(e, B.dir, Math.max(0, B.s - 8), this.net.laneOffset(e, e.spec.lanes - 1), {});
        obstacles.push({ x: back.x, z: back.z, r: 3 });
      }
    }

    // Animals
    for (const a of this.animals) {
      a.t += dt;
      if (a.state === 'cross' || a.state === 'dash') {
        const dx = a.target.x - a.x, dz = a.target.z - a.z, dd = Math.hypot(dx, dz);
        if (dd < 0.3) { a.state = a.kind === 'cow' ? 'graze' : 'idle'; a.speed = 0; }
        else { a.x += (dx / dd) * a.speed * dt; a.z += (dz / dd) * a.speed * dt; a.heading = Math.atan2(dx, dz); }
        obstacles.push({ x: a.x, z: a.z, r: a.r + 0.3 });
      } else if (a.kind === 'dog' && Math.hypot(a.x - P.x, a.z - P.z) < 10 && Math.abs(pSpeed) > 4 && this.rng.chance(dt * 0.3)) {
        // chase the bike a little, like every street dog ever
        a.state = 'dash'; a.target = { x: P.x + pfx * 6, z: P.z + pfz * 6 }; a.speed = 6;
      } else if (a.state === 'graze' && this.rng.chance(dt * 0.02)) {
        a.heading += this.rng.float(-0.8, 0.8);
      }
      a.mesh.position.x = a.x; a.mesh.position.z = a.z; a.mesh.rotation.y = a.heading;
      if (a.state === 'cross' || a.state === 'dash') a.mesh.position.y = Math.abs(Math.sin(a.t * (a.kind === 'dog' ? 14 : 4))) * 0.04;
      if (Math.hypot(a.x - P.x, a.z - P.z) < 40) obstacles.push({ x: a.x, z: a.z, r: a.r });
    }
    if (traffic) traffic.obstacles = obstacles;
    this._render(hour);
  }

  // Player collision against peds and animals (soft: they stumble / you stop)
  collidePlayer(c, r) {
    let hit = null;
    for (const p of this.peds) {
      const dx = c.x - p.x, dz = c.z - p.z, d = Math.hypot(dx, dz), R = r + 0.3;
      if (d < R && d > 1e-4) {
        const nx = dx / d, nz = dz / d;
        c.x += nx * (R - d) * 0.6; c.z += nz * (R - d) * 0.6;
        p.x -= nx * (R - d) * 0.4; p.z -= nz * (R - d) * 0.4;
        if (p.stumble <= 0) { p.stumble = 1.0; this.onBump?.(p); }
        hit = { nx, nz, depth: R - d, ped: p };
      }
    }
    for (const a of this.animals) {
      const dx = c.x - a.x, dz = c.z - a.z, d = Math.hypot(dx, dz), R = r + a.r;
      if (d < R && d > 1e-4) {
        const nx = dx / d, nz = dz / d; c.x += nx * (R - d); c.z += nz * (R - d);
        hit = { nx, nz, depth: R - d, animal: a };
      }
    }
    return hit;
  }

  _render(hour) {
    const H = this.humans;
    H.begin();
    let li = 0;
    const cam = this.camPos;
    for (const p of this.peds) {
      H.draw(p, cam);
      if (p.lampBearer && li < 24) {
        _m2.compose(_v.set(p.x, 2.25 * p.outfit.scale, p.z), _q.identity(), _s.set(1, 1, 1));
        this.lamps.setMatrixAt(li++, _m2);
      }
    }
    H.end();
    this.lamps.count = li; this.lamps.instanceMatrix.needsUpdate = true;
  }
}
