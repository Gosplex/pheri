import { ROAD_CLASSES, halfWidth } from './mapData.js';
import { pointSegDist } from '../core/rng.js';

// Road graph used by rendering, traffic, pedestrians, navigation and missions.
export class RoadNetwork {
  constructor(data) {
    this.nodes = new Map();
    this.edges = [];
    const deg = {};
    for (const e of data.edges) { deg[e.a] = (deg[e.a] || 0) + 1; deg[e.b] = (deg[e.b] || 0) + 1; }
    for (const n of Object.values(data.nodes)) {
      if (!deg[n.id]) continue;
      this.nodes.set(n.id, { ...n, edges: [], radius: 0 });
    }
    data.edges.forEach((d, i) => {
      const a = this.nodes.get(d.a), b = this.nodes.get(d.b);
      if (!a || !b) throw new Error('bad edge ' + d.a + '-' + d.b);
      const spec = ROAD_CLASSES[d.cls];
      const pts = [{ x: a.x, z: a.z }, ...(d.via || []).map(([x, z]) => ({ x, z })), { x: b.x, z: b.z }];
      const cum = [0];
      for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z));
      const e = {
        id: i, a, b, cls: d.cls, spec, name: d.name, oneway: !!(d.oneway || spec.oneway), pts, cum, len: cum[cum.length - 1],
        hw: halfWidth(d.cls), trimA: 0, trimB: 0, vehicles: [[], []], blocked: null, jam: 0,
      };
      this.edges.push(e);
      a.edges.push(e); b.edges.push(e);
    });
    // junction radii
    for (const n of this.nodes.values()) {
      const maxHw = Math.max(...n.edges.map((e) => e.hw));
      if (n.type === 'ring') n.radius = Math.max(...n.edges.filter((e) => e.cls !== 'ring').map((e) => e.hw), 4) + 1.0;
      else if (n.edges.length >= 3) n.radius = maxHw + 1.2;
      else if (n.edges.length === 2) {
        const [e1, e2] = n.edges;
        const d1 = this.dirAtNode(e1, n), d2 = this.dirAtNode(e2, n);
        const dot = d1.x * d2.x + d1.z * d2.z; // -1 = straight through
        n.radius = e1.cls !== e2.cls || dot > -0.95 ? maxHw * 0.9 + 0.5 : 0;
      } else n.radius = 0;
    }
    for (const e of this.edges) {
      e.trimA = Math.min(e.a.radius, e.len * 0.45);
      e.trimB = Math.min(e.b.radius, e.len * 0.45);
      if (e.cls === 'ring') { e.trimA = Math.min(e.trimA, 9); e.trimB = Math.min(e.trimB, 9); }
    }
    this._buildIndex();
    this._setupSignals();
  }

  // unit direction pointing AWAY from node n along edge e
  dirAtNode(e, n) {
    const p = e.pts;
    if (e.a === n) { const dx = p[1].x - p[0].x, dz = p[1].z - p[0].z, l = Math.hypot(dx, dz); return { x: dx / l, z: dz / l }; }
    const L = p.length; const dx = p[L - 2].x - p[L - 1].x, dz = p[L - 2].z - p[L - 1].z, l = Math.hypot(dx, dz);
    return { x: dx / l, z: dz / l };
  }

  // Sample the centerline at arc length s (from node a). Writes into out.
  sample(e, s, out = {}) {
    const { pts, cum } = e;
    if (s <= 0) s = 0; if (s >= e.len) s = e.len;
    let k = 1;
    while (k < cum.length - 1 && cum[k] < s) k++;
    const p0 = pts[k - 1], p1 = pts[k];
    const segL = cum[k] - cum[k - 1] || 1e-6;
    const t = (s - cum[k - 1]) / segL;
    out.x = p0.x + (p1.x - p0.x) * t; out.z = p0.z + (p1.z - p0.z) * t;
    out.tx = (p1.x - p0.x) / segL; out.tz = (p1.z - p0.z) / segL;
    return out;
  }

  laneOffset(e, lane) {
    const c = e.spec;
    if (e.oneway) return c.laneW * (lane + 0.5) - (c.lanes * c.laneW) / 2;
    return c.median / 2 + c.laneW * (lane + 0.5);
  }

  // Position of a vehicle travelling in direction dir (0 = a->b, 1 = b->a) at distance s from its start,
  // offset `lat` metres to the LEFT of travel (left-hand traffic).
  lanePoint(e, dir, s, lat, out = {}) {
    const ss = dir === 0 ? s : e.len - s;
    this.sample(e, ss, out);
    if (dir === 1) { out.tx = -out.tx; out.tz = -out.tz; }
    // left of (tx,tz) is (tz, -tx)
    out.x += out.tz * lat; out.z += -out.tx * lat;
    return out;
  }

  _buildIndex() {
    this.cell = 24;
    this.grid = new Map();
    for (const e of this.edges) {
      for (let k = 1; k < e.pts.length; k++) {
        const a = e.pts[k - 1], b = e.pts[k];
        const minX = Math.min(a.x, b.x) - e.hw - 4, maxX = Math.max(a.x, b.x) + e.hw + 4;
        const minZ = Math.min(a.z, b.z) - e.hw - 4, maxZ = Math.max(a.z, b.z) + e.hw + 4;
        for (let cx = Math.floor(minX / this.cell); cx <= Math.floor(maxX / this.cell); cx++)
          for (let cz = Math.floor(minZ / this.cell); cz <= Math.floor(maxZ / this.cell); cz++) {
            const key = cx * 100000 + cz;
            let arr = this.grid.get(key); if (!arr) this.grid.set(key, (arr = []));
            arr.push({ e, k });
          }
      }
    }
  }

  // Nearest road to a point: {e, s, d, lat} where lat = signed offset (left of a->b positive)
  nearest(x, z, maxD = 60) {
    let best = null;
    const r = Math.ceil(maxD / this.cell);
    const cx0 = Math.floor(x / this.cell), cz0 = Math.floor(z / this.cell);
    for (let ring = 0; ring <= r; ring++) {
      for (let cx = cx0 - ring; cx <= cx0 + ring; cx++)
        for (let cz = cz0 - ring; cz <= cz0 + ring; cz++) {
          if (Math.max(Math.abs(cx - cx0), Math.abs(cz - cz0)) !== ring) continue;
          const arr = this.grid.get(cx * 100000 + cz); if (!arr) continue;
          for (const { e, k } of arr) {
            const a = e.pts[k - 1], b = e.pts[k];
            const q = pointSegDist(x, z, a.x, a.z, b.x, b.z);
            if (!best || q.d < best.d) {
              const segL = e.cum[k] - e.cum[k - 1];
              const tx = (b.x - a.x) / segL, tz = (b.z - a.z) / segL;
              const lat = (x - q.cx) * tz + (z - q.cz) * -tx;
              best = { e, s: e.cum[k - 1] + q.t * segL, d: q.d, lat };
            }
          }
        }
      if (best && best.d < (ring) * this.cell) break;
    }
    return best;
  }

  nearestNode(x, z) {
    let best = null, bd = Infinity;
    for (const n of this.nodes.values()) { const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; best = n; } }
    return best;
  }

  other(e, n) { return e.a === n ? e.b : e.a; }
  canTravel(e, from) { return !e.oneway || e.a === from; }

  // A* shortest route between two nodes; returns array of nodes.
  route(from, to) {
    if (from === to) return [from];
    const open = new Set([from]);
    const g = new Map([[from, 0]]), f = new Map([[from, dist(from, to)]]), came = new Map();
    let guard = 0;
    while (open.size && guard++ < 5000) {
      let cur = null, cf = Infinity;
      for (const n of open) { const v = f.get(n); if (v < cf) { cf = v; cur = n; } }
      if (cur === to) {
        const path = [cur];
        while (came.has(cur)) { cur = came.get(cur); path.unshift(cur); }
        return path;
      }
      open.delete(cur);
      for (const e of cur.edges) {
        if (!this.canTravel(e, cur)) continue;
        const nb = this.other(e, cur);
        const w = e.len * (e.cls === 'lane' ? 1.25 : e.cls === 'highway' || e.cls === 'arterial' ? 0.85 : 1);
        const ng = g.get(cur) + w;
        if (ng < (g.get(nb) ?? Infinity)) { came.set(nb, cur); g.set(nb, ng); f.set(nb, ng + dist(nb, to)); open.add(nb); }
      }
    }
    return null;
  }

  edgeBetween(a, b) { return a.edges.find((e) => (e.a === a && e.b === b) || (e.b === a && e.a === b)); }

  // Convert a node route into a polyline (for minimap and 3D guidance)
  routePolyline(nodes) {
    const out = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      const e = this.edgeBetween(nodes[i], nodes[i + 1]); if (!e) continue;
      const pts = e.a === nodes[i] ? e.pts : [...e.pts].reverse();
      for (const p of pts) { const l = out[out.length - 1]; if (!l || l.x !== p.x || l.z !== p.z) out.push({ x: p.x, z: p.z }); }
    }
    return out;
  }

  // --- Traffic signals -----------------------------------------------------
  _setupSignals() {
    this.signals = [];
    for (const n of this.nodes.values()) {
      if (n.type !== 'signal') continue;
      const ref = this.dirAtNode(n.edges[0], n);
      const groups = new Map();
      for (const e of n.edges) {
        const d = this.dirAtNode(e, n);
        groups.set(e.id, Math.abs(d.x * ref.x + d.z * ref.z) > 0.7 ? 0 : 1);
      }
      n.signal = { groups, phase: 0, timer: Math.random() * 12, green: 13, amber: 3, state: 'green' };
      this.signals.push(n);
    }
  }

  updateSignals(dt) {
    for (const n of this.signals) {
      const s = n.signal; s.timer += dt;
      if (s.state === 'green' && s.timer > s.green) { s.state = 'amber'; s.timer = 0; }
      else if (s.state === 'amber' && s.timer > s.amber) { s.state = 'allred'; s.timer = 0; }
      else if (s.state === 'allred' && s.timer > 1.2) { s.state = 'green'; s.timer = 0; s.phase = 1 - s.phase; }
    }
  }

  // light for vehicles arriving at node n along edge e: 'green' | 'amber' | 'red'
  signalFor(n, e) {
    if (!n.signal) return 'green';
    const s = n.signal; const g = s.groups.get(e.id);
    if (s.state === 'allred') return 'red';
    if (g === s.phase) return s.state === 'amber' ? 'amber' : 'green';
    return 'red';
  }
}

function dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
