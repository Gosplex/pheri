import * as THREE from 'three';
import { MeshBuilder } from '../core/geom.js';
import { Rng } from '../core/rng.js';

// All vehicles face +z. y=0 is the road. Built once per type/variant and shared.

const CAR_COLORS = [0xf2f2f2, 0xf2f2f2, 0xbfc3c7, 0x8a8f94, 0x2b2e33, 0xb71c1c, 0x1f4e9c, 0x7a1f2b, 0xd8cbb0, 0x3e5f3a];
const BIKE_COLORS = [0x111111, 0xb71c1c, 0x1f4e9c, 0x2b2b2b, 0x8e8e8e, 0x5d1f7a, 0x0d5e3a];
const SCOOTY_COLORS = [0xf2f2f2, 0xd32f2f, 0x1e88e5, 0x2b2b2b, 0xf9a825, 0x7e57c2, 0x26a69a, 0xec407a];
const SHIRTS = [0xffffff, 0x1565c0, 0xc62828, 0x2e7d32, 0xf9a825, 0x6a1b9a, 0x37474f, 0xef6c00, 0x00838f, 0xad1457, 0x8d6e63];
const SKIN = [0x8d5524, 0xa0673a, 0xc68642, 0x7a4a26, 0xb57a4b];
const HELMETS = [0x111111, 0xd32f2f, 0xffffff, 0x1565c0, 0xf9a825, 0x424242];

export const VEHICLE_SPECS = {
  bike:     { len: 2.0, wid: 0.75, hgt: 1.5, radius: 0.55, speed: 1.05, horn: 'bike', mass: 1 },
  scooter:  { len: 1.8, wid: 0.72, hgt: 1.45, radius: 0.5, speed: 0.95, horn: 'scooter', mass: 1 },
  auto:     { len: 2.7, wid: 1.4, hgt: 1.8, radius: 1.0, speed: 0.75, horn: 'auto', mass: 2 },
  hatch:    { len: 3.7, wid: 1.66, hgt: 1.5, radius: 1.3, speed: 1.0, horn: 'car', mass: 3 },
  sedan:    { len: 4.3, wid: 1.74, hgt: 1.45, radius: 1.45, speed: 1.05, horn: 'car', mass: 3 },
  suv:      { len: 4.5, wid: 1.86, hgt: 1.85, radius: 1.5, speed: 1.0, horn: 'car', mass: 4 },
  tempo:    { len: 3.8, wid: 1.55, hgt: 2.0, radius: 1.35, speed: 0.8, horn: 'auto', mass: 4 },
  bus:      { len: 10.5, wid: 2.5, hgt: 3.1, radius: 2.4, speed: 0.8, horn: 'bus', mass: 10 },
  truck:    { len: 8.0, wid: 2.45, hgt: 3.3, radius: 2.2, speed: 0.72, horn: 'truck', mass: 10 },
  campusbus:{ len: 9.0, wid: 2.4, hgt: 3.0, radius: 2.2, speed: 0.6, horn: 'bus', mass: 9 },
};

function wheel(b, x, y, z, r, w, color = 0x151515) {
  b.cylinder(x, y, z, r, w, color, 10, 0, 0, Math.PI / 2);
  b.cylinder(x, y, z, r * 0.55, w + 0.02, 0x9e9e9e, 8, 0, 0, Math.PI / 2);
}

