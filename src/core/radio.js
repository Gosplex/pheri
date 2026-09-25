// Pheri FM: three fictional stations synthesised live with Web Audio.
// Rangilo 98.3 plays garba (dhol + shehnai-like lead in raag Kafi), Saurashtra Lo-fi 91.1 plays
// soft chords, Bhakti 104 plays a slow harmonium drone with temple bells.

export const STATIONS = [
  { id: 'off', name: 'Radio off' },
  { id: 'garba', name: 'Rangilo 98.3', sub: 'Non-stop garba' },
  { id: 'lofi', name: 'Saurashtra Lo-fi 91.1', sub: 'Chai and chill' },
  { id: 'bhakti', name: 'Bhakti 104', sub: 'Aarti and bhajans' },
];

const KAFI = [0, 2, 3, 5, 7, 9, 10, 12, 14, 15];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Radio {
  constructor(audio) { this.audio = audio; this.station = 'off'; this.step = 0; this.next = 0; this.timer = null; this.bar = 0; }

  set(id) {
    this.station = id; this.step = 0; this.bar = 0;
    if (!this.audio.started) return;
    if (!this.out) {
      const ctx = this.audio.ctx;
      this.out = ctx.createGain(); this.out.gain.value = 0.22;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200; // a little "FM" softness
      this.out.connect(lp).connect(this.audio.master);
    }
    this.next = this.audio.ctx.currentTime + 0.1;
    if (!this.timer) this.timer = setInterval(() => this._schedule(), 60);
    if (id !== 'off') this._jingle();
  }
  cycle() { const i = STATIONS.findIndex((s) => s.id === this.station); const n = STATIONS[(i + 1) % STATIONS.length]; this.set(n.id); return n; }
  setDuck(paused) { if (this.out) this.out.gain.value = paused ? 0.05 : 0.22; }

  _tone(t, freq, dur, type = 'sine', gain = 0.2, vib = 0, attack = 0.01) {
    const ctx = this.audio.ctx;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    if (vib) { const l = ctx.createOscillator(); l.frequency.value = 5.5; const lg = ctx.createGain(); lg.gain.value = vib; l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + dur); }
    o.connect(g).connect(this.out); o.start(t); o.stop(t + dur + 0.05);
  }
  _drum(t, f0, f1, dur, gain) {
    const ctx = this.audio.ctx;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.6);
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + dur + 0.02);
  }
  _noise(t, dur, gain, freq = 7000) {
    const ctx = this.audio.ctx;
    const s = ctx.createBufferSource(); s.buffer = this.audio.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.out); s.start(t, Math.random(), dur + 0.02);
  }
  _jingle() {
    const t = this.audio.ctx.currentTime + 0.05;
    [72, 76, 79, 84].forEach((m, i) => this._tone(t + i * 0.09, mtof(m), 0.25, 'triangle', 0.12));
  }

  _schedule() {
    if (!this.audio.started || this.station === 'off') return;
    const ctx = this.audio.ctx;
    while (this.next < ctx.currentTime + 0.25) {
      const t = this.next;
      const st = this.station;
      if (st === 'garba') this._garbaStep(t); else if (st === 'lofi') this._lofiStep(t); else if (st === 'bhakti') this._bhaktiStep(t);
      const spb = st === 'garba' ? 60 / 132 / 2 : st === 'lofi' ? 60 / 78 / 2 : 60 / 60 / 2;
      this.next += spb; this.step++;
    }
  }

  // Garba: 6-beat taal feel with dhol, tali claps and a wandering Kafi melody
  _garbaStep(t) {
    const s = this.step % 12;
    if (s === 0 || s === 6) this._drum(t, 140, 60, 0.35, 0.55);
    if (s === 3 || s === 9) this._drum(t, 300, 180, 0.15, 0.3);
    if (s === 4 || s === 10) this._noise(t, 0.08, 0.18, 2500); // tali
    if (s % 2 === 1) this._noise(t, 0.03, 0.05, 8000);
    if (s % 2 === 0) {
      const root = 62;
      const deg = Math.floor(Math.abs(Math.sin(this.step * 0.37 + this.bar)) * 7);
      this._tone(t, mtof(root + 12 + KAFI[deg]), 0.42, 'sawtooth', 0.045, 4, 0.03);
    }
    if (s === 0) { this._tone(t, mtof(50), 2.6, 'sawtooth', 0.03); this._tone(t, mtof(57), 2.6, 'sawtooth', 0.02); this.bar++; }
  }
  _lofiStep(t) {
    const s = this.step % 16;
    const chords = [[57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65], [52, 55, 59, 62]];
    const c = chords[Math.floor(this.step / 16) % 4];
    if (s === 0) c.forEach((m, i) => this._tone(t + i * 0.02, mtof(m), 3.4, 'triangle', 0.05, 1.5, 0.08));
    if (s === 0 || s === 7 || s === 10) this._drum(t, 110, 45, 0.3, 0.45);
    if (s === 4 || s === 12) this._noise(t, 0.12, 0.12, 1800);
    if (s % 2 === 0) this._noise(t, 0.03, 0.035, 9000);
    if (s === 6 || s === 14) this._tone(t, mtof(c[3] + 12), 0.5, 'sine', 0.04);
  }
  _bhaktiStep(t) {
    const s = this.step % 16;
    if (s === 0) { this._tone(t, mtof(48), 8, 'sawtooth', 0.025, 0, 0.6); this._tone(t, mtof(55), 8, 'sawtooth', 0.02, 0, 0.6); }
    if (s % 4 === 0) this._tone(t, mtof(84) * 1.01, 1.6, 'sine', 0.05); // temple bell
    if (s % 2 === 1) this._drum(t, 220, 150, 0.2, 0.18);
    const phrase = [0, 2, 3, 5, 7, 5, 3, 2];
    if (s % 2 === 0) this._tone(t, mtof(60 + KAFI[phrase[(this.step / 2) % 8 | 0]]), 0.95, 'square', 0.02, 3, 0.08);
  }
}
