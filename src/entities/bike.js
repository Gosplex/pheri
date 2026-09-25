import * as THREE from 'three';
import { MeshBuilder } from '../core/geom.js';
import { clamp, lerp, damp, Rng } from '../core/rng.js';
import { makeCanvas } from '../core/textures.js';
import { riderParts } from './vehicleModels.js';

export const BIKES = {
  sparrow: { style: 'commuter', name: 'Sparrow 110', price: 0, top: 21.5, accel: 5.4, brake: 8.5, handling: 1.0, eff: 1.0, gears: 4, redline: 8500, tank: 100, blurb: 'The honest commuter. Sips fuel, forgives everything.' },
  kestrel: { style: 'commuter', name: 'Kestrel 125', price: 4500, top: 24.5, accel: 6.2, brake: 9.5, handling: 1.08, eff: 0.95, gears: 5, redline: 9000, tank: 110, blurb: 'Punchier pickup for the Ring Road rush hour.' },
  falcon:  { style: 'sport', name: 'Falcon 160', price: 9000, top: 28.5, accel: 7.4, brake: 10.5, handling: 1.12, eff: 0.85, gears: 5, redline: 9500, tank: 120, blurb: 'Sporty, planted, and quick off every signal.' },
  volt:    { style: 'ev', sound: 'ev', name: 'Volt E1 (electric)', price: 7500, top: 23, accel: 7.0, brake: 9.5, handling: 1.1, eff: 1.0, gears: 1, redline: 9000, tank: 100, blurb: 'Silent electric pickup. Charging costs a third of petrol.' },
  thunder: { style: 'cruiser', sound: 'thump', name: 'Thunder 350', price: 15000, top: 30, accel: 6.4, brake: 10, handling: 0.95, eff: 1.25, gears: 5, redline: 6000, tank: 130, blurb: 'The big-single thump. King of the Morbi highway.' },
};

export const UPGRADES = {
  engine1: { name: 'Engine tune', desc: '+7% top speed and pickup', price: 900 },
  engine2: { name: 'Performance exhaust', desc: '+7% more (needs Engine tune)', price: 2400, requires: 'engine1' },
  tyres:   { name: 'Monsoon tyres', desc: 'Much better grip in rain and on dirt', price: 700 },
  brakes:  { name: 'Disc brake kit', desc: '+20% braking power', price: 600 },
  tank:    { name: 'Fuel saver kit', desc: 'Uses 25% less fuel', price: 800 },
  box:     { name: 'Pheri delivery box', desc: '+10% pay on food & parcel jobs', price: 350 },
};

export const COSMETICS = {
  'helmet-red': { slot: 'helmet', name: 'Madder red helmet', color: 0xb8322a, price: 0 },
  'helmet-white': { slot: 'helmet', name: 'Chalk white helmet', color: 0xf3ede2, price: 150 },
  'helmet-marigold': { slot: 'helmet', name: 'Marigold helmet', color: 0xf4b400, price: 150 },
  'helmet-indigo': { slot: 'helmet', name: 'Ajrakh indigo helmet', color: 0x1e2a5a, price: 200 },
  'jacket-indigo': { slot: 'jacket', name: 'Indigo jacket', color: 0x1e2a5a, price: 0 },
  'jacket-olive': { slot: 'jacket', name: 'Olive jacket', color: 0x556b2f, price: 200 },
  'jacket-maroon': { slot: 'jacket', name: 'Maroon jacket', color: 0x7b1e2b, price: 200 },
  'jacket-bandhani': { slot: 'jacket', name: 'Bandhani red kurta', color: 0xc2185b, price: 350 },
  'paint-red': { slot: 'paint', name: 'Racing red', color: 0xb71c1c, price: 0 },
  'paint-black': { slot: 'paint', name: 'Gloss black', color: 0x16181c, price: 300 },
  'paint-blue': { slot: 'paint', name: 'Kutch blue', color: 0x1f4e9c, price: 300 },
  'paint-green': { slot: 'paint', name: 'Gir green', color: 0x2e6b3a, price: 300 },
  'paint-gold': { slot: 'paint', name: 'Kesar gold', color: 0xc99a2e, price: 500 },
};

