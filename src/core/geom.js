import * as THREE from 'three';

// MeshBuilder accumulates many primitives into ONE BufferGeometry with vertex colours.
// This is how the whole city stays at a few dozen draw calls.

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();
const _c = new THREE.Color();

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const cylCache = new Map();
const sphCache = new Map();
function cyl(seg) {
  if (!cylCache.has(seg)) cylCache.set(seg, new THREE.CylinderGeometry(1, 1, 1, seg, 1));
  return cylCache.get(seg);
}
function sph(seg) {
  if (!sphCache.has(seg)) sphCache.set(seg, new THREE.SphereGeometry(1, seg, Math.max(3, seg >> 1)));
  return sphCache.get(seg);
}

export class MeshBuilder {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.uv = []; this.idx = []; this.vcount = 0; }

  get empty() { return this.vcount === 0; }

  addGeometry(geo, matrix, color, uvMode = 0) {
    const P = geo.attributes.position, N = geo.attributes.normal, U = geo.attributes.uv;
    _nm.getNormalMatrix(matrix);
    _c.set(color);
    const base = this.vcount;
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i).applyMatrix4(matrix);
      this.pos.push(_v.x, _v.y, _v.z);
      if (N) { _n.fromBufferAttribute(N, i).applyMatrix3(_nm).normalize(); this.nor.push(_n.x, _n.y, _n.z); }
      else this.nor.push(0, 1, 0);
      this.col.push(_c.r, _c.g, _c.b);
      if (uvMode === 1) this.uv.push(_v.x * 0.25, _v.z * 0.25); // world planar
      else if (U) this.uv.push(U.getX(i), U.getY(i));
      else this.uv.push(0, 0);
    }
    if (geo.index) { const I = geo.index.array; for (let i = 0; i < I.length; i++) this.idx.push(base + I[i]); }
    else for (let i = 0; i < P.count; i++) this.idx.push(base + i);
    this.vcount += P.count;
    return this;
  }

  // Axis-aligned box rotated around Y. (cx,cy,cz) is the CENTER.
  box(cx, cy, cz, sx, sy, sz, rotY, color, rotX = 0, rotZ = 0) {
    _e.set(rotX, rotY, rotZ, 'YXZ');
    _q.setFromEuler(_e);
    _m.compose(_p.set(cx, cy, cz), _q, _s.set(sx, sy, sz));
    return this.addGeometry(unitBox, _m, color);
  }

  // Cylinder along Y by default. radius r, height h, center (cx,cy,cz)
  cylinder(cx, cy, cz, r, h, color, seg = 8, rotX = 0, rotY = 0, rotZ = 0, r2 = null) {
    _e.set(rotX, rotY, rotZ, 'YXZ');
    _q.setFromEuler(_e);
    if (r2 !== null) {
      const g = new THREE.CylinderGeometry(r2, r, h, seg, 1);
      _m.compose(_p.set(cx, cy, cz), _q, _s.set(1, 1, 1));
      this.addGeometry(g, _m, color); g.dispose(); return this;
    }
    _m.compose(_p.set(cx, cy, cz), _q, _s.set(r, h, r));
    return this.addGeometry(cyl(seg), _m, color);
  }

  sphere(cx, cy, cz, rx, ry, rz, color, seg = 8) {
    _m.compose(_p.set(cx, cy, cz), _q.identity(), _s.set(rx, ry, rz));
    return this.addGeometry(sph(seg), _m, color);
  }

  // Flat quad from 4 corners (counter-clockwise when seen from the front)
  quad(a, b, c, d, color, uvs = null) {
    _c.set(color);
    const base = this.vcount;
    _v.subVectors(b, a); _n.subVectors(d, a); _v.cross(_n).normalize();
    // note: winding a,b,c,d with normal = (b-a) x (d-a)
    const pts = [a, b, c, d];
    for (let i = 0; i < 4; i++) {
      const p = pts[i];
      this.pos.push(p.x, p.y, p.z); this.nor.push(_v.x, _v.y, _v.z); this.col.push(_c.r, _c.g, _c.b);
      if (uvs) this.uv.push(uvs[i * 2], uvs[i * 2 + 1]); else this.uv.push(p.x * 0.25, p.z * 0.25);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    this.vcount += 4;
    return this;
  }

  // Vertical quad facing direction (nx,nz), centered at (cx,cy,cz), width w, height h. UV rect optional.
  facingQuad(cx, cy, cz, nx, nz, w, h, color, uvRect = null) {
    // right vector when looking at the face from outside: (-nz, nx)... we want text readable from outside.
    const rx = nz, rz = -nx; // right-hand side for a viewer facing -n (looking at the wall)
    const hw = w / 2, hh = h / 2;
    const a = new THREE.Vector3(cx - rx * hw, cy - hh, cz - rz * hw);
    const b = new THREE.Vector3(cx + rx * hw, cy - hh, cz + rz * hw);
    const c = new THREE.Vector3(cx + rx * hw, cy + hh, cz + rz * hw);
    const d = new THREE.Vector3(cx - rx * hw, cy + hh, cz - rz * hw);
    let uvs = null;
    if (uvRect) { const [u0, v0, u1, v1] = uvRect; uvs = [u0, v0, u1, v0, u1, v1, u0, v1]; }
    return this.quad(a, b, c, d, color, uvs);
  }

  // Append another builder (keeps its vertex colours), offset by (dx,dy,dz)
  merge(o, dx = 0, dy = 0, dz = 0) {
    const base = this.vcount;
    for (let i = 0; i < o.pos.length; i += 3) this.pos.push(o.pos[i] + dx, o.pos[i + 1] + dy, o.pos[i + 2] + dz);
    this.nor.push(...o.nor); this.col.push(...o.col); this.uv.push(...o.uv);
    for (const k of o.idx) this.idx.push(base + k);
    this.vcount += o.vcount;
    return this;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.vcount > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

// Spatially chunked builders: one MeshBuilder per grid cell so the renderer can frustum-cull.
export class ChunkedBuilder {
  constructor(chunkSize = 200) { this.size = chunkSize; this.map = new Map(); }
  at(x, z) {
    const k = Math.floor(x / this.size) + ',' + Math.floor(z / this.size);
    let b = this.map.get(k);
    if (!b) { b = new MeshBuilder(); this.map.set(k, b); }
    return b;
  }
  buildMeshes(material, { castShadow = false, receiveShadow = false, name = '' } = {}) {
    const meshes = [];
    for (const b of this.map.values()) {
      if (b.empty) continue;
      const m = new THREE.Mesh(b.build(), material);
      m.castShadow = castShadow; m.receiveShadow = receiveShadow; m.name = name;
      m.matrixAutoUpdate = false; m.updateMatrix();
      meshes.push(m);
    }
    return meshes;
  }
}

export const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
