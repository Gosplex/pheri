import * as THREE from 'three';
import { Rng } from './rng.js';

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function noiseFill(ctx, w, h, base, variance, rng, dots = 6000, dotSize = 2) {
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < dots; i++) {
    const v = Math.floor(rng.float(-variance, variance));
    ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v / 255})` : `rgba(0,0,0,${-v / 255})`;
    const s = rng.float(0.5, dotSize);
    ctx.fillRect(rng.float(0, w), rng.float(0, h), s, s);
  }
}

export function asphaltTexture() {
  const rng = new Rng(11);
  const c = makeCanvas(512, 512), ctx = c.getContext('2d');
  noiseFill(ctx, 512, 512, '#6b6862', 40, rng, 26000, 2.2);
  // patches of repaired asphalt, typical of Indian roads
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = `rgba(${rng.pick(['40,40,42', '90,86,80', '55,53,50'])},${rng.float(0.15, 0.35)})`;
    ctx.beginPath();
    const x = rng.float(0, 512), y = rng.float(0, 512);
    ctx.ellipse(x, y, rng.float(20, 70), rng.float(12, 40), rng.float(0, 3), 0, Math.PI * 2);
    ctx.fill();
  }
  // hairline cracks
  ctx.strokeStyle = 'rgba(30,30,30,0.35)'; ctx.lineWidth = 1;
  for (let i = 0; i < 14; i++) {
    ctx.beginPath(); let x = rng.float(0, 512), y = rng.float(0, 512); ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += rng.float(-18, 18); y += rng.float(-18, 18); ctx.lineTo(x, y); }
    ctx.stroke();
  }
  return toTex(c, true);
}

export function groundTexture() {
  const rng = new Rng(21);
  const c = makeCanvas(512, 512), ctx = c.getContext('2d');
  noiseFill(ctx, 512, 512, '#b69a73', 36, rng, 30000, 3);
  for (let i = 0; i < 70; i++) { // dry grass tufts and pebbles
    ctx.fillStyle = rng.chance(0.5) ? `rgba(120,120,60,${rng.float(0.2, 0.5)})` : `rgba(90,70,50,${rng.float(0.2, 0.4)})`;
    ctx.beginPath(); ctx.arc(rng.float(0, 512), rng.float(0, 512), rng.float(2, 9), 0, 7); ctx.fill();
  }
  return toTex(c, true);
}

// Lime-plaster facade with monsoon rain streaks and a dusty plinth
export function plasterTexture() {
  const rng = new Rng(61);
  const c = makeCanvas(256, 512), ctx = c.getContext('2d');
  noiseFill(ctx, 256, 512, '#f2f0ea', 16, rng, 9000, 2);
  for (let i = 0; i < 26; i++) { // rain streaks from the parapet
    const x = rng.float(0, 256), w = rng.float(3, 16), len = rng.float(60, 360);
    const g = ctx.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, `rgba(70,62,52,${rng.float(0.12, 0.3)})`); g.addColorStop(1, 'rgba(70,62,52,0)');
    ctx.fillStyle = g; ctx.fillRect(x, 0, w, len);
  }
  for (let i = 0; i < 14; i++) { // damp patches and repairs
    ctx.fillStyle = `rgba(${rng.pick(['90,80,65', '255,255,255', '120,110,95'])},${rng.float(0.05, 0.14)})`;
    ctx.beginPath(); ctx.ellipse(rng.float(0, 256), rng.float(0, 512), rng.float(10, 40), rng.float(8, 30), 0, 0, 7); ctx.fill();
  }
  const g = ctx.createLinearGradient(0, 440, 0, 512); g.addColorStop(0, 'rgba(110,90,70,0)'); g.addColorStop(1, 'rgba(110,90,70,0.35)');
  ctx.fillStyle = g; ctx.fillRect(0, 440, 256, 72);
  return toTex(c, true);
}

export function grassTexture() {
  const rng = new Rng(31);
  const c = makeCanvas(256, 256), ctx = c.getContext('2d');
  noiseFill(ctx, 256, 256, '#6f8a45', 40, rng, 16000, 2);
  return toTex(c, true);
}

export function pavingTexture() {
  const rng = new Rng(41);
  const c = makeCanvas(256, 256), ctx = c.getContext('2d');
  noiseFill(ctx, 256, 256, '#b8ada0', 25, rng, 6000, 2);
  ctx.strokeStyle = 'rgba(70,60,50,0.35)'; ctx.lineWidth = 2;
  for (let i = 0; i <= 256; i += 32) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke();
  }
  return toTex(c, true);
}

export function waterNormalTexture() {
  const rng = new Rng(51);
  const c = makeCanvas(256, 256), ctx = c.getContext('2d');
  ctx.fillStyle = 'rgb(128,128,255)'; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 400; i++) {
    const r = rng.float(4, 18);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, 'rgba(160,160,255,0.35)'); g.addColorStop(1, 'rgba(100,100,255,0)');
    ctx.save(); ctx.translate(rng.float(0, 256), rng.float(0, 256)); ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.restore();
  }
  const t = toTex(c, true); t.colorSpace = THREE.NoColorSpace; return t;
}

// Soft radial disc: used for street-light pools, headlight glow and blob shadows.
export function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = makeCanvas(128, 128), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner); g.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.55)')); g.addColorStop(1, outer);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  return toTex(c, false);
}

// Rows of lit windows for the "glow" pass on buildings
function toTex(c, repeat) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
}

/* ---------------------------------------------------------------------------
 * SignAtlas: every shop board, hoarding and road sign in the world lives in one
 * 2048x2048 canvas, so all signage is drawn in a single draw call and glows
 * together at night.
 * ------------------------------------------------------------------------- */
export class SignAtlas {
  constructor(size = 2048, cols = 4, rows = 24) {
    this.size = size; this.cols = cols; this.rows = rows;
    this.cw = size / cols; this.ch = size / rows;
    this.canvas = makeCanvas(size, size);
    this.ctx = this.canvas.getContext('2d');
    this.ctx.fillStyle = '#222'; this.ctx.fillRect(0, 0, size, size);
    this.next = 0; this.nextD = 0;
    this.cache = new Map();
    this.texture = null;
  }
  // Single-height slots use rows [0, splitRow); double-height slots use the rest.
  alloc(span = 1) {
    const split = this.rows - 8;
    let col, row;
    if (span === 1) {
      if (this.next >= split * this.cols) return null;
      col = this.next % this.cols; row = Math.floor(this.next / this.cols); this.next++;
    } else {
      this.nextD = this.nextD || 0;
      if (this.nextD >= 4 * this.cols) return null;
      col = this.nextD % this.cols; row = split + Math.floor(this.nextD / this.cols) * 2; this.nextD++;
    }
    const x = col * this.cw, y = row * this.ch, w = this.cw, h = this.ch * span;
    const S = this.size;
    // canvas y grows downward; texture v grows upward (flipY)
    return { x, y, w, h, uv: [x / S + 0.002, 1 - (y + h) / S + 0.002, (x + w) / S - 0.002, 1 - y / S - 0.002] };
  }

  // Shop board: English on top, regional script underneath.
  shopBoard(key, { en, local = '', script = 'gu', bg = '#b3261e', fg = '#fff', accent = '#f4b400', style = 0 }) {
    if (this.cache.has(key)) return this.cache.get(key);
    const s = this.alloc(1); if (!s) return null;
    const c = this.ctx;
    c.save(); c.beginPath(); c.rect(s.x, s.y, s.w, s.h); c.clip();
    c.fillStyle = bg; c.fillRect(s.x, s.y, s.w, s.h);
    if (style === 1) { // two-tone band
      c.fillStyle = accent; c.fillRect(s.x, s.y + s.h * 0.78, s.w, s.h * 0.22);
    } else if (style === 2) { // bordered board
      c.strokeStyle = accent; c.lineWidth = 6; c.strokeRect(s.x + 5, s.y + 5, s.w - 10, s.h - 10);
    } else {
      c.fillStyle = accent; c.fillRect(s.x, s.y, 10, s.h); c.fillRect(s.x + s.w - 10, s.y, 10, s.h);
    }
    c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
    const localFont = script === 'hi' ? '"Noto Sans Devanagari"' : '"Baloo Bhai 2"';
    if (local) {
      fitText(c, en.toUpperCase(), s.x + s.w / 2, s.y + s.h * 0.34, s.w - 34, 34, '700', '"Rajdhani", sans-serif');
      fitText(c, local, s.x + s.w / 2, s.y + s.h * 0.72, s.w - 40, 28, '600', `${localFont}, sans-serif`);
    } else {
      fitText(c, en.toUpperCase(), s.x + s.w / 2, s.y + s.h * 0.52, s.w - 34, 44, '700', '"Rajdhani", sans-serif');
    }
    c.restore();
    this.cache.set(key, s);
    return s;
  }

  // Large roadside hoarding (2 slots tall)
  hoarding(key, { title, sub = '', local = '', bg = '#1e2a5a', fg = '#fff', accent = '#f4b400' }) {
    if (this.cache.has(key)) return this.cache.get(key);
    const s = this.alloc(2); if (!s) return null;
    const c = this.ctx;
    c.save(); c.beginPath(); c.rect(s.x, s.y, s.w, s.h); c.clip();
    const g = c.createLinearGradient(s.x, s.y, s.x + s.w, s.y + s.h);
    g.addColorStop(0, bg); g.addColorStop(1, shade(bg, -30));
    c.fillStyle = g; c.fillRect(s.x, s.y, s.w, s.h);
    c.fillStyle = accent;
    c.beginPath(); c.arc(s.x + s.w * 0.86, s.y + s.h * 0.3, s.h * 0.42, 0, 7); c.fill();
    c.fillStyle = fg; c.textAlign = 'left'; c.textBaseline = 'middle';
    fitText(c, title, s.x + 22, s.y + s.h * 0.3, s.w * 0.7, 46, '700', '"Rajdhani", sans-serif', 'left');
    if (sub) fitText(c, sub, s.x + 22, s.y + s.h * 0.56, s.w * 0.72, 26, '600', '"Rajdhani", sans-serif', 'left');
    if (local) fitText(c, local, s.x + 22, s.y + s.h * 0.8, s.w * 0.72, 30, '600', '"Baloo Bhai 2", sans-serif', 'left');
    c.restore();
    this.cache.set(key, s);
    return s;
  }

  // Green direction board used on highways and big junctions
  roadSign(key, lines) {
    if (this.cache.has(key)) return this.cache.get(key);
    const s = this.alloc(2); if (!s) return null;
    const c = this.ctx;
    c.fillStyle = '#0d6b3a'; c.fillRect(s.x, s.y, s.w, s.h);
    c.strokeStyle = '#fff'; c.lineWidth = 5; c.strokeRect(s.x + 8, s.y + 8, s.w - 16, s.h - 16);
    c.fillStyle = '#fff'; c.textAlign = 'left'; c.textBaseline = 'middle';
    const n = lines.length;
    lines.forEach((ln, i) => {
      const y = s.y + s.h * ((i + 0.6) / (n + 0.2));
      const font = /[\u0A80-\u0AFF]/.test(ln) ? '"Baloo Bhai 2", sans-serif' : '"Rajdhani", sans-serif';
      fitText(c, ln, s.x + 26, y, s.w - 52, 34, '700', font, 'left');
    });
    this.cache.set(key, s);
    return s;
  }

  // Truck tailboard: the famous "HORN OK PLEASE"
  truckBack() {
    if (this.cache.has('truckback')) return this.cache.get('truckback');
    const s = this.alloc(1);
    const c = this.ctx;
    c.fillStyle = '#f2c230'; c.fillRect(s.x, s.y, s.w, s.h);
    c.fillStyle = '#c0392b';
    for (let i = 0; i < 12; i++) { c.beginPath(); c.arc(s.x + 20 + i * 42, s.y + 10, 8, 0, 7); c.fill(); }
    c.fillStyle = '#1e2a5a'; c.textAlign = 'center'; c.textBaseline = 'middle';
    fitText(c, 'HORN OK PLEASE', s.x + s.w / 2, s.y + s.h * 0.52, s.w - 40, 40, '700', '"Rajdhani", sans-serif');
    c.fillStyle = '#c0392b';
    fitText(c, 'USE DIPPER AT NIGHT', s.x + s.w / 2, s.y + s.h * 0.84, s.w - 60, 16, '700', '"Rajdhani", sans-serif');
    this.cache.set('truckback', s);
    return s;
  }

  finalize() {
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.texture.generateMipmaps = true;
    return this.texture;
  }
}

function fitText(c, text, x, y, maxW, size, weight, family, align = 'center') {
  let s = size;
  c.textAlign = align;
  c.font = `${weight} ${s}px ${family}`;
  let w = c.measureText(text).width;
  while (w > maxW && s > 10) { s -= 2; c.font = `${weight} ${s}px ${family}`; w = c.measureText(text).width; }
  c.fillText(text, x, y);
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}
