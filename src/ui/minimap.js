import { CELL } from '../world/spatial.js';

const COL = {
  [CELL.EMPTY]: [214, 199, 168], [CELL.ROAD]: [255, 252, 244], [CELL.JUNCTION]: [255, 252, 244], [CELL.WALK]: [231, 222, 204],
  [CELL.BUILDING]: [176, 160, 136], [CELL.RESERVED]: [205, 196, 170], [CELL.WATER]: [124, 170, 190], [CELL.GRASS]: [165, 190, 118], [CELL.PAVED]: [222, 212, 194],
};

// Pre-render the whole city (1 px per metre) once from the occupancy grid.
export function buildMapCanvas(world) {
  const g = world.grid;
  const c = document.createElement('canvas'); c.width = g.w; c.height = g.h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(g.w, g.h);
  for (let i = 0; i < g.data.length; i++) {
    const col = COL[g.data[i]] || COL[0];
    img.data[i * 4] = col[0]; img.data[i * 4 + 1] = col[1]; img.data[i * 4 + 2] = col[2]; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // road casing lines for highways/arterials to make hierarchy readable
  const b = g.b;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const e of world.net.edges) {
    if (e.cls !== 'highway' && e.cls !== 'arterial' && e.cls !== 'ring') continue;
    ctx.strokeStyle = e.cls === 'highway' ? 'rgba(244,180,0,0.85)' : 'rgba(244,180,0,0.5)';
    ctx.lineWidth = e.cls === 'highway' ? 4 : 3;
    ctx.beginPath();
    e.pts.forEach((p, i) => { const x = p.x - b.minX, y = p.z - b.minZ; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
  }
  return c;
}

export class Minimap {
  constructor(canvas, mapCanvas, world) {
    this.c = canvas; this.ctx = canvas.getContext('2d'); this.map = mapCanvas; this.world = world;
    this.b = world.grid.b; this.zoom = 1.25;
  }
  draw(player, yaw, route, targets, vehicles) {
    const ctx = this.ctx, W = this.c.width, H = this.c.height, b = this.b;
    const zoom = this.zoom * (1 - Math.min(0.35, Math.abs(player.speed) / 60));
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 2, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#cbb999'; ctx.fillRect(0, 0, W, H);
    ctx.translate(W / 2, H / 2 + 20);
    ctx.rotate(yaw + Math.PI);
    ctx.scale(zoom, zoom);
    ctx.translate(-(player.pos.x - b.minX), -(player.pos.z - b.minZ));
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.map, 0, 0);
    // vehicles
    ctx.fillStyle = 'rgba(30,42,90,0.55)';
    for (const v of vehicles) { const x = v.x - b.minX, y = v.z - b.minZ; ctx.fillRect(x - 1.5, y - 1.5, 3, 3); }
    // route
    if (route && route.length > 1) {
      ctx.strokeStyle = '#f4b400'; ctx.lineWidth = 5 / zoom + 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); route.forEach((p, i) => { const x = p.x - b.minX, y = p.z - b.minZ; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
    }
    ctx.restore();
    // targets clamped to the rim
    const cx = W / 2, cy = H / 2 + 20;
    for (const t of targets) {
      const dx = t.x - player.pos.x, dz = t.z - player.pos.z;
      const a = yaw + Math.PI;
      let sx = (dx * Math.cos(a) - dz * Math.sin(a)) * zoom, sy = (dx * Math.sin(a) + dz * Math.cos(a)) * zoom;
      const R = W / 2 - 12, d = Math.hypot(sx + cx - W / 2, sy + cy - H / 2);
      if (d > R) { const k = R / d; sx = (sx + cx - W / 2) * k - (cx - W / 2); sy = (sy + cy - H / 2) * k - (cy - H / 2); }
      ctx.fillStyle = t.color; ctx.strokeStyle = '#14161f'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx + sx, cy + sy, t.small ? 5 : 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (t.label) { ctx.fillStyle = '#14161f'; ctx.font = '700 11px Rajdhani, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(t.label, cx + sx, cy + sy + 4); }
    }
    // player arrow
    ctx.save(); ctx.translate(cx, cy);
    const rel = player.heading - yaw;
    ctx.rotate(-rel);
    ctx.fillStyle = '#1e2a5a'; ctx.strokeStyle = '#f3ede2'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(8, 9); ctx.lineTo(0, 4); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}

export class BigMap {
  constructor(canvas, mapCanvas, world) {
    this.c = canvas; this.ctx = canvas.getContext('2d'); this.map = mapCanvas; this.world = world; this.b = world.grid.b;
    this.zoom = 0.6; this.cx = 0; this.cz = -200; this.drag = null;
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom = Math.min(4, Math.max(0.35, this.zoom * (e.deltaY < 0 ? 1.15 : 0.87))); this.draw(); }, { passive: false });
    canvas.addEventListener('pointerdown', (e) => { this.drag = { x: e.clientX, y: e.clientY, cx: this.cx, cz: this.cz }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => { if (!this.drag) return; this.cx = this.drag.cx - (e.clientX - this.drag.x) / this.zoom; this.cz = this.drag.cz - (e.clientY - this.drag.y) / this.zoom; this.draw(); });
    canvas.addEventListener('pointerup', () => { this.drag = null; });
    this.labels = this._labels();
  }
  _labels() {
    const seen = new Map();
    for (const e of this.world.net.edges) {
      if (!e.name || e.cls === 'ring' || e.len < 90) continue;
      const cur = seen.get(e.name);
      if (!cur || e.len > cur.len) seen.set(e.name, e);
    }
    return [...seen.values()].map((e) => { const p = this.world.net.sample(e, e.len / 2); return { name: e.name, x: p.x, z: p.z, ang: Math.atan2(p.tz, p.tx), major: e.cls === 'highway' || e.cls === 'arterial' }; });
  }
  open(player) { this.cx = player.pos.x; this.cz = player.pos.z; this.player = player; this.resize(); this.draw(); }
  resize() { this.dpr = Math.min(devicePixelRatio, 2); this.c.width = innerWidth * this.dpr; this.c.height = innerHeight * this.dpr; }
  draw(extra = this.extra) {
    this.extra = extra;
    const ctx = this.ctx, W = this.c.width, H = this.c.height, b = this.b, z = this.zoom * this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0d1230'; ctx.fillRect(0, 0, W, H);
    const toS = (x, zz) => [(x - this.cx) * z + W / 2, (zz - this.cz) * z + H / 2];
    ctx.save();
    ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-(this.cx - b.minX), -(this.cz - b.minZ));
    ctx.drawImage(this.map, 0, 0);
    if (extra?.route?.length > 1) {
      ctx.strokeStyle = '#f4b400'; ctx.lineWidth = 6 / this.zoom; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath(); extra.route.forEach((p, i) => { const x = p.x - b.minX, y = p.z - b.minZ; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
    }
    ctx.restore();
    // road names
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const l of this.labels) {
      if (!l.major && this.zoom < 0.9) continue;
      const [sx, sy] = toS(l.x, l.z);
      ctx.save(); ctx.translate(sx, sy); let a = l.ang; if (a > Math.PI / 2) a -= Math.PI; if (a < -Math.PI / 2) a += Math.PI; ctx.rotate(a);
      ctx.font = `${l.major ? 700 : 600} ${Math.round((l.major ? 14 : 12) * this.dpr)}px Rajdhani, sans-serif`;
      ctx.lineWidth = 4 * this.dpr; ctx.strokeStyle = 'rgba(243,237,226,0.9)'; ctx.strokeText(l.name, 0, 0);
      ctx.fillStyle = '#3b2f28'; ctx.fillText(l.name, 0, 0); ctx.restore();
    }
    // landmarks
    for (const lm of this.world.landmarks) {
      const [sx, sy] = toS(lm.x, lm.z);
      const fuel = lm.icon === 'fuel';
      ctx.fillStyle = fuel ? '#1aa36f' : '#7b1e2b';
      ctx.beginPath(); ctx.arc(sx, sy, 6 * this.dpr, 0, Math.PI * 2); ctx.fill();
      ctx.font = `700 ${Math.round(13 * this.dpr)}px Rajdhani, sans-serif`;
      ctx.lineWidth = 4 * this.dpr; ctx.strokeStyle = 'rgba(13,18,48,0.85)'; ctx.strokeText(lm.short, sx, sy - 14 * this.dpr);
      ctx.fillStyle = '#f3ede2'; ctx.fillText(lm.short, sx, sy - 14 * this.dpr);
    }
    for (const t of extra?.targets || []) {
      const [sx, sy] = toS(t.x, t.z);
      ctx.fillStyle = t.color; ctx.strokeStyle = '#14161f'; ctx.lineWidth = 3 * this.dpr;
      ctx.beginPath(); ctx.arc(sx, sy, 10 * this.dpr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    if (this.player) {
      const [sx, sy] = toS(this.player.pos.x, this.player.pos.z);
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(Math.PI - this.player.heading); ctx.scale(this.dpr * 1.4, this.dpr * 1.4);
      ctx.fillStyle = '#1e2a5a'; ctx.strokeStyle = '#f3ede2'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(8, 9); ctx.lineTo(0, 4); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    }
  }
}
