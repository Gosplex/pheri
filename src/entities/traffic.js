import * as THREE from 'three';
import { Rng, clamp, damp } from '../core/rng.js';
import { buildVehicleGeometry, VEHICLE_SPECS } from './vehicleModels.js';

const MIX = {
  highway:  { truck: 18, bus: 7, hatch: 12, sedan: 10, suv: 10, bike: 20, auto: 7, tempo: 10, scooter: 4 },
  arterial: { bike: 28, scooter: 18, auto: 16, hatch: 10, sedan: 8, suv: 7, bus: 5, tempo: 5, truck: 2 },
  ring:     { bike: 28, scooter: 16, auto: 16, hatch: 12, sedan: 8, suv: 8, bus: 5, tempo: 5, truck: 3 },
  street:   { bike: 33, scooter: 30, auto: 15, hatch: 10, sedan: 5, suv: 4, tempo: 3 },
  lane:     { bike: 45, scooter: 42, auto: 13 },
  campus:   { bike: 36, scooter: 36, hatch: 12, suv: 8, campusbus: 4 },
};
const VARIANTS = { bike: 6, scooter: 6, auto: 3, hatch: 5, sedan: 4, suv: 4, tempo: 3, bus: 2, truck: 4, campusbus: 1 };

function bezier(p0, p1, p2, p3, t, out) {
  const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  out.x = a * p0.x + b * p1.x + c * p2.x + d * p3.x;
  out.z = a * p0.z + b * p1.z + c * p2.z + d * p3.z;
  const da = -3 * u * u, db = 3 * u * u - 6 * u * t, dc = 6 * u * t - 3 * t * t, dd = 3 * t * t;
  out.tx = da * p0.x + db * p1.x + dc * p2.x + dd * p3.x; out.tz = da * p0.z + db * p1.z + dc * p2.z + dd * p3.z;
  const l = Math.hypot(out.tx, out.tz) || 1; out.tx /= l; out.tz /= l;
  return out;
}

export class Traffic {
  constructor(scene, world, mats, audio, quality) {
    this.scene = scene; this.world = world; this.net = world.net; this.mats = mats; this.audio = audio;
    this.rng = new Rng(31337);
    this.max = quality === 'low' ? 28 : quality === 'high' ? 70 : 48;
    this.radius = quality === 'low' ? 230 : 300;
    this.vehicles = [];
    this.pool = {};
    this.geo = {};
    for (const [k, n] of Object.entries(VARIANTS)) {
      this.geo[k] = [];
      for (let i = 0; i < n; i++) this.geo[k].push(buildVehicleGeometry(k, i, world.atlas));
    }
    this.edgeWeights = this.net.edges.map((e) => e.len * ({ highway: 1.2, arterial: 1.4, ring: 1.6, street: 0.7, lane: 0.45, campus: 0.5 }[e.cls]));
    this.obstacles = []; // {x,z,r} set by pedestrians/animals/events each frame
    this.hornEvents = [];
    this._tmp = {};
    this.player = null;
    this.density = 1;
  }

  _mesh(kind, variant) {
    const key = kind + variant;
    const pool = this.pool[key] || (this.pool[key] = []);
    if (pool.length) { const g = pool.pop(); g.visible = true; return g; }
    const G = this.geo[kind][variant];
    const g = new THREE.Group();
    const body = new THREE.Mesh(G.body, this.mats.vehicle); body.castShadow = true; body.receiveShadow = false; g.add(body);
    if (G.lights) g.add(new THREE.Mesh(G.lights, this.mats.vehLights));
    if (G.sign) g.add(new THREE.Mesh(G.sign, this.mats.sign));
    g.userData.key = key;
    this.scene.add(g);
    return g;
  }
  _release(v) { v.mesh.visible = false; (this.pool[v.mesh.userData.key] || (this.pool[v.mesh.userData.key] = [])).push(v.mesh); }

