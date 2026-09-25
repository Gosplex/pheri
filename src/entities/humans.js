import * as THREE from 'three';
import { MeshBuilder } from '../core/geom.js';
import { makeCanvas } from '../core/textures.js';

// ---------------------------------------------------------------------------
// Procedural Indian people.
// Every body part and garment is one InstancedMesh shared by the whole crowd.
// A light skeleton (pelvis, spine, neck, shoulders, elbows, hips, knees, ankles)
// drives walk, idle, phone, chai, talk, wave, dance and stumble poses.
// Vertex colours are white where the per-person instance colour should show
// (skin, fabric) and dark where detail must stay dark (eyes, brows).
// ---------------------------------------------------------------------------

export const SKIN = [0x8d5524, 0x9c6b43, 0xa9754b, 0xb57a4b, 0xc68642, 0x7a4a26, 0x6b3f22, 0xd09a6a];
const SAREE = [0xc2185b, 0xe65100, 0xb71c1c, 0x1a237e, 0x00695c, 0x6a1b9a, 0xf9a825, 0xad1457, 0x2e7d32, 0x00838f, 0xd84315, 0x4527a0, 0xff7043, 0x880e4f];
const KAMEEZ = [0xf8bbd0, 0xb2dfdb, 0xfff59d, 0xce93d8, 0x90caf9, 0xffccbc, 0xc5e1a5, 0xe1bee7, 0xd81b60, 0x00897b, 0xfb8c00, 0x5e35b1, 0xffffff];
const SHIRT = [0xffffff, 0xf5f5f5, 0xbbdefb, 0xe3f2fd, 0xfff8e1, 0xcfd8dc, 0x90a4ae, 0x1565c0, 0x283593, 0x4e342e, 0x558b2f, 0xc62828, 0xefebe9];
const KURTA = [0xffffff, 0xfdf6e3, 0xfff3e0, 0xe0f7fa, 0xf3e5f5, 0xffe0b2, 0xef6c00, 0xffd54f, 0xd7ccc8];
const PANTS = [0x263238, 0x212121, 0x37474f, 0x3e2723, 0x4e342e, 0x5d4037, 0x8d6e63, 0x1a237e, 0x3b5a8a, 0x455a64, 0xbcaaa4];
const JEANS = [0x3b5a8a, 0x2c4770, 0x4a6fa5, 0x1f2f4f, 0x212121];
const TEES = [0x212121, 0xffffff, 0xc62828, 0x1565c0, 0x2e7d32, 0xf9a825, 0x6a1b9a, 0x00838f, 0xef6c00, 0x9e9e9e, 0x795548];
const PAGDI = [0xd32f2f, 0xffffff, 0xff8f00, 0xf9a825, 0xc2185b, 0xe65100];
const SHOES = [0x2b1d14, 0x3e2723, 0x212121, 0x5d4037, 0x8d6e63, 0xbfa37a];
const HAIR = [0x0e0c0b, 0x15110f, 0x1b1511, 0x231a14];

const pick = (r, a) => a[Math.floor(r.next() * a.length)];

