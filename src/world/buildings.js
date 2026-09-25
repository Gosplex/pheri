import * as THREE from 'three';
import { Rng } from '../core/rng.js';
import { zoneAt } from './mapData.js';
import { CELL } from './spatial.js';
import { SHOPS, SOCIETIES, HOUSE_NAMES, HOARDINGS } from './catalog.js';

// Palettes grounded in Rajkot streets: lime-washed whites, creams, pale ochres, powder blues,
// and the occasional bold pink or turquoise house.
const PAL = {
  market: [0xefe3c8, 0xf3d9a4, 0xe8c9a0, 0xf2efe6, 0xd9e4e8, 0xf0d4c8, 0xe6d3a3, 0xcfe0d0],
  resi:   [0xf4efe4, 0xefe2cc, 0xf1d7b8, 0xe4e4df, 0xf5e6c8, 0xdcd3c6, 0xf2e9dc, 0xe9d9c9],
  old:    [0xe8c07a, 0xb7cde0, 0xefe8da, 0xd9a86c, 0xa9c7b0, 0xe7b8a0, 0xd8cdb8, 0x9fb8d6, 0xe2a4b0],
  outer:  [0xdcd0bb, 0xcfc3ad, 0xe8e0cf, 0xbfb6a6],
  highway:[0xdcd0bb, 0xcfc3ad, 0xe8e0cf, 0xbfb6a6, 0xe0cfa8],
  park:   [0xefe3c8, 0xe8d8bf],
};
const TRIM = [0x8d6e63, 0x6d4c41, 0x546e7a, 0x795548, 0x5d4037, 0x9e9e9e];
const LIT = [0xffd08a, 0xffe2b0, 0xfff2da, 0xcfe8ff, 0xffc978];