  spawn(px, pz, camFx, camFz, forceNear = false) {
    const rng = this.rng;
    for (let attempt = 0; attempt < 12; attempt++) {
      const e = rng.weighted(this.net.edges.map((e, i) => i), (i) => this.edgeWeights[i] * this._zoneWeight(this.net.edges[i]));
      const edge = this.net.edges[e];
      const s = rng.float(edge.trimA + 2, Math.max(edge.trimA + 3, edge.len - edge.trimB - 2));
      const dir = edge.oneway ? 0 : rng.int(0, 1);
      const p = this.net.lanePoint(edge, dir, dir === 0 ? s : edge.len - s, 0, this._tmp);
      const dx = p.x - px, dz = p.z - pz, d = Math.hypot(dx, dz);
      const minD = forceNear ? 25 : 90;
      if (d < minD || d > this.radius - 20) continue;
      if (!forceNear && d < 160 && (dx * camFx + dz * camFz) / d > 0.2) continue; // don't pop in view
      const kind = this._pickKind(edge);
      const spec = VEHICLE_SPECS[kind];
      const ss = dir === 0 ? s : edge.len - s;
      if (this._occupied(edge, dir, ss, spec.len + 3)) continue;
      const lanes = edge.spec.lanes;
      const slow = kind === 'auto' || kind === 'truck' || kind === 'bus' || kind === 'tempo' || kind === 'scooter';
      const lane = lanes > 1 ? (slow ? lanes - 1 : rng.int(0, lanes - 1)) : 0;
      const variant = rng.int(0, VARIANTS[kind] - 1);
      const v = {
        kind, spec, variant, mesh: this._mesh(kind, variant), edge, dir, s: ss, lane,
        lat: this.net.laneOffset(edge, lane), latOff: (kind === 'bike' || kind === 'scooter') ? rng.float(-0.7, 0.7) : rng.float(-0.15, 0.15),
        speed: 0, personality: rng.float(0.85, 1.15) * spec.speed, state: 'drive', turn: null, x: p.x, z: p.z, heading: 0,
        blocked: 0, honkCd: rng.float(2, 6), pull: 0, pullCd: rng.float(10, 40), makeWay: 0, stopped: 0, id: Math.random(),
      };
      v.speed = Math.min(edge.spec.speed * v.personality, 8);
      this.vehicles.push(v);
      edge.vehicles[dir].push(v);
      this._pose(v);
      return v;
    }
    return null;
  }

  _zoneWeight(e) {
    const h = this.hour ?? 12;
    const rush = (h > 8 && h < 11) || (h > 17 && h < 21) ? 1.3 : 1;
    const night = h < 6 || h > 22.5 ? 0.35 : 1;
    const campus = e.cls === 'campus' ? (h > 8 && h < 18 ? 1 : 0.3) : 1;
    return rush * night * campus * (e.cls === 'highway' && (h < 6 || h > 22) ? 2.2 : 1);
  }

  _pickKind(e) {
    const mix = MIX[e.cls] || MIX.street;
    const h = this.hour ?? 12;
    const keys = Object.keys(mix);
    return this.rng.weighted(keys, (k) => mix[k] * (k === 'truck' && (h < 6 || h > 21) ? 2.5 : 1) * (k === 'campusbus' && (h < 7 || h > 20) ? 0 : 1));
  }

  _occupied(edge, dir, s, gap) { return edge.vehicles[dir].some((o) => Math.abs(o.s - s) < gap); }

  _remove(v, i) {
    const list = v.edge.vehicles[v.dir]; const k = list.indexOf(v); if (k >= 0) list.splice(k, 1);
    this._release(v);
    this.vehicles.splice(i, 1);
  }

  // choose next edge when arriving at a node
  _nextEdge(v) {
    const node = v.dir === 0 ? v.edge.b : v.edge.a;
    const options = node.edges.filter((e) => e !== v.edge && this.net.canTravel(e, node));
    if (!options.length) return null;
    // prefer going straight on big roads
    const din = this.net.dirAtNode(v.edge, node); // points away from node back along the edge we came from
    return { node, e: this.rng.weighted(options, (e) => {
      const d = this.net.dirAtNode(e, node);
      const straight = -(d.x * din.x + d.z * din.z); // 1 = straight on
      let w = 1 + Math.max(0, straight) * 2.2;
      if (e.cls === 'lane' && v.spec.len > 3) w *= 0.05; // big vehicles avoid old-city lanes
      if (e.cls === 'campus' && v.kind === 'truck') w = 0.001;
      if (e.b.type === 'edge' || e.a.type === 'edge') w *= 0.6;
      return w;
    }) };
  }