// Bandhani dots + a darker woven border along the hem (v near 0)
function patternTexture() {
  const c = makeCanvas(256, 256), g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
  for (let y = 18; y < 220; y += 14) for (let x = (y / 14) % 2 ? 7 : 0; x < 256; x += 14) {
    g.fillStyle = 'rgba(255,255,255,1)'; g.beginPath(); g.arc(x, y, 3.2, 0, 7); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1.2; g.beginPath(); g.arc(x, y, 3.4, 0, 7); g.stroke();
  }
  g.fillStyle = 'rgba(0,0,0,0.42)'; g.fillRect(0, 222, 256, 34);
  g.fillStyle = 'rgba(255,236,160,0.95)'; g.fillRect(0, 228, 256, 3); g.fillRect(0, 247, 256, 3);
  for (let x = 4; x < 256; x += 12) { g.beginPath(); g.moveTo(x, 239); g.lineTo(x + 4, 235); g.lineTo(x + 8, 239); g.lineTo(x + 4, 243); g.closePath(); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

// ---- part geometry (built at unit scale; pivot = joint) --------------------
function cyl(b, y0, y1, r0, r1, seg = 10, sz = 1, color = 0xffffff, ox = 0, oz = 0) {
  const g = new THREE.CylinderGeometry(r1, r0, Math.abs(y1 - y0), seg, 1);
  g.scale(1, 1, sz);
  b.addGeometry(g, new THREE.Matrix4().makeTranslation(ox, (y0 + y1) / 2, oz), color);
  g.dispose();
}
function sph(b, x, y, z, rx, ry, rz, color = 0xffffff, seg = 10, thetaLen = Math.PI) {
  const g = new THREE.SphereGeometry(1, seg, Math.max(4, seg >> 1), 0, Math.PI * 2, 0, thetaLen);
  b.addGeometry(g, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(rx, ry, rz)), color);
  g.dispose();
}

function buildParts() {
  const P = {};
  const mk = (fn) => { const b = new MeshBuilder(); fn(b); return b.build(); };
  // pelvis (hips) around hip joint height
  P.pelvis = mk((b) => sph(b, 0, 0, 0, 0.165, 0.11, 0.115, 0xffffff, 12));
  // torso from the waist up: tapered, elliptical, with shoulder caps
  P.torso = mk((b) => {
    cyl(b, 0.02, 0.44, 0.14, 0.175, 12, 0.62);
    sph(b, 0, 0.44, 0, 0.19, 0.07, 0.11, 0xffffff, 12);
    sph(b, 0.16, 0.42, 0, 0.065, 0.06, 0.065); sph(b, -0.16, 0.42, 0, 0.065, 0.06, 0.065);
  });
  P.torsoF = mk((b) => { // female torso: narrower waist, soft chest
    cyl(b, 0.02, 0.42, 0.125, 0.16, 12, 0.62);
    sph(b, 0, 0.42, 0, 0.17, 0.06, 0.1, 0xffffff, 12);
    sph(b, 0.055, 0.3, 0.06, 0.06, 0.06, 0.05); sph(b, -0.055, 0.3, 0.06, 0.06, 0.06, 0.05);
    sph(b, 0.135, 0.4, 0, 0.045, 0.045, 0.045); sph(b, -0.135, 0.4, 0, 0.045, 0.045, 0.045);
  });
  // head with neck, eyes, brows, nose, lips, ears (dark details stay dark after tinting)
  P.head = mk((b) => {
    cyl(b, 0, 0.1, 0.048, 0.045, 8);
    sph(b, 0, 0.2, 0.005, 0.095, 0.118, 0.108, 0xffffff, 14);
    sph(b, 0, 0.135, 0.03, 0.07, 0.05, 0.07, 0xffffff, 10); // jaw
    sph(b, 0.034, 0.212, 0.093, 0.016, 0.011, 0.008, 0xf4f4f4, 6); sph(b, -0.034, 0.212, 0.093, 0.016, 0.011, 0.008, 0xf4f4f4, 6);
    sph(b, 0.034, 0.212, 0.099, 0.008, 0.008, 0.005, 0x060404, 6); sph(b, -0.034, 0.212, 0.099, 0.008, 0.008, 0.005, 0x060404, 6);
    b.box(0.036, 0.235, 0.098, 0.032, 0.006, 0.008, 0, 0x120c0a, 0, -0.1); b.box(-0.036, 0.235, 0.098, 0.032, 0.006, 0.008, 0, 0x120c0a, 0, 0.1);
    b.box(0, 0.19, 0.107, 0.02, 0.04, 0.02, 0, 0xe0d0c8, 0.25);
    b.box(0, 0.155, 0.098, 0.034, 0.008, 0.01, 0, 0x8a5a58);
    sph(b, 0.095, 0.2, 0, 0.018, 0.03, 0.014); sph(b, -0.095, 0.2, 0, 0.018, 0.03, 0.014);
  });
  const cap = (b, s = 1) => sph(b, 0, 0.215, -0.006, 0.1 * s, 0.118 * s, 0.114 * s, 0xffffff, 12, Math.PI * 0.52);
  P.hairShort = mk((b) => { cap(b, 1.04); sph(b, 0, 0.19, -0.035, 0.098, 0.1, 0.085, 0xffffff, 10); });
  P.hairLong = mk((b) => { cap(b, 1.05); sph(b, 0, 0.18, -0.04, 0.1, 0.11, 0.09, 0xffffff, 10); b.box(0, -0.04, -0.105, 0.05, 0.36, 0.035, 0, 0xffffff, 0.12); sph(b, 0, -0.22, -0.13, 0.028, 0.03, 0.028); });
  P.hairBun = mk((b) => { cap(b, 1.05); sph(b, 0, 0.19, -0.035, 0.1, 0.1, 0.085, 0xffffff, 10); sph(b, 0, 0.2, -0.125, 0.052, 0.05, 0.045, 0xffffff, 8); });
  P.moustache = mk((b) => { b.box(0, 0.172, 0.101, 0.07, 0.014, 0.014, 0, 0xffffff); b.box(0.036, 0.165, 0.096, 0.02, 0.014, 0.012, 0, 0xffffff, 0, 0.5); b.box(-0.036, 0.165, 0.096, 0.02, 0.014, 0.012, 0, 0xffffff, 0, -0.5); });
  P.beard = mk((b) => sph(b, 0, 0.14, 0.035, 0.08, 0.055, 0.075, 0xffffff, 10));
  P.pagdi = mk((b) => { cyl(b, 0.22, 0.33, 0.118, 0.13, 14, 1.05); sph(b, 0, 0.33, 0, 0.128, 0.05, 0.134, 0xffffff, 12); for (let i = 0; i < 3; i++) b.box(0, 0.24 + i * 0.03, 0.125, 0.2, 0.012, 0.01, 0, 0xdddddd, 0, (i - 1) * 0.25); });
  P.topi = mk((b) => cyl(b, 0.27, 0.33, 0.1, 0.098, 12));
  P.guardCap = mk((b) => { cyl(b, 0.26, 0.34, 0.105, 0.112, 12); b.box(0, 0.265, 0.11, 0.16, 0.012, 0.08, 0, 0x151515); });
  P.headCover = mk((b) => { sph(b, 0, 0.215, -0.01, 0.118, 0.13, 0.126, 0xffffff, 12, Math.PI * 0.6); b.box(0, 0.02, -0.1, 0.2, 0.34, 0.03, 0, 0xffffff, 0.15); });
  P.bindi = mk((b) => sph(b, 0, 0.228, 0.103, 0.007, 0.007, 0.004, 0xffffff, 6));
  // arms
  P.upperArm = mk((b) => { sph(b, 0, 0, 0, 0.05, 0.05, 0.05); cyl(b, -0.29, 0, 0.04, 0.05, 8); });
  P.upperArmLoose = mk((b) => { sph(b, 0, 0, 0, 0.06, 0.06, 0.06); cyl(b, -0.28, 0, 0.055, 0.06, 8); });
  P.forearm = mk((b) => cyl(b, -0.25, 0, 0.032, 0.04, 8));
  P.hand = mk((b) => { sph(b, 0, -0.045, 0.004, 0.032, 0.048, 0.02, 0xffffff, 8); b.box(0.028, -0.035, 0.012, 0.018, 0.04, 0.018, 0, 0xffffff, 0, -0.5); });
  // legs
  P.thigh = mk((b) => cyl(b, -0.43, 0, 0.052, 0.074, 10));
  P.shin = mk((b) => { cyl(b, -0.42, 0, 0.037, 0.052, 10); sph(b, 0, -0.14, -0.02, 0.045, 0.1, 0.045); });
  P.thighLoose = mk((b) => cyl(b, -0.43, 0, 0.09, 0.105, 10));
  P.shinLoose = mk((b) => cyl(b, -0.42, 0, 0.05, 0.09, 10));
  P.foot = mk((b) => { b.box(0, -0.03, 0.045, 0.08, 0.055, 0.22, 0, 0xffffff); });
  // garments
  P.skirt = mk((b) => cyl(b, -0.9, 0.04, 0.28, 0.165, 16, 0.92));          // saree / chaniya / petticoat, pivot at pelvis
  P.tunic = mk((b) => cyl(b, -0.5, 0.46, 0.235, 0.18, 14, 0.72));          // kurta / kameez, pivot at waist
  P.kediyu = mk((b) => { cyl(b, 0.12, 0.46, 0.25, 0.185, 14, 0.75); cyl(b, 0.0, 0.14, 0.3, 0.25, 14, 0.8); }); // Kathiyawadi frilled top
  P.pallu = mk((b) => {                                                     // saree drape across chest, over left shoulder
    b.box(0.02, 0.26, 0.078, 0.17, 0.5, 0.02, 0, 0xffffff, 0, -0.55);
    b.box(0.13, 0.43, 0.0, 0.1, 0.03, 0.16, 0, 0xffffff);
    b.box(0.12, 0.08, -0.095, 0.2, 0.7, 0.02, 0, 0xffffff, 0.08);
  });
  P.dupatta = mk((b) => {
    b.box(0.1, 0.25, 0.085, 0.09, 0.42, 0.015, 0, 0xffffff, -0.05, 0.1);
    b.box(-0.1, 0.25, 0.085, 0.09, 0.42, 0.015, 0, 0xffffff, -0.05, -0.1);
    b.box(0, 0.44, 0.02, 0.3, 0.025, 0.16, 0, 0xffffff);
    b.box(0, 0.3, -0.085, 0.26, 0.3, 0.015, 0, 0xffffff, 0.05);
  });
  P.backpack = mk((b) => { b.box(0, 0.28, -0.14, 0.27, 0.36, 0.13, 0, 0xffffff); b.box(0, 0.38, -0.215, 0.2, 0.12, 0.03, 0, 0xdddddd); b.box(0.09, 0.3, 0.02, 0.03, 0.34, 0.03, 0, 0x333333); b.box(-0.09, 0.3, 0.02, 0.03, 0.34, 0.03, 0, 0x333333); });
  P.gamchha = mk((b) => { b.box(-0.14, 0.46, 0.0, 0.08, 0.02, 0.2, 0, 0xffffff); b.box(-0.14, 0.3, 0.1, 0.08, 0.3, 0.015, 0, 0xffffff); b.box(-0.14, 0.3, -0.1, 0.08, 0.3, 0.015, 0, 0xffffff); });
  P.belt = mk((b) => cyl(b, -0.015, 0.03, 0.15, 0.15, 12, 0.66));
  P.phone = mk((b) => { b.box(0, -0.075, 0.03, 0.045, 0.085, 0.01, 0, 0x151515); b.box(0, -0.075, 0.036, 0.038, 0.074, 0.002, 0, 0x4c6a8a); });
  P.cup = mk((b) => cyl(b, -0.09, -0.04, 0.018, 0.024, 8, 1, 0xf1e6d0, 0, 0.03));
  P.bag = mk((b) => { b.box(0, -0.36, 0.05, 0.22, 0.26, 0.08, 0, 0xffffff); b.box(0, -0.18, 0.05, 0.02, 0.12, 0.02, 0, 0x333333); });
  return P;
}

// Which parts use the patterned fabric material
const PATTERNED = new Set(['skirt', 'pallu', 'dupatta', 'headCover']);

// ---------------------------------------------------------------------------
// Outfit generator: picks a believable Rajkot outfit for the place and hour.
// ---------------------------------------------------------------------------
export function makeOutfit(r, { zone = 'resi', hour = 12, kind = null } = {}) {
  const o = { parts: {}, female: false, scale: 1, width: 1, loose: false, style: '' };
  const skin = pick(r, SKIN), hair = r.next() < 0.1 ? 0xbdbdbd : pick(r, HAIR);
  const set = (k, c) => { o.parts[k] = c; };
  const campus = zone === 'campus';
  const old = zone === 'old' || zone === 'outer' || zone === 'highway';
  let style = kind;
  if (!style) {
    const f = r.next() < 0.46;
    const kidTime = (hour > 7 && hour < 9.5) || (hour > 12.5 && hour < 14.5);
    if (!campus && kidTime && r.next() < 0.18) style = f ? 'schoolgirl' : 'schoolboy';
    else if (f) {
      style = campus ? r.weighted(['kurtiJeans', 'kameez', 'tee'], (s) => ({ kurtiJeans: 4, kameez: 3, tee: 2 })[s])
        : r.weighted(['saree', 'kameez', 'kurtiJeans', 'sareeElder', 'chaniya'], (s) => ({ saree: old ? 5 : 3.5, kameez: 4, kurtiJeans: old ? 0.6 : 2, sareeElder: old ? 2.5 : 1, chaniya: hour > 18 && hour < 23 ? 1.2 : 0.1 })[s]);
    } else {
      style = campus ? r.weighted(['student', 'shirt', 'kurta'], (s) => ({ student: 5, shirt: 2, kurta: 0.6 })[s])
        : r.weighted(['shirt', 'kurta', 'student', 'kathiyawadi', 'worker'], (s) => ({ shirt: 4.5, kurta: 2, student: old ? 0.6 : 1.5, kathiyawadi: old ? 1.8 : 0.4, worker: 1.4 })[s]);
    }
  }
  o.style = style;
  const female = ['saree', 'sareeElder', 'kameez', 'kurtiJeans', 'chaniya', 'schoolgirl', 'bride'].includes(style) || (style === 'tee' && true);
  o.female = female;
  set('head', skin); set('hand', skin); set('pelvis', 0);
  o.scale = female ? 0.93 + r.next() * 0.07 : 0.98 + r.next() * 0.08;
  o.width = 0.94 + r.next() * 0.14;
  if (style === 'schoolboy' || style === 'schoolgirl') o.scale = 0.64 + r.next() * 0.1;

  const shoes = pick(r, SHOES);
  set('foot', shoes);
  if (female) {
    set(r.next() < 0.55 ? 'hairLong' : 'hairBun', hair);
    if (r.next() < 0.55 && style !== 'schoolgirl') set('bindi', 0xc62828);
  } else if (style !== 'kathiyawadi') {
    set('hairShort', hair);
    if (r.next() < 0.45 && style !== 'schoolboy') set('moustache', hair);
    if (r.next() < 0.12 && style !== 'schoolboy') set('beard', hair);
  }

  switch (style) {
    case 'saree': case 'sareeElder': {
      const c = pick(r, SAREE);
      const blouse = r.next() < 0.5 ? c : pick(r, SAREE);
      set('torsoF', blouse); set('upperArm', blouse); set('forearm', skin);
      set('skirt', c); set('pallu', c);
      if (style === 'sareeElder') { set('headCover', c); delete o.parts.hairLong; delete o.parts.hairBun; if (r.next() < 0.5) set('bag', pick(r, [0x6d4c41, 0xc62828, 0x1565c0])); }
      o.skirtFlare = 1;
      break;
    }
    case 'chaniya': {
      const c = pick(r, SAREE);
      set('torsoF', pick(r, SAREE)); set('upperArm', skin); set('forearm', skin);
      set('skirt', c); set('dupatta', pick(r, SAREE)); o.skirtFlare = 1.55;
      break;
    }
    case 'kameez': {
      const c = pick(r, KAMEEZ);
      set('torsoF', c); set('tunic', c); set('upperArm', c); set('forearm', r.next() < 0.5 ? c : skin);
      set('thighLoose', r.next() < 0.5 ? 0xffffff : pick(r, KAMEEZ)); set('shinLoose', o.parts.thighLoose);
      set('dupatta', pick(r, SAREE));
      break;
    }
    case 'kurtiJeans': case 'tee': {
      const c = style === 'tee' ? pick(r, TEES) : pick(r, KAMEEZ);
      set('torsoF', c); if (style !== 'tee') set('tunic', c);
      set('upperArm', c); set('forearm', style === 'tee' ? skin : r.next() < 0.5 ? c : skin);
      set('thigh', pick(r, JEANS)); set('shin', o.parts.thigh);
      if (campus && r.next() < 0.6) set('backpack', pick(r, [0x212121, 0x1565c0, 0x6a1b9a, 0xc62828, 0x455a64]));
      else if (r.next() < 0.4) set('bag', pick(r, [0x6d4c41, 0x212121, 0xad1457]));
      break;
    }
    case 'schoolgirl': case 'schoolboy': {
      set('torso', 0xffffff); set('upperArm', 0xffffff); set('forearm', skin);
      if (style === 'schoolgirl') { set('skirt', 0x1a237e); o.skirtFlare = 0.9; o.skirtShort = true; set('shin', skin); }
      else { set('thigh', 0x1a237e); set('shin', skin); }
      set('backpack', pick(r, [0xc62828, 0x1565c0, 0xf9a825, 0x6a1b9a, 0x00897b]));
      set('foot', 0x111111);
      break;
    }
    case 'shirt': {
      const c = pick(r, SHIRT), p = pick(r, PANTS);
      set('torso', c); set('upperArm', c); set('forearm', r.next() < 0.55 ? c : skin);
      set('thigh', p); set('shin', p); set('belt', 0x2b1d14);
      if (r.next() < 0.15) set('bag', 0x3e2723);
      break;
    }
    case 'kurta': {
      const c = pick(r, KURTA);
      set('torso', c); set('tunic', c); set('upperArm', c); set('forearm', c);
      set('thighLoose', 0xffffff); set('shinLoose', 0xffffff);
      if (r.next() < 0.3) set('topi', 0xffffff);
      break;
    }
    case 'student': {
      const c = pick(r, TEES);
      set('torso', c); set('upperArm', c); set('forearm', r.next() < 0.25 ? c : skin);
      set('thigh', pick(r, JEANS)); set('shin', o.parts.thigh);
      set('foot', pick(r, [0xffffff, 0x212121, 0x9e9e9e]));
      if (r.next() < 0.7) set('backpack', pick(r, [0x212121, 0x37474f, 0x1565c0, 0xc62828]));
      break;
    }
    case 'kathiyawadi': { // Saurashtra elder: kediyu, dhoti, pagdi
      set('torso', 0xffffff); set('kediyu', 0xfafafa); set('upperArmLoose', 0xfafafa); set('forearm', 0xfafafa);
      set('thighLoose', 0xf5f0e6); set('shinLoose', 0xf5f0e6); set('pagdi', pick(r, PAGDI));
      set('moustache', r.next() < 0.5 ? 0xd6d6d6 : hair);
      o.scale *= 0.98;
      break;
    }
    case 'worker': {
      const c = pick(r, [0xffffff, 0x9e9e9e, 0x795548, 0x5d4037, 0x1565c0]);
      set('torso', c); set('upperArm', c); set('forearm', skin);
      set('thigh', pick(r, PANTS)); set('shin', o.parts.thigh);
      set('gamchha', pick(r, [0xc62828, 0xf9a825, 0xffffff, 0x2e7d32]));
      break;
    }
    case 'guard': {
      set('torso', 0xa1887f); set('upperArm', 0xa1887f); set('forearm', 0xa1887f);
      set('thigh', 0x8d6e63); set('shin', 0x8d6e63); set('guardCap', 0x8d6e63); set('belt', 0x2b1d14);
      break;
    }
    case 'groomParty': {
      const c = pick(r, [0xffd54f, 0xffe0b2, 0xf8bbd0, 0xe1bee7, 0xffcc80]);
      set('torso', c); set('tunic', c); set('upperArm', c); set('forearm', c);
      set('thighLoose', 0xfff8e1); set('shinLoose', 0xfff8e1); set('pagdi', pick(r, PAGDI));
      break;
    }
    default: break;
  }
  if (o.parts.torsoF === undefined && female && !o.parts.torso) set('torsoF', pick(r, KAMEEZ));
  return o;
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------
const _root = new THREE.Matrix4(), _pel = new THREE.Matrix4(), _tor = new THREE.Matrix4(), _hd = new THREE.Matrix4();
const _j = [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()];
const _loc = new THREE.Matrix4(), _out = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _c = new THREE.Color();

function local(parent, x, y, z, rx, ry, rz, out, order = 'XYZ', sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz, order); _q.setFromEuler(_e);
  _loc.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
  return out.multiplyMatrices(parent, _loc);
}

export class HumanRenderer {
  constructor(scene, capacity, quality = 'medium') {
    this.cap = capacity;
    this.parts = buildParts();
    this.clothMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });
    this.patternMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, map: patternTexture() });
    this.meshes = {};
    const shadowParts = quality === 'low' ? [] : ['torso', 'torsoF', 'tunic', 'skirt', 'thigh', 'thighLoose', 'head'];
    for (const [k, g] of Object.entries(this.parts)) {
      const m = new THREE.InstancedMesh(g, PATTERNED.has(k) ? this.patternMat : this.clothMat, capacity);
      m.count = 0; m.frustumCulled = false; m.castShadow = shadowParts.includes(k);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, _c.set(0xffffff));
      scene.add(m);
      this.meshes[k] = m;
    }
    this.counts = {};
  }

  _put(key, color, matrix) {
    const m = this.meshes[key]; if (!m) return;
    const i = this.counts[key] || 0;
    if (i >= this.cap) return;
    m.setMatrixAt(i, matrix);
    m.setColorAt(i, _c.set(color));
    this.counts[key] = i + 1;
  }

  // Build the pose for one person and write every visible part.
  draw(p, camPos) {
    const O = p.outfit, P = O.parts;
    const d2 = camPos ? (p.x - camPos.x) ** 2 + (p.z - camPos.z) ** 2 : 0;
    const far = d2 > 70 * 70;
    const sc = O.scale;
    const t = p.phase;
    const moving = p.speed > 0.1;
    const amp = moving ? Math.min(1, p.speed / 1.4) : 0;
    // --- pose parameters ---
    let hipL = 0, hipR = 0, kneeL = 0.04, kneeR = 0.04, shL = 0, shR = 0, abL = 0.1, abR = 0.1, elL = 0.18, elR = 0.18;
    let bob = 0, twist = 0, lean = 0, headYaw = 0, headPitch = 0, sway = 0, bounce = 0, shRzExtra = 0;
    let holdPhone = false, holdCup = false;
    if (moving) {
      const s = Math.sin(t), c = Math.cos(t);
      hipL = 0.48 * s * amp; hipR = -0.48 * s * amp;
      kneeL = 0.08 + 0.85 * Math.max(0, c) * amp; kneeR = 0.08 + 0.85 * Math.max(0, -c) * amp;
      shL = -0.38 * s * amp; shR = 0.38 * s * amp;
      elL = 0.25 + 0.25 * Math.max(0, -s) * amp; elR = 0.25 + 0.25 * Math.max(0, s) * amp;
      bob = Math.abs(c) * 0.035 * amp; twist = 0.09 * s * amp; lean = 0.05 * amp; sway = Math.sin(t) * 0.02;
      if (P.bag) { shR = 0.05; elR = 0.1; }
    } else {
      const it = p.idleT || 0, ph = p.phase;
      sway = Math.sin(it * 0.9 + ph) * 0.025; headYaw = Math.sin(it * 0.35 + ph) * 0.35;
      hipL = sway * 2; hipR = -sway * 2;
      if (p.act === 'phone') { shR = 0.55; elR = 1.95; abR = 0.08; headPitch = 0.38; headYaw = 0; holdPhone = true; }
      else if (p.act === 'chai') { const sip = Math.max(0, Math.sin(it * 0.8 + ph)) > 0.85; shR = sip ? 0.7 : 0.35; elR = sip ? 2.15 : 1.5; holdCup = true; headPitch = sip ? -0.1 : 0; }
      else if (p.act === 'talk') { shR = 0.3 + Math.sin(it * 3.1 + ph) * 0.25; elR = 1.1 + Math.sin(it * 2.3) * 0.3; shL = 0.15 + Math.sin(it * 2.7 + 1) * 0.12; elL = 0.6; headYaw = Math.sin(it * 0.8) * 0.2; }
      else if (p.act === 'hips') { abL = 0.55; abR = 0.55; elL = 1.8; elR = 1.8; shL = -0.3; shR = -0.3; shRzExtra = 0.2; }
      else if (p.act === 'bat') { shL = 0.7; shR = 0.7; abL = -0.35; abR = -0.35; elL = 0.5; elR = 0.5; lean = 0.25; kneeL = 0.3; kneeR = 0.3; headYaw = -0.4; }
      else if (p.act === 'field') { lean = 0.35; kneeL = 0.5; kneeR = 0.5; hipL = 0.4; hipR = 0.4; shL = 0.4; shR = 0.4; elL = 0.6; elR = 0.6; }
      else if (p.act === 'namaste') { shL = 0.6; shR = 0.6; abL = -0.25; abR = -0.25; elL = 1.9; elR = 1.9; }
    }
    if (p.mode === 'waiting') { shR = 2.7 + Math.sin(p.wave * 7) * 0.2; elR = 0.3; abR = 0.35; headPitch = -0.05; }
    if (p.mode === 'baraat') {
      const b = t * 1.6;
      bounce = Math.abs(Math.sin(b)) * 0.1; twist = Math.sin(b * 0.5) * 0.35;
      shL = 2.7 + Math.sin(b) * 0.3; shR = 2.7 - Math.sin(b) * 0.3; abL = 0.5; abR = 0.5; elL = 0.5 + Math.sin(b) * 0.3; elR = 0.5 - Math.sin(b) * 0.3;
      kneeL = 0.3 + Math.max(0, Math.sin(b)) * 0.5; kneeR = 0.3 + Math.max(0, -Math.sin(b)) * 0.5; hipL = -kneeL * 0.4; hipR = -kneeR * 0.4;
    }
    if (p.lampBearer) { shL = 2.95; shR = 2.95; abL = 0.08; abR = 0.08; elL = 0.2; elR = 0.2; }
    const stumble = p.stumble > 0 ? Math.sin(p.stumble * 9) * 0.35 : 0;

    // --- skeleton ---
    const hipY = 0.93;
    _e.set(stumble * 0.6, p.heading, stumble * 0.4, 'YXZ'); _q.setFromEuler(_e);
    _root.compose(_v.set(p.x, bounce, p.z), _q, _s.set(sc * O.width, sc, sc * O.width));
    local(_root, sway, hipY + bob, 0, 0, twist, sway * 2, _pel, 'YXZ');
    const bottom = P.thigh ?? P.thighLoose ?? P.skirt ?? 0x333333;
    if (P.skirt === undefined || O.skirtShort) this._put('pelvis', bottom, _pel);
    local(_pel, 0, 0.06, 0, lean, -twist * 1.6, -sway * 2, _tor, 'YXZ');
    const torsoKey = P.torsoF !== undefined ? 'torsoF' : 'torso';
    if (P[torsoKey] !== undefined) this._put(torsoKey, P[torsoKey], _tor);
    for (const k of ['tunic', 'kediyu', 'pallu', 'dupatta', 'backpack', 'gamchha', 'belt']) if (P[k] !== undefined) this._put(k, P[k], k === 'belt' ? _pel : _tor);
    // skirt hangs from pelvis and sways with the stride
    if (P.skirt !== undefined) {
      const fl = O.skirtFlare || 1;
      local(_pel, 0, 0.02, 0, (hipL + hipR) * 0.15, 0, 0, _out, 'XYZ', fl, O.skirtShort ? 0.52 : 1, fl);
      this._put('skirt', P.skirt, _out);
    }
    // head
    local(_tor, 0, 0.47, 0.005, headPitch - lean * 0.6, headYaw + twist * 0.6, 0, _hd, 'YXZ');
    this._put('head', P.head, _hd);
    const headKeys = far ? ['hairShort', 'hairLong', 'hairBun', 'pagdi', 'headCover', 'topi', 'guardCap'] : ['hairShort', 'hairLong', 'hairBun', 'moustache', 'beard', 'pagdi', 'topi', 'guardCap', 'headCover', 'bindi'];
    for (const k of headKeys) if (P[k] !== undefined) this._put(k, P[k], _hd);

    // arms
    const upKey = P.upperArmLoose !== undefined ? 'upperArmLoose' : 'upperArm';
    const armColor = P[upKey] ?? P.head;
    const fore = P.forearm ?? P.head;
    const sh = (side, a, ab, el) => {
      const x = side * (O.female ? 0.155 : 0.168);
      local(_tor, x, 0.41, 0, -a, 0, side * (ab + shRzExtra * 0), _j[0], 'ZXY');
      this._put(upKey, armColor, _j[0]);
      local(_j[0], 0, -0.29, 0, -el, 0, 0, _j[1]);
      this._put('forearm', fore, _j[1]);
      local(_j[1], 0, -0.25, 0, 0, 0, 0, _j[2]);
      this._put('hand', P.hand, _j[2]);
      if (side < 0 && holdPhone) this._put('phone', 0xffffff, _j[2]);
      if (side < 0 && holdCup) this._put('cup', 0xffffff, _j[2]);
      if (side < 0 && P.bag !== undefined && !holdPhone && !holdCup) this._put('bag', P.bag, _j[2]);
    };
    sh(1, shL, abL, elL); sh(-1, shR, abR, elR);

    // legs
    const loose = P.thighLoose !== undefined;
    const thighKey = loose ? 'thighLoose' : 'thigh', shinKey = loose ? 'shinLoose' : 'shin';
    const hideThigh = P.skirt !== undefined && !O.skirtShort;
    const leg = (side, hip, knee) => {
      local(_pel, side * 0.088, -0.02, 0, -hip, 0, side * 0.02, _j[0]);
      if (!hideThigh && P[thighKey] !== undefined) this._put(thighKey, P[thighKey], _j[0]);
      local(_j[0], 0, -0.43, 0, knee, 0, 0, _j[1]);
      if (!hideThigh && P[shinKey] !== undefined) this._put(shinKey, P[shinKey], _j[1]);
      local(_j[1], 0, -0.42, 0, -knee * 0.5 + hip * 0.3, 0, 0, _j[2]);
      this._put('foot', P.foot, _j[2]);
    };
    leg(1, hipL, kneeL); leg(-1, hipR, kneeR);
  }

  begin() { this.counts = {}; }
  end() {
    for (const [k, m] of Object.entries(this.meshes)) {
      m.count = this.counts[k] || 0;
      if (m.count) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    }
  }
}