// ---------------------------------------------------------------------------
// Seated people (riders, pillions, auto passengers) with rounded limbs and Indian attire.
// pose: 'rider' (hands on bars), 'pillion' (hands on knees), 'sidesaddle' (legs to the left),
//       'seated' (auto passenger).
// ---------------------------------------------------------------------------
const _up = new THREE.Vector3(0, 1, 0);
function limb(b, a, c, r0, r1, color, seg = 7) {
  const A = new THREE.Vector3(...a), C = new THREE.Vector3(...c);
  const dir = C.clone().sub(A); const len = dir.length(); if (len < 1e-4) return;
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(_up, dir.normalize());
  b.addGeometry(g, new THREE.Matrix4().compose(A.add(C).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)), color);
  g.dispose();
}
const SAREE_C = [0xc2185b, 0xe65100, 0xb71c1c, 0x1a237e, 0x00695c, 0x6a1b9a, 0xf9a825, 0xad1457, 0x00838f];
const KAMEEZ_C = [0xf8bbd0, 0xb2dfdb, 0xfff59d, 0xce93d8, 0x90caf9, 0xffccbc, 0xd81b60, 0x00897b, 0xfb8c00];
export function riderParts(b, rng, y0 = 0.72, z0 = -0.15, opts = {}) {
  const pose = opts.pose || 'rider';
  const female = opts.female ?? (pose === 'sidesaddle' ? true : rng.chance(pose === 'rider' ? 0.28 : 0.5));
  const skin = rng.pick(SKIN);
  let top, bottom, sleeve, dupatta = null, saree = null, loose = false;
  if (female) {
    const st = pose === 'sidesaddle' || (pose !== 'rider' && rng.chance(0.5)) ? 'saree' : rng.chance(0.6) ? 'kameez' : 'kurti';
    if (st === 'saree') { saree = rng.pick(SAREE_C); top = rng.chance(0.5) ? saree : rng.pick(SAREE_C); bottom = saree; sleeve = skin; }
    else if (st === 'kameez') { top = rng.pick(KAMEEZ_C); bottom = rng.chance(0.5) ? 0xffffff : rng.pick(KAMEEZ_C); sleeve = top; dupatta = rng.pick(SAREE_C); loose = true; }
    else { top = rng.pick(KAMEEZ_C); bottom = rng.pick([0x3b5a8a, 0x2c4770, 0x212121]); sleeve = top; }
  } else {
    top = opts.shirt ?? rng.pick(SHIRTS);
    const kurta = rng.chance(0.18);
    bottom = kurta ? 0xffffff : rng.pick([0x263238, 0x3e2723, 0x1a237e, 0x4e342e, 0x212121, 0x3b5a8a]);
    sleeve = rng.chance(0.5) ? top : skin; loose = kurta;
  }
  const hipY = y0 + 0.06, shY = y0 + 0.56;
  const leanF = pose === 'rider' ? 0.14 : 0.03;
  // pelvis + torso (tapered, leaning towards the bars)
  b.sphere(0, hipY, z0, 0.16, 0.1, 0.13, saree ?? bottom, 8);
  limb(b, [0, hipY + 0.02, z0], [0, shY, z0 + leanF], female ? 0.13 : 0.145, female ? 0.16 : 0.175, top, 10);
  b.sphere(0, shY, z0 + leanF, female ? 0.17 : 0.19, 0.07, 0.11, top, 8);
  if (!female && loose) limb(b, [0, hipY + 0.28, z0 + leanF * 0.5], [0, hipY - 0.1, z0 + 0.05], 0.2, 0.17, top, 10); // kurta hem
  if (loose && female) limb(b, [0, hipY + 0.28, z0 + leanF * 0.5], [0, hipY - 0.12, z0 + 0.05], 0.22, 0.16, top, 10); // kameez
  // legs
  const side = pose === 'sidesaddle';
  for (const sx of [-1, 1]) {
    const hip = [sx * 0.09, hipY, z0];
    let knee, foot;
    if (side) { knee = [0.32, hipY - 0.03, z0 + sx * 0.1 + 0.05]; foot = [0.36, hipY - 0.48, z0 + sx * 0.08 + 0.12]; }
    else if (pose === 'seated') { knee = [sx * 0.12, hipY + 0.02, z0 + 0.42]; foot = [sx * 0.13, hipY - 0.42, z0 + 0.48]; }
    else { knee = [sx * (pose === 'rider' ? 0.17 : 0.2), hipY + 0.05, z0 + 0.4]; foot = [sx * 0.2, hipY - 0.42, z0 + 0.48]; }
    const lw = loose ? 1.35 : 1;
    limb(b, hip, knee, 0.058 * lw, 0.072 * lw, saree ?? bottom);
    limb(b, knee, foot, 0.042 * lw, 0.056 * lw, saree ?? bottom);
    b.box(foot[0], foot[1] - 0.03, foot[2] + 0.05, 0.08, 0.05, 0.2, 0, rng.pick([0x2b1d14, 0x3e2723, 0x212121, 0x8d6e63]));
  }
  if (saree) { // draped saree: flowing panel over the legs and the pallu over the shoulder
    limb(b, [0, hipY + 0.02, z0], side ? [0.34, hipY - 0.35, z0 + 0.1] : [0, hipY - 0.1, z0 + 0.35], 0.18, 0.16, saree, 10);
    b.box(0.08, shY - 0.2, z0 + leanF + 0.07, 0.15, 0.45, 0.02, 0, saree, 0, 0, -0.5);
    b.box(0.12, shY - 0.35, z0 - 0.1, 0.18, 0.6, 0.02, 0, saree, 0.1);
  }
  if (dupatta) { b.box(0, shY - 0.02, z0 + leanF, 0.3, 0.03, 0.15, 0, dupatta); b.box(0, shY - 0.25, z0 - 0.09, 0.26, 0.45, 0.015, 0.1, dupatta); }
  // arms
  for (const sx of [-1, 1]) {
    const sh = [sx * (female ? 0.16 : 0.18), shY - 0.02, z0 + leanF];
    let el, hand;
    if (pose === 'rider') { el = [sx * 0.26, shY - 0.2, z0 + 0.3]; hand = [sx * 0.3, shY - 0.16, z0 + 0.62]; }
    else if (side) { el = [sx * 0.2, shY - 0.28, z0 + 0.1]; hand = sx > 0 ? [0.26, shY - 0.42, z0 + 0.22] : [-0.2, shY - 0.3, z0 + 0.28]; }
    else { el = [sx * 0.21, shY - 0.28, z0 + 0.08]; hand = [sx * 0.17, hipY + 0.08, z0 + 0.3]; }
    b.sphere(sh[0], sh[1], sh[2], 0.055, 0.055, 0.055, sleeve === skin ? top : sleeve, 6);
    limb(b, sh, el, 0.04, 0.05, sleeve === skin ? top : sleeve);
    limb(b, el, hand, 0.032, 0.04, sleeve);
    b.sphere(hand[0], hand[1], hand[2], 0.035, 0.045, 0.03, skin, 6);
  }
  // head
  const hx = 0, hy = shY + 0.2, hz = z0 + leanF + 0.04;
  limb(b, [0, shY, z0 + leanF], [0, hy - 0.1, hz], 0.045, 0.048, skin, 6);
  b.sphere(hx, hy, hz, 0.095, 0.115, 0.105, skin, 10);
  const helmet = opts.helmet !== false && rng.chance(opts.helmetChance ?? 0.75);
  if (helmet) {
    b.sphere(hx, hy + 0.02, hz - 0.01, 0.145, 0.15, 0.16, rng.pick(HELMETS), 10);
    b.box(hx, hy - 0.005, hz + 0.13, 0.19, 0.08, 0.04, 0, 0x1e2630);
  } else {
    b.sphere(hx - 0.03, hy + 0.01, hz + 0.1, 0.012, 0.01, 0.005, 0x0a0808, 5); b.sphere(hx + 0.03, hy + 0.01, hz + 0.1, 0.012, 0.01, 0.005, 0x0a0808, 5);
    if (female && (dupatta || saree) && rng.chance(0.5)) { // face and hair covered against sun and dust, a common sight
      b.sphere(hx, hy + 0.02, hz - 0.005, 0.115, 0.13, 0.125, dupatta ?? saree, 10);
      b.box(hx, hy - 0.04, hz + 0.08, 0.17, 0.09, 0.05, 0, dupatta ?? saree);
    } else {
      b.sphere(hx, hy + 0.04, hz - 0.015, 0.1, 0.1, 0.105, rng.chance(0.1) ? 0xbdbdbd : 0x141010, 10);
      if (female) b.box(hx, hy - 0.2, hz - 0.12, 0.05, 0.3, 0.035, 0, 0x141010, 0.15);
      else if (rng.chance(0.4)) b.box(hx, hy - 0.04, hz + 0.1, 0.06, 0.012, 0.012, 0, 0x141010);
    }
  }
}