  _beginTurn(v) {
    const nx = this._nextEdge(v);
    if (!nx) return false;
    const { node, e } = nx;
    const dir = e.a === node ? 0 : 1;
    const lanes = e.spec.lanes;
    const lane = lanes > 1 ? Math.min(v.lane, lanes - 1) : 0;
    const startS = dir === 0 ? e.trimA : e.trimB;
    const p0 = { x: v.x, z: v.z };
    const t0 = { x: Math.sin(v.heading), z: Math.cos(v.heading) };
    const lat = this.net.laneOffset(e, lane) + v.latOff * 0.3;
    const p3 = this.net.lanePoint(e, dir, startS, lat, {});
    const d = Math.hypot(p3.x - p0.x, p3.z - p0.z);
    const p1 = { x: p0.x + t0.x * d * 0.4, z: p0.z + t0.z * d * 0.4 };
    const p2 = { x: p3.x - p3.tx * d * 0.4, z: p3.z - p3.tz * d * 0.4 };
    let len = 0, prev = p0; const tmp = {};
    for (let i = 1; i <= 8; i++) { bezier(p0, p1, p2, p3, i / 8, tmp); len += Math.hypot(tmp.x - prev.x, tmp.z - prev.z); prev = { x: tmp.x, z: tmp.z }; }
    v.turn = { p0, p1, p2, p3, t: 0, len: Math.max(len, 0.5), e, dir, lane, startS, node, lat };
    v.state = 'turning';
    const list = v.edge.vehicles[v.dir]; const k = list.indexOf(v); if (k >= 0) list.splice(k, 1);
    return true;
  }

  _pose(v) {
    const m = v.mesh;
    m.position.set(v.x, 0, v.z);
    m.rotation.y = v.heading;
  }

  update(dt, player, cam, hour, nightFactor) {
    this.hour = hour;
    const net = this.net;
    // density by time of day
    const h = hour;
    let dens = 0.55;
    if (h >= 6 && h < 8) dens = 0.7; else if (h >= 8 && h < 11) dens = 1.0; else if (h >= 11 && h < 17) dens = 0.8;
    else if (h >= 17 && h < 21) dens = 1.0; else if (h >= 21 && h < 23) dens = 0.6; else dens = 0.3;
    const target = Math.round(this.max * dens * this.density);
    const camF = cam ? { x: Math.sin(cam.yaw), z: Math.cos(cam.yaw) } : { x: 0, z: 1 };
    let spawned = 0;
    while (this.vehicles.length < target && spawned < 3) { if (!this.spawn(player.pos.x, player.pos.z, camF.x, camF.z, this.vehicles.length < 6)) break; spawned++; }

    // sort per-edge lists
    for (const v of this.vehicles) if (v.state !== 'turning') { /* lists maintained */ }
    const touched = new Set();
    for (const v of this.vehicles) if (v.state !== 'turning') touched.add(v.edge);
    for (const e of touched) { e.vehicles[0].sort((a, b) => a.s - b.s); e.vehicles[1].sort((a, b) => a.s - b.s); }

    const P = player.pos, pSpeed = player.speed;
    const pfx = Math.sin(player.heading), pfz = Math.cos(player.heading);
    this.nearCount = 0;
    const hornNow = player.hornPressed;

    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];
      const dxp = v.x - P.x, dzp = v.z - P.z, dP = Math.hypot(dxp, dzp);
      if (dP > this.radius + 60) { this._remove(v, i); continue; }
      if (dP < 45) this.nearCount++;
      const spec = v.spec;
      const e = v.edge;
      const road = v.state === 'turning' ? v.turn.e : e;
      let v0 = road.spec.speed * v.personality * (road.jam > 0 ? 0.25 : 1);
      if (v.kind === 'auto') v0 = Math.min(v0, 11); if (v.kind === 'truck' || v.kind === 'bus') v0 = Math.min(v0, 14);
      if (v.state === 'turning') v0 = Math.min(v0, 6.5);
      const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
      const lx = fz, lz = -fx; // left
      let gap = 999;

