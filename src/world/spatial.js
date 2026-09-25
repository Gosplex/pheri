import { pointSegDist } from '../core/rng.js';

export const CELL = { EMPTY: 0, ROAD: 1, WALK: 2, JUNCTION: 3, BUILDING: 4, RESERVED: 5, WATER: 6, GRASS: 7, PAVED: 8 };

// 2m occupancy grid over the world. Used during generation (so buildings never land on roads)
// and at runtime to know what surface the bike is on.
export class Grid {
  constructor(b, cell = 2) {
    this.b = b; this.cell = cell;
    this.w = Math.ceil((b.maxX - b.minX) / cell); this.h = Math.ceil((b.maxZ - b.minZ) / cell);
    this.data = new Uint8Array(this.w * this.h);
  }
  idx(x, z) {
    const i = Math.floor((x - this.b.minX) / this.cell), j = Math.floor((z - this.b.minZ) / this.cell);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return -1;
    return j * this.w + i;
  }
  get(x, z) { const i = this.idx(x, z); return i < 0 ? CELL.RESERVED : this.data[i]; }
  set(x, z, v) { const i = this.idx(x, z); if (i >= 0) this.data[i] = v; }

  // iterate cells whose centers fall inside a rotated rectangle
  forRect(cx, cz, hx, hz, rot, fn) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const R = Math.hypot(hx, hz);
    const i0 = Math.max(0, Math.floor((cx - R - this.b.minX) / this.cell)), i1 = Math.min(this.w - 1, Math.floor((cx + R - this.b.minX) / this.cell));
    const j0 = Math.max(0, Math.floor((cz - R - this.b.minZ) / this.cell)), j1 = Math.min(this.h - 1, Math.floor((cz + R - this.b.minZ) / this.cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = this.b.minX + (i + 0.5) * this.cell, z = this.b.minZ + (j + 0.5) * this.cell;
      const dx = x - cx, dz = z - cz;
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) <= hx && Math.abs(lz) <= hz) { if (fn(j * this.w + i) === false) return false; }
    }
    return true;
  }
  rectFree(cx, cz, hx, hz, rot, allowed = [CELL.EMPTY]) {
    if (cx - hx < this.b.minX + 4 || cx + hx > this.b.maxX - 4 || cz - hz < this.b.minZ + 4 || cz + hz > this.b.maxZ - 4) return false;
    return this.forRect(cx, cz, hx, hz, rot, (k) => allowed.includes(this.data[k]) ? true : false) !== false;
  }
  fillRect(cx, cz, hx, hz, rot, v, onlyIf = null) {
    this.forRect(cx, cz, hx, hz, rot, (k) => { if (onlyIf === null || onlyIf.includes(this.data[k])) this.data[k] = v; });
  }
  fillCircle(cx, cz, r, v, onlyIf = null) {
    const i0 = Math.max(0, Math.floor((cx - r - this.b.minX) / this.cell)), i1 = Math.min(this.w - 1, Math.floor((cx + r - this.b.minX) / this.cell));
    const j0 = Math.max(0, Math.floor((cz - r - this.b.minZ) / this.cell)), j1 = Math.min(this.h - 1, Math.floor((cz + r - this.b.minZ) / this.cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = this.b.minX + (i + 0.5) * this.cell, z = this.b.minZ + (j + 0.5) * this.cell;
      if ((x - cx) ** 2 + (z - cz) ** 2 <= r * r) { const k = j * this.w + i; if (onlyIf === null || onlyIf.includes(this.data[k])) this.data[k] = v; }
    }
  }
  fillSegment(ax, az, bx, bz, r, v, onlyIf = null) {
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - r - this.b.minX) / this.cell)), i1 = Math.min(this.w - 1, Math.floor((Math.max(ax, bx) + r - this.b.minX) / this.cell));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz) - r - this.b.minZ) / this.cell)), j1 = Math.min(this.h - 1, Math.floor((Math.max(az, bz) + r - this.b.minZ) / this.cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = this.b.minX + (i + 0.5) * this.cell, z = this.b.minZ + (j + 0.5) * this.cell;
      if (pointSegDist(x, z, ax, az, bx, bz).d <= r) { const k = j * this.w + i; if (onlyIf === null || onlyIf.includes(this.data[k])) this.data[k] = v; }
    }
  }
}

// ---------------------------------------------------------------------------
// Collision: oriented boxes and circles in 2D (XZ), spatially hashed.
// ---------------------------------------------------------------------------
export class Collision {
  constructor(cell = 16) { this.cell = cell; this.map = new Map(); this.stamp = 0; this.count = 0; }

  _keys(minX, minZ, maxX, maxZ, fn) {
    for (let cx = Math.floor(minX / this.cell); cx <= Math.floor(maxX / this.cell); cx++)
      for (let cz = Math.floor(minZ / this.cell); cz <= Math.floor(maxZ / this.cell); cz++) fn(cx * 100000 + cz);
  }

