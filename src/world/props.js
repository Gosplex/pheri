import * as THREE from 'three';
import { MeshBuilder, V3 } from '../core/geom.js';
import { Rng } from '../core/rng.js';
import { CELL } from './spatial.js';
import { FUEL_STATIONS, RING } from './mapData.js';
import { radialTexture } from '../core/textures.js';
import { buildVehicleGeometry } from '../entities/vehicleModels.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _c = new THREE.Color();

function instanced(geo, mat, list, fn, { cast = false, receive = false } = {}) {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  im.count = list.length;
  list.forEach((it, i) => { fn(it, _m, i); im.setMatrixAt(i, _m); });
  im.instanceMatrix.needsUpdate = true;
  im.castShadow = cast; im.receiveShadow = receive;
  im.computeBoundingSphere();
  return im;
}
const compose = (x, y, z, ry, sx = 1, sy = 1, sz = 1, rx = 0) => { _e.set(rx, ry, 0, 'YXZ'); _q.setFromEuler(_e); return _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)); };

export function buildProps(ctx, roads, campus) {
  const { net, grid, collision, atlas, mats, B } = ctx;
  const rng = new Rng(555);
  const group = new THREE.Group(); group.name = 'props';
  const nightGroup = new THREE.Group(); nightGroup.name = 'night-only';
  const out = { group, nightGroup, lampMat: null, poolMat: null, signals: [], fuelZones: [], stalls: [], temples: [], busStops: [] };

  // ---- Streetlights ----------------------------------------------------------------------
  const poleMB = { single: new MeshBuilder(), double: new MeshBuilder(), wall: new MeshBuilder() };
  poleMB.single.cylinder(0, 3.8, 0, 0.09, 7.6, 0x7c8388, 6).box(0, 7.55, 0.8, 0.08, 0.08, 1.7, 0, 0x7c8388).box(0, 7.45, 1.6, 0.34, 0.14, 0.7, 0, 0x4a4f53);
  poleMB.double.cylinder(0, 4.5, 0, 0.12, 9, 0x8a9196, 6).cylinder(0, 0.3, 0, 0.3, 0.6, 0x5d6468, 8)
    .box(1.6, 8.9, 0, 3.2, 0.09, 0.09, 0, 0x8a9196).box(-1.6, 8.9, 0, 3.2, 0.09, 0.09, 0, 0x8a9196)
    .box(3.1, 8.8, 0, 0.8, 0.16, 0.36, 0, 0x4a4f53).box(-3.1, 8.8, 0, 0.8, 0.16, 0.36, 0, 0x4a4f53);
  poleMB.wall.cylinder(0, 2.6, 0, 0.07, 5.2, 0x6b6b6b, 5).box(0, 5.15, 0.5, 0.06, 0.06, 1.0, 0, 0x6b6b6b).box(0, 5.05, 0.95, 0.24, 0.12, 0.4, 0, 0x3a3a3a);
  const lampGeo = new THREE.BoxGeometry(0.5, 0.06, 0.28);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0x444444, toneMapped: false });
  out.lampMat = lampMat;
  const poolTex = radialTexture('rgba(255,214,150,1)', 'rgba(255,200,120,0)');
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
  out.poolMat = poolMat;
  const poolGeo = new THREE.PlaneGeometry(1, 1); poolGeo.rotateX(-Math.PI / 2);
  const lampPts = [], pools = [];
  const byType = { single: [], double: [], wall: [] };
  for (const l of roads.streetlights) {
    if (grid.get(l.x, l.z) === CELL.BUILDING && l.type !== 'double') continue;
    byType[l.type].push(l);
    const c = Math.cos(l.rot), s = Math.sin(l.rot);
    const w = (lx, lz) => [l.x + lx * c + lz * s, l.z - lx * s + lz * c];
    if (l.type === 'double') {
      for (const sg of [-1, 1]) { const [x, z] = w(sg * 3.1, 0); lampPts.push([x, 8.7, z, l.rot + Math.PI / 2]); const [px, pz] = w(sg * 4.5, 0); pools.push([px, pz, 11]); }
      collision.addCircle(l.x, l.z, 0.35, 9, 'pole');
    } else if (l.type === 'single') {
      const [x, z] = w(0, 1.6); lampPts.push([x, 7.37, z, l.rot]); const [px, pz] = w(0, 3.5); pools.push([px, pz, 10]);
      collision.addCircle(l.x, l.z, 0.2, 7.6, 'pole');
    } else {
      const [x, z] = w(0, 0.95); lampPts.push([x, 4.98, z, l.rot]); const [px, pz] = w(0, 2); pools.push([px, pz, 7.5]);
      collision.addCircle(l.x, l.z, 0.15, 5, 'pole');
    }
  }
  const poleMat = mats.plain;
  for (const t of ['single', 'double', 'wall']) {
    const g = poleMB[t].build();
    group.add(instanced(g, poleMat, byType[t], (l, m) => compose(l.x, 0, l.z, l.rot), { cast: true }));
  }
  group.add(instanced(lampGeo, lampMat, lampPts, (p, m) => compose(p[0], p[1], p[2], p[3])));
  const poolMesh = instanced(poolGeo, poolMat, pools, (p, m) => compose(p[0], 0.06 + (p[2] % 1) * 0.01, p[1], 0, p[2], 1, p[2]));
  poolMesh.renderOrder = 2;
  group.add(poolMesh);
  out.pools = pools;

  // ---- Utility poles + sagging wires ------------------------------------------------------------
  const upMB = new MeshBuilder();
  upMB.box(0, 4.5, 0, 0.22, 9, 0.22, 0, 0x9e9a92).box(0, 8.4, 0, 1.8, 0.12, 0.12, 0, 0x6b6b6b);
  const poles = roads.poles.filter((p) => grid.get(p.x, p.z) !== CELL.BUILDING && grid.get(p.x, p.z) !== CELL.ROAD);
  const poleSet = new Set(poles);
  group.add(instanced(upMB.build(), mats.plain, poles, (p, m) => compose(p.x, 0, p.z, rng.float(0, 0.2)), { cast: true }));
  for (const p of poles) collision.addCircle(p.x, p.z, 0.2, 9, 'pole');
  const wirePts = [];
  for (const p of poles) {
    if (!p.prev || !poleSet.has(p.prev)) continue;
    const a = p.prev, b = p;
    for (const off of [-0.8, 0, 0.8]) {
      const segs = 8;
      for (let i = 0; i < segs; i++) {
        const t0 = i / segs, t1 = (i + 1) / segs;
        const sag = (t) => 8.4 - Math.sin(t * Math.PI) * 0.9;
        const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
        const ox = (-dz / l) * off, oz = (dx / l) * off;
        wirePts.push(a.x + dx * t0 + ox, sag(t0), a.z + dz * t0 + oz, a.x + dx * t1 + ox, sag(t1), a.z + dz * t1 + oz);
      }
    }
  }
  if (wirePts.length) {
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wirePts, 3));
    const wires = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.75 }));
    group.add(wires);
  }

  // ---- Trees -------------------------------------------------------------------------------------
  const trees = [];
  for (const t of [...roads.trees, ...(campus.trees || [])]) {
    const c = grid.get(t.x, t.z);
    if (t.kind !== 'bush' && (c === CELL.ROAD || c === CELL.JUNCTION || c === CELL.BUILDING || c === CELL.WATER)) continue;
    trees.push(t);
  }
  // Race Course Garden trees
  for (let i = 0; i < 90; i++) {
    const x = rng.float(150, 490), z = rng.float(330, 600);
    if (Math.abs(x - 320) < 60 && Math.abs(z - 450) < 50) continue;
    trees.push({ x, z, kind: rng.pick(['neem', 'peepal', 'gulmohar', 'neem']), s: rng.float(0.9, 1.5) });
  }
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 1, 6); trunkGeo.translate(0, 0.5, 0);
  const canopyGeo = new THREE.IcosahedronGeometry(1, 1);
  const coneGeo = new THREE.ConeGeometry(1, 1, 7); coneGeo.translate(0, 0.5, 0);
  const treeMat = new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true });
  const barkMat = new THREE.MeshStandardMaterial({ color: 0x5b4636, roughness: 1 });
  const nonBush = trees.filter((t) => t.kind !== 'bush');
  group.add(instanced(trunkGeo, barkMat, nonBush, (t, m) => compose(t.x, 0, t.z, 0, t.s, (t.kind === 'ashoka' ? 5 : 2.6) * t.s, t.s), { cast: true }));
  const round = trees.filter((t) => t.kind !== 'ashoka');
  const canopy = instanced(canopyGeo, treeMat, round, (t, m) => {
    const r = (t.kind === 'peepal' ? 3.6 : t.kind === 'gulmohar' ? 3.3 : t.kind === 'bush' ? 0.8 : 2.9) * t.s;
    const y = t.kind === 'bush' ? 0.7 * t.s : 2.6 * t.s + r * 0.7;
    compose(t.x, y, t.z, rng.float(0, 6), r, r * (t.kind === 'gulmohar' ? 0.6 : 0.8), r);
  }, { cast: true });
  round.forEach((t, i) => {
    const col = t.kind === 'gulmohar' ? (rng.chance(0.3) ? 0xd4602e : 0x5f8f3a) : t.kind === 'peepal' ? 0x5c8f34 : t.kind === 'bush' ? 0x4f7d2e : 0x3f6e2a;
    _c.set(col).offsetHSL(rng.float(-0.02, 0.02), 0, rng.float(-0.05, 0.05)); canopy.setColorAt(i, _c);
  });
  group.add(canopy);
  const tall = trees.filter((t) => t.kind === 'ashoka');
  if (tall.length) {
    const cone = instanced(coneGeo, treeMat, tall, (t, m) => compose(t.x, 1.2 * t.s, t.z, 0, 1.3 * t.s, 7 * t.s, 1.3 * t.s), { cast: true });
    tall.forEach((t, i) => { _c.set(0x2f5d22); cone.setColorAt(i, _c); });
    group.add(cone);
  }
  for (const t of nonBush) collision.addCircle(t.x, t.z, 0.35 * t.s, 4, 'tree');
  out.treeCount = trees.length;

  // ---- Parked two-wheelers and cars ---------------------------------------------------------------
  const parked = [...campus.parkedSpots, ...ctx.parkedSpots.filter(() => rng.chance(0.35))];
  const kinds = { bike: [], scooter: [], car: [] };
  for (const p of parked) {
    const c = grid.get(p.x, p.z);
    if (c === CELL.ROAD || c === CELL.JUNCTION || c === CELL.WATER) continue;
    const k = p.kind || (rng.chance(0.08) ? 'car' : rng.chance(0.5) ? 'bike' : 'scooter');
    if (k === 'car' && c === CELL.BUILDING) continue;
    kinds[k].push({ ...p, v: rng.int(0, 3) });
  }
  for (const k of ['bike', 'scooter', 'car']) {
    for (let v = 0; v < 4; v++) {
      const list = kinds[k].filter((p) => p.v === v);
      if (!list.length) continue;
      const { body } = buildVehicleGeometry(k === 'car' ? 'hatch' : k, v + 10, atlas);
      group.add(instanced(body, mats.vehicle, list, (p, m) => compose(p.x, 0, p.z, p.rot, 1, 1, 1, k === 'car' ? 0 : 0.0), { cast: true }));
      for (const p of list) collision.addCircle(p.x, p.z, k === 'car' ? 1.6 : 0.55, 1.2, 'parked');
    }
  }

  // ---- Street stalls: chai, fruit and pani-puri carts -----------------------------------------------
  const stallMB = new MeshBuilder();
  const nightMB = new MeshBuilder();
  const nightLights = new MeshBuilder();
  const cart = (b, x, z, rot, kind) => {
    const c = Math.cos(rot), s = Math.sin(rot);
    const w = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    const bodyC = kind === 'chai' ? 0x2e7d32 : kind === 'fruit' ? 0x1565c0 : 0xc62828;
    b.box(x, 0.9, z, 2.2, 0.12, 1.1, rot, 0x8d6e63);
    b.box(x, 0.6, z, 2.1, 0.5, 1.0, rot, bodyC);
    for (const [lx, lz] of [[-0.9, -0.5], [0.9, -0.5], [-0.9, 0.5], [0.9, 0.5]]) { const [px, pz] = w(lx, lz); b.cylinder(px, 0.3, pz, 0.28, 0.08, 0x333333, 8, Math.PI / 2, rot); }
    if (kind === 'fruit') for (let i = 0; i < 8; i++) { const [px, pz] = w(rng.float(-0.9, 0.9), rng.float(-0.4, 0.4)); b.sphere(px, 1.05, pz, 0.12, 0.12, 0.12, rng.pick([0xe53935, 0xffb300, 0x7cb342, 0xfdd835]), 5); }
    if (kind === 'chai') { const [px, pz] = w(0.5, 0); b.cylinder(px, 1.1, pz, 0.18, 0.3, 0xb0bec5, 8); const [bx, bz] = w(0, 1.8); b.box(bx, 0.4, bz, 2, 0.08, 0.4, rot, 0x6d4c41); b.box(bx, 0.2, bz, 1.8, 0.4, 0.06, rot, 0x5d4037); }
    if (kind === 'panipuri') { const [px, pz] = w(0, 0); b.cylinder(px, 1.2, pz, 0.45, 0.4, 0xeeeeee, 10); }
    const [ux, uz] = w(0, 0);
    b.cylinder(ux, 1.8, uz, 0.03, 1.8, 0x555555, 4);
    b.cylinder(ux, 2.7, uz, 1.3, 0.3, kind === 'chai' ? 0xfbc02d : rng.pick([0xe53935, 0x1e88e5, 0x43a047]), 8, 0, 0, 0, 0.05);
    collision.addCircle(x, z, 1.1, 1.2, 'stall');
  };
  // day stalls near campus gate, markets and the chowk
  const daySpots = [[-20, -611, 0, 'chai'], [-30, -589, Math.PI, 'fruit'], [-4, -612, 0, 'panipuri'],
    [-118, -290, 0.6, 'chai'], [-360, -150, Math.PI, 'fruit'], [-420, -171, 0, 'fruit'], [-310, -48, 1.57, 'chai'],
    [-100, 8, 1.57, 'panipuri'], [230, -50, 0, 'chai'], [-330, 392, 0.3, 'chai']];
  for (const [x, z, r, k] of daySpots) { if (grid.get(x, z) !== CELL.ROAD && grid.get(x, z) !== CELL.BUILDING) { cart(stallMB, x, z, r, k); out.stalls.push({ x, z, kind: k, night: false }); } }

  // Khau Gali: night food street along Race Course Ring, lit with string lights
  for (let i = 0; i < 12; i++) {
    const x = 150 + i * 28, z = 296;
    if (grid.get(x, z) === CELL.ROAD) continue;
    cart(nightMB, x, z, Math.PI, rng.pick(['panipuri', 'chai', 'fruit']));
    out.stalls.push({ x, z, kind: 'food', night: true });
    for (let k = 0; k < 8; k++) nightLights.sphere(x - 1.4 + k * 0.4, 2.9 + Math.sin(k) * 0.08, z, 0.07, 0.07, 0.07, [0xffd54f, 0xff7043, 0x4fc3f7, 0x81c784][k % 4], 4);
  }
  // ---- Temples ---------------------------------------------------------------------------------------
  const temple = (x, z, rot, scale = 1) => {
    const b = stallMB;
    const c = Math.cos(rot), s = Math.sin(rot);
    b.box(x, 0.4 * scale, z, 6 * scale, 0.8 * scale, 6 * scale, rot, 0xe8dcc8);
    b.box(x, 2.2 * scale, z, 4 * scale, 2.8 * scale, 4 * scale, rot, 0xfaf3e6);
    for (let i = 0; i < 4; i++) { const r = (1.8 - i * 0.38) * scale; b.cylinder(x, (3.9 + i * 0.9) * scale, z, r, 0.9 * scale, 0xf6ead2, 8, 0, rot, 0, r * 0.82); }
    b.cylinder(x, 7.8 * scale, z, 0.25 * scale, 0.6 * scale, 0xd4a017, 8);
    b.cylinder(x, 8.9 * scale, z, 0.03, 2 * scale, 0x6d4c41, 4);
    b.box(x + 0.45 * scale, 9.5 * scale, z, 0.9 * scale, 0.55 * scale, 0.02, rot, 0xff7f00, 0, 0, 0.1);
    const dx = s * 2.05 * scale, dz = c * 2.05 * scale;
    B.shopLit.at(x, z).facingQuad(x + dx, 1.9 * scale, z + dz, s, c, 1.4 * scale, 2 * scale, 0xffcc80);
    collision.addBox(x, z, 3 * scale, 3 * scale, rot, 8 * scale, 'building');
    grid.fillRect(x, z, 3 * scale, 3 * scale, rot, CELL.BUILDING);
    out.temples.push({ x, z });
  };
  // big temple at Juni Pol Mandir Chowk + small roadside shrines
  const jn = net.nearestNode(-340, 400);
  const tpos = findFree(grid, jn.x + 16, jn.z + 14, 5);
  if (tpos) temple(tpos.x, tpos.z, Math.atan2(jn.x - tpos.x, jn.z - tpos.z), 1.25);
  for (const [x, z] of [[-60, -440], [470, -80], [-560, 120], [300, 120], [-150, 560]]) {
    const p = findFree(grid, x, z, 3.5);
    if (p) { const e = net.nearest(p.x, p.z); temple(p.x, p.z, Math.atan2(-e.lat * 0 + (net.sample(e.e, e.s).x - p.x), net.sample(e.e, e.s).z - p.z), 0.5); }
  }

  // ---- Madhapar Chowk island ----------------------------------------------------------------------------
  {
    const b = stallMB, { x, z } = RING;
    const g = new THREE.CircleGeometry(19, 40); g.rotateX(-Math.PI / 2);
    b.addGeometry(g, new THREE.Matrix4().makeTranslation(x, 0.3, z), 0x7fa34a); g.dispose();
    const k = new THREE.CylinderGeometry(19.3, 19.3, 0.3, 40, 1, true);
    b.addGeometry(k, new THREE.Matrix4().makeTranslation(x, 0.15, z), 0xf0c419); k.dispose();
    b.cylinder(x, 0.8, z, 6, 1.0, 0xd7ccc8, 20);
    b.cylinder(x, 1.35, z, 5.4, 0.12, 0x4a90a4, 20);
    b.box(x, 4.3, z, 1.6, 7, 1.6, Math.PI / 4, 0xe0d4be);
    b.cylinder(x, 8.2, z, 1.4, 0.8, 0xc9a24a, 12);
    b.sphere(x, 9, z, 1.1, 1.1, 1.1, 0xc9a24a, 10);
    for (let a = 0; a < 16; a++) { const px = x + Math.cos(a / 16 * Math.PI * 2) * 14, pz = z + Math.sin(a / 16 * Math.PI * 2) * 14; b.sphere(px, 0.8, pz, 0.9, 0.7, 0.9, a % 2 ? 0xe65100 : 0x558b2f, 6); }
    nightLights.cylinder(x, 1.45, z, 5.2, 0.05, 0x7fdcff, 20);
    for (let a = 0; a < 24; a++) { const px = x + Math.cos(a / 24 * Math.PI * 2) * 18.6, pz = z + Math.sin(a / 24 * Math.PI * 2) * 18.6; nightLights.sphere(px, 0.45, pz, 0.12, 0.12, 0.12, a % 3 === 0 ? 0xff9933 : a % 3 === 1 ? 0xffffff : 0x138808, 4); }
    collision.addCircle(x, z, 19.2, 0.6, 'island');
    grid.fillCircle(x, z, 19, CELL.GRASS);
    const slot = atlas.roadSign('madhapar', ['MADHAPAR CHOWK', 'માધાપર ચોકડી', '↑ Morbi 58 km  ↓ Rajkot City']);
    if (slot) {
      b.box(x - 14, 1.6, z + 30, 0.15, 3.2, 0.15, 0, 0x555555); b.box(x - 10, 1.6, z + 30, 0.15, 3.2, 0.15, 0, 0x555555);
      B.signs.at(x, z).facingQuad(x - 12, 4.4, z + 30.1, 0, 1, 5, 2.6, 0xffffff, slot.uv);
    }
  }

  // ---- Highway direction boards ---------------------------------------------------------------------------
  const hs = atlas.roadSign('hwy1', ['↑ Morbi  મોરબી  58 km', '↓ Rajkot City  રાજકોટ', '→ Marwadi University']);
  if (hs) {
    for (const [x, z, face] of [[-96, -640, 1], [-64, -560, -1]]) {
      stallMB.box(x - 2.2, 3, z, 0.2, 6, 0.2, 0, 0x555555); stallMB.box(x + 2.2, 3, z, 0.2, 6, 0.2, 0, 0x555555);
      B.signs.at(x, z).facingQuad(x, 5.8, z + face * 0.12, 0, face, 6, 3.2, 0xffffff, hs.uv);
      stallMB.box(x, 5.8, z, 6.2, 3.3, 0.18, 0, 0x2f3f2f);
      collision.addCircle(x - 2.2, z, 0.2, 6); collision.addCircle(x + 2.2, z, 0.2, 6);
    }
  }

  // ---- Fuel stations ------------------------------------------------------------------------------------------
  for (const st of FUEL_STATIONS) {
    const b = stallMB;
    const W = st.id === 'pump_n' ? 30 : 40, D = st.id === 'pump_n' ? 40 : 28;
    grid.fillRect(st.x, st.z, W / 2, D / 2, 0, CELL.PAVED);
    B.paved.at(st.x, st.z).box(st.x, 0.06, st.z, W, 0.06, D, 0, 0xc8c2b8);
    // canopy
    for (const [dx, dz] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) { b.box(st.x + dx, 2.8, st.z + dz, 0.5, 5.6, 0.5, 0, 0xf2f2f2); collision.addCircle(st.x + dx, st.z + dz, 0.35, 5.6); }
    b.box(st.x, 5.8, st.z, 18, 0.6, 18, 0, 0xf5f5f5);
    b.box(st.x, 5.8, st.z, 18.2, 0.8, 18.2, 0, 0x0b5345);
    const fs = atlas.shopBoard('fuel', { en: 'Saurashtra Fuels', local: 'સૌરાષ્ટ્ર ફ્યુઅલ્સ', bg: '#0b5345', fg: '#fff', accent: '#f1c40f', style: 1 });
    if (fs) for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) B.signs.at(st.x, st.z).facingQuad(st.x + nx * 9.12, 5.8, st.z + nz * 9.12, nx, nz, 7, 0.78, 0xffffff, fs.uv);
    B.shopLit.at(st.x, st.z).box(st.x, 5.36, st.z, 16, 0.04, 16, 0, 0xfff6e0);
    { const fp = new THREE.Mesh(poolGeo, poolMat); fp.scale.set(24, 1, 24); fp.position.set(st.x, 0.1, st.z); fp.renderOrder = 2; group.add(fp); }
    // dispensers
    for (const dx of [-3.5, 3.5]) {
      b.box(st.x + dx, 0.9, st.z, 1.0, 1.8, 0.6, 0, 0xeeeeee);
      b.box(st.x + dx, 1.9, st.z, 1.1, 0.2, 0.7, 0, 0x0b5345);
      B.winLit.at(st.x, st.z).facingQuad(st.x + dx, 1.3, st.z + 0.31, 0, 1, 0.6, 0.35, 0x9cff9c);
      B.winLit.at(st.x, st.z).facingQuad(st.x + dx, 1.3, st.z - 0.31, 0, -1, 0.6, 0.35, 0x9cff9c);
      b.box(st.x + dx, 0.12, st.z, 1.6, 0.24, 1.6, 0, 0xbdbdbd);
      collision.addBox(st.x + dx, st.z, 0.6, 0.4, 0, 1.8);
    }
    // office kiosk
    const ox = st.x + (st.id === 'pump_n' ? -10 : 14), oz = st.z + (st.id === 'pump_n' ? 14 : -8);
    b.box(ox, 1.6, oz, 6, 3.2, 4, 0, 0xf2f2f2); collision.addBox(ox, oz, 3, 2, 0, 3.2);
    b.box(ox, 3.3, oz, 6.4, 0.2, 4.4, 0, 0x0b5345);
    // tall price pylon
    const py = { x: st.x + (st.id === 'pump_n' ? 12 : -18), z: st.z + (st.id === 'pump_n' ? -16 : 11) };
    b.box(py.x, 4, py.z, 1.2, 8, 0.4, 0, 0x0b5345); collision.addCircle(py.x, py.z, 0.6, 8);
    if (fs) B.signs.at(py.x, py.z).facingQuad(py.x + 0.21, 6.8, py.z, 1, 0, 1.1, 1.1 / 6 * 1.0, 0xffffff, fs.uv);
    out.fuelZones.push({ id: st.id, x: st.x, z: st.z, r: 8 });
  }

  // ---- Race Course Garden -----------------------------------------------------------------------------------
  {
    const gx = 320, gz = 460, W = 330, D = 280;
    B.grass.at(gx, gz).box(gx, 0.06, gz, W, 0.06, D, 0, 0x88b057);
    const ring = new THREE.RingGeometry(1, 1.04, 64); ring.rotateX(-Math.PI / 2);
    B.paved.at(gx, gz).addGeometry(ring, new THREE.Matrix4().compose(V3(gx, 0.1, gz), new THREE.Quaternion(), V3(120, 1, 95)), 0xc9a27a, 1); ring.dispose();
    stallMB.cylinder(gx, 0.5, gz, 9, 1.0, 0xd7ccc8, 24);
    B.winDark.at(gx, gz).cylinder(gx, 1.02, gz, 8.4, 0.05, 0x4a90a4, 24);
    stallMB.cylinder(gx, 2, gz, 0.6, 3, 0xd7ccc8, 10);
    nightLights.cylinder(gx, 1.06, gz, 8.0, 0.03, 0x7fdcff, 24);
    collision.addCircle(gx, gz, 9.2, 1.0);
    for (let i = 0; i < 18; i++) { // benches along the track
      const a = (i / 18) * Math.PI * 2, x = gx + Math.cos(a) * 128, z = gz + Math.sin(a) * 102;
      stallMB.box(x, 0.45, z, 1.8, 0.1, 0.5, -a, 0x8d6e63); stallMB.box(x, 0.22, z, 1.6, 0.44, 0.1, -a, 0x5d4037);
    }
    // perimeter railing with gate facing Race Course Ring
    for (let x = gx - W / 2; x < gx + W / 2; x += 3) {
      if (Math.abs(x - gx) < 6) continue;
      stallMB.box(x + 1.5, 0.6, gz - D / 2, 3, 1.2, 0.08, 0, 0x2e7d32);
    }
    stallMB.box(gx - 6, 2, gz - D / 2, 0.8, 4, 0.8, 0, 0xc9b28a); stallMB.box(gx + 6, 2, gz - D / 2, 0.8, 4, 0.8, 0, 0xc9b28a);
    stallMB.box(gx, 4.2, gz - D / 2, 13, 0.6, 0.8, 0, 0xc9b28a);
    const gs = atlas.shopBoard('garden', { en: 'Race Course Garden', local: 'રેસ કોર્સ ગાર્ડન', bg: '#1b5e20', accent: '#fdd835', style: 2 });
    if (gs) B.signs.at(gx, gz).facingQuad(gx, 4.2, gz - D / 2 - 0.42, 0, -1, 6, 1, 0xffffff, gs.uv);
    grid.fillRect(gx, gz, W / 2, D / 2, 0, CELL.GRASS, [CELL.EMPTY, CELL.RESERVED]);
  }

  // ---- bus shelters on arterials --------------------------------------------------------------------------
  let busCount = 0;
  for (const e of net.edges) {
    if (e.cls !== 'arterial' || e.len < 120 || busCount > 10) continue;
    const s = e.len * 0.5;
    const p = net.lanePoint(e, 0, s, e.hw + e.spec.sidewalk - 0.8, {});
    const rot = Math.atan2(p.tx, p.tz);
    if (grid.get(p.x, p.z) === CELL.BUILDING) continue;
    stallMB.box(p.x, 2.6, p.z, 0.2, 0.12, 6, rot, 0x1e2a5a);
    stallMB.box(p.x, 2.62, p.z, 1.8, 0.1, 6.4, rot, 0xd32f2f);
    const c = Math.cos(rot), sn = Math.sin(rot);
    for (const dz of [-2.8, 2.8]) stallMB.box(p.x + sn * dz, 1.3, p.z + c * dz, 0.12, 2.6, 0.12, rot, 0x555555);
    stallMB.box(p.x, 0.5, p.z, 0.5, 0.08, 4.5, rot, 0x9e9e9e);
    out.busStops.push({ x: p.x, z: p.z, e, s });
    busCount++;
  }

  // ---- Traffic signals ----------------------------------------------------------------------------------------
  const sigPole = new MeshBuilder();
  sigPole.cylinder(0, 2.2, 0, 0.09, 4.4, 0x3a3a3a, 6).box(0, 4.2, 0.18, 0.42, 1.25, 0.3, 0, 0x151515).box(0, 4.9, 0.18, 0.5, 0.06, 0.4, 0, 0x151515);
  const heads = [];
  for (const n of net.signals) {
    for (const e of n.edges) {
      const d = net.dirAtNode(e, n); // outward
      const startS = e.a === n ? e.trimA : e.len - e.trimB;
      const p = net.sample(e, startS, {});
      // inbound traffic moves along -d, keeps to its left: left of -d is (-d.z, d.x)
      const lx = -d.z, lz = d.x;
      const x = p.x + d.x * 5 + lx * (e.hw + 0.8), z = p.z + d.z * 5 + lz * (e.hw + 0.8);
      const rot = Math.atan2(d.x, d.z); // head faces outward (toward approaching traffic)
      heads.push({ x, z, rot, node: n, edge: e });
      collision.addCircle(x, z, 0.15, 4.4);
    }
  }
  group.add(instanced(sigPole.build(), mats.plain, heads, (h, m) => compose(h.x, 0, h.z, h.rot), { cast: true }));
  const bulbGeo = new THREE.CircleGeometry(0.14, 10);
  const bulbMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const bulbs = [];
  heads.forEach((h) => { for (let k = 0; k < 3; k++) bulbs.push({ h, k }); });
  const bulbMesh = instanced(bulbGeo, bulbMat, bulbs, (b, m) => {
    const c = Math.cos(b.h.rot), s = Math.sin(b.h.rot);
    compose(b.h.x + s * 0.34, 4.6 - b.k * 0.38, b.h.z + c * 0.34, b.h.rot);
  });
  bulbs.forEach((b, i) => bulbMesh.setColorAt(i, _c.set(0x222222)));
  group.add(bulbMesh);
  out.signals = { heads, bulbs, mesh: bulbMesh };

  // ---- assemble static stall/temple mesh ----------------------------------------------------------------------
  if (!stallMB.empty) { const m = new THREE.Mesh(stallMB.build(), mats.building); m.castShadow = true; m.receiveShadow = true; group.add(m); }
  if (!nightMB.empty) { const m = new THREE.Mesh(nightMB.build(), mats.building); m.castShadow = true; nightGroup.add(m); }
  if (!nightLights.empty) { out.fairyMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }); nightGroup.add(new THREE.Mesh(nightLights.build(), out.fairyMat)); }
  return out;
}

function findFree(grid, x, z, r) {
  for (let ring = 0; ring < 12; ring++) {
    for (let a = 0; a < 8; a++) {
      const px = x + Math.cos(a * 0.785) * ring * 3, pz = z + Math.sin(a * 0.785) * ring * 3;
      if (grid.rectFree(px, pz, r, r, 0)) return { x: px, z: pz };
    }
  }
  return null;
}

// Update signal bulbs to current phase
export function updateSignalLights(net, signals, night) {
  const colors = { red: 0xff2a1a, amber: 0xffb000, green: 0x22ff66 };
  const off = 0x2a2a2a;
  signals.bulbs.forEach((b, i) => {
    const st = net.signalFor(b.h.node, b.h.edge);
    const want = b.k === 0 ? 'red' : b.k === 1 ? 'amber' : 'green';
    _c.set(st === want ? colors[want] : off);
    if (st === want) _c.multiplyScalar(0.8 + night * 0.9);
    signals.mesh.setColorAt(i, _c);
  });
  signals.mesh.instanceColor.needsUpdate = true;
}