// Extrude a side profile [[z,y]...] across the vehicle width (x), centred on xc.
function extrudeSide(b, pts, width, color, xc = 0, bevel = 0.03) {
  const sh = new THREE.Shape();
  pts.forEach(([z, y], i) => (i ? sh.lineTo(z, y) : sh.moveTo(z, y)));
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.01, width - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6 });
  const m = new THREE.Matrix4().makeTranslation(xc + width / 2 - bevel, 0, 0).multiply(new THREE.Matrix4().makeRotationY(-Math.PI / 2));
  b.addGeometry(g, m, color);
  g.dispose();
}

const CAR_PROFILES = {
  hatch: { L: 3.7, belt: 0.95, roof: 1.47, cowl: 0.85, wsTop: 1.55, roofRear: -1.65, rearGlass: -1.8, clear: 0.3, wr: 0.29 },
  sedan: { L: 4.3, belt: 0.93, roof: 1.43, cowl: 1.0, wsTop: 1.85, roofRear: -1.05, rearGlass: -1.75, clear: 0.3, wr: 0.3 },
  suv:   { L: 4.5, belt: 1.12, roof: 1.82, cowl: 1.05, wsTop: 1.65, roofRear: -2.05, rearGlass: -2.2, clear: 0.42, wr: 0.36 },
};

