// Static world data for the Rajkot-inspired map.
//
// Coordinates are metres. +x = east, +z = south (so north is -z).
// Real geography is COMPRESSED: Marwadi University really sits several km out on the
// Rajkot–Morbi Road at Gauridad. Here the ride from the campus gate to Madhapar Chowk takes
// under a minute so the city stays dense and fun. Layout is inspired, not surveyed.

import { Rng } from '../core/rng.js';

export const WORLD_BOUNDS = { minX: -700, maxX: 700, minZ: -820, maxZ: 640 };

export const ROAD_CLASSES = {
  highway:  { lanes: 2, laneW: 3.5, median: 2.4, shoulder: 1.8, sidewalk: 0,   speed: 16.5, divider: true, lights: 'median' },
  arterial: { lanes: 2, laneW: 3.3, median: 1.2, shoulder: 0.6, sidewalk: 3.0, speed: 12.5, divider: true, lights: 'median' },
  street:   { lanes: 1, laneW: 3.3, median: 0,   shoulder: 0.5, sidewalk: 2.2, speed: 9.0,  lights: 'side' },
  lane:     { lanes: 1, laneW: 2.4, median: 0,   shoulder: 0.2, sidewalk: 0.9, speed: 6.0,  lights: 'wall' },
  campus:   { lanes: 1, laneW: 3.1, median: 0,   shoulder: 0.3, sidewalk: 2.4, speed: 7.0,  lights: 'side' },
  ring:     { lanes: 2, laneW: 3.5, median: 0,   shoulder: 0.6, sidewalk: 0,   speed: 8.5,  oneway: true, lights: 'none' },
};

export function halfWidth(cls) {
  const c = ROAD_CLASSES[cls];
  if (c.oneway) return (c.lanes * c.laneW) / 2 + c.shoulder;
  return c.median / 2 + c.lanes * c.laneW + c.shoulder;
}

// Zone rectangles, first match wins.
export const ZONES = [
  { id: 'campus',  name: 'Marwadi University', x0: 20,   x1: 640, z0: -820, z1: -490 },
  { id: 'highway', name: 'Rajkot–Morbi Road',  x0: -700, x1: 20,  z0: -820, z1: -300 },
  { id: 'outer',   name: 'Gauridad',           x0: 20,   x1: 700, z0: -490, z1: -300 },
  { id: 'market',  name: 'Sardar Bazaar',      x0: -700, x1: -95, z0: -300, z1: 180 },
  { id: 'old',     name: 'Juni Pol',           x0: -700, x1: -95, z0: 180,  z1: 640 },
  { id: 'park',    name: 'Race Course Garden', x0: 120,  x1: 520, z0: 290,  z1: 640 },
  { id: 'resi',    name: 'Madhapar Society Area', x0: -95, x1: 700, z0: -300, z1: 640 },
];

export function zoneAt(x, z) {
  for (const zn of ZONES) if (x >= zn.x0 && x < zn.x1 && z >= zn.z0 && z < zn.z1) return zn;
  return ZONES[ZONES.length - 1];
}

export const RING = { x: -80, z: -260, r: 24 };