  addBox(x, z, hx, hz, rot = 0, h = 10, tag = 'wall') {
    const c = { type: 0, x, z, hx, hz, rot, cos: Math.cos(rot), sin: Math.sin(rot), h, tag, _s: 0 };
    const R = Math.hypot(hx, hz);
    this._keys(x - R, z - R, x + R, z + R, (k) => { let a = this.map.get(k); if (!a) this.map.set(k, (a = [])); a.push(c); });
    this.count++;
    return c;
  }
  addCircle(x, z, r, h = 3, tag = 'pole') {
    const c = { type: 1, x, z, r, h, tag, _s: 0 };
    this._keys(x - r, z - r, x + r, z + r, (k) => { let a = this.map.get(k); if (!a) this.map.set(k, (a = [])); a.push(c); });
    this.count++;
    return c;
  }

  query(minX, minZ, maxX, maxZ, out) {
    out.length = 0; const st = ++this.stamp;
    this._keys(minX, minZ, maxX, maxZ, (k) => {
      const a = this.map.get(k); if (!a) return;
      for (const c of a) if (c._s !== st) { c._s = st; out.push(c); }
    });
    return out;
  }

  // Push a circle out of all static colliders. Returns strongest contact or null.
  resolveCircle(p, r, result) {
    const cand = this.query(p.x - r, p.z - r, p.x + r, p.z + r, this._tmp || (this._tmp = []));
    let hit = null;
    for (const c of cand) {
      const res = circleVs(c, p.x, p.z, r);
      if (res) {
        p.x += res.nx * res.depth; p.z += res.nz * res.depth;
        if (!hit || res.depth > hit.depth) { hit = result || {}; hit.nx = res.nx; hit.nz = res.nz; hit.depth = res.depth; hit.c = c; }
      }
    }
    return hit;
  }

  // First hit fraction along segment (for camera obstruction); only colliders taller than minH
  segment(x0, z0, x1, z1, minH = 2.5) {
    const cand = this.query(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), this._tmp2 || (this._tmp2 = []));
    let best = 1;
    for (const c of cand) {
      if (c.h < minH || (c.type === 1 && c.r < 1.5) || c.tag === 'bound') continue;
      const t = c.type === 0 ? segBox(c, x0, z0, x1, z1) : segCircle(c, x0, z0, x1, z1);
      if (t !== null && t < best) best = t;
    }
    return best;
  }
}

const _r = { nx: 0, nz: 0, depth: 0 };
export function circleVs(c, px, pz, r) {
  if (c.type === 1) {
    const dx = px - c.x, dz = pz - c.z, d = Math.hypot(dx, dz), R = r + c.r;
    if (d >= R) return null;
    if (d < 1e-5) { _r.nx = 1; _r.nz = 0; } else { _r.nx = dx / d; _r.nz = dz / d; }
    _r.depth = R - d; return _r;
  }
  const dx = px - c.x, dz = pz - c.z;
  const lx = dx * c.cos - dz * c.sin, lz = dx * c.sin + dz * c.cos;
  const qx = Math.max(-c.hx, Math.min(c.hx, lx)), qz = Math.max(-c.hz, Math.min(c.hz, lz));
  let nlx = lx - qx, nlz = lz - qz;
  let d = Math.hypot(nlx, nlz);
  let depth;
  if (d < 1e-6) { // inside box: push out along smallest axis
    const ox = c.hx - Math.abs(lx), oz = c.hz - Math.abs(lz);
    if (ox < oz) { nlx = Math.sign(lx) || 1; nlz = 0; depth = ox + r; } else { nlx = 0; nlz = Math.sign(lz) || 1; depth = oz + r; }
  } else {
    if (d >= r) return null;
    nlx /= d; nlz /= d; depth = r - d;
  }
  _r.nx = nlx * c.cos + nlz * c.sin; _r.nz = -nlx * c.sin + nlz * c.cos; _r.depth = depth;
  return _r;
}

function segBox(c, x0, z0, x1, z1) {
  const tx = (x, z) => [(x - c.x) * c.cos - (z - c.z) * c.sin, (x - c.x) * c.sin + (z - c.z) * c.cos];
  const [ax, az] = tx(x0, z0), [bx, bz] = tx(x1, z1);
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  const clip = (p, q) => {
    if (Math.abs(p) < 1e-9) return q >= 0;
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
    return true;
  };
  if (clip(-dx, ax + c.hx) && clip(dx, c.hx - ax) && clip(-dz, az + c.hz) && clip(dz, c.hz - az)) return t0;
  return null;
}
function segCircle(c, x0, z0, x1, z1) {
  const q = pointSegDist(c.x, c.z, x0, z0, x1, z1);
  return q.d < c.r ? Math.max(0, q.t - 0.05) : null;
}