function buildCar(b, L_, kind, rng, HEAD, TAIL) {
  const P = CAR_PROFILES[kind], L = P.L, h = L / 2;
  const c = rng.pick(CAR_COLORS);
  const wid = VEHICLE_SPECS[kind].wid;
  const glass = 0x1f2a36;
  // lower body shell
  const body = [[-h + 0.08, P.clear], [h - 0.12, P.clear], [h, P.clear + 0.18], [h, P.belt - 0.28], [h - 0.18, P.belt - 0.16], [h - P.cowl, P.belt], [kind === 'sedan' ? -h + 0.35 : P.rearGlass, P.belt + 0.02], [-h, P.belt - 0.08], [-h, P.clear + 0.18]];
  extrudeSide(b, body, wid, c, 0, 0.05);
  // glasshouse
  const gh = [[h - P.cowl + 0.05, P.belt], [h - P.wsTop, P.roof - 0.03], [P.roofRear, P.roof - 0.03], [P.rearGlass + (kind === 'sedan' ? 0.2 : 0.02), P.belt + 0.02]];
  extrudeSide(b, gh, wid - 0.14, glass, 0, 0.02);
  // roof skin and pillars in body colour
  extrudeSide(b, [[h - P.wsTop - 0.05, P.roof - 0.02], [P.roofRear + 0.05, P.roof - 0.02], [P.roofRear + 0.08, P.roof + 0.03], [h - P.wsTop - 0.08, P.roof + 0.03]], wid - 0.1, c, 0, 0.02);
  for (const sx of [-1, 1]) {
    const x = sx * (wid / 2 - 0.075);
    limb(b, [x, P.belt, h - P.cowl + 0.05], [x, P.roof, h - P.wsTop], 0.035, 0.035, c, 5);
    limb(b, [x, P.belt, (h - P.wsTop + P.roofRear) / 2 - 0.1], [x, P.roof, (h - P.wsTop + P.roofRear) / 2 - 0.1], 0.04, 0.04, c, 5);
    limb(b, [x, P.belt, P.rearGlass + 0.1], [x, P.roof, P.roofRear], 0.05, 0.05, c, 5);
    b.box(sx * (wid / 2 + 0.05), P.belt + 0.08, h - P.cowl - 0.05, 0.1, 0.07, 0.12, 0, c); // mirrors
  }
  // bumpers, grille, plates, wheel arches
  b.box(0, P.clear + 0.13, h + 0.02, wid - 0.06, 0.18, 0.08, 0, 0x2a2a2a);
  b.box(0, P.clear + 0.13, -h - 0.02, wid - 0.06, 0.18, 0.08, 0, 0x2a2a2a);
  b.box(0, P.belt - 0.3, h + 0.005, wid * 0.42, 0.12, 0.02, 0, 0x151515);
  b.box(0, P.clear + 0.3, h + 0.04, 0.5, 0.11, 0.01, 0, 0xffffff);
  b.box(0, P.belt - 0.22, -h - 0.02, 0.5, 0.11, 0.01, 0, 0xffffff);
  const wz = h - 0.72;
  for (const x of [-(wid / 2 - 0.13), wid / 2 - 0.13]) for (const z of [-wz, wz]) wheel(b, x, P.wr, z, P.wr, 0.22);
  L_.box(-wid / 2 + 0.26, P.belt - 0.26, h + 0.012, 0.32, 0.1, 0.02, 0, HEAD);
  L_.box(wid / 2 - 0.26, P.belt - 0.26, h + 0.012, 0.32, 0.1, 0.02, 0, HEAD);
  L_.box(-wid / 2 + 0.2, P.belt - 0.14, -h - 0.012, 0.26, 0.12, 0.02, 0, TAIL);
  L_.box(wid / 2 - 0.2, P.belt - 0.14, -h - 0.012, 0.26, 0.12, 0.02, 0, TAIL);
  if (rng.chance(0.6)) { const d = new MeshBuilder(); riderParts(d, rng, P.clear + 0.25, 0.05, { pose: 'seated', helmet: false }); b.merge(d, -0.36, 0, 0); } // right-hand drive
}