      // leader on the same edge
      if (v.state === 'drive') {
        const list = e.vehicles[v.dir];
        const idx = list.indexOf(v);
        for (let k = idx + 1; k < list.length && k < idx + 5; k++) {
          const o = list[k];
          if (Math.abs(o.lat - v.lat) < (o.spec.wid + spec.wid) / 2 + 0.25) { gap = Math.min(gap, o.s - v.s - (o.spec.len + spec.len) / 2); break; }
        }
        // look past the node into turning vehicles
        const endS = v.dir === 0 ? e.len - e.trimB : e.len - e.trimA;
        const toEnd = endS - v.s;
        if (toEnd < 18) {
          const node = v.dir === 0 ? e.b : e.a;
          // traffic light
          const light = net.signalFor(node, e);
          if (light === 'red' || (light === 'amber' && toEnd > 6)) gap = Math.min(gap, toEnd - 4.2);
          // yield to vehicles already crossing
          for (const o of this.vehicles) {
            if (o !== v && o.state === 'turning' && o.turn.node === node) {
              const dd = Math.hypot(o.x - v.x, o.z - v.z);
              if (dd < 9 && ((o.x - v.x) * fx + (o.z - v.z) * fz) > 0) gap = Math.min(gap, dd - (o.spec.len + spec.len) / 2);
            }
          }
        }
      } else if (v.state === 'turning') {
        for (const o of this.vehicles) {
          if (o === v) continue;
          const dx = o.x - v.x, dz = o.z - v.z;
          const f = dx * fx + dz * fz; const l = Math.abs(dx * lx + dz * lz);
          if (f > 0 && f < 10 && l < (o.spec.wid + spec.wid) / 2 + 0.2) gap = Math.min(gap, f - (o.spec.len + spec.len) / 2);
        }
      }
      // the player and other obstacles directly ahead
      {
        const f = -dxp * fx + -dzp * fz, l = -dxp * lx + -dzp * lz;
        if (f > 0 && f < 35 && Math.abs(l) < spec.wid / 2 + 0.9) gap = Math.min(gap, f - spec.len / 2 - 1.2);
        for (const ob of this.obstacles) {
          const ox = ob.x - v.x, oz = ob.z - v.z;
          const f2 = ox * fx + oz * fz; if (f2 < 0 || f2 > 30) continue;
          const l2 = ox * lx + oz * lz;
          if (Math.abs(l2) < spec.wid / 2 + ob.r + 0.4) gap = Math.min(gap, f2 - spec.len / 2 - ob.r - 0.8);
        }
      }
      // pull over behaviour (autos drop passengers, buses stop)
      v.pullCd -= dt;
      if (v.pull > 0) { v.pull -= dt; v0 = v.pull > 1 ? 0 : v0 * 0.4; }
      else if (v.pullCd < 0 && v.state === 'drive' && (v.kind === 'auto' || v.kind === 'bus') && e.cls !== 'highway') {
        v.pullCd = this.rng.float(25, 60); if (this.rng.chance(0.6)) v.pull = this.rng.float(4, 8);
      }

      // speed control (simplified IDM)
      const minGap = 1.2 + spec.len * 0.1;
      const safe = gap < 998 ? Math.max(0, (gap - minGap)) / 1.1 : 999;
      const tv = Math.max(0, Math.min(v0, safe));
      const acc = 2.2 / Math.max(1, spec.mass * 0.25), dec = gap < 3 ? 12 : 6;
      v.speed += clamp(tv - v.speed, -dec * dt, acc * dt);
      if (v.speed < 0) v.speed = 0;

      // honking when blocked, very Rajkot
      if (v.speed < 1 && gap < 6 && tv < 0.5) v.blocked += dt; else v.blocked = Math.max(0, v.blocked - dt);
      v.honkCd -= dt;
      const blockedByPlayer = dP < 16 && ((-dxp * fx - dzp * fz) > 0);
      if (v.honkCd < 0 && (v.blocked > 1.2 || (blockedByPlayer && v.speed < 2 && this.rng.chance(0.4)) || this.rng.chance(dt * 0.02))) {
        v.honkCd = this.rng.float(3, 9);
        const pan = clamp((dxp * -pfz + dzp * pfx) / Math.max(dP, 1), -1, 1) * -1;
        if (dP < 120) this.audio?.npcHorn(spec.horn, pan, dP);
      }
      // make way when the player honks behind
      if (hornNow && dP < 25) {
        const rel = (P.x - v.x) * fx + (P.z - v.z) * fz;
        if (rel < 0) v.makeWay = 2.5;
      }
      v.makeWay = Math.max(0, v.makeWay - dt);

