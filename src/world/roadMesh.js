import * as THREE from 'three';
import { MeshBuilder, ChunkedBuilder, V3 } from '../core/geom.js';
import { Rng } from '../core/rng.js';
import { CELL } from './spatial.js';

const Y_ROAD = 0.03, Y_JUNC = 0.036, Y_MARK = 0.05, Y_WALK = 0.17;

// Returns an array of {x,z,tx,tz,s} sampled between s0 and s1 on edge centerline
function samplePath(net, e, s0, s1, step = 1e9) {
  const out = [];
  const push = (s) => { const p = net.sample(e, s, {}); p.s = s; out.push(p); };
  push(s0);
  for (let k = 1; k < e.cum.length - 1; k++) if (e.cum[k] > s0 + 0.01 && e.cum[k] < s1 - 0.01) push(e.cum[k]);
  if (step < 1e8) { // extra subdivisions for dashed things
    const res = [];
    for (let i = 0; i < out.length; i++) res.push(out[i]);
    out.length = 0; out.push(...res);
  }
  push(s1);
  // smooth tangents at interior points (miter)
  for (let i = 0; i < out.length; i++) {
    const a = out[Math.max(0, i - 1)], b = out[Math.min(out.length - 1, i + 1)];
    let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    if (i > 0 && i < out.length - 1) out[i].tx = tx, out[i].tz = tz;
  }
  return out;
}

// Build a flat ribbon between lateral offsets l0..l1 (left positive) at height y.
function ribbon(b, path, l0, l1, y, color, uvScale = 0.125, colorFn = null) {
  for (let i = 0; i < path.length - 1; i++) {
    const p = path[i], q = path[i + 1];
    const pl = { x: p.tz, z: -p.tx }, ql = { x: q.tz, z: -q.tx };
    const c = colorFn ? colorFn(i, p) : color;
    const A = V3(p.x + pl.x * l0, y, p.z + pl.z * l0);
    const B = V3(q.x + ql.x * l0, y, q.z + ql.z * l0);
    const C = V3(q.x + ql.x * l1, y, q.z + ql.z * l1);
    const D = V3(p.x + pl.x * l1, y, p.z + pl.z * l1);
    // ensure upward normal
    const up = (B.x - A.x) * (D.z - A.z) - (B.z - A.z) * (D.x - A.x);
    const uv = (P) => [P.x * uvScale, P.z * uvScale];
    if (up < 0) b.quad(A, B, C, D, c, [...uv(A), ...uv(B), ...uv(C), ...uv(D)]);
    else b.quad(A, D, C, B, c, [...uv(A), ...uv(D), ...uv(C), ...uv(B)]);
  }
}

// Vertical strip (kerb face) at lateral offset l. side > 0: faces left (+lat), side < 0: faces right
function wallStrip(b, path, l, y0, y1, side, colorFn) {
  for (let i = 0; i < path.length - 1; i++) {
    const p = path[i], q = path[i + 1];
    const pl = { x: p.tz, z: -p.tx }, ql = { x: q.tz, z: -q.tx };
    const A = V3(p.x + pl.x * l, y0, p.z + pl.z * l), B = V3(q.x + ql.x * l, y0, q.z + ql.z * l);
    const C = V3(q.x + ql.x * l, y1, q.z + ql.z * l), D = V3(p.x + pl.x * l, y1, p.z + pl.z * l);
    const c = colorFn(i);
    // face normal should point toward -side*left (toward road center) i.e. away from the raised part
    if (side > 0) b.quad(B, A, D, C, c); else b.quad(A, B, C, D, c);
  }
}

// Split a path into short pieces of length `len` so painted curbs can alternate colour
function subdivide(net, e, s0, s1, len) {
  const out = [];
  const n = Math.max(1, Math.round((s1 - s0) / len));
  for (let i = 0; i <= n; i++) { const s = s0 + ((s1 - s0) * i) / n; const p = net.sample(e, s, {}); p.s = s; out.push(p); }
  return out;
}

