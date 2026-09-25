import * as THREE from 'three';
import { Rng } from '../core/rng.js';
import { CELL } from './spatial.js';
import { V3 } from '../core/geom.js';

// Marwadi University: an approximate, recognisable campus built from public descriptions
// (main gate on Rajkot–Morbi Road, academic blocks, hostels, parking, cricket & football
// grounds, volleyball, amphitheatre and lake). Not an architectural survey.

export const CAMPUS = { x0: 20, x1: 640, z0: -820, z1: -490 };

export function buildCampus(ctx) {
  const { grid, collision, atlas, B, pois, net } = ctx;
  const rng = new Rng(2024);
  const out = { walkPoints: [], busStops: [], spawn: { x: 118, z: -571, heading: Math.PI }, lake: null, parkedSpots: [], stallsDay: [], lightPoints: [] };

  // Reserve the whole campus so the city generator never builds inside it
  grid.fillRect((CAMPUS.x0 + CAMPUS.x1) / 2, (CAMPUS.z0 + CAMPUS.z1) / 2, (CAMPUS.x1 - CAMPUS.x0) / 2, (CAMPUS.z1 - CAMPUS.z0) / 2, 0, CELL.RESERVED, [CELL.EMPTY]);

  const box = (x, y, z, sx, sy, sz, c, rot = 0, collide = true, h = sy) => {
    B.body.at(x, z).box(x, y, z, sx, sy, sz, rot, c);
    if (collide) collision.addBox(x, z, sx / 2, sz / 2, rot, h, 'building');
  };
  const flat = (builder, x, z, sx, sz, y, c, rot = 0) => builder.at(x, z).box(x, y, z, sx, 0.04, sz, rot, c);

  // ---- boundary wall with maroon band ---------------------------------------
  const wallH = 2.2, wc = 0xefe4d0, band = 0x7b1e2b;
  const wallSeg = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0); if (len < 0.5) return;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, rot = Math.atan2(x1 - x0, z1 - z0);
    B.body.at(cx, cz).box(cx, wallH / 2, cz, 0.3, wallH, len, rot, wc);
    B.body.at(cx, cz).box(cx, wallH - 0.25, cz, 0.34, 0.3, len, rot, band);
    collision.addBox(cx, cz, 0.2, len / 2, rot, wallH, 'wall');
  };
  const { x0, x1, z0, z1 } = CAMPUS;
  wallSeg(x0, z0, x0, -609); wallSeg(x0, -591, x0, z1);   // west wall with main gate gap
  wallSeg(x0, z1, 292, z1); wallSeg(308, z1, x1, z1);      // south wall with south gate gap
  wallSeg(x1, z1, x1, z0); wallSeg(x1, z0, x0, z0);

  // ---- MAIN GATE: arch with bilingual name board -----------------------------
  const gx = x0, gz = -600;
  box(gx, 5.6, gz - 8.2, 1.6, 11.2, 1.6, 0x7b1e2b);
  box(gx, 5.6, gz + 8.2, 1.6, 11.2, 1.6, 0x7b1e2b);
  box(gx, 9.4, gz, 2.0, 3.6, 18.2, 0xf3ead8, 0, false);
  box(gx, 11.4, gz, 1.2, 0.4, 16, 0x7b1e2b, 0, false);
  const slot = atlas.hoarding('mugate', { title: 'MARWADI UNIVERSITY', sub: 'Rajkot–Morbi Road, Gauridad, Rajkot', local: 'મારવાડી યુનિવર્સિટી', bg: '#7b1e2b', accent: '#f4b400' });
  if (slot) {
    B.signs.at(gx, gz).facingQuad(gx - 1.02, 9.4, gz, -1, 0, 15, 3.3, 0xffffff, slot.uv);
    B.signs.at(gx, gz).facingQuad(gx + 1.02, 9.4, gz, 1, 0, 15, 3.3, 0xffffff, slot.uv);
  }
  // security cabin + raised boom barrier
  box(gx + 6, 1.3, gz - 12, 2.6, 2.6, 2.6, 0xe0d6c4);
  box(gx + 6, 2.75, gz - 12, 3.2, 0.2, 3.2, 0x7b1e2b, 0, false);
  B.winLit.at(gx, gz).facingQuad(gx + 7.32, 1.5, gz - 12, 1, 0, 1.4, 0.9, 0xfff0cc);
  box(gx + 3, 0.6, gz - 6.2, 0.4, 1.2, 0.4, 0x333333);
  B.body.at(gx, gz).box(gx + 3, 3.6, gz - 6.2, 0.14, 6, 0.14, 0, 0xd32f2f, 0, 0, 0.05);
  out.guardPoints = [{ x: gx + 4, z: gz - 10 }, { x: gx + 4, z: gz + 10 }];
  pois.push({ name: 'Marwadi University Main Gate', kind: 'campus', x: gx - 8, z: gz + 4, zone: 'campus', landmark: 'mu_gate' });

  // ---- Main academic block ------------------------------------------------------
  const acad = (x, z, W, D, floors, color, name, glass = true) => {
    const H = floors * 3.6;
    box(x, H / 2, z, W, H, D, color);
    // horizontal glass bands on the south face (faces +z)
    for (let f = 0; f < floors; f++) {
      const y = f * 3.6 + 2.0;
      if (glass) {
        const lit = rng.chance(0.6);
        (lit ? B.winLit : B.winDark).at(x, z).facingQuad(x, y, z + D / 2 + 0.03, 0, 1, W - 4, 1.9, lit ? 0xdff1ff : 0x31465a);
        (rng.chance(0.4) ? B.winLit : B.winDark).at(x, z).facingQuad(x, y, z - D / 2 - 0.03, 0, -1, W - 4, 1.9, 0xdff1ff);
      }
      box(x, f * 3.6 + 0.1, z + D / 2 + 0.4, W + 0.4, 0.2, 0.8, 0xffffff, 0, false);
      // side windows
      for (let k = 0; k < Math.floor(D / 4); k++) {
        const wz = z - D / 2 + (k + 0.5) * (D / Math.floor(D / 4));
        B.winDark.at(x, z).facingQuad(x + W / 2 + 0.03, y, wz, 1, 0, 1.5, 1.6, 0x31465a);
        B.winDark.at(x, z).facingQuad(x - W / 2 - 0.03, y, wz, -1, 0, 1.5, 1.6, 0x31465a);
      }
    }
    // vertical fins
    for (let k = 0; k <= Math.floor(W / 6); k++) box(x - W / 2 + k * (W / Math.floor(W / 6)), H / 2, z + D / 2 + 0.3, 0.35, H, 0.6, 0x7b1e2b, 0, false);
    // parapet + solar panels on roof
    box(x, H + 0.5, z, W, 1.0, D, color, 0, false);
    for (let i = 0; i < Math.floor(W / 7); i++) for (let j = 0; j < Math.floor(D / 8); j++) {
      const px = x - W / 2 + 4 + i * 7, pz = z - D / 2 + 4 + j * 8;
      B.body.at(px, pz).box(px, H + 1.4, pz, 5, 0.1, 2.6, 0, 0x1f3b73, -0.35);
    }
    // name board
    const s = atlas.shopBoard('acad-' + name, { en: name, local: '', bg: '#7b1e2b', fg: '#fff', accent: '#f4b400', style: 1 });
    if (s) B.signs.at(x, z).facingQuad(x, H - 1.2, z + D / 2 + 0.65, 0, 1, Math.min(W * 0.5, 22), Math.min(W * 0.5, 22) / 6, 0xffffff, s.uv);
    return H;
  };
  acad(160, -665, 110, 40, 5, 0xf1ece2, 'Main Academic Block');
  // entrance porch facing the front lawn
  box(160, 5.5, -640, 16, 0.5, 10, 0x7b1e2b, 0, false);
  for (const dx of [-7, 7]) box(160 + dx, 2.7, -636, 0.8, 5.4, 0.8, 0xf1ece2);
  acad(320, -684, 70, 44, 4, 0xe9e2d4, 'Engineering Block');
  acad(300, -565, 40, 26, 3, 0xf0e8dc, 'Central Library');
  box(300, 0.2, -548, 30, 0.4, 6, 0xcfc6b8, 0, false);
  pois.push({ name: 'MU Main Academic Building', kind: 'campus', x: 160, z: -606, zone: 'campus', landmark: 'mu_main' });
  pois.push({ name: 'MU Engineering Block', kind: 'campus', x: 330, z: -606, zone: 'campus' });
  pois.push({ name: 'MU Central Library', kind: 'campus', x: 300, z: -545, zone: 'campus' });

  // Front lawn with flagpole and a round fountain
  flat(B.grass, 160, -622, 96, 30, 0.06, 0x9bbf63);
  box(160, 0.35, -622, 8, 0.7, 8, 0xcfc6b8, 0, true, 0.7);
  B.body.at(160, -622).cylinder(160, 0.55, -622, 3.4, 0.5, 0xcfc6b8, 16);
  B.winDark.at(160, -622).cylinder(160, 0.82, -622, 3.1, 0.05, 0x5f9aa8, 16);
  B.body.at(120, -622).cylinder(120, 7, -622, 0.1, 14, 0xdddddd, 6);
  B.body.at(120, -622).box(120.9, 12.9, -622, 1.8, 0.4, 0.02, 0, 0xff9933);
  B.body.at(120, -622).box(120.9, 12.5, -622, 1.8, 0.4, 0.02, 0, 0xffffff);
  B.body.at(120, -622).box(120.9, 12.1, -622, 1.8, 0.4, 0.02, 0, 0x138808);
  collision.addCircle(120, -622, 0.3, 14);

  // ---- Amphitheatre (semicircular tiers facing a stage) --------------------------------
  const ax = 250, az = -642;
  for (let t = 0; t < 6; t++) {
    const r = 8 + t * 2.2;
    const g = new THREE.RingGeometry(r, r + 2.2, 20, 1, Math.PI, Math.PI);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Matrix4().makeTranslation(ax, 0.45 * (t + 1), az - 14);
    B.body.at(ax, az).addGeometry(g, m, t % 2 ? 0xd7cbb5 : 0xc9bca4); g.dispose();
    const side = new THREE.CylinderGeometry(r, r, 0.45, 20, 1, true, -Math.PI / 2, Math.PI);
    const m2 = new THREE.Matrix4().compose(V3(ax, 0.45 * t + 0.225, az - 14), new THREE.Quaternion(), V3(-1, 1, 1));
    B.body.at(ax, az).addGeometry(side, m2, 0xb8aa90); side.dispose();
  }
  box(ax, 0.6, az - 18, 16, 1.2, 6, 0xb8aa90, 0, true, 1.2);
  collision.addBox(ax, az - 3, 21, 11, 0, 2.7, 'building');
  pois.push({ name: 'MU Amphitheatre', kind: 'campus', x: ax, z: -606, zone: 'campus' });

  // ---- Hostels (long blocks, balconies with drying clothes) ------------------------------
  const hostel = (x, z, W, name, landmark) => {
    const floors = 5, H = floors * 3.2, D = 22;
    box(x, H / 2, z, W, H, D, 0xf3e3c3);
    for (let f = 0; f < floors; f++) for (let k = 0; k < Math.floor(W / 4); k++) {
      const wx = x - W / 2 + (k + 0.5) * (W / Math.floor(W / 4));
      const y = f * 3.2 + 1.8;
      const lit = rng.chance(0.65);
      (lit ? B.winLit : B.winDark).at(wx, z).facingQuad(wx, y, z + D / 2 + 0.03, 0, 1, 1.4, 1.3, lit ? rng.pick([0xfff0cc, 0xdff1ff]) : 0x2b3440);
      (rng.chance(0.5) ? B.winLit : B.winDark).at(wx, z).facingQuad(wx, y, z - D / 2 - 0.03, 0, -1, 1.4, 1.3, 0xfff0cc);
      if (f > 0) {
        B.body.at(wx, z).box(wx, f * 3.2 + 0.05, z + D / 2 + 0.6, 3.4, 0.14, 1.2, 0, 0xe5d3b0);
        B.body.at(wx, z).box(wx, f * 3.2 + 0.55, z + D / 2 + 1.15, 3.4, 0.9, 0.06, 0, 0x7b1e2b);
        if (rng.chance(0.45)) B.body.at(wx, z).box(wx + rng.float(-1, 1), f * 3.2 + 1.2, z + D / 2 + 1.0, 0.7, 0.9, 0.03, 0, rng.pick([0xffffff, 0x1565c0, 0xe53935, 0xfdd835, 0x212121]));
      }
    }
    box(x, H + 0.45, z, W, 0.9, D, 0xf3e3c3, 0, false);
    for (let i = 0; i < Math.floor(W / 14); i++) B.body.at(x, z).cylinder(x - W / 2 + 6 + i * 14, H + 1.8, z, 0.8, 1.8, 0x1d1d1f, 10);
    const s = atlas.shopBoard('hostel-' + name, { en: name, local: '', bg: '#1e2a5a', fg: '#fff', accent: '#f4b400' });
    if (s) B.signs.at(x, z).facingQuad(x, 3.4, z + D / 2 + 1.25, 0, 1, 10, 10 / 6, 0xffffff, s.uv);
    pois.push({ name: 'MU ' + name, kind: 'hostel', x, z: z + D / 2 + 9, zone: 'campus', landmark });
  };
  hostel(170, -770, 120, 'Boys Hostel', 'mu_boys');
  hostel(330, -770, 90, 'Girls Hostel', 'mu_girls');

  // ---- Canteen + campus stationery (pickups) ----------------------------------------------
  box(205, 2.2, -560, 30, 4.4, 16, 0xf0d9b5);
  box(205, 4.6, -560, 33, 0.3, 19, 0x7b1e2b, 0, false);
  B.shopLit.at(205, -560).facingQuad(205, 1.6, -551.96, 0, 1, 24, 2.4, 0xffe6b8);
  const cs = atlas.shopBoard('canteen', { en: 'MU Canteen', local: 'કેન્ટીન', bg: '#f4b400', fg: '#5a1010', accent: '#7b1e2b', style: 2 });
  if (cs) B.signs.at(205, -560).facingQuad(205, 3.6, -551.8, 0, 1, 8, 8 / 6, 0xffffff, cs.uv);
  for (let i = 0; i < 6; i++) { // outdoor tables
    const tx = 192 + (i % 3) * 13, tz = -545 + Math.floor(i / 3) * 5;
    B.body.at(tx, tz).cylinder(tx, 0.75, tz, 0.8, 0.06, 0xf5f5f5, 10);
    B.body.at(tx, tz).cylinder(tx, 0.37, tz, 0.08, 0.74, 0x9e9e9e, 5);
    B.body.at(tx, tz).cylinder(tx, 2.4, tz, 1.6, 0.05, i % 2 ? 0xe53935 : 0xfdd835, 10, 0, 0, 0, 0.02);
    B.body.at(tx, tz).cylinder(tx, 1.2, tz, 0.04, 2.4, 0x777777, 4);
  }
  pois.push({ name: 'MU Canteen', kind: 'restaurant', x: 205, z: -545, zone: 'campus', shop: true, landmark: 'mu_canteen', nightOpen: false });
  box(238, 1.8, -560, 10, 3.6, 10, 0xe8e0d0);
  B.shopLit.at(238, -560).facingQuad(238, 1.4, -554.96, 0, 1, 7, 2.2, 0xfff1d0);
  const xs = atlas.shopBoard('muxerox', { en: 'Campus Xerox & Stationery', local: 'ઝેરોક્ષ', bg: '#ffffff', fg: '#1e2a5a', accent: '#7b1e2b', style: 2 });
  if (xs) B.signs.at(238, -560).facingQuad(238, 3.0, -554.9, 0, 1, 7, 7 / 6, 0xffffff, xs.uv);
  pois.push({ name: 'Campus Xerox & Stationery', kind: 'xerox', x: 238, z: -546, zone: 'campus', shop: true });

  // ---- Student parking: the spawn point -------------------------------------------------
  flat(B.paved, 138, -566, 76, 44, 0.05, 0xb9b1a4);
  grid.fillRect(138, -566, 38, 22, 0, CELL.PAVED, [CELL.RESERVED]);
  grid.fillRect(55, -560, 10, 20, 0, CELL.PAVED, [CELL.RESERVED]);
  for (let row = 0; row < 4; row++) for (let i = 0; i < 22; i++) {
    if (row <= 1 && i >= 3 && i <= 6) continue; // keep a clear lane out of the spawn
    const px = 104 + i * 3.1, pz = -584 + row * 11;
    if (rng.chance(0.82)) out.parkedSpots.push({ x: px, z: pz, rot: row % 2 ? Math.PI : 0, kind: rng.chance(0.55) ? 'bike' : 'scooter' });
  }
  // parking shade structure
  for (let i = 0; i < 5; i++) { box(108 + i * 16, 1.4, -590, 0.25, 2.8, 0.25, 0x666666); }
  B.body.at(140, -590).box(140, 2.9, -589, 70, 0.08, 5, 0, 0x5b7c99, 0.12);
  const ps = atlas.shopBoard('parking', { en: 'Student Two-Wheeler Parking', local: 'ટુ-વ્હીલર પાર્કિંગ', bg: '#1565c0', accent: '#fff', style: 1 });
  if (ps) { box(96, 1.5, -546, 0.15, 3, 0.15, 0x555555); B.signs.at(96, -546).facingQuad(96, 3.2, -545.9, 0, 1, 4.8, 0.8, 0xffffff, ps.uv); }

  // ---- Campus bus bay near the gate ------------------------------------------------------
  flat(B.paved, 55, -560, 20, 40, 0.05, 0xa9a194);
  box(44, 2.6, -560, 3, 0.15, 14, 0x1e2a5a, 0, false);
  for (const dz of [-6, 6]) box(44, 1.3, -560 + dz, 0.15, 2.6, 0.15, 0x555555);
  out.busStops.push({ x: 50, z: -560 });

  // ---- Cricket ground --------------------------------------------------------------------
  const cg = new THREE.CircleGeometry(1, 48); cg.rotateX(-Math.PI / 2);
  B.grass.at(510, -660).addGeometry(cg, new THREE.Matrix4().compose(V3(510, 0.05, -660), new THREE.Quaternion(), V3(72, 1, 58)), 0x7fb24a, 1);
  const rope = new THREE.RingGeometry(0.97, 1, 64); rope.rotateX(-Math.PI / 2);
  B.paved.at(510, -660).addGeometry(rope, new THREE.Matrix4().compose(V3(510, 0.07, -660), new THREE.Quaternion(), V3(70, 1, 56)), 0xffffff, 1);
  cg.dispose(); rope.dispose();
  flat(B.paved, 510, -660, 3, 20, 0.08, 0xcdb88f);
  grid.fillRect(510, -660, 74, 60, 0, CELL.GRASS, [CELL.RESERVED]);
  for (const dz of [-9.5, 9.5]) for (const dx of [-0.2, 0, 0.2]) B.body.at(510, -660).cylinder(510 + dx, 0.36, -660 + dz, 0.03, 0.72, 0xf5e6c8, 4);
  box(510, 2.5, -722, 12, 5, 0.4, 0xffffff, 0, false);
  box(510, 2.5, -598.5, 12, 5, 0.4, 0xffffff, 0, false);
  // pavilion
  box(612, 3, -660, 16, 6, 30, 0xf1ece2);
  box(602, 6.3, -660, 6, 0.3, 30, 0x7b1e2b, 0, false);
  for (let i = 0; i < 4; i++) box(598 - i * 1.2, 0.3 + i * 0.4, -660, 1.2, 0.6 + i * 0.8, 26, 0xbdb3a2, 0, false);
  pois.push({ name: 'MU Cricket Ground Pavilion', kind: 'campus', x: 585, z: -640, zone: 'campus', landmark: 'mu_cricket' });

  // ---- Football ground + volleyball court --------------------------------------------------
  flat(B.grass, 505, -540, 90, 52, 0.05, 0x76a845);
  grid.fillRect(505, -540, 47, 28, 0, CELL.GRASS, [CELL.RESERVED]);
  grid.fillRect(598, -535, 10, 6, 0, CELL.GRASS, [CELL.RESERVED]);
  const line = (x, z, sx, sz) => flat(B.paved, x, z, sx, sz, 0.075, 0xffffff);
  line(505, -566, 86, 0.3); line(505, -514, 86, 0.3); line(462, -540, 0.3, 52); line(548, -540, 0.3, 52); line(505, -540, 0.3, 52);
  for (const gx2 of [461, 549]) { box(gx2, 1.2, -543.6, 0.15, 2.4, 0.15, 0xffffff); box(gx2, 1.2, -536.4, 0.15, 2.4, 0.15, 0xffffff); box(gx2, 2.4, -540, 0.15, 0.15, 7.3, 0xffffff, 0, false); }
  flat(B.paved, 598, -535, 18, 9, 0.06, 0xd8b98a);
  box(598, 1.2, -539.8, 0.12, 2.4, 0.12, 0x444444); box(598, 1.2, -530.2, 0.12, 2.4, 0.12, 0x444444);
  box(598, 2.1, -535, 0.04, 0.8, 9.6, 0xf5f5f5, 0, false);

  // ---- Campus lake with stone ghat edge ----------------------------------------------------
  const lg = new THREE.CircleGeometry(1, 40); lg.rotateX(-Math.PI / 2);
  const lake = new THREE.Mesh(lg, ctx.mats.water);
  lake.scale.set(68, 1, 22); lake.position.set(530, 0.04, -785);
  out.lake = lake;
  const edge = new THREE.RingGeometry(1, 1.06, 48); edge.rotateX(-Math.PI / 2);
  B.paved.at(530, -785).addGeometry(edge, new THREE.Matrix4().compose(V3(530, 0.12, -785), new THREE.Quaternion(), V3(68, 1, 22)), 0xa89f8f, 1);
  edge.dispose();
  grid.fillRect(530, -785, 69, 23, 0, CELL.WATER);
  for (let a = 0; a < Math.PI * 2; a += 0.12) { // soft collision ring around the lake
    const x = 530 + Math.cos(a) * 67, z = -785 + Math.sin(a) * 21;
    collision.addCircle(x, z, 1.4, 0.4, 'water');
  }
  pois.push({ name: 'Campus Lake Walkway', kind: 'campus', x: 530, z: -758, zone: 'campus', landmark: 'mu_lake' });

  // ---- Lawns and walkways ------------------------------------------------------------------
  flat(B.grass, 230, -800, 380, 26, 0.05, 0x8fb45a);
  flat(B.grass, 55, -700, 50, 160, 0.05, 0x93b75e);
  flat(B.paved, 250, -618, 26, 22, 0.06, 0xc7bba6);
  flat(B.paved, 205, -540, 60, 12, 0.06, 0xc7bba6);

  // campus direction signs
  const dir = atlas.roadSign('campusdir', ['↑ Main Block · Library', '← Hostels   Sports →', 'મારવાડી યુનિવર્સિટી']);
  if (dir) { box(96, 1.4, -606, 0.12, 2.8, 0.12, 0x555555); B.signs.at(96, -606).facingQuad(96, 3.4, -605.9, 0, 1, 3.6, 2.4, 0xffffff, dir.uv); }

  // pedestrian wander points
  out.walkPoints = [
    { x: 160, z: -632 }, { x: 205, z: -545 }, { x: 238, z: -548 }, { x: 300, z: -548 }, { x: 250, z: -618 },
    { x: 170, z: -752 }, { x: 330, z: -752 }, { x: 128, z: -560 }, { x: 55, z: -565 }, { x: 330, z: -656 },
    { x: 585, z: -640 }, { x: 505, z: -520 }, { x: 530, z: -760 }, { x: 440, z: -600 }, { x: 120, z: -610 },
  ];
  // decorative campus trees on lawns
  out.trees = [];
  for (let i = 0; i < 70; i++) {
    const x = rng.float(x0 + 6, x1 - 6), z = rng.float(z0 + 6, z1 - 6);
    const c = grid.get(x, z);
    if (c === CELL.RESERVED && collision.query(x - 3, z - 3, x + 3, z + 3, []).length === 0) out.trees.push({ x, z, kind: rng.pick(['neem', 'gulmohar', 'ashoka', 'peepal']), s: rng.float(0.9, 1.4) });
  }
  return out;
}