// Gujarat CNG auto-rickshaw: green body, yellow canvas hood, three wheels, open sides.
function buildAuto(b, L, rng, HEAD, TAIL, withPassengers) {
  const green = rng.chance(0.8) ? 0x1e7d3a : 0x151515, yellow = 0xf2c230, black = 0x151515;
  const W = 1.34;
  wheel(b, 0, 0.23, 1.02, 0.23, 0.13);
  wheel(b, -0.62, 0.23, -0.72, 0.23, 0.14); wheel(b, 0.62, 0.23, -0.72, 0.23, 0.14);
  // floor tub + rear body
  extrudeSide(b, [[-1.25, 0.3], [0.45, 0.3], [0.5, 0.42], [0.5, 0.62], [-1.1, 0.62], [-1.25, 0.55]], W, green, 0, 0.04);
  extrudeSide(b, [[-1.28, 0.55], [-1.05, 0.55], [-1.05, 1.05], [-1.28, 1.0]], W, green, 0, 0.03);    // rear panel
  // front cowl (the rounded nose)
  extrudeSide(b, [[0.35, 0.3], [0.95, 0.3], [1.22, 0.42], [1.3, 0.62], [1.24, 0.88], [1.05, 1.08], [0.7, 1.15], [0.35, 1.15]], 0.92, green, 0, 0.06);
  b.box(0, 0.36, 1.03, 0.2, 0.08, 0.5, 0, black);                                                    // front mudguard
  // windscreen + frame
  extrudeSide(b, [[1.02, 1.1], [1.08, 1.12], [0.82, 1.64], [0.76, 1.62]], 1.1, 0x4f6b7a, 0, 0.0);
  // canvas hood: curved roof down to the back
  const hood = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; hood.push([0.82 - t * 2.12, 1.66 + Math.sin(t * Math.PI) * 0.1 - t * 0.12]); }
  const inner = hood.map(([z, y]) => [z, y - 0.05]).reverse();
  extrudeSide(b, [...hood, [-1.3, 1.1], [-1.25, 1.1], ...inner], W + 0.06, yellow, 0, 0.02);
  // side pillars and grab rails
  for (const sx of [-1, 1]) {
    limb(b, [sx * 0.66, 0.62, 0.42], [sx * 0.68, 1.64, 0.62], 0.025, 0.025, black, 5);
    limb(b, [sx * 0.66, 0.62, -0.95], [sx * 0.68, 1.58, -0.95], 0.025, 0.025, black, 5);
    limb(b, [sx * 0.67, 1.05, -0.95], [sx * 0.67, 1.05, 0.3], 0.018, 0.018, 0xbdbdbd, 5);
    b.box(sx * 0.69, 1.45, -0.3, 0.04, 0.22, 1.2, 0, 0x8d7b4a);   // rolled side flap
  }
  // rear passenger bench + backrest, driver seat, handlebar, meter
  b.box(0, 0.78, -0.62, 1.2, 0.14, 0.55, 0, 0x2b2b2b);
  b.box(0, 1.08, -0.92, 1.2, 0.5, 0.1, -0.1, 0x2b2b2b);
  b.box(0, 0.82, 0.18, 0.42, 0.12, 0.42, 0, 0x2b2b2b);
  limb(b, [-0.34, 1.1, 0.6], [0.34, 1.1, 0.6], 0.018, 0.018, 0x333333, 5);
  b.box(0.36, 1.2, 0.62, 0.12, 0.12, 0.06, 0, 0x111111);
  b.box(0, 1.22, 0.9, 0.3, 0.12, 0.06, 0, 0xd4af37);            // decorative strip
  // tail with yellow commercial number plate
  b.box(0, 0.72, -1.3, 0.42, 0.12, 0.02, 0, 0xf2d25a);
  riderParts(b, rng, 0.86, 0.2, { helmet: false, female: false });
  if (withPassengers) {
    { const b1 = new MeshBuilder(); riderParts(b1, rng, 0.86, -0.66, { pose: 'seated', helmet: false, female: rng.chance(0.5) }); b.merge(b1, -0.3, 0, 0); }
    if (rng.chance(0.5)) { const b2 = new MeshBuilder(); riderParts(b2, rng, 0.86, -0.66, { pose: 'seated', helmet: false }); b.merge(b2, 0.36, 0, 0); }
  }
  L.box(0, 0.98, 1.3, 0.2, 0.16, 0.04, 0, HEAD);
  L.box(-0.55, 0.62, -1.3, 0.12, 0.1, 0.03, 0, TAIL); L.box(0.55, 0.62, -1.3, 0.12, 0.1, 0.03, 0, TAIL);
}