export function buildRoads(net, grid, mats, collision) {
  const rng = new Rng(777);
  const asphalt = new ChunkedBuilder(220);
  const marks = new ChunkedBuilder(220);
  const walks = new ChunkedBuilder(220);
  const dividers = new ChunkedBuilder(220);
  const breakers = new MeshBuilder();
  const potholes = new MeshBuilder();
  const out = { streetlights: [], poles: [], trees: [], breakers: [], potholes: [], crossings: [], walkPaths: [] };

  const roadColor = { highway: 0xa4a4a6, arterial: 0xb3b0ac, street: 0xc4bfb7, lane: 0xe8e0d0, campus: 0xbdbab4, ring: 0xaaaaaa };

  // ---- raster roads into the occupancy grid first -------------------------
  for (const e of net.edges) {
    const sw = e.spec.sidewalk;
    for (let k = 1; k < e.pts.length; k++) {
      const a = e.pts[k - 1], c = e.pts[k];
      grid.fillSegment(a.x, a.z, c.x, c.z, e.hw + sw + (sw > 0 ? 0.2 : 2.6), CELL.WALK, [CELL.EMPTY]);
    }
  }
  for (const e of net.edges) for (let k = 1; k < e.pts.length; k++) {
    const a = e.pts[k - 1], c = e.pts[k];
    grid.fillSegment(a.x, a.z, c.x, c.z, e.hw, CELL.ROAD);
  }
  for (const n of net.nodes.values()) if (n.radius > 0) grid.fillCircle(n.x, n.z, n.radius, CELL.JUNCTION);

  // ---- edges -----------------------------------------------------------------
  for (const e of net.edges) {
    const s0 = e.trimA, s1 = e.len - e.trimB;
    if (s1 - s0 < 0.5) continue;
    const path = samplePath(net, e, s0, s1);
    const mid = net.sample(e, e.len / 2, {});
    const col = new THREE.Color(roadColor[e.cls]).offsetHSL(0, 0, rng.float(-0.02, 0.02));
    ribbon(asphalt.at(mid.x, mid.z), path, -e.hw, e.hw, Y_ROAD, col, 0.125);

    const sp = e.spec;
    const mb = marks.at(mid.x, mid.z);
    const white = 0xf2f0e6, yellow = 0xf2c14e;
    // dashed/solid helpers
    const dashed = (lat, color, w = 0.15, dash = 3, gap = 4) => {
      for (let s = s0 + 1; s < s1 - 1; s += dash + gap) {
        const p = subdivide(net, e, s, Math.min(s + dash, s1 - 1), 50);
        ribbon(mb, p, lat - w / 2, lat + w / 2, Y_MARK, color, 1);
      }
    };
    const solid = (lat, color, w = 0.15) => ribbon(mb, path, lat - w / 2, lat + w / 2, Y_MARK, color, 1);

    if (e.cls === 'highway' || e.cls === 'arterial') {
      const edgeLat = sp.median / 2 + sp.lanes * sp.laneW;
      solid(edgeLat, white); solid(-edgeLat, white);
      for (let l = 1; l < sp.lanes; l++) { const lat = sp.median / 2 + sp.laneW * l; dashed(lat, white); dashed(-lat, white); }
    } else if (e.cls === 'street' || e.cls === 'campus') {
      dashed(0, e.cls === 'campus' ? yellow : white, 0.14, 3, 5);
    } else if (e.cls === 'ring') {
      dashed(0, white, 0.15, 2.5, 3);
    }

    // ---- median divider with painted black/yellow kerb -------------------------
    if (sp.divider) {
      const d0 = s0 + 2.5, d1 = s1 - 2.5;
      if (d1 - d0 > 4) {
        const pieces = subdivide(net, e, d0, d1, 1.5);
        const db = dividers.at(mid.x, mid.z);
        const hwM = sp.median / 2 - 0.05;
        ribbon(db, pieces, -hwM, hwM, 0.34, e.cls === 'highway' ? 0x6f7d3e : 0x8a8a80, 0.5);
        const kerb = (i) => (i % 2 ? 0x1c1c1c : 0xf0c419);
        wallStrip(db, pieces, hwM, 0.02, 0.34, 1, kerb);
        wallStrip(db, pieces, -hwM, 0.02, 0.34, -1, kerb);
        // end caps + colliders
        for (let i = 0; i < pieces.length - 1; i += 4) {
          const p = pieces[i], q = pieces[Math.min(i + 4, pieces.length - 1)];
          const cx = (p.x + q.x) / 2, cz = (p.z + q.z) / 2, len = Math.hypot(q.x - p.x, q.z - p.z);
          const rot = Math.atan2(q.x - p.x, q.z - p.z);
          collision.addBox(cx, cz, hwM, len / 2, rot, 0.4, 'divider');
        }
        // median streetlights (double arm), every ~36 m
        for (let s = d0 + 6; s < d1 - 4; s += 36) {
          const p = net.sample(e, s, {});
          out.streetlights.push({ x: p.x, z: p.z, rot: Math.atan2(p.tx, p.tz), type: 'double', arm: sp.median / 2 + sp.laneW * 1.2 });
        }
        if (e.cls === 'highway') for (let s = d0 + 3; s < d1 - 3; s += rng.float(5, 9)) {
          const p = net.sample(e, s, {});
          out.trees.push({ x: p.x, z: p.z, kind: 'bush', s: rng.float(0.6, 1.0) });
        }
      }
    }

    // ---- sidewalks -----------------------------------------------------------------
    if (sp.sidewalk > 0) {
      const w0 = s0 + 1.2, w1 = s1 - 1.2;
      if (w1 - w0 > 2) {
        const pieces = subdivide(net, e, w0, w1, e.cls === 'arterial' ? 1.2 : 6);
        const wb = walks.at(mid.x, mid.z);
        const lo = e.hw, hi = e.hw + sp.sidewalk;
        const paint = e.cls === 'arterial';
        const kerb = (i) => (paint ? (i % 2 ? 0x1c1c1c : 0xf0c419) : 0x9d978c);
        const top = e.cls === 'campus' ? 0xc9b9a3 : e.cls === 'lane' ? 0x9a8f80 : 0xb3a998;
        ribbon(wb, pieces, lo, hi, Y_WALK, top, 0.5);
        ribbon(wb, pieces, -hi, -lo, Y_WALK, top, 0.5);
        wallStrip(wb, pieces, lo, Y_ROAD, Y_WALK, -1, kerb);
        wallStrip(wb, pieces, -lo, Y_ROAD, Y_WALK, 1, kerb);
        out.walkPaths.push({ e, lat: e.hw + sp.sidewalk * 0.55, s0: w0, s1: w1 });
      }
    } else if (e.cls === 'highway' || e.cls === 'ring') {
      out.walkPaths.push({ e, lat: e.hw + 1.2, s0: s0 + 2, s1: s1 - 2, shoulder: true });
    }

    // ---- side streetlights / utility poles / trees ---------------------------------
    const sideLat = e.hw + Math.max(0.35, sp.sidewalk - 0.35);
    if (sp.lights === 'side' || sp.lights === 'wall') {
      const step = sp.lights === 'wall' ? 26 : 32;
      let side = 1;
      for (let s = s0 + 6; s < s1 - 5; s += step) {
        const p = net.lanePoint(e, 0, s, side * sideLat, {});
        out.streetlights.push({ x: p.x, z: p.z, rot: Math.atan2(-side * p.tz, side * p.tx), type: sp.lights === 'wall' ? 'wall' : 'single', arm: 1.6 });
        side = e.cls === 'campus' ? side : -side;
      }
    }
    if (e.cls === 'street' || e.cls === 'lane' || e.cls === 'highway') {
      const lat = e.cls === 'highway' ? e.hw + 3.5 : -sideLat;
      let prev = null;
      for (let s = s0 + 4; s < s1 - 3; s += e.cls === 'lane' ? 22 : 30) {
        const p = net.lanePoint(e, 0, s, lat, {});
        const pole = { x: p.x, z: p.z, edge: e.id, prev };
        out.poles.push(pole); prev = pole;
      }
    }
    if (e.cls === 'arterial' || e.cls === 'campus' || (e.cls === 'street' && rng.chance(0.5))) {
      for (let s = s0 + 8; s < s1 - 8; s += rng.float(14, 24)) {
        const side = rng.chance(0.5) ? 1 : -1;
        const lat = side * (e.hw + (sp.sidewalk > 1.5 ? sp.sidewalk - 0.8 : sp.sidewalk + 1.4));
        const p = net.lanePoint(e, 0, s, lat, {});
        out.trees.push({ x: p.x, z: p.z, kind: e.cls === 'campus' ? rng.pick(['neem', 'ashoka', 'gulmohar']) : rng.pick(['neem', 'neem', 'peepal']), s: rng.float(0.8, 1.2), onWalk: true });
      }
    }

    // ---- speed breakers (very Indian) ------------------------------------------------
    const wantBreaker = e.cls === 'campus' ? 2 : e.cls === 'street' ? (rng.chance(0.6) ? 1 : 0) : e.cls === 'lane' ? (rng.chance(0.5) ? 1 : 0) : 0;
    for (let i = 0; i < wantBreaker; i++) {
      if (s1 - s0 < 30) break;
      const s = i === 0 ? s0 + 10 : s1 - 10;
      const p = net.sample(e, s, {});
      const rot = Math.atan2(p.tx, p.tz);
      const w = e.hw * 2;
      // painted hump: alternating black / white stripes
      const nStr = Math.max(3, Math.round(w / 0.9));
      for (let k = 0; k < nStr; k++) {
        const lat = -e.hw + (k + 0.5) * (w / nStr);
        const cx = p.x + p.tz * lat, cz = p.z - p.tx * lat;
        breakers.box(cx, 0.06, cz, w / nStr, 0.1, 1.1, rot, k % 2 ? 0x222222 : 0xe8e4d8);
        breakers.box(cx, 0.03, cz, w / nStr, 0.05, 1.6, rot, k % 2 ? 0x222222 : 0xe8e4d8);
      }
      out.breakers.push({ x: p.x, z: p.z, tx: p.tx, tz: p.tz, hw: e.hw, e });
    }
    // ---- potholes on older roads -----------------------------------------------------
    const potCount = e.cls === 'highway' ? Math.floor(e.len / 90) : e.cls === 'street' ? Math.floor(e.len / 120) : e.cls === 'lane' ? Math.floor(e.len / 70) : 0;
    for (let i = 0; i < potCount; i++) {
      const s = rng.float(s0 + 5, s1 - 5);
      const lat = rng.float(-e.hw + 0.8, e.hw - 0.8);
      const p = net.lanePoint(e, 0, s, lat, {});
      const r = rng.float(0.35, 0.8);
      const g = new THREE.CircleGeometry(1, 10); g.rotateX(-Math.PI / 2);
      const m = new THREE.Matrix4().compose(V3(p.x, Y_MARK - 0.005, p.z), new THREE.Quaternion(), V3(r * 1.3, 1, r));
      potholes.addGeometry(g, m, 0x2c2a27); g.dispose();
      out.potholes.push({ x: p.x, z: p.z, r });
    }
  }

  // ---- junction discs, zebra crossings and stop lines ------------------------------
  for (const n of net.nodes.values()) {
    if (n.radius <= 0) continue;
    const jb = asphalt.at(n.x, n.z);
    const g = new THREE.CircleGeometry(n.radius + 0.4, 24); g.rotateX(-Math.PI / 2);
    const m = new THREE.Matrix4().makeTranslation(n.x, Y_JUNC, n.z);
    const cls = n.edges[0].cls;
    jb.addGeometry(g, m, roadColor[cls] || 0x6a6866, 1); g.dispose();
    const isBig = n.type === 'signal' || (n.edges.length >= 3 && n.edges.some((e) => e.cls === 'arterial'));
    if (!isBig) continue;
    const mb = marks.at(n.x, n.z);
    for (const e of n.edges) {
      const d = net.dirAtNode(e, n);
      const startS = e.a === n ? e.trimA : e.len - e.trimB;
      const p = net.sample(e, startS, {});
      const lx = d.z, lz = -d.x; // left of outward direction
      const hw = e.hw - 0.4;
      // zebra
      for (let lat = -hw + 0.4; lat < hw - 0.3; lat += 1.0) {
        const cx = p.x + lx * lat + d.x * 1.8, cz = p.z + lz * lat + d.z * 1.8;
        mb.box(cx, Y_MARK - 0.02, cz, 0.5, 0.02, 3, Math.atan2(d.x, d.z), 0xf2f0e6);
      }
      out.crossings.push({ x: p.x + d.x * 1.8, z: p.z + d.z * 1.8, dx: d.x, dz: d.z, hw: e.hw, node: n, e });
      // stop line on the approaching (inbound) side: inbound traffic drives on the left of the inbound direction (-d)
      const sx = p.x + d.x * 3.8, sz = p.z + d.z * 3.8;
      const inLx = -lx, inLz = -lz; // left of inbound direction
      const half = e.oneway ? e.hw : e.hw / 2;
      const off = e.oneway ? 0 : half;
      mb.box(sx + inLx * off, Y_MARK - 0.02, sz + inLz * off, 0.35, 0.02, half * 2 - 0.6, Math.atan2(d.x, d.z) + Math.PI / 2, 0xf2f0e6);
    }
  }

  // ---- assemble meshes -----------------------------------------------------------------
  const meshes = [];
  meshes.push(...asphalt.buildMeshes(mats.road, { receiveShadow: true, name: 'road' }));
  meshes.push(...marks.buildMeshes(mats.marking, { receiveShadow: true, name: 'marking' }));
  meshes.push(...walks.buildMeshes(mats.walk, { receiveShadow: true, name: 'walk' }));
  meshes.push(...dividers.buildMeshes(mats.plain, { receiveShadow: true, castShadow: true, name: 'divider' }));
  if (!breakers.empty) { const m = new THREE.Mesh(breakers.build(), mats.plain); m.receiveShadow = true; meshes.push(m); }
  if (!potholes.empty) { const m = new THREE.Mesh(potholes.build(), mats.pothole); meshes.push(m); }
  out.meshes = meshes;
  return out;
}