function plateTexture() {
  const c = makeCanvas(256, 64), g = c.getContext('2d');
  g.fillStyle = '#f7f7f2'; g.fillRect(0, 0, 256, 64);
  g.strokeStyle = '#111'; g.lineWidth = 4; g.strokeRect(3, 3, 250, 58);
  g.fillStyle = '#111'; g.font = '700 38px "Rajdhani", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('GJ 03 MR 2026', 128, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Bike {
  constructor(scene, mats, profile) {
    this.scene = scene; this.mats = mats;
    this.pos = new THREE.Vector3(); this.heading = 0; this.speed = 0;
    this.steer = 0; this.lean = 0; this.pitch = 0; this.susY = 0; this.susV = 0;
    this.yawRate = 0; this.rpm = 1000; this.gear = 1; this.shiftTimer = 0;
    this.boost = 1; this.boosting = false; this.fuel = 100; this.skid = 0;
    this.headlightOn = true; this.highBeam = false; this.indicator = 0; this.indTimer = 0;
    this.crashTimer = 0; this.surface = 'road'; this.lastImpact = 0; this.accelSmoothed = 0;
    this.pushing = false;
    this.root = new THREE.Group(); this.root.name = 'player-bike';
    this.leanPivot = new THREE.Group(); this.root.add(this.leanPivot);
    scene.add(this.root);
    this.plateTex = plateTexture();
    this.applyProfile(profile);

    // Headlight
    this.headlight = new THREE.SpotLight(0xfff1d6, 0, 70, 0.42, 0.55, 1.4);
    this.headlight.position.set(0, 1.0, 0.8);
    this.headlight.target.position.set(0, 0, 14);
    this.root.add(this.headlight); this.root.add(this.headlight.target);
    this.headlight.castShadow = false;
    // soft blob shadow
    const sc = makeCanvas(64, 64), g = sc.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const st = new THREE.CanvasTexture(sc);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: st, transparent: true, depthWrite: false }));
    sh.position.y = 0.06; sh.renderOrder = 1; this.root.add(sh); this.blob = sh;
  }

  applyProfile(p) {
    this.profile = p;
    this.model = BIKES[p.bike] || BIKES.sparrow;
    const up = p.owned.upgrades;
    this.mods = {
      power: 1 + (up.includes('engine1') ? 0.07 : 0) + (up.includes('engine2') ? 0.07 : 0),
      grip: up.includes('tyres') ? 1.2 : 1,
      brake: up.includes('brakes') ? 1.2 : 1,
      eff: up.includes('tank') ? 0.75 : 1,
    };
    this.buildMesh();
  }

  buildMesh() {
    for (const c of [...this.leanPivot.children]) { this.leanPivot.remove(c); c.traverse?.((o) => o.geometry?.dispose()); }
    const p = this.profile;
    const paint = COSMETICS[p.equip.paint]?.color ?? 0xb71c1c;
    const helmet = COSMETICS[p.equip.helmet]?.color ?? 0xb8322a;
    const jacket = COSMETICS[p.equip.jacket]?.color ?? 0x1e2a5a;
    const style = (BIKES[p.bike] || BIKES.sparrow).style;
    const sporty = style === 'sport', cruiser = style === 'cruiser', ev = style === 'ev';
    const mat = this.mats.vehicle;
    const chassis = new MeshBuilder();
    // frame, engine, tank, seat, exhaust
    chassis.box(0, 0.48, -0.02, 0.14, 0.14, 1.05, 0, 0x2b2b2b);
    chassis.box(0, 0.42, 0.05, 0.3, 0.3, 0.42, 0, 0x5b5f64);                    // engine block
    chassis.cylinder(0, 0.45, 0.05, 0.12, 0.34, 0x8a8f94, 10, 0, 0, Math.PI / 2); // crank cover
    chassis.box(0, 0.8, 0.22, sporty ? 0.4 : 0.34, sporty ? 0.26 : 0.24, 0.52, 0.1, paint);
    chassis.box(0.175, 0.8, 0.22, 0.01, 0.06, 0.46, 0.1, 0xf3ede2);             // tank stripe
    chassis.box(-0.175, 0.8, 0.22, 0.01, 0.06, 0.46, 0.1, 0xf3ede2);
    chassis.box(0, 0.79, -0.32, 0.3, 0.1, 0.64, sporty ? -0.1 : 0, 0x121212);   // seat
    chassis.box(0, 0.6, -0.42, 0.32, 0.26, 0.52, 0, paint);                     // side panels
    chassis.box(0, 0.66, -0.78, 0.2, 0.06, 0.34, sporty ? -0.35 : 0, paint);    // tail
    if (!ev) {
      chassis.box(0.17, 0.38, -0.5, 0.09, 0.09, 0.7, 0.06, 0xd8dadc);             // chrome exhaust
      chassis.cylinder(0.17, 0.4, -0.88, cruiser ? 0.075 : 0.055, 0.12, 0x333333, 8, Math.PI / 2);
    } else {
      chassis.box(0, 0.42, 0.02, 0.36, 0.3, 0.6, 0, 0x263238);                    // battery pack
      chassis.box(0, 0.42, 0.02, 0.37, 0.05, 0.62, 0, 0x00bcd4);                  // EV accent strip
    }
    if (cruiser) {
      chassis.sphere(0, 0.86, 0.24, 0.23, 0.15, 0.32, paint, 12);               // teardrop tank
      chassis.sphere(0, 0.93, 0.24, 0.05, 0.02, 0.28, 0xd8dadc, 6);             // chrome strip
      chassis.box(0, 0.74, -0.3, 0.36, 0.1, 0.5, 0, 0x3e2723);                  // leather seat
      chassis.cylinder(-0.16, 0.34, 0.05, 0.1, 0.34, 0xb0b4b8, 10, 0, 0, Math.PI / 2); // big engine fins
    }
    chassis.box(0, 0.36, -0.66, 0.24, 0.04, 0.44, 0, 0x151515);                 // rear mudguard
    chassis.box(0, 0.72, -0.64, 0.46, 0.04, 0.36, 0, 0x333333);                 // carrier
    chassis.box(-0.12, 0.25, 0.0, 0.04, 0.04, 0.3, 0, 0x777777);                // footrests
    chassis.box(0.12, 0.25, 0.0, 0.04, 0.04, 0.3, 0, 0x777777);
    const cm = new THREE.Mesh(chassis.build(), mat); cm.castShadow = true;
    this.leanPivot.add(cm);
    // number plate at the rear
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.085), new THREE.MeshStandardMaterial({ map: this.plateTex, roughness: 0.5 }));
    plate.position.set(0, 0.56, -0.97); plate.rotation.y = Math.PI; this.leanPivot.add(plate);

    // wheels
    const wheelGeo = (r) => { const b = new MeshBuilder(); b.cylinder(0, 0, 0, r, 0.11, 0x141414, 14, 0, 0, Math.PI / 2); b.cylinder(0, 0, 0, r * 0.62, 0.12, 0xa9adb1, 12, 0, 0, Math.PI / 2); for (let i = 0; i < 5; i++) b.box(0, 0, 0, 0.13, r * 1.2, 0.03, 0, 0x777777, (i / 5) * Math.PI); return b.build(); };
    const wr = sporty ? 0.31 : 0.3;
    this.rearWheel = new THREE.Mesh(wheelGeo(wr), mat); this.rearWheel.position.set(0, wr, -0.64); this.rearWheel.castShadow = true;
    this.leanPivot.add(this.rearWheel);
    // steering assembly
    this.front = new THREE.Group(); this.front.position.set(0, 0, 0.56); this.leanPivot.add(this.front);
    const fb = new MeshBuilder();
    fb.cylinder(-0.08, 0.62, 0.05, 0.03, 0.8, 0xb0b4b8, 6, -0.35); fb.cylinder(0.08, 0.62, 0.05, 0.03, 0.8, 0xb0b4b8, 6, -0.35);
    fb.box(0, cruiser ? 1.1 : 1.03, -0.08, sporty ? 0.6 : cruiser ? 0.86 : 0.72, 0.045, 0.05, 0, cruiser ? 0xd8dadc : 0x222222);          // handlebar
    fb.box(-0.36, 1.03, -0.08, 0.1, 0.06, 0.06, 0, 0x111111); fb.box(0.36, 1.03, -0.08, 0.1, 0.06, 0.06, 0, 0x111111);
    fb.cylinder(-0.3, 1.2, -0.06, 0.012, 0.3, 0x222222, 4); fb.cylinder(0.3, 1.2, -0.06, 0.012, 0.3, 0x222222, 4);
    fb.box(-0.3, 1.36, -0.06, 0.12, 0.07, 0.02, 0, 0x222222); fb.box(0.3, 1.36, -0.06, 0.12, 0.07, 0.02, 0, 0x222222); // mirrors
    fb.box(0, 0.93, 0.08, sporty ? 0.3 : 0.24, 0.22, 0.16, sporty ? -0.3 : 0, paint);  // headlamp cowl
    fb.box(0, 1.05, -0.02, 0.2, 0.1, 0.1, -0.4, 0x151515);                         // speedo pod
    fb.box(0, 0.4, 0.12, 0.2, 0.04, 0.42, 0.2, paint);                            // front mudguard
    const fm = new THREE.Mesh(fb.build(), mat); fm.castShadow = true; this.front.add(fm);
    this.frontWheel = new THREE.Mesh(wheelGeo(wr), mat); this.frontWheel.position.set(0, wr, 0.1); this.frontWheel.castShadow = true;
    this.front.add(this.frontWheel);
    // emissive lamps
    this.lampMat = new THREE.MeshBasicMaterial({ color: 0xfff4d6, toneMapped: false });
    const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.075, 12), this.lampMat); lamp.position.set(0, 0.93, 0.165); this.front.add(lamp);
    this.brakeMat = new THREE.MeshBasicMaterial({ color: 0x551111, toneMapped: false });
    const tail = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.06), this.brakeMat); tail.position.set(0, 0.69, -0.955); tail.rotation.y = Math.PI; this.leanPivot.add(tail);
    this.indMat = [new THREE.MeshBasicMaterial({ color: 0x553300, toneMapped: false }), new THREE.MeshBasicMaterial({ color: 0x553300, toneMapped: false })];
    for (const [i, sx] of [[0, 0.16], [1, -0.16]]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.05), this.indMat[i]); f.position.set(sx, 0.9, 0.08); this.front.add(f);
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.05), this.indMat[i]); r.position.set(sx, 0.66, -0.94); this.leanPivot.add(r);
    }
    // beam cone (visible at night, sells the headlight)
    const coneGeo = new THREE.ConeGeometry(2.6, 12, 16, 1, true); coneGeo.translate(0, -6, 0); coneGeo.rotateX(-Math.PI / 2);
    this.beamMat = new THREE.MeshBasicMaterial({ color: 0xfff1d0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.beam = new THREE.Mesh(coneGeo, this.beamMat); this.beam.position.set(0, 0.93, 0.2); this.beam.rotation.x = 0.09; this.front.add(this.beam);

    // rider
    this.rider = new THREE.Group(); this.leanPivot.add(this.rider);
    const rb = new MeshBuilder();
    const skin = 0xa0673a, pants = 0x2b2f3a;
    for (const sx of [-0.17, 0.17]) {
      rb.box(sx, 0.9, -0.08, 0.16, 0.16, 0.46, 0, pants);
      rb.box(sx * 1.2, 0.62, 0.12, 0.14, 0.5, 0.15, 0.1, pants);
      rb.box(sx * 1.2, 0.34, 0.18, 0.13, 0.1, 0.26, 0, 0x2b1d14);
    }
    const rm = new THREE.Mesh(rb.build(), mat); rm.castShadow = true; this.rider.add(rm);
    this.torso = new THREE.Group(); this.torso.position.set(0, 0.95, -0.25); this.rider.add(this.torso);
    const tb = new MeshBuilder();
    tb.box(0, 0.3, 0.02, 0.44, 0.6, 0.26, 0, jacket, sporty ? 0.45 : 0.22);
    tb.box(0, 0.3, 0.02, 0.45, 0.05, 0.27, 0, 0xf4b400, sporty ? 0.45 : 0.22);  // reflective band
    for (const sx of [-0.25, 0.25]) tb.box(sx, 0.36, 0.3, 0.11, 0.11, 0.55, 0, jacket, sporty ? 0.1 : 0.32);
    for (const sx of [-0.28, 0.28]) tb.box(sx, 0.18, 0.58, 0.08, 0.08, 0.08, 0, 0x222222);                      // gloves
    const tm = new THREE.Mesh(tb.build(), mat); tm.castShadow = true; this.torso.add(tm);
    this.head = new THREE.Group(); this.head.position.set(0, 0.68, sporty ? 0.2 : 0.1); this.torso.add(this.head);
    const hb = new MeshBuilder();
    hb.box(0, -0.08, 0, 0.13, 0.1, 0.13, 0, skin);
    hb.sphere(0, 0.1, 0, 0.18, 0.18, 0.2, helmet, 12);
    hb.box(0, 0.08, 0.14, 0.24, 0.1, 0.08, 0, 0x1c2733);                    // visor
    hb.box(0, 0.25, -0.02, 0.05, 0.03, 0.3, 0, 0xf3ede2);                   // helmet stripe
    const hm = new THREE.Mesh(hb.build(), mat); hm.castShadow = true; this.head.add(hm);
    // delivery backpack (thermal bag)
    const bp = new MeshBuilder();
    bp.box(0, 0.32, -0.22, 0.46, 0.5, 0.3, 0, 0xf4b400, 0.2);
    bp.box(0, 0.5, -0.22, 0.47, 0.06, 0.31, 0, 0x1e2a5a, 0.2);
    this.backpack = new THREE.Mesh(bp.build(), mat); this.backpack.castShadow = true; this.torso.add(this.backpack);
    this.backpack.visible = false;
    // rear delivery box (upgrade)
    const bx = new MeshBuilder();
    bx.box(0, 1.0, -0.66, 0.5, 0.44, 0.44, 0, 0xf4b400); bx.box(0, 1.23, -0.66, 0.52, 0.04, 0.46, 0, 0x1e2a5a);
    this.rearBox = new THREE.Mesh(bx.build(), mat); this.rearBox.castShadow = true; this.leanPivot.add(this.rearBox);
    this.rearBox.visible = !!p.owned.upgrades.includes('box');
    // pillion passenger
    this.pillion = new THREE.Group(); this.leanPivot.add(this.pillion); this.pillion.visible = false;
    this.setPillion(1);
    this.wheelR = wr;
  }

  setPillion(seed) {
    for (const c of [...this.pillion.children]) { this.pillion.remove(c); c.geometry?.dispose(); }
    const b = new MeshBuilder();
    riderParts(b, new Rng(seed * 13 + 1), 0.86, -0.58, { helmetChance: 1 });
    const m = new THREE.Mesh(b.build(), this.mats.vehicle); m.castShadow = true; this.pillion.add(m);
  }

  setFirstPerson(on) { this.fp = on; this.head.visible = !on; this.torso.visible = !on; this.pillion.visible = on ? false : this.pillion.visible; }

  place(x, z, heading) { this.pos.set(x, 0, z); this.heading = heading; this.speed = 0; this.lean = 0; this.steer = 0; }

  get kmh() { return Math.abs(this.speed) * 3.6; }

  // ------------------------------------------------------------------------
  update(dt, input, world, env, dynamicColliders) {
    const m = this.model, mods = this.mods;
    const wet = env.wet;
    let grip = (1 - wet * 0.28) * mods.grip; if (grip > 1.05) grip = 1.05;
    const surf = world.surfaceAt(this.pos.x, this.pos.z);
    this.surface = surf;
    const surfTop = surf === 'road' ? 1 : surf === 'paved' ? 0.9 : surf === 'grass' ? 0.62 * (mods.grip > 1 ? 1.12 : 1) : surf === 'water' ? 0.3 : 0.55 * (mods.grip > 1 ? 1.15 : 1);
    const surfDrag = surf === 'road' ? 0 : surf === 'paved' ? 0.2 : 1.1;

    const crashed = this.crashTimer > 0;
    if (crashed) this.crashTimer -= dt;
    const thr = crashed ? 0 : input.axes.throttle;
    const brk = crashed ? 1 : input.axes.brake;
    const hand = !crashed && input.isDown('handbrake');
    let steerIn = crashed ? 0 : input.axes.steer;

    // Rush boost meter
    this.boosting = !crashed && input.isDown('boost') && thr > 0.1 && this.boost > 0.02 && this.fuel > 0;
    if (this.boosting) this.boost = Math.max(0, this.boost - dt * 0.2); else this.boost = Math.min(1, this.boost + dt * 0.07);

    const empty = this.fuel <= 0;
    const wear = this.profile.wear || 0;
    const wearF = 1 - Math.max(0, wear - 0.6) * 0.6;
    let top = m.top * mods.power * wearF * surfTop * (this.boosting ? 1.18 : 1) * (this.puddleDrag ? 0.45 : 1);
    if (this.puncture) top = Math.min(top, 5.5);
    if (empty) top = 2.2;
    const accel = m.accel * mods.power * (this.boosting ? 1.35 : 1) * (surf === 'road' ? 1 : 0.75);

    // longitudinal
    const v = this.speed;
    let a = 0;
    this.pushing = false;
    if (thr > 0 && v >= -0.2) {
      const t = clamp(v / top, 0, 1.2);
      a += accel * thr * Math.max(0, 1 - t * t * t) * (this.shiftTimer > 0 ? 0.3 : 1);
    }
    if (brk > 0) {
      if (v > 0.3) a -= m.brake * mods.brake * brk * (0.75 + grip * 0.25);
      else { a -= 1.6 * brk; this.pushing = true; } // walk the bike backwards
    }
    if (hand && v > 0) a -= 7.5 * (0.7 + 0.3 * grip);
    // drag + engine braking + rolling resistance
    a -= v * (0.035 + surfDrag * 0.35) + Math.sign(v) * (thr > 0 ? 0 : 0.6) + (v > top ? (v - top) * 1.5 : 0);
    this.speed += a * dt;
    if (this.pushing) this.speed = Math.max(this.speed, -1.4);
    else if (thr === 0 && brk === 0 && Math.abs(this.speed) < 0.15) this.speed = 0;
    if (!this.pushing && this.speed < 0 && brk === 0) this.speed = Math.min(0, this.speed + dt * 3);
    this.accelSmoothed = damp(this.accelSmoothed, a, 6, dt);

    // steering: large lock at walking pace, tight at speed
    const sp = Math.abs(this.speed);
    const steerRate = steerIn === 0 ? 7 : 4.2;
    this.steer = damp(this.steer, steerIn, steerRate, dt);
    const maxSteer = lerp(0.62, 0.075, clamp(sp / 26, 0, 1)) * m.handling * (0.75 + grip * 0.25);
    const wheelbase = 1.28;
    let yaw = (this.speed / wheelbase) * Math.tan(this.steer * maxSteer);
    if (hand && sp > 5) { yaw *= 1.35; this.skid = Math.min(1, this.skid + dt * 4); }
    else this.skid = Math.max(0, this.skid - dt * 3);
    // brake in rain: slight wobble
    if (wet > 0.4 && brk > 0.8 && sp > 12 && grip < 1) yaw += Math.sin(performance.now() * 0.02) * 0.08 * wet;
    if (this.puncture && sp > 1) yaw += Math.sin(performance.now() * 0.012) * 0.12;
    this.yawRate = damp(this.yawRate, -yaw, 10, dt);
    this.heading += this.yawRate * dt;

    // lean from lateral acceleration (visual only; collision stays upright)
    const latAcc = this.speed * this.yawRate;
    const targetLean = clamp(-Math.atan(latAcc / 9.81), -0.75, 0.75) * (crashed ? 0 : 1);
    this.lean = damp(this.lean, crashed ? Math.sin(this.crashTimer * 12) * 0.25 : targetLean, 8, dt);

    // integrate position
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    this.pos.x += fx * this.speed * dt;
    this.pos.z += fz * this.speed * dt;

    // collisions: two circles along the bike
    let impact = 0, hitNormal = null;
    for (const off of [0.55, -0.5]) {
      const c = { x: this.pos.x + fx * off, z: this.pos.z + fz * off };
      const hit = world.collision.resolveCircle(c, 0.42, {});
      const dyn = dynamicColliders ? dynamicColliders(c, 0.42) : null;
      for (const h of [hit, dyn]) {
        if (!h) continue;
        this.pos.x = c.x - fx * off; this.pos.z = c.z - fz * off;
        const headOn = Math.max(0, -(fx * h.nx + fz * h.nz)) * Math.sign(this.speed || 1);
        const hitV = Math.abs(this.speed) * Math.max(headOn, 0.15);
        if (hitV > impact) { impact = hitV; hitNormal = h; }
        this.speed *= 1 - clamp(headOn * 0.9 + 0.05, 0, 0.95);
        // glance off: align heading slightly with wall
        if (headOn < 0.7 && Math.abs(this.speed) > 2) {
          const tx = -h.nz, tz = h.nx; const dot = fx * tx + fz * tz;
          const target = Math.atan2(tx * Math.sign(dot), tz * Math.sign(dot));
          const d = Math.atan2(Math.sin(target - this.heading), Math.cos(target - this.heading));
          this.heading += d * 0.12;
        }
      }
    }
    this.lastImpact = impact;
    if (impact > 7.5 && !crashed) { this.crashTimer = 1.1; this.speed *= 0.2; }

    // suspension + bumps
    const k = 140, c = 14;
    this.susV += (-k * this.susY - c * this.susV) * dt;
    this.susY += this.susV * dt;
    if (surf === 'dirt' || surf === 'grass') this.susV += (Math.random() - 0.5) * sp * 0.25 * dt * 60 * 0.05;
    this.pitch = damp(this.pitch, clamp(-this.accelSmoothed * 0.008, -0.07, 0.07) + this.susV * 0.02, 10, dt);

    // gears and rpm
    const gTop = (g) => (m.top * mods.power * 1.05 * g) / m.gears;
    if (this.shiftTimer > 0) this.shiftTimer -= dt;
    const vv = Math.abs(this.speed);
    if (this.gear < m.gears && vv > gTop(this.gear) * 0.92) { this.gear++; this.shiftTimer = 0.18; this.onShift?.(); }
    else if (this.gear > 1 && vv < gTop(this.gear - 1) * 0.55) this.gear--;
    const lo = this.gear === 1 ? 0 : gTop(this.gear - 1) * 0.5;
    const r = clamp((vv - lo) / (gTop(this.gear) - lo), 0, 1.05);
    const targetRpm = vv < 0.5 ? 1100 + thr * 3500 : lerp(2200, m.redline, r) + thr * 400;
    this.rpm = damp(this.rpm, this.shiftTimer > 0 ? targetRpm * 0.7 : targetRpm, 12, dt);

    // fuel: litres modelled as percent of tank
    const dist = Math.abs(this.speed) * dt;
    if (!empty) {
      this.fuel -= (dist * 0.0078 * (this.boosting ? 2 : 1) + dt * 0.002) * m.eff * mods.eff * (100 / m.tank);
      if (this.fuel < 0) this.fuel = 0;
    }
    this.distanceThisFrame = dist;
    this.profile.wear = Math.min(1, (this.profile.wear || 0) + dist / 80000);
    this.rearWheel.scale.set(1, this.puncture ? 0.82 : 1, this.puncture ? 1.08 : 1);

    // indicators
    if (input.wasPressed('indicator')) this.indicator = this.indicator === 0 ? (steerIn >= 0 ? 1 : -1) : 0;
    if (this.indicator !== 0) {
      this.indTimer += dt;
      if (Math.abs(this.steer) > 0.5 && sp > 3) this._indTurned = true;
      if (this._indTurned && Math.abs(this.steer) < 0.1) { this.indicator = 0; this._indTurned = false; }
    }
    if (input.wasPressed('headlight')) this.highBeam = !this.highBeam;

    this.updateVisual(dt, env, brk > 0 || hand, steerIn);
  }

  updateVisual(dt, env, braking, steerIn) {
    const night = env.state.night;
    this.root.position.set(this.pos.x, Math.max(0, this.susY * 0.6) + (this.surface === 'paved' ? 0.1 : 0.03), this.pos.z);
    this.root.rotation.y = this.heading;
    this.leanPivot.rotation.set(this.pitch, 0, this.lean);
    this.front.rotation.y = this.steer * lerp(0.5, 0.08, clamp(Math.abs(this.speed) / 20, 0, 1));
    const spin = (this.speed / this.wheelR) * dt;
    this.frontWheel.rotation.x += spin; this.rearWheel.rotation.x += spin;
    // rider body language
    this.rider.rotation.z = this.lean * 0.18;
    this.torso.rotation.x = clamp(this.accelSmoothed * -0.01, -0.1, 0.08) + (this.boosting ? 0.15 : 0);
    this.head.rotation.y = damp(this.head.rotation.y, -steerIn * 0.35, 5, dt);
    this.head.rotation.z = -this.lean * 0.4;
    // lights
    const on = night > 0.15 || env.rain > 0.4;
    this.headlight.intensity = on ? (this.highBeam ? 90 : 45) : 0;
    this.headlight.distance = this.highBeam ? 110 : 70;
    this.headlight.target.position.set(0, 0, this.highBeam ? 22 : 13);
    this.lampMat.color.setScalar(on ? 2.2 : 0.9);
    this.beamMat.opacity = on ? 0.05 * night * (this.highBeam ? 1.4 : 1) : 0;
    this.brakeMat.color.set(braking ? 0xff2211 : on ? 0x991111 : 0x441111);
    const blinkOn = this.indicator !== 0 && Math.floor(this.indTimer * 2.6) % 2 === 0;
    this.indMat[0].color.set(this.indicator === -1 && blinkOn ? 0xffa000 : 0x553300); // left
    this.indMat[1].color.set(this.indicator === 1 && blinkOn ? 0xffa000 : 0x553300);  // right
    if (this.indicator !== 0) { const ph = Math.floor(this.indTimer * 2.6) % 2; if (ph !== this._lastPh) { this._lastPh = ph; this.onIndicator?.(); } }
  }
}
