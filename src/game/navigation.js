import * as THREE from 'three';

// Route guidance: A* over the road graph, drawn as a glowing marigold ribbon on the road,
// a tall beacon at the destination and a chevron that floats ahead of the bike.
export class Navigation {
  constructor(scene, net) {
    this.scene = scene; this.net = net;
    this.target = null; this.route = null; this.poly = []; this.recalc = 0;
    const ribMat = new THREE.MeshBasicMaterial({ color: 0xf4b400, transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -6 });
    this.ribbon = new THREE.Mesh(new THREE.BufferGeometry(), ribMat); this.ribbon.renderOrder = 3; this.ribbon.frustumCulled = false;
    scene.add(this.ribbon);

    // Destination beacon: soft column + pulsing ground ring
    this.beacon = new THREE.Group();
    const colGeo = new THREE.CylinderGeometry(1.2, 1.2, 60, 16, 1, true); colGeo.translate(0, 30, 0);
    this.beaconMat = new THREE.MeshBasicMaterial({ color: 0xf4b400, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false });
    this.beacon.add(new THREE.Mesh(colGeo, this.beaconMat));
    const ringGeo = new THREE.RingGeometry(3.2, 4.0, 40); ringGeo.rotateX(-Math.PI / 2);
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xf4b400, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false });
    this.ring = new THREE.Mesh(ringGeo, this.ringMat); this.ring.position.y = 0.12; this.beacon.add(this.ring);
    this.beacon.visible = false; scene.add(this.beacon);

    // Chevron
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.7); shape.lineTo(0.55, -0.2); shape.lineTo(0.2, -0.2); shape.lineTo(0.2, -0.6); shape.lineTo(-0.2, -0.6); shape.lineTo(-0.2, -0.2); shape.lineTo(-0.55, -0.2); shape.closePath();
    const cg = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false }); cg.rotateX(-Math.PI / 2); cg.translate(0, 0, 0);
    this.arrow = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color: 0xf4b400, toneMapped: false, transparent: true, opacity: 0.92 }));
    this.arrow.scale.set(1.5, 1, 1.5); this.arrow.visible = false; scene.add(this.arrow);
  }

  setTarget(t, color = 0xf4b400) {
    this.target = t; this.recalc = 0;
    this.beaconMat.color.set(color); this.ringMat.color.set(color); this.ribbon.material.color.set(color);
    this.beacon.visible = !!t; this.arrow.visible = !!t; this.ribbon.visible = !!t;
    if (!t) { this.poly = []; }
  }

  _compute(px, pz) {
    const t = this.target;
    const a = this.net.nearest(px, pz, 200), b = this.net.nearest(t.x, t.z, 200);
    if (!a || !b) { this.poly = [{ x: px, z: pz }, { x: t.x, z: t.z }]; return; }
    // try both ends of the current and target edges, keep the shortest
    let best = null, bestLen = Infinity;
    for (const na of [a.e.a, a.e.b]) for (const nb of [b.e.a, b.e.b]) {
      if (a.e.oneway && na === a.e.a) continue;
      const r = this.net.route(na, nb); if (!r) continue;
      const poly = this.net.routePolyline(r);
      let len = Math.hypot(na.x - px, na.z - pz) + Math.hypot(nb.x - t.x, nb.z - t.z);
      for (let i = 1; i < poly.length; i++) len += Math.hypot(poly[i].x - poly[i - 1].x, poly[i].z - poly[i - 1].z);
      if (len < bestLen) { bestLen = len; best = poly.length ? poly : [{ x: na.x, z: na.z }]; }
    }
    const pa = this.net.sample(a.e, a.s), pb = this.net.sample(b.e, b.s);
    const poly = [{ x: px, z: pz }, { x: pa.x, z: pa.z }, ...(best || []), { x: pb.x, z: pb.z }, { x: t.x, z: t.z }];
    // drop backtracking at the start (if the first node is behind us along the same road)
    if (poly.length > 3) {
      const d1 = Math.hypot(poly[2].x - poly[1].x, poly[2].z - poly[1].z), d2 = Math.hypot(poly[3].x - poly[1].x, poly[3].z - poly[1].z);
      if (d2 < d1) poly.splice(2, 1);
    }
    this.poly = poly; this.length = bestLen;
    this._buildRibbon();
  }

  _buildRibbon() {
    const pts = []; let total = 0;
    for (let i = 0; i < this.poly.length && total < 700; i++) {
      pts.push(this.poly[i]);
      if (i > 0) total += Math.hypot(this.poly[i].x - this.poly[i - 1].x, this.poly[i].z - this.poly[i - 1].z);
    }
    // resample every 2m for dashes
    const out = [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i]; const L = Math.hypot(b.x - a.x, b.z - a.z); if (L < 0.01) continue;
      const tx = (b.x - a.x) / L, tz = (b.z - a.z) / L;
      for (let s = 0; s < L; s += 3.2) {
        const x = a.x + tx * s, z = a.z + tz * s, e = Math.min(1.6, L - s);
        // chevron-ish dash
        const lx = tz * 0.28, lz = -tx * 0.28;
        out.push(x + lx, 0.09, z + lz, x - lx, 0.09, z - lz, x + tx * e - lx, 0.09, z + tz * e - lz);
        out.push(x + lx, 0.09, z + lz, x + tx * e - lx, 0.09, z + tz * e - lz, x + tx * e + lx, 0.09, z + tz * e + lz);
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
    this.ribbon.geometry.dispose(); this.ribbon.geometry = g;
  }

  update(dt, bike, t) {
    if (!this.target) return;
    this.recalc -= dt;
    if (this.recalc <= 0) { this.recalc = 1.5; this._compute(bike.pos.x, bike.pos.z); }
    this.beacon.position.set(this.target.x, 0, this.target.z);
    const pulse = 1 + Math.sin(t * 4) * 0.12; this.ring.scale.set(pulse, 1, pulse);
    // chevron points at the route point ~14 m ahead
    let aim = this.poly[this.poly.length - 1];
    let acc = 0;
    for (let i = 1; i < this.poly.length; i++) {
      acc = Math.hypot(this.poly[i].x - bike.pos.x, this.poly[i].z - bike.pos.z);
      if (acc > 14) { aim = this.poly[i]; break; }
    }
    const ang = Math.atan2(aim.x - bike.pos.x, aim.z - bike.pos.z);
    const fx = Math.sin(bike.heading), fz = Math.cos(bike.heading);
    this.arrow.position.set(bike.pos.x + fx * 7, 0.35 + Math.sin(t * 3) * 0.05, bike.pos.z + fz * 7);
    this.arrow.rotation.set(0, ang + Math.PI, 0);
    const dT = Math.hypot(this.target.x - bike.pos.x, this.target.z - bike.pos.z);
    this.arrow.visible = dT > 12;
    this.distance = dT;
  }
}