// ---------------------------------------------------------------------------
// Nodes and edges
// ---------------------------------------------------------------------------
export function buildMapData() {
  const rng = new Rng(4242);
  const nodes = {};
  const edges = [];
  const N = (id, x, z, type = 'plain') => { nodes[id] = { id, x, z, type }; return id; };
  const E = (a, b, cls, name = '', extra = {}) => edges.push({ a, b, cls, name, ...extra });

  // --- Rajkot–Morbi Road (highway section, north of Madhapar Chowk) --------
  N('hN', -80, -820, 'edge');
  N('hGate', -80, -600);
  N('hS', -80, -470);
  E('hN', 'hGate', 'highway', 'Rajkot–Morbi Road');
  E('hGate', 'hS', 'highway', 'Rajkot–Morbi Road');

  // --- Madhapar Chowk roundabout (clockwise: left-hand traffic) ------------
  const { x: cx, z: cz, r } = RING;
  N('rN', cx, cz - r, 'ring'); N('rE', cx + r, cz, 'ring'); N('rS', cx, cz + r, 'ring'); N('rW', cx - r, cz, 'ring');
  const arc = (a0, a1) => { // angles measured with x=sin, z=-cos (0 = north, clockwise positive)
    const pts = [];
    for (let i = 1; i < 8; i++) { const t = a0 + ((a1 - a0) * i) / 8; pts.push([cx + Math.sin(t) * r, cz - Math.cos(t) * r]); }
    return pts;
  };
  E('rN', 'rE', 'ring', 'Madhapar Chowk', { oneway: true, via: arc(0, Math.PI / 2) });
  E('rE', 'rS', 'ring', 'Madhapar Chowk', { oneway: true, via: arc(Math.PI / 2, Math.PI) });
  E('rS', 'rW', 'ring', 'Madhapar Chowk', { oneway: true, via: arc(Math.PI, Math.PI * 1.5) });
  E('rW', 'rN', 'ring', 'Madhapar Chowk', { oneway: true, via: arc(Math.PI * 1.5, Math.PI * 2) });
  E('hS', 'rN', 'highway', 'Rajkot–Morbi Road');

  // --- Campus -------------------------------------------------------------
  N('cGate', 20, -600, 'gate');
  N('cA', 90, -600); N('cB', 90, -730); N('cC', 380, -730); N('cF', 380, -600); N('cD', 380, -530);
  N('cSG', 300, -530); N('cE', 90, -530); N('cM', 240, -600); N('cK', 450, -600);
  E('hGate', 'cGate', 'street', 'University Approach');
  E('cGate', 'cA', 'campus', 'Campus Boulevard');
  E('cA', 'cB', 'campus', 'Hostel Road'); E('cB', 'cC', 'campus', 'Hostel Road');
  E('cC', 'cF', 'campus', 'Academic Road'); E('cF', 'cD', 'campus', 'Academic Road');
  E('cD', 'cSG', 'campus', 'South Walk'); E('cSG', 'cE', 'campus', 'South Walk'); E('cE', 'cA', 'campus', 'Campus Boulevard');
  E('cA', 'cM', 'campus', 'Central Avenue'); E('cM', 'cF', 'campus', 'Central Avenue'); E('cF', 'cK', 'campus', 'Sports Road');

  // --- Gauridad Road (south edge of campus) --------------------------------
  N('gSG', 300, -470); N('g3', 520, -470); N('gEnd', 700, -470, 'edge');
  E('hS', 'gSG', 'street', 'Gauridad Road');
  E('gSG', 'g3', 'street', 'Gauridad Road');
  E('g3', 'gEnd', 'street', 'Gauridad Road');
  E('cSG', 'gSG', 'street', 'University South Gate');

  // --- 150 Ft Ring Road -----------------------------------------------------
  N('rrW', -700, -260, 'edge'); N('rrW1', -640, -260); N('rrW2', -480, -260); N('rrW3', -300, -260, 'signal');
  N('rrE1', 120, -260); N('rrE2', 300, -260, 'signal'); N('rrE3', 520, -260); N('rrE4', 700, -260, 'edge');
  E('rrW', 'rrW1', 'arterial', '150 Ft Ring Road'); E('rrW1', 'rrW2', 'arterial', '150 Ft Ring Road');
  E('rrW2', 'rrW3', 'arterial', '150 Ft Ring Road'); E('rrW3', 'rW', 'arterial', '150 Ft Ring Road');
  E('rE', 'rrE1', 'arterial', '150 Ft Ring Road'); E('rrE1', 'rrE2', 'arterial', '150 Ft Ring Road');
  E('rrE2', 'rrE3', 'arterial', '150 Ft Ring Road'); E('rrE3', 'rrE4', 'arterial', '150 Ft Ring Road');
  E('g3', 'rrE3', 'street', 'Gauridad Link');

  // --- Morbi Road (city section) --------------------------------------------
  const mz = { m0: -160, m1: -60, mA: 40, m2: 140, mB: 280, m3: 400 };
  N('m0', -80, mz.m0); N('m1', -80, mz.m1, 'signal'); N('mA', -80, mz.mA); N('m2', -80, mz.m2, 'signal');
  N('mB', -80, mz.mB); N('m3', -80, mz.m3, 'signal'); N('m4', -80, 640, 'edge');
  E('rS', 'm0', 'arterial', 'Morbi Road'); E('m0', 'm1', 'arterial', 'Morbi Road'); E('m1', 'mA', 'arterial', 'Morbi Road');
  E('mA', 'm2', 'arterial', 'Morbi Road'); E('m2', 'mB', 'arterial', 'Morbi Road'); E('mB', 'm3', 'arterial', 'Morbi Road');
  E('m3', 'm4', 'arterial', 'Morbi Road');

  // --- 80 Ft Road -------------------------------------------------------------
  N('f0', -700, -60, 'edge'); N('f1', -640, -60); N('f2', -480, -60); N('f3', -300, -60);
  N('f4', 120, -60); N('f5', 300, -60, 'signal'); N('f6', 520, -60); N('f7', 700, -60, 'edge');
  E('f0', 'f1', 'arterial', '80 Ft Road'); E('f1', 'f2', 'arterial', '80 Ft Road'); E('f2', 'f3', 'arterial', '80 Ft Road');
  E('f3', 'm1', 'arterial', '80 Ft Road'); E('m1', 'f4', 'arterial', '80 Ft Road'); E('f4', 'f5', 'arterial', '80 Ft Road');
  E('f5', 'f6', 'arterial', '80 Ft Road'); E('f6', 'f7', 'arterial', '80 Ft Road');

  // --- Sardar Bazaar market grid (west) --------------------------------------
  const mx = [-640, -480, -300];
  const rows = [-160, -60, 40, 140];
  const topIds = ['rrW1', 'rrW2', 'rrW3'];
  const rowIds = { '-60': ['f1', 'f2', 'f3'] };
  const gid = (x, z) => `mk_${x}_${z}`;
  for (let i = 0; i < mx.length; i++) {
    let prev = topIds[i];
    for (const z of rows) {
      const id = rowIds[z] ? rowIds[z][i] : N(gid(mx[i], z), mx[i], z);
      E(prev, id, 'street', i === 2 ? 'Bazaar Road' : i === 1 ? 'Kanak Road' : 'Soni Bazaar');
      prev = id;
    }
  }
  const rowName = { '-160': 'Sardar Bazaar', 40: 'Dharmendra Marg', 140: 'Station Road' };
  const rowEnd = { '-160': 'm0', 40: 'mA', 140: 'm2' };
  for (const z of [-160, 40, 140]) {
    E(gid(-640, z), gid(-480, z), 'street', rowName[z]);
    E(gid(-480, z), gid(-300, z), 'street', rowName[z]);
    E(gid(-300, z), rowEnd[z], 'street', rowName[z]);
  }

  // --- Juni Pol old-city lanes (south-west): slightly irregular grid ---------
  const lx = [-600, -470, -340, -210];
  const lz = [280, 400, 520];
  const lid = (i, j) => `ol_${i}_${j}`;
  const jit = () => rng.float(-9, 9);
  for (let i = 0; i < lx.length; i++) for (let j = 0; j < lz.length; j++) N(lid(i, j), lx[i] + jit(), lz[j] + jit());
  for (let i = 0; i < lx.length; i++) {
    // connect to Station Road row (z=140). Nearest market node
    const top = [gid(-640, 140), gid(-480, 140), gid(-300, 140), gid(-300, 140)][i];
    if (i < 3) E(top, lid(i, 0), 'lane', 'Juni Pol'); else E(lid(i, 0), lid(i - 1, 0), 'lane', 'Juni Pol');
    for (let j = 0; j < lz.length - 1; j++) {
      const a = nodes[lid(i, j)], b = nodes[lid(i, j + 1)];
      E(lid(i, j), lid(i, j + 1), 'lane', 'Juni Pol', { via: [[(a.x + b.x) / 2 + rng.float(-6, 6), (a.z + b.z) / 2]] });
    }
    N(`ol_end_${i}`, lx[i] + jit(), 640, 'edge');
    E(lid(i, lz.length - 1), `ol_end_${i}`, 'lane', 'Juni Pol');
  }
  for (let j = 0; j < lz.length; j++) {
    for (let i = 0; i < lx.length - 1; i++) {
      if (j === 0 && i === 2) continue; // already linked above
      const a = nodes[lid(i, j)], b = nodes[lid(i + 1, j)];
      E(lid(i, j), lid(i + 1, j), 'lane', ['Kansara Sheri', 'Panchnath Sheri', 'Mochi Bazaar'][j],
        { via: [[(a.x + b.x) / 2, (a.z + b.z) / 2 + rng.float(-6, 6)]] });
    }
  }
  E(lid(3, 0), 'mB', 'lane', 'Kansara Sheri');
  E(lid(3, 1), 'm3', 'lane', 'Panchnath Sheri');

  // --- Residential society grid (east of Morbi Road) -------------------------
  const rx = [120, 300, 520];
  const rz = [-160, -60, 40, 140, 280];
  const topE = ['rrE1', 'rrE2', 'rrE3'];
  const r80 = ['f4', 'f5', 'f6'];
  const rid = (x, z) => `rs_${x}_${z}`;
  const colNames = ['Nilkanth Park Road', 'Shivam Society Road', 'Gokuldham Road'];
  for (let i = 0; i < rx.length; i++) {
    let prev = topE[i];
    for (const z of rz) {
      const id = z === -60 ? r80[i] : N(rid(rx[i], z), rx[i], z);
      E(prev, id, 'street', colNames[i]);
      prev = id;
    }
    N(`rs_end_${i}`, rx[i], 640, 'edge');
    if (i === 0) { N('pk0', 120, 400); E(prev, 'pk0', 'street', colNames[i]); E('pk0', `rs_end_${i}`, 'street', colNames[i]); }
    else if (i === 2) E(prev, `rs_end_${i}`, 'street', colNames[i]);
  }
  const rrowName = { '-160': 'Sadhuvasvani Road', 40: 'Ambika Township Road', 140: 'Aji Dam Road', 280: 'Race Course Ring' };
  const rrowStart = { '-160': 'm0', 40: 'mA', 140: 'm2', 280: 'mB' };
  for (const z of [-160, 40, 140, 280]) {
    E(rrowStart[z], rid(120, z), 'street', rrowName[z]);
    E(rid(120, z), rid(300, z), 'street', rrowName[z]);
    E(rid(300, z), rid(520, z), 'street', rrowName[z]);
    N(`rr_end_${z}`, 700, z, 'edge');
    E(rid(520, z), `rr_end_${z}`, 'street', rrowName[z]);
  }
  // Garden Road links Morbi Road to the park
  E('m3', 'pk0', 'street', 'Garden Road');

  return { nodes, edges };
}