export function buildVehicleGeometry(kind, seed = 0, atlas = null) {
  const rng = new Rng(1000 + seed * 31 + kind.length * 7);
  const b = new MeshBuilder();
  const L = new MeshBuilder(); // lights
  let sign = null;
  const HEAD = 0xfff4d6, TAIL = 0xff2a1a;

  if (kind === 'bike' || kind === 'scooter') {
    const scoot = kind === 'scooter';
    const c = rng.pick(scoot ? SCOOTY_COLORS : BIKE_COLORS);
    const r = scoot ? 0.24 : 0.3;
    wheel(b, 0, r, 0.66, r, 0.1); wheel(b, 0, r, -0.64, r, 0.12);
    if (scoot) {
      b.box(0, 0.33, 0.02, 0.36, 0.12, 0.9, 0, 0x2b2b2b);            // floorboard
      b.box(0, 0.7, 0.48, 0.42, 0.72, 0.18, -0.25, c);                  // apron
      b.box(0, 0.55, -0.45, 0.5, 0.42, 0.7, 0, c);                      // rear body
      b.box(0, 0.8, -0.35, 0.36, 0.1, 0.62, 0, 0x1a1a1a);               // seat
      b.box(0, 1.08, 0.56, 0.62, 0.06, 0.1, 0, 0x2b2b2b);               // handlebar
      b.cylinder(0, 0.85, 0.6, 0.04, 0.5, 0x444444, 5, -0.3);
      L.box(0, 1.02, 0.62, 0.16, 0.1, 0.05, 0, HEAD);
      L.box(0, 0.6, -0.82, 0.2, 0.06, 0.03, 0, TAIL);
    } else {
      b.box(0, 0.5, 0.0, 0.14, 0.14, 1.0, 0, 0x2b2b2b);                 // frame
      b.box(0, 0.78, 0.22, 0.34, 0.24, 0.5, 0.08, c);                    // tank
      b.box(0, 0.78, -0.3, 0.3, 0.1, 0.6, 0, 0x151515);                  // seat
      b.box(0, 0.58, -0.4, 0.32, 0.24, 0.5, 0, c);                       // side panel
      b.box(0.16, 0.4, -0.52, 0.08, 0.08, 0.6, 0, 0xbdbdbd);             // exhaust
      b.cylinder(0, 0.72, 0.58, 0.035, 0.7, 0x888888, 5, -0.4);          // fork
      b.box(0, 1.02, 0.46, 0.68, 0.05, 0.05, 0, 0x2b2b2b);               // bars
      b.box(0, 0.92, 0.62, 0.22, 0.2, 0.14, 0, c);                       // headlamp cowl
      b.box(0, 0.35, -0.68, 0.26, 0.04, 0.4, 0, 0x151515);               // mudguard
      L.box(0, 0.92, 0.7, 0.14, 0.12, 0.04, 0, HEAD);
      L.box(0, 0.72, -0.72, 0.14, 0.06, 0.03, 0, TAIL);
    }
    if (seed < 10) {
      riderParts(b, rng, scoot ? 0.78 : 0.8, scoot ? -0.36 : -0.3, { helmetChance: scoot ? 0.5 : 0.72, female: scoot ? rng.chance(0.45) : rng.chance(0.08) });
      if (rng.chance(0.35)) riderParts(b, rng, scoot ? 0.84 : 0.86, -0.66, { helmetChance: 0.12, pose: rng.chance(0.5) ? 'sidesaddle' : 'pillion' });
    }
  } else if (kind === 'auto') {
    buildAuto(b, L, rng, HEAD, TAIL, seed % 3 !== 0);
  } else if (kind === 'hatch' || kind === 'sedan' || kind === 'suv') {
    buildCar(b, L, kind, rng, HEAD, TAIL);
  } else if (kind === 'bus' || kind === 'campusbus') {
    const s = VEHICLE_SPECS[kind];
    const campus = kind === 'campusbus';
    const c1 = campus ? 0xf5f5f5 : rng.chance(0.5) ? 0xc62828 : 0x1f5fa8, c2 = campus ? 0x7b1e2b : 0xf2e6c9;
    const len = s.len, wid = s.wid;
    for (const z of [len / 2 - 1.8, -len / 2 + 2.2]) for (const x of [-wid / 2 + 0.25, wid / 2 - 0.25]) wheel(b, x, 0.5, z, 0.5, 0.3);
    b.box(0, 1.75, 0, wid, 2.5, len, 0, c1);
    b.box(0, 1.1, 0, wid + 0.02, 0.35, len, 0, c2);
    b.box(0, 2.25, 0, wid + 0.03, 0.9, len - 1.2, 0, 0x26323c);           // window band
    b.box(0, 2.1, len / 2, wid - 0.2, 1.3, 0.05, 0, 0x26323c);           // windscreen
    b.box(0, 3.05, 0, wid - 0.1, 0.1, len - 0.4, 0, c1);
    if (atlas && campus) {
      const slot = atlas.shopBoard('busmu', { en: 'Marwadi University', local: 'મારવાડી યુનિવર્સિટી', bg: '#7b1e2b', accent: '#f4b400', style: 1 });
      if (slot) { sign = new MeshBuilder(); sign.facingQuad(wid / 2 + 0.04, 1.45, 0, 1, 0, 4, 0.66, 0xffffff, slot.uv); sign.facingQuad(-wid / 2 - 0.04, 1.45, 0, -1, 0, 4, 0.66, 0xffffff, slot.uv); }
    }
    L.box(-wid / 2 + 0.3, 0.9, len / 2 + 0.01, 0.3, 0.2, 0.03, 0, HEAD); L.box(wid / 2 - 0.3, 0.9, len / 2 + 0.01, 0.3, 0.2, 0.03, 0, HEAD);
    L.box(-wid / 2 + 0.2, 1.0, -len / 2 - 0.01, 0.2, 0.3, 0.03, 0, TAIL); L.box(wid / 2 - 0.2, 1.0, -len / 2 - 0.01, 0.2, 0.3, 0.03, 0, TAIL);
    L.box(0, 2.95, len / 2 + 0.02, 1.2, 0.18, 0.03, 0, 0xffb300); // route display
  } else if (kind === 'truck') {
    // Painted Indian goods truck: decorated cab, wooden body, tarpaulin
    const cab = rng.pick([0xe65100, 0xf9a825, 0x1565c0, 0xc62828, 0x2e7d32]);
    const len = 8, wid = 2.45;
    for (const z of [2.6, -1.8, -2.9]) for (const x of [-wid / 2 + 0.25, wid / 2 - 0.25]) wheel(b, x, 0.5, z, 0.5, 0.32);
    b.box(0, 1.6, 3.1, wid, 2.0, 1.7, 0, cab);                      // cab
    b.box(0, 2.1, 3.96, wid - 0.3, 0.8, 0.05, -0.08, 0x2a3440);     // windscreen
    b.box(0, 2.72, 3.1, wid + 0.1, 0.25, 1.9, 0, 0xf2f2f2);         // cab visor (decorated)
    for (let i = 0; i < 6; i++) b.box(-wid / 2 + 0.2 + i * 0.41, 2.88, 3.9, 0.2, 0.12, 0.05, 0, [0xe53935, 0x43a047, 0xfdd835][i % 3]);
    b.box(0, 1.3, -0.9, wid, 1.5, 5.6, 0, 0x8d5a2b);                // wooden body
    b.box(0, 2.35, -0.9, wid + 0.05, 0.9, 5.7, 0, rng.pick([0x1a3a6b, 0x2e7d32, 0x5d4037]), 0, 0, 0); // tarp
    b.box(0, 0.7, 0, 0.6, 0.3, 7.6, 0, 0x222222);                   // chassis
    L.box(-0.9, 1.0, 3.96, 0.3, 0.2, 0.03, 0, HEAD); L.box(0.9, 1.0, 3.96, 0.3, 0.2, 0.03, 0, HEAD);
    L.box(-1.05, 0.9, -3.72, 0.22, 0.18, 0.03, 0, TAIL); L.box(1.05, 0.9, -3.72, 0.22, 0.18, 0.03, 0, TAIL);
    if (atlas) {
      const slot = atlas.truckBack();
      if (slot) { sign = new MeshBuilder(); sign.facingQuad(0, 1.45, -3.73, 0, -1, 2.2, 0.36, 0xffffff, slot.uv); }
    }
  } else if (kind === 'tempo') {
    const c = rng.pick([0xf5f5f5, 0x1565c0, 0xf9a825]);
    for (const z of [1.1, -1.0]) for (const x of [-0.62, 0.62]) wheel(b, x, 0.3, z, 0.3, 0.2);
    b.box(0, 1.05, 1.35, 1.5, 1.4, 1.0, 0, c);
    b.box(0, 1.35, 1.86, 1.3, 0.6, 0.04, -0.1, 0x2a3440);
    b.box(0, 0.75, -0.55, 1.55, 0.6, 2.4, 0, 0x5d6d7e);
    for (let i = 0; i < 5; i++) b.box(rng.float(-0.5, 0.5), 1.2, -1.4 + i * 0.45, 0.5, 0.4, 0.4, rng.float(-0.3, 0.3), rng.pick([0xa1887f, 0x8d6e63, 0xd7ccc8, 0x4caf50])); // sacks/crates
    L.box(-0.55, 0.75, 1.86, 0.2, 0.14, 0.03, 0, HEAD); L.box(0.55, 0.75, 1.86, 0.2, 0.14, 0.03, 0, HEAD);
    L.box(-0.65, 0.7, -1.76, 0.14, 0.1, 0.03, 0, TAIL); L.box(0.65, 0.7, -1.76, 0.14, 0.1, 0.03, 0, TAIL);
  }
  return { body: b.build(), lights: L.empty ? null : L.build(), sign: sign ? sign.build() : null };
}

