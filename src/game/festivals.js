import * as THREE from 'three';
import { Rng, clamp } from '../core/rng.js';
import { radialTexture } from '../core/textures.js';

// Festival calendar: the game rotates through Gujarat's big festivals so every few days feel different.
// Day 1 ordinary, Day 2 Navratri, Day 3 Uttarayan, Day 4 Diwali, then repeat (or forced in Settings).
export const FESTIVALS = {
  none: { name: '' },
  navratri: { name: 'Navratri', gu: 'નવરાત્રી', blurb: 'Garba nights at Race Course Garden. Evening jobs pay 20% more.' },
  uttarayan: { name: 'Uttarayan', gu: 'ઉત્તરાયણ', blurb: 'Kites fill the sky. Kai po che! Daytime jobs pay 15% more.' },
  diwali: { name: 'Diwali', gu: 'દિવાળી', blurb: 'Diyas on every shop, fireworks after dark. Night jobs pay 25% more.' },
};
const CYCLE = ['none', 'navratri', 'uttarayan', 'diwali'];

export class Festivals {
  constructor(scene, world, peds, audio, hooks) {
    Object.assign(this, { scene, world, peds, audio, hooks });
    this.rng = new Rng(2026);
    this.current = 'none'; this.mode = 'auto'; this.lastDay = -1;
    this.powerCut = 0;

    // --- Uttarayan kites: instanced diamonds drifting around the player -------------
    const kg = new THREE.BufferGeometry();
    kg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.5, 0, -0.35, 0, 0, 0, -0.55, 0, 0.35, 0, 0, 0, 0.5, 0, 0, -0.55, 0], 3));
    kg.setIndex([0, 1, 2, 0, 2, 3]); kg.computeVertexNormals();
    this.kites = new THREE.InstancedMesh(kg, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), 140);
    this.kites.frustumCulled = false; this.kites.visible = false; scene.add(this.kites);
    const cols = [0xe53935, 0xfdd835, 0x1e88e5, 0x43a047, 0xff7043, 0x8e24aa, 0xffffff, 0xff4081];
    this.kiteData = [];
    for (let i = 0; i < 140; i++) { this.kiteData.push({ ox: this.rng.float(-160, 160), oz: this.rng.float(-160, 160), h: this.rng.float(16, 48), ph: this.rng.float(0, 6), sp: this.rng.float(0.4, 1.2) }); this.kites.setColorAt(i, new THREE.Color(cols[i % cols.length])); }

    // --- Diwali diyas at shop fronts -----------------------------------------------------
    const shops = world.pois.filter((p) => p.shop || p.kind === 'home');
    const diyaPts = [];
    for (const s of shops) for (let k = 0; k < 3; k++) diyaPts.push([s.x + this.rng.float(-1.5, 1.5), s.z + this.rng.float(-1.5, 1.5)]);
    this.diyas = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffb040, toneMapped: false }), diyaPts.length);
    const m = new THREE.Matrix4();
    diyaPts.forEach(([x, z], i) => { m.makeTranslation(x, 0.25, z); this.diyas.setMatrixAt(i, m); });
    this.diyas.visible = false; scene.add(this.diyas);
    // flicker glow decals under each diya cluster
    const glowTex = radialTexture('rgba(255,170,60,1)', 'rgba(255,150,40,0)');
    const glowGeo = new THREE.PlaneGeometry(1, 1); glowGeo.rotateX(-Math.PI / 2);
    this.diyaGlow = new THREE.InstancedMesh(glowGeo, new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7, toneMapped: false }), shops.length);
    shops.forEach((s, i) => { m.compose(new THREE.Vector3(s.x, 0.08, s.z), new THREE.Quaternion(), new THREE.Vector3(5, 1, 5)); this.diyaGlow.setMatrixAt(i, m); });
    this.diyaGlow.visible = false; this.diyaGlow.renderOrder = 2; scene.add(this.diyaGlow);

    // --- Fireworks: pooled particle bursts ----------------------------------------------
    this.fwN = 1400;
    const fg = new THREE.BufferGeometry();
    this.fwPos = new Float32Array(this.fwN * 3); this.fwCol = new Float32Array(this.fwN * 3);
    fg.setAttribute('position', new THREE.BufferAttribute(this.fwPos, 3)); fg.setAttribute('color', new THREE.BufferAttribute(this.fwCol, 3));
    this.fwVel = new Float32Array(this.fwN * 3); this.fwLife = new Float32Array(this.fwN);
    this.fw = new THREE.Points(fg, new THREE.PointsMaterial({ size: 0.9, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, sizeAttenuation: true }));
    this.fw.frustumCulled = false; this.fw.visible = false; scene.add(this.fw);
    this.fwNext = 0; this.fwTimer = 0;

    // --- Navratri garba circle at the garden fountain -------------------------------------
    this.garba = [];
    this.garbaCenter = { x: 320, z: 460 };
    this.garbaGroup = new THREE.Group();
    const gc = this.garbaCenter;
    const bulbs = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, px = gc.x + Math.cos(a) * 19, pz = gc.z + Math.sin(a) * 19;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 6, 6), new THREE.MeshStandardMaterial({ color: 0x8d6e63 }));
      pole.position.set(px, 3, pz); this.garbaGroup.add(pole);
      for (let k = 1; k < 14; k++) { const t = k / 14; bulbs.push([px + (gc.x - px) * t, 6 - Math.sin(t * Math.PI) * 1.2 + t * 2, pz + (gc.z - pz) * t, k % 4]); }
    }
    const bulbMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 6, 4), new THREE.MeshBasicMaterial({ toneMapped: false }), bulbs.length);
    const bc = [0xffd54f, 0xff5252, 0x69f0ae, 0x40c4ff].map((c) => new THREE.Color(c).multiplyScalar(1.6));
    bulbs.forEach((b, i) => { bulbMesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(b[0], b[1], b[2])); bulbMesh.setColorAt(i, bc[b[3]]); });
    this.garbaGroup.add(bulbMesh);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(46, 46).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: radialTexture('rgba(255,190,120,1)', 'rgba(255,160,80,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55, toneMapped: false }));
    pool.position.set(gc.x, 0.12, gc.z); pool.renderOrder = 2; this.garbaGroup.add(pool);
    this.garbaGroup.visible = false; scene.add(this.garbaGroup);
    this.garbaLight = new THREE.PointLight(0xffc88a, 0, 60, 1.5); this.garbaLight.position.set(gc.x, 9, gc.z); scene.add(this.garbaLight);

    // --- Monsoon waterlogging spots on low streets ----------------------------------------
    this.puddles = [];
    const waterMat = new THREE.MeshStandardMaterial({ color: 0x5c6b6e, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -5 });
    const cand = world.net.edges.filter((e) => (e.cls === 'street' || e.cls === 'lane' || e.cls === 'arterial') && e.len > 60);
    for (let i = 0; i < 12 && cand.length; i++) {
      const e = cand[this.rng.int(0, cand.length - 1)];
      const p = world.net.sample(e, this.rng.float(e.trimA + 12, e.len - e.trimB - 12));
      const r = Math.min(e.hw * 0.9, this.rng.float(3.5, 6));
      const g = new THREE.CircleGeometry(1, 20); g.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(g, waterMat); mesh.position.set(p.x, 0.07, p.z); mesh.scale.set(r * 1.6, 1, r); mesh.rotation.y = Math.atan2(p.tx, p.tz) + Math.PI / 2;
      mesh.visible = false; scene.add(mesh);
      this.puddles.push({ x: p.x, z: p.z, r, mesh, name: e.name });
    }
    this.waterMat = waterMat;
  }

  festivalFor(day) { if (this.mode !== 'auto') return this.mode === 'off' ? 'none' : this.mode; return CYCLE[(day - 1) % CYCLE.length]; }
  get info() { return FESTIVALS[this.current]; }
  payMultiplier(hour) {
    const f = this.current;
    if (f === 'navratri' && (hour >= 18 || hour < 1)) return 1.2;
    if (f === 'uttarayan' && hour >= 7 && hour < 18) return 1.15;
    if (f === 'diwali' && (hour >= 18 || hour < 1)) return 1.25;
    return 1;
  }
  isActiveNow(hour) { return this.payMultiplier(hour) > 1; }

  _startGarba() {
    if (this.garba.length) return;
    const n = 32;
    for (let i = 0; i < n; i++) {
      const ring = i < 20 ? 9.5 : 13;
      const p = this.peds._newPed(0, 0, 'baraat', { persistent: true, kind: i % 3 === 0 ? 'groomParty' : 'chaniya', garba: { a: (i / (i < 20 ? 20 : 12)) * Math.PI * 2, r: ring, dir: i < 20 ? 1 : -1 } });
      this.garba.push(p);
    }
  }
  _endGarba() { for (const p of this.garba) p.alive = false; this.garba = []; }

  _burst(x, y, z) {
    const col = new THREE.Color().setHSL(this.rng.next(), 0.9, 0.6);
    const n = 110;
    for (let k = 0; k < n; k++) {
      const i = this.fwNext; this.fwNext = (this.fwNext + 1) % this.fwN;
      const th = this.rng.float(0, Math.PI * 2), ph = Math.acos(this.rng.float(-1, 1)), sp = this.rng.float(7, 12);
      this.fwPos[i * 3] = x; this.fwPos[i * 3 + 1] = y; this.fwPos[i * 3 + 2] = z;
      this.fwVel[i * 3] = Math.sin(ph) * Math.cos(th) * sp; this.fwVel[i * 3 + 1] = Math.cos(ph) * sp; this.fwVel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * sp;
      this.fwLife[i] = this.rng.float(1.2, 2.0);
      this.fwCol[i * 3] = col.r; this.fwCol[i * 3 + 1] = col.g; this.fwCol[i * 3 + 2] = col.b;
    }
  }

  triggerPowerCut() { if (this.powerCut > 0) return false; this.powerCut = this.rng.float(50, 80); this.hooks.toast?.('Power cut in the area! Streetlights are off, only shops with generators still glow.', 'warn', 6000); return true; }

  update(dt, env, bike, t) {
    const day = env.day, hour = env.time, night = env.state.night;
    const f = this.festivalFor(day);
    if (f !== this.current || day !== this.lastDay) {
      this.lastDay = day;
      if (f !== this.current) { this.current = f; if (f !== 'none') this.hooks.toast?.(`Today is ${FESTIVALS[f].name} (${FESTIVALS[f].gu}). ${FESTIVALS[f].blurb}`, 'good', 8000); }
    }
    const P = bike.pos;
    // Uttarayan kites
    const kitesOn = f === 'uttarayan' && hour > 6.5 && hour < 18.5;
    this.kites.visible = kitesOn;
    if (kitesOn) {
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3(3.6, 3.6, 3.6);
      this.kiteData.forEach((k, i) => {
        const wx = Math.round((P.x - k.ox) / 320) * 320 + k.ox, wz = Math.round((P.z - k.oz) / 320) * 320 + k.oz; // tile around player
        const bob = Math.sin(t * k.sp + k.ph);
        e.set(Math.sin(t * 1.3 + k.ph) * 0.4, t * 0.2 + k.ph, bob * 0.5); q.setFromEuler(e);
        m.compose(v.set(wx + Math.sin(t * 0.3 * k.sp + k.ph) * 6, k.h + bob * 3, wz + Math.cos(t * 0.25 + k.ph) * 6), q, s);
        this.kites.setMatrixAt(i, m);
      });
      this.kites.instanceMatrix.needsUpdate = true;
      if (!this._kaiT || t > this._kaiT) { this._kaiT = t + 55; if (this.rng.chance(0.6)) this.hooks.say?.('Kai po che! (Someone just cut a kite.)'); }
    }
    // Diwali lights and fireworks
    const diwaliNight = f === 'diwali' && night > 0.3;
    this.diyas.visible = diwaliNight; this.diyaGlow.visible = diwaliNight;
    if (diwaliNight) {
      this.diyaGlow.material.opacity = 0.55 + Math.sin(t * 9) * 0.08 + Math.sin(t * 13.7) * 0.05;
      this.fwTimer -= dt;
      if (this.fwTimer <= 0) {
        this.fwTimer = this.rng.float(0.7, 2.2);
        const x = P.x + this.rng.float(-120, 120), z = P.z + this.rng.float(-120, 120), y = this.rng.float(35, 60);
        this._burst(x, y, z);
        this.audio.cracker?.(Math.hypot(x - P.x, z - P.z));
      }
    }
    let alive = 0;
    for (let i = 0; i < this.fwN; i++) {
      if (this.fwLife[i] <= 0) { this.fwPos[i * 3 + 1] = -100; continue; }
      alive++;
      this.fwLife[i] -= dt;
      this.fwVel[i * 3 + 1] -= 6 * dt;
      for (let a = 0; a < 3; a++) { this.fwVel[i * 3 + a] *= 0.985; this.fwPos[i * 3 + a] += this.fwVel[i * 3 + a] * dt; }
      const fade = clamp(this.fwLife[i] / 1.2, 0, 1);
      this.fwCol[i * 3] *= 0.995 + fade * 0.005; this.fwCol[i * 3 + 1] *= 0.99; this.fwCol[i * 3 + 2] *= 0.99;
    }
    this.fw.visible = alive > 0;
    if (alive) { this.fw.geometry.attributes.position.needsUpdate = true; this.fw.geometry.attributes.color.needsUpdate = true; }

    // Navratri garba
    const garbaTime = f === 'navratri' && (hour >= 19.5 || hour < 0.5);
    const dG = Math.hypot(P.x - this.garbaCenter.x, P.z - this.garbaCenter.z);
    if (garbaTime && dG < 260) this._startGarba(); else if (this.garba.length && (!garbaTime || dG > 320)) this._endGarba();
    for (const p of this.garba) {
      const g = p.garba; g.a += dt * 0.35 * g.dir;
      p.x = this.garbaCenter.x + Math.cos(g.a) * g.r; p.z = this.garbaCenter.z + Math.sin(g.a) * g.r;
      p.heading = Math.atan2(-Math.sin(g.a) * g.dir, Math.cos(g.a) * g.dir) + Math.sin(t * 2 + g.a) * 0.6;
    }
    if (this.garba.length && dG < 150) this.audio.dhol?.(dG);
    this.garbaGroup.visible = garbaTime; this.garbaLight.intensity = garbaTime ? 260 : 0;

    // Power cuts
    if (this.powerCut > 0) { this.powerCut -= dt; if (this.powerCut <= 0) this.hooks.toast?.('Power is back. The street lights flicker on.', 'good'); }

    // Waterlogging during and after rain
    const wet = env.wet;
    for (const pd of this.puddles) {
      pd.mesh.visible = wet > 0.35;
      const s = clamp((wet - 0.35) / 0.4, 0, 1);
      pd.mesh.scale.set(pd.r * 1.6 * (0.4 + s * 0.6), 1, pd.r * (0.4 + s * 0.6));
      pd.active = s > 0.3;
    }
  }

  // Returns the puddle the bike is in (if any)
  puddleAt(x, z) {
    for (const pd of this.puddles) if (pd.active && Math.hypot(x - pd.x, z - pd.z) < pd.r * 1.2) return pd;
    return null;
  }
}