// Named landmarks used for map labels, missions and the tutorial.
export const LANDMARKS = [
  { id: 'mu_gate', name: 'Marwadi University Main Gate', short: 'MU Main Gate', x: 30, z: -612, zone: 'campus', icon: 'gate' },
  { id: 'mu_main', name: 'MU Main Academic Building', short: 'MU Main Block', x: 160, z: -640, zone: 'campus', icon: 'uni' },
  { id: 'mu_boys', name: 'MU Boys Hostel', short: 'Boys Hostel', x: 170, z: -752, zone: 'campus', icon: 'hostel' },
  { id: 'mu_girls', name: 'MU Girls Hostel', short: 'Girls Hostel', x: 330, z: -752, zone: 'campus', icon: 'hostel' },
  { id: 'mu_canteen', name: 'MU Canteen', short: 'Canteen', x: 205, z: -545, zone: 'campus', icon: 'food' },
  { id: 'mu_cricket', name: 'MU Cricket Ground', short: 'Cricket Ground', x: 510, z: -660, zone: 'campus', icon: 'sport' },
  { id: 'mu_lake', name: 'Campus Lake', short: 'Lake', x: 530, z: -772, zone: 'campus', icon: 'lake' },
  { id: 'madhapar', name: 'Madhapar Chowk', short: 'Madhapar Chowk', x: -80, z: -260, zone: 'highway', icon: 'chowk' },
  { id: 'pump_n', name: 'Saurashtra Fuels, Morbi Road', short: 'Fuel (Morbi Rd)', x: -122, z: -410, zone: 'highway', icon: 'fuel' },
  { id: 'pump_s', name: 'Saurashtra Fuels, 80 Ft Road', short: 'Fuel (80 Ft Rd)', x: 210, z: -26, zone: 'resi', icon: 'fuel' },
  { id: 'bazaar', name: 'Sardar Bazaar', short: 'Sardar Bazaar', x: -390, z: -160, zone: 'market', icon: 'market' },
  { id: 'junipol', name: 'Juni Pol Mandir Chowk', short: 'Mandir Chowk', x: -340, z: 400, zone: 'old', icon: 'temple' },
  { id: 'garden', name: 'Race Course Garden', short: 'Race Course Garden', x: 320, z: 450, zone: 'park', icon: 'park' },
  { id: 'khau', name: 'Garden Khau Gali (night food street)', short: 'Khau Gali', x: 320, z: 296, zone: 'park', icon: 'food' },
];

export const FUEL_STATIONS = [
  { id: 'pump_n', x: -122, z: -410, w: 34, d: 44, rot: 0, side: -1 },
  { id: 'pump_s', x: 210, z: -26, w: 44, d: 30, rot: Math.PI / 2, side: 1 },
];