// Gir cow: red-brown with the distinctive domed forehead and curved horns
export function buildCowGeometry(seed = 0) {
  const rng = new Rng(seed + 77);
  const b = new MeshBuilder();
  const c = rng.pick([0x8b3a1e, 0xa0522d, 0xe8e0d0, 0x6d3b22, 0xc9b79c]);
  const spot = rng.chance(0.5) ? 0xf2ede4 : c;
  b.box(0, 1.05, 0, 0.62, 0.62, 1.55, 0, c);
  b.box(0, 1.08, -0.3, 0.64, 0.5, 0.6, 0, spot);
  b.sphere(0, 1.42, 0.35, 0.22, 0.2, 0.28, c, 6);                          // hump
  for (const [x, z] of [[-0.2, 0.55], [0.2, 0.55], [-0.2, -0.55], [0.2, -0.55]]) b.box(x, 0.42, z, 0.12, 0.84, 0.12, 0, c);
  b.box(0, 1.15, 0.95, 0.3, 0.36, 0.5, -0.5, c);                          // head
  b.box(0, 0.98, 1.18, 0.24, 0.2, 0.22, -0.5, 0x3e2723);                  // muzzle
  b.sphere(0, 1.34, 0.9, 0.18, 0.12, 0.14, c, 6);                          // domed forehead
  b.box(-0.22, 1.2, 0.86, 0.22, 0.08, 0.14, 0, c, 0, 0.6);                 // droopy ears
  b.box(0.22, 1.2, 0.86, 0.22, 0.08, 0.14, 0, c, 0, -0.6);
  b.cylinder(-0.13, 1.46, 0.82, 0.04, 0.34, 0x3a2a1a, 5, -0.6, 0, 0.5);    // horns curving back
  b.cylinder(0.13, 1.46, 0.82, 0.04, 0.34, 0x3a2a1a, 5, -0.6, 0, -0.5);
  b.box(0, 0.95, -0.84, 0.06, 0.7, 0.06, 0, c, 0.3);                       // tail
  b.box(0, 0.78, 0.2, 0.2, 0.14, 0.4, 0, 0xd9b8a5);                        // dewlap/udder hint
  return b.build();
}