export function buildCity(ctx) {
  const { net, grid, collision, atlas, B, pois } = ctx;
  const rng = new Rng(9001);
  let shopIdx = 0;

  const addPoi = (p) => { pois.push(p); return p; };

  // local->world transform helper for a lot
  const frame = (x, z, rot) => {
    const c = Math.cos(rot), s = Math.sin(rot);
    return {
      w: (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c],
      n: (nx, nz) => [nx * c + nz * s, -nx * s + nz * c],
    };
  };

  function windowsOnFace(F, rot, face, W, D, floors, fh, y0, litRatio, style, skipGround) {
    // face: 0 front(+z) 1 back(-z) 2 right(+x) 3 left(-x)
    const len = face < 2 ? W : D;
    const cols = Math.max(1, Math.floor(len / 3.2));
    const nrm = face === 0 ? [0, 1] : face === 1 ? [0, -1] : face === 2 ? [1, 0] : [-1, 0];
    const [nx, nz] = F.n(nrm[0], nrm[1]);
    const off = (face < 2 ? D : W) / 2 + 0.03;
    for (let f = skipGround ? 1 : 0; f < floors; f++) {
      const y = y0 + f * fh + fh * 0.55;
      for (let k = 0; k < cols; k++) {
        const t = -len / 2 + (k + 0.5) * (len / cols);
        let lx, lz;
        if (face === 0) { lx = t; lz = off; } else if (face === 1) { lx = -t; lz = -off; } else if (face === 2) { lx = off; lz = -t; } else { lx = -off; lz = t; }
        const [wx, wz] = F.w(lx, lz);
        const ww = style === 'old' ? 1.0 : 1.4, wh = style === 'old' ? 1.5 : 1.3;
        // frame (slightly larger, darker) sits in the body builder
        B.body.at(wx, wz).facingQuad(wx - nx * 0.01, y, wz - nz * 0.01, nx, nz, ww + 0.28, wh + 0.28, style === 'old' ? 0x6b4a2b : 0x5d5d5d);
        // concrete chajja (sunshade) over every window: the Indian facade signature
        if (face === 0) B.body.at(wx, wz).box(wx + nx * 0.28, y + wh / 2 + 0.22, wz + nz * 0.28, (face < 2 ? ww : ww) + 0.5, 0.08, 0.55, rot + (face >= 2 ? Math.PI / 2 : 0), style === 'old' ? 0x8d6e63 : 0xd8d2c4);
        if (style !== 'old' && f <= 1 && rng.chance(0.6)) for (let gb = -1; gb <= 1; gb++) B.body.at(wx, wz).facingQuad(wx + nx * 0.05 + nz * gb * ww * 0.3, y, wz + nz * 0.05 - nx * gb * ww * 0.3, nx, nz, 0.035, wh, 0x2a2a2a);
        const lit = rng.chance(litRatio);
        (lit ? B.winLit : B.winDark).at(wx, wz).facingQuad(wx + nx * 0.01, y, wz + nz * 0.01, nx, nz, ww, wh, lit ? rng.pick(LIT) : 0x2b3440);
        // occasional window AC or grill box
        if (style !== 'old' && rng.chance(0.12)) {
          B.body.at(wx, wz).box(wx + nx * 0.35, y - wh * 0.7, wz + nz * 0.35, 0.8, 0.5, 0.5, rot + (face >= 2 ? Math.PI / 2 : 0), 0xe7e7e2);
        }
      }
    }
  }

  function roof(F, rot, W, D, H, color, zone) {
    const [cx, cz] = F.w(0, 0);
    const b = B.body.at(cx, cz);
    // parapet
    const pH = 0.9, t = 0.2;
    const edges = [[0, D / 2 - t / 2, W, t], [0, -D / 2 + t / 2, W, t], [W / 2 - t / 2, 0, t, D], [-W / 2 + t / 2, 0, t, D]];
    for (const [lx, lz, sx, sz] of edges) { const [x, z] = F.w(lx, lz); b.box(x, H + pH / 2, z, sx, pH, sz, rot, color); }
    // stair room ("mumty")
    if (W > 6 && D > 6 && rng.chance(0.7)) {
      const [x, z] = F.w(rng.float(-W / 4, W / 4), rng.float(-D / 4, D / 4));
      b.box(x, H + 1.3, z, 2.6, 2.6, 3, rot, color);
    }
    // black plastic water tanks, the signature of every Indian roofline
    const nt = rng.int(1, W * D > 150 ? 3 : 2);
    for (let i = 0; i < nt; i++) {
      const [x, z] = F.w(rng.float(-W / 2 + 1.2, W / 2 - 1.2), rng.float(-D / 2 + 1.2, D / 2 - 1.2));
      const tr = rng.float(0.55, 0.8);
      b.box(x, H + 0.2, z, 1.4, 0.4, 1.4, 0, 0x8a8a8a); // stand
      b.cylinder(x, H + 0.4 + tr * 1.1, z, tr, tr * 2.2, rng.chance(0.8) ? 0x1d1d1f : 0xd9c9a0, 7);
    }
    if (rng.chance(0.35)) { // dish antenna
      const [x, z] = F.w(rng.float(-W / 3, W / 3), rng.float(-D / 3, D / 3));
      b.cylinder(x, H + 1.1, z, 0.03, 1.2, 0x777777, 4);
      b.cylinder(x, H + 1.7, z, 0.35, 0.08, 0xdddddd, 6, 0.9, rot);
    }
    if (zone === 'old' && rng.chance(0.3)) { // clothes line
      const [x1, z1] = F.w(-W / 3, 0), [x2, z2] = F.w(W / 3, 0);
      b.cylinder(x1, H + 1, z1, 0.04, 2, 0x555555, 4); b.cylinder(x2, H + 1, z2, 0.04, 2, 0x555555, 4);
      for (let i = 0; i < 4; i++) { const [x, z] = F.w(-W / 3 + (i + 0.5) * (W / 6) * 1.3, 0); b.box(x, H + 1.5, z, 0.6, 0.8, 0.03, rot, rng.pick([0xc0392b, 0x2980b9, 0xf1c40f, 0x27ae60, 0xffffff])); }
    }
  }

  function balconies(F, rot, W, D, floors, fh, y0, color, zone) {
    const cols = Math.max(1, Math.floor(W / 4.5));
    for (let f = 1; f < floors; f++) {
      for (let k = 0; k < cols; k++) {
        if (!rng.chance(zone === 'resi' ? 0.8 : 0.5)) continue;
        const lx = -W / 2 + (k + 0.5) * (W / cols);
        const bw = Math.min(3.2, W / cols - 0.6);
        const [x, z] = F.w(lx, D / 2 + 0.55);
        const y = y0 + f * fh;
        const b = B.body.at(x, z);
        b.box(x, y + 0.08, z, bw, 0.16, 1.1, rot, color);
        const rail = zone === 'old' ? 0x5d4037 : rng.pick([0x37474f, 0x5d5d5d, 0x8d6e63, color]);
        const [rx, rz] = F.w(lx, D / 2 + 1.05);
        b.box(rx, y + 0.6, rz, bw, 0.9, 0.08, rot, rail);
        if (rng.chance(0.3)) { // potted tulsi / plants
          const [px, pz] = F.w(lx + rng.float(-bw / 3, bw / 3), D / 2 + 0.7);
          b.box(px, y + 0.35, pz, 0.3, 0.35, 0.3, rot, 0xb5651d);
          b.box(px, y + 0.7, pz, 0.45, 0.4, 0.45, rot + 0.6, 0x4e8a3a);
        }
      }
    }
  }

  function shopFront(F, rot, W, D, fh, zone, facing) {
    // ground floor shops: 1 or 2 per building
    const n = W > 9 ? 2 : 1;
    const out = [];
    for (let i = 0; i < n; i++) {
      const sw = W / n;
      const lx = -W / 2 + (i + 0.5) * sw;
      const shop = SHOPS[(shopIdx++ * 7 + rng.int(0, 3)) % SHOPS.length];
      const [ox, oz] = F.w(lx, D / 2 - 0.25);
      const [nx, nz] = F.n(0, 1);
      // dark opening + lit interior (day-only shops close at night)
      const nightOpen = ['restaurant', 'farsan', 'icecream', 'pharmacy', 'tea', 'sweets'].includes(shop.type) || rng.chance(0.35);
      B.body.at(ox, oz).facingQuad(ox + nx * 0.02, fh * 0.42, oz + nz * 0.02, nx, nz, sw - 0.9, fh * 0.78, 0x2a2622);
      (nightOpen ? B.shopLit : B.shopDay).at(ox, oz).facingQuad(ox + nx * 0.05, fh * 0.4, oz + nz * 0.05, nx, nz, sw - 1.3, fh * 0.66, rng.pick([0xfff1d0, 0xffe6b8, 0xeaf6ff]));
      // counter + goods
      const [cx, cz] = F.w(lx, D / 2 + 0.25);
      B.body.at(cx, cz).box(cx, 0.45, cz, sw - 1.4, 0.9, 0.5, rot, rng.pick([0x8d6e63, 0x607d8b, 0xa1887f]));
      for (let g = 0; g < 4; g++) {
        const [gx, gz] = F.w(lx + rng.float(-sw / 2 + 0.9, sw / 2 - 0.9), D / 2 + 0.25);
        B.body.at(gx, gz).box(gx, 1.0, gz, rng.float(0.2, 0.5), rng.float(0.2, 0.4), 0.3, rot, rng.pick([0xe74c3c, 0xf1c40f, 0x3498db, 0x2ecc71, 0xecf0f1, 0xe67e22]));
      }
      // rolled-up shutter
      const [sx, sz] = F.w(lx, D / 2 + 0.08);
      B.body.at(sx, sz).box(sx, fh * 0.86, sz, sw - 0.7, 0.35, 0.3, rot, 0x9ea3a6);
      // awning
      if (rng.chance(0.65)) {
        const [ax, az] = F.w(lx, D / 2 + 0.9);
        B.body.at(ax, az).box(ax, fh * 0.95, az, sw - 0.3, 0.08, 1.8, rot, rng.pick([0x1e88e5, 0x43a047, 0xe53935, 0xfdd835, 0x8e24aa, 0xfb8c00]), -0.25);
      }
      // sign board
      const key = 'shop' + SHOPS.indexOf(shop);
      const slot = atlas.shopBoard(key, shop);
      if (slot) {
        const [bx, bz] = F.w(lx, D / 2 + 0.12);
        const bw = Math.min(sw - 0.4, 5.5);
        B.signs.at(bx, bz).facingQuad(bx + nx * 0.05, fh * 1.15, bz + nz * 0.05, nx, nz, bw, bw / 6, 0xffffff, slot.uv);
      }
      const [px, pz] = F.w(lx, D / 2 + 3.0);
      out.push({ shop, x: px, z: pz, nightOpen });
    }
    return out;
  }

  // One generic Indian RCC building
  function building(x, z, rot, W, D, zone, frontEdge, opts = {}) {
    const F = frame(x, z, rot);
    const pal = PAL[zone] || PAL.resi;
    const color = new THREE.Color(rng.pick(pal)).offsetHSL(0, rng.float(-0.02, 0.02), rng.float(-0.04, 0.03)).getHex();
    const fh = 3.1;
    let floors;
    if (zone === 'market') floors = rng.int(2, 4);
    else if (zone === 'old') floors = rng.int(2, 3);
    else if (zone === 'resi') floors = opts.apartment ? rng.int(4, 7) : rng.int(1, 3);
    else floors = rng.int(1, 2);
    if (opts.floors) floors = opts.floors;
    const H = floors * fh + 0.3;
    const b = B.body.at(x, z);
    b.box(x, H / 2, z, W, H, D, rot, color);
    // plinth band and floor bands
    const trim = rng.pick(TRIM);
    const [fx, fz] = F.w(0, D / 2 + 0.02);
    b.box(fx, 0.25, fz, W, 0.5, 0.06, rot, 0x7b7266);
    for (let f = 1; f < floors; f++) { b.box(fx, f * fh, fz, W + 0.1, 0.18, 0.2, rot, zone === 'old' ? trim : color); }
    const hasShop = opts.shop;
    let shops = [];
    if (hasShop) shops = shopFront(F, rot, W, D, fh, zone);
    const lit = zone === 'resi' ? 0.55 : 0.45;
    windowsOnFace(F, rot, 0, W, D, floors, fh, 0, lit, zone === 'old' ? 'old' : 'std', hasShop);
    if (floors >= 3 || opts.apartment) {
      windowsOnFace(F, rot, 1, W, D, floors, fh, 0, lit * 0.8, 'std', false);
      windowsOnFace(F, rot, 2, W, D, floors, fh, 0, lit * 0.6, 'std', false);
      windowsOnFace(F, rot, 3, W, D, floors, fh, 0, lit * 0.6, 'std', false);
    }
    if (zone !== 'outer' && zone !== 'highway') balconies(F, rot, W, D, floors, fh, 0, color, zone);
    if (zone === 'old' && floors >= 2 && rng.chance(0.6)) { // projecting jharokha-style window box
      const [jx, jz] = F.w(rng.float(-W / 4, W / 4), D / 2 + 0.45);
      b.box(jx, fh * 1.55, jz, 1.8, 1.6, 0.9, rot, 0x8d5a3b);
      b.box(jx, fh * 1.55 + 0.9, jz, 2.1, 0.15, 1.1, rot, 0x6d4c41);
    }
    if (!hasShop && zone !== 'outer') { // front door with little steps
      const [dx, dz] = F.w(rng.float(-W / 4, W / 4), D / 2 + 0.03);
      const [nx, nz] = F.n(0, 1);
      b.facingQuad(dx, 1.1, dz, nx, nz, 1.1, 2.2, rng.pick([0x6d4c41, 0x8d6e63, 0x455a64, 0x7b1fa2]));
      const [sx, sz] = F.w(0, D / 2 + 0.35);
      b.box(sx, 0.12, sz, Math.min(2, W - 1), 0.24, 0.6, rot, 0x9e9486);
      // painted "Shubh Labh" swastika-free rangoli mark: a small colourful tile by the door
      if (rng.chance(0.3)) { const [rx, rz] = F.w(0, D / 2 + 0.9); b.box(rx, 0.05, rz, 0.9, 0.02, 0.9, rot, rng.pick([0xe91e63, 0xff9800, 0x9c27b0])); }
    }
    roof(F, rot, W, D, H, color, zone);
    collision.addBox(x, z, W / 2, D / 2, rot, H, 'building');
    return { H, shops, color };
  }

  // Society: compound wall + gate + name board, with an apartment block or bungalow behind
  function society(x, z, rot, W, D, frontEdge) {
    const F = frame(x, z, rot);
    const soc = SOCIETIES[rng.int(0, SOCIETIES.length - 1)];
    const wallH = 1.6;
    const wc = rng.pick([0xe8dcc8, 0xdad0bf, 0xf0e6d6]);
    const gateW = 4;
    const b = B.body.at(x, z);
    // front wall with gate gap
    const segW = (W - gateW) / 2;
    for (const sgn of [-1, 1]) {
      const [wx, wz] = F.w(sgn * (gateW / 2 + segW / 2), D / 2);
      b.box(wx, wallH / 2, wz, segW, wallH, 0.25, rot, wc);
      collision.addBox(wx, wz, segW / 2, 0.15, rot, wallH, 'wall');
      // gate pillars
      const [px, pz] = F.w(sgn * gateW / 2, D / 2);
      b.box(px, 1.3, pz, 0.6, 2.6, 0.6, rot, 0xb89b72);
    }
    // side + back walls
    for (const [lx, lz, sx, sz] of [[W / 2, 0, 0.25, D], [-W / 2, 0, 0.25, D], [0, -D / 2, W, 0.25]]) {
      const [wx, wz] = F.w(lx, lz); b.box(wx, wallH / 2, wz, sx, wallH, sz, rot, wc);
      collision.addBox(wx, wz, sx / 2 + 0.05, sz / 2 + 0.05, rot, wallH, 'wall');
    }
    // arch board with society name
    const slot = atlas.shopBoard('soc' + SOCIETIES.indexOf(soc), { en: soc.en, local: soc.local, bg: '#fdf6e3', fg: '#6d1b1b', accent: '#b7950b', style: 2 });
    const [ax, az] = F.w(0, D / 2);
    b.box(ax, 3.0, az, gateW + 0.6, 0.25, 0.4, rot, 0xb89b72);
    const [nx, nz] = F.n(0, 1);
    if (slot) B.signs.at(ax, az).facingQuad(ax + nx * 0.22, 3.55, az + nz * 0.22, nx, nz, gateW + 0.4, (gateW + 0.4) / 6, 0xffffff, slot.uv);
    // security booth
    const [bx, bz] = F.w(gateW / 2 + 1.4, D / 2 - 1.4);
    b.box(bx, 1.2, bz, 1.6, 2.4, 1.6, rot, 0xd7ccc8);
    b.box(bx, 2.5, bz, 2.0, 0.15, 2.0, rot, 0x8d6e63);
    // inner block
    const innerD = D - 7, innerW = W - 4;
    const apartment = innerD > 12 && innerW > 12 && rng.chance(0.65);
    const [ix, iz] = F.w(0, -D / 2 + innerD / 2 + 1.2);
    const bld = building(ix, iz, rot, innerW, innerD, 'resi', frontEdge, { apartment });
    // parked two-wheelers in the compound
    ctx.parkedSpots.push(...[0, 1, 2].map(() => { const [px, pz] = F.w(rng.float(-W / 2 + 2, W / 2 - 2), D / 2 - 2.2); return { x: px, z: pz, rot: rot + Math.PI / 2 + rng.float(-0.2, 0.2) }; }));
    const [gx, gz] = F.w(0, D / 2 + 2.2);
    return addPoi({ name: soc.en, local: soc.local, kind: 'home', x: gx, z: gz, zone: 'resi', edge: frontEdge, height: bld.H });
  }

  // Tin-roof garage / warehouse / dhaba for highway & outer areas
  function shed(x, z, rot, W, D, zone, frontEdge) {
    const F = frame(x, z, rot);
    const b = B.body.at(x, z);
    const H = rng.float(4, 6.5);
    const wallC = rng.pick([0xcfc3ad, 0xb0a48e, 0xe0d6c2]);
    b.box(x, H / 2, z, W, H, D, rot, wallC);
    const roofC = rng.pick([0x8fa3ad, 0x9e7d5a, 0x7f8c8d, 0x3d6f8c]);
    b.box(x, H + 0.2, z, W + 0.8, 0.12, D + 0.8, rot, roofC, 0.08);
    const [ox, oz] = F.w(0, D / 2 + 0.02);
    const [nx, nz] = F.n(0, 1);
    b.facingQuad(ox, H * 0.38, oz, nx, nz, W * 0.6, H * 0.7, 0x2a2622);
    B.shopLit.at(ox, oz).facingQuad(ox + nx * 0.04, H * 0.36, oz + nz * 0.04, nx, nz, W * 0.5, H * 0.6, 0xffe0b0);
    const shop = SHOPS.filter((s) => ['garage', 'restaurant', 'hardware', 'tea'].includes(s.type))[rng.int(0, 7) % 8];
    const slot = atlas.shopBoard('shop' + SHOPS.indexOf(shop), shop);
    if (slot) B.signs.at(ox, oz).facingQuad(ox + nx * 0.06, H * 0.88, oz + nz * 0.06, nx, nz, Math.min(W - 1, 6), Math.min(W - 1, 6) / 6, 0xffffff, slot.uv);
    // dhaba charpai cots & plastic chairs out front
    if (shop.type === 'restaurant' || shop.type === 'tea') {
      for (let i = 0; i < 3; i++) {
        const [cx, cz] = F.w(rng.float(-W / 2, W / 2), D / 2 + rng.float(2, 4));
        b.box(cx, 0.45, cz, 1.9, 0.12, 0.9, rot + rng.float(-0.3, 0.3), 0xc8a26b);
        for (const [a, c] of [[-0.85, -0.35], [0.85, -0.35], [-0.85, 0.35], [0.85, 0.35]]) b.box(cx + a * 0.9, 0.22, cz + c, 0.08, 0.44, 0.08, rot, 0x6d4c41);
      }
    }
    collision.addBox(x, z, W / 2, D / 2, rot, H, 'building');
    const [px, pz] = F.w(0, D / 2 + 3);
    return addPoi({ name: shop.en, local: shop.local, kind: shop.type, x: px, z: pz, zone, edge: frontEdge, shop: true, nightOpen: true });
  }

  function hoarding(x, z, rot, idx) {
    const F = frame(x, z, rot);
    const h = HOARDINGS[idx % HOARDINGS.length];
    const slot = atlas.hoarding('hoard' + (idx % HOARDINGS.length), h);
    const b = B.body.at(x, z);
    for (const sgn of [-1, 1]) { const [px, pz] = F.w(sgn * 3.2, 0); b.box(px, 3.5, pz, 0.3, 7, 0.3, rot, 0x5f6a6a); }
    b.box(x, 8.5, z, 8.6, 4.4, 0.3, rot, 0x3d4545);
    const [nx, nz] = F.n(0, 1);
    if (slot) B.signs.at(x, z).facingQuad(x + nx * 0.17, 8.5, z + nz * 0.17, nx, nz, 8.2, 4.1, 0xffffff, slot.uv);
    collision.addCircle(F.w(-3.2, 0)[0], F.w(-3.2, 0)[1], 0.3, 7, 'pole');
    collision.addCircle(F.w(3.2, 0)[0], F.w(3.2, 0)[1], 0.3, 7, 'pole');
  }

  // ---- walk every road and fill both sides with lots ---------------------------------
  let hoardIdx = 0;
  for (const e of net.edges) {
    if (e.cls === 'ring' || e.cls === 'campus') continue;
    const sp = e.spec;
    for (const side of [1, -1]) {
      let s = e.trimA + 4;
      const end = e.len - e.trimB - 4;
      while (s < end) {
        const mid = net.lanePoint(e, 0, s, 0, {});
        const zn = zoneAt(mid.x, mid.z).id;
        if (zn === 'campus' || zn === 'park') { s += 10; continue; }
        let W, D, setback, gap, type;
        if (zn === 'market') { W = rng.float(7, 12); D = rng.float(10, 16); setback = 0.2; gap = rng.chance(0.2) ? rng.float(1, 3) : 0.1; type = 'shop'; }
        else if (zn === 'old') { W = rng.float(5, 8); D = rng.float(8, 12); setback = 0.1; gap = 0.05; type = rng.chance(0.4) ? 'shop' : 'house'; }
        else if (zn === 'resi') {
          if (e.cls === 'arterial' || rng.chance(0.25)) { W = rng.float(9, 14); D = rng.float(12, 18); setback = 0.5; gap = rng.float(0.5, 2); type = e.cls === 'arterial' ? 'commercial' : 'shop'; }
          else { W = rng.float(18, 30); D = rng.float(22, 32); setback = 0.5; gap = rng.float(1, 4); type = 'society'; }
        } else { // highway / outer
          if (rng.chance(0.45)) { s += rng.float(12, 30); if (rng.chance(0.35)) type = 'hoarding'; else continue; W = 9; D = 2; setback = 3; gap = 20; }
          else { W = rng.float(10, 18); D = rng.float(10, 16); setback = rng.float(4, 9); gap = rng.float(4, 14); type = 'shed'; }
        }
        const baseLat = e.hw + sp.sidewalk + (sp.sidewalk > 0 ? 0.6 : 3.0) + setback;
        const lat = side * (baseLat + D / 2);
        const c = net.lanePoint(e, 0, s + W / 2, lat, {});
        const toRoadX = -side * c.tz, toRoadZ = side * c.tx; // unit vector from lot to road (-left*side)
        const rot = Math.atan2(toRoadX, toRoadZ);
        if (grid.rectFree(c.x, c.z, W / 2 + 0.3, D / 2 + 0.3, rot)) {
          grid.fillRect(c.x, c.z, W / 2, D / 2, rot, CELL.BUILDING);
          if (type === 'hoarding') { hoarding(c.x, c.z, rot, hoardIdx++); }
          else if (type === 'society') society(c.x, c.z, rot, W, D, e);
          else if (type === 'shed') shed(c.x, c.z, rot, W, D, zn, e);
          else {
            const isShop = type === 'shop' || type === 'commercial';
            const r = building(c.x, c.z, rot, W, D, zn, e, { shop: isShop, floors: type === 'commercial' ? rng.int(3, 6) : undefined });
            for (const sh of r.shops) addPoi({ name: sh.shop.en, local: sh.shop.local, kind: sh.shop.type, x: sh.x, z: sh.z, zone: zn, edge: e, shop: true, nightOpen: sh.nightOpen });
            if (!isShop) {
              const [nm] = [rng.pick(HOUSE_NAMES)];
              addPoi({ name: `"${nm}" house`, kind: 'home', x: c.x + toRoadX * (D / 2 + 2), z: c.z + toRoadZ * (D / 2 + 2), zone: zn, edge: e });
            }
            if (zn === 'resi' || zn === 'market') ctx.parkedSpots.push({ x: c.x + toRoadX * (D / 2 + 1.2) + c.tx * rng.float(-2, 2), z: c.z + toRoadZ * (D / 2 + 1.2) + c.tz * rng.float(-2, 2), rot: rot + Math.PI / 2 });
          }
          s += W + gap;
        } else s += 3;
      }
    }
  }
}