      // lateral target
      let latT;
      if (v.state === 'drive') {
        latT = net.laneOffset(e, v.lane) + v.latOff;
        const outer = net.laneOffset(e, e.spec.lanes - 1) + e.spec.laneW * 0.35;
        if (v.pull > 0 || v.makeWay > 0) latT = outer + (v.pull > 0 ? 0.6 : 0.2);
        // construction / blocked lanes
        if (e.blocked && e.blocked.dir === v.dir) {
          const b = e.blocked;
          if (v.s > b.s0 - 25 && v.s < b.s1) {
            if (e.spec.lanes > 1 && v.lane === b.lane) v.lane = b.lane === 0 ? 1 : 0;
            else if (e.spec.lanes === 1) { latT = net.laneOffset(e, 0) - e.spec.laneW * 0.6; v0 = Math.min(v0, 3); }
          }
        }
        // bikes filter through stopped traffic
        if ((v.kind === 'bike' || v.kind === 'scooter') && gap < 8 && v.speed < 3) v.latOff = clamp(v.latOff + (v.latOff >= 0 ? 1 : -1) * dt * 0.8, -1.2, 1.4);
        v.lat = damp(v.lat, latT, 1.6, dt);
      }

      // advance
      if (v.state === 'drive') {
        v.s += v.speed * dt;
        const endS = v.dir === 0 ? e.len - e.trimB : e.len - e.trimA;
        if (v.s >= endS) {
          const node = v.dir === 0 ? e.b : e.a;
          if (node.type === 'edge' || !this._beginTurn(v)) { this._remove(v, i); continue; }
        } else {
          net.lanePoint(e, v.dir, v.s, v.lat, this._tmp);
          v.x = this._tmp.x; v.z = this._tmp.z;
          v.heading = Math.atan2(this._tmp.tx, this._tmp.tz);
        }
      }
      if (v.state === 'turning') {
        const T = v.turn;
        T.t += (v.speed * dt) / T.len;
        if (T.t >= 1) {
          v.edge = T.e; v.dir = T.dir; v.lane = T.lane; v.s = T.startS; v.lat = T.lat; v.state = 'drive'; v.turn = null;
          v.edge.vehicles[v.dir].push(v);
        } else {
          bezier(T.p0, T.p1, T.p2, T.p3, T.t, this._tmp);
          v.x = this._tmp.x; v.z = this._tmp.z; v.heading = Math.atan2(this._tmp.tx, this._tmp.tz);
        }
      }
      this._pose(v);
      // two-wheelers lean into turns
      if (v.kind === 'bike' || v.kind === 'scooter') {
        const prev = v._ph ?? v.heading; let dh = v.heading - prev; if (dh > Math.PI) dh -= 2 * Math.PI; if (dh < -Math.PI) dh += 2 * Math.PI;
        v._lean = damp(v._lean || 0, clamp(-(dh / Math.max(dt, 1e-3)) * v.speed * 0.08, -0.5, 0.5), 6, dt);
        v.mesh.rotation.z = v._lean; v._ph = v.heading;
      }
    }
  }

  // Resolve a player circle against nearby vehicles (capsules). Returns contact or null.
  collidePlayer(c, r) {
    let hit = null;
    for (const v of this.vehicles) {
      const dx = c.x - v.x, dz = c.z - v.z;
      if (dx * dx + dz * dz > (v.spec.len + 3) ** 2) continue;
      const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
      const half = Math.max(0, v.spec.len / 2 - v.spec.wid / 2);
      let t = dx * fx + dz * fz; t = clamp(t, -half, half);
      const px = v.x + fx * t, pz = v.z + fz * t;
      const ex = c.x - px, ez = c.z - pz, d = Math.hypot(ex, ez), R = r + v.spec.wid / 2;
      if (d < R && d > 1e-4) {
        const nx = ex / d, nz = ez / d, depth = R - d;
        c.x += nx * depth; c.z += nz * depth;
        v.speed *= 0.3; v.blocked = 2;
        hit = { nx, nz, depth, vehicle: v };
      }
    }
    return hit;
  }

  clear() { for (let i = this.vehicles.length - 1; i >= 0; i--) this._remove(this.vehicles[i], i); }
}