export function buildDogGeometry(seed = 0) {
  const rng = new Rng(seed + 99);
  const b = new MeshBuilder();
  const c = rng.pick([0xc8a165, 0x8d6e63, 0x3e2723, 0xe0cda8]);
  b.box(0, 0.45, 0, 0.26, 0.26, 0.7, 0, c);
  for (const [x, z] of [[-0.09, 0.26], [0.09, 0.26], [-0.09, -0.26], [0.09, -0.26]]) b.box(x, 0.18, z, 0.07, 0.36, 0.07, 0, c);
  b.box(0, 0.62, 0.42, 0.2, 0.2, 0.26, 0, c);
  b.box(0, 0.57, 0.58, 0.12, 0.1, 0.14, 0, 0x2b1d14);
  b.box(-0.07, 0.76, 0.4, 0.05, 0.1, 0.05, 0, c); b.box(0.07, 0.76, 0.4, 0.05, 0.1, 0.05, 0, c);
  b.box(0, 0.58, -0.42, 0.05, 0.05, 0.3, 0, c, -0.8);
  return b.build();
}

// Decorated wedding horse (ghodi) for the baraat event
export function buildHorseGeometry() {
  const b = new MeshBuilder();
  const c = 0xf5f0e6;
  b.box(0, 1.35, 0, 0.55, 0.6, 1.5, 0, c);
  for (const [x, z] of [[-0.18, 0.55], [0.18, 0.55], [-0.18, -0.55], [0.18, -0.55]]) b.box(x, 0.55, z, 0.13, 1.1, 0.13, 0, c);
  b.box(0, 1.85, 0.8, 0.28, 0.8, 0.3, 0.5, c);
  b.box(0, 2.2, 1.05, 0.22, 0.26, 0.5, 0.3, c);
  b.box(0, 1.5, 0, 0.62, 0.35, 1.0, 0, 0xc62828);          // saddle cloth
  b.box(0, 1.38, 0, 0.64, 0.08, 1.02, 0, 0xffd54f);         // gold trim
  b.box(0, 2.35, 0.95, 0.28, 0.12, 0.3, 0, 0xffd54f);       // head ornament
  riderParts(b, new Rng(5), 1.72, -0.05, { helmet: false, female: false, shirt: 0xf3e5ab });
  b.cylinder(0, 2.82, -0.05, 0.16, 0.2, 0xd32f2f, 8);        // safa turban
  return b.build();
}
