// Everything you hear is synthesised at runtime with Web Audio: no sound files.
import { clamp, lerp } from './rng.js';

export class AudioEngine {
  constructor() {
    this.ctx = null; this.started = false; this.volume = 0.8;
    this.birdTimer = 0; this.cricketPhase = 0; this.dholTimer = 0; this.dholActive = 0;
  }

  start() {
    if (this.started) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.started = true;
    this.master = ctx.createGain(); this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.amb = ctx.createGain(); this.amb.gain.value = 0.9; this.amb.connect(this.master);

    // white noise buffer
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    this._buildEngine();
    this._buildHorn();
    this.traffic = this._noiseLayer('lowpass', 220, 0.7, 0);
    this.murmur = this._noiseLayer('bandpass', 700, 0.6, 0);
    this.wind = this._noiseLayer('lowpass', 500, 0.8, 0);
    this.rain = this._noiseLayer('highpass', 1400, 0.4, 0);
    this.rainLow = this._noiseLayer('lowpass', 900, 0.5, 0);
    this.skid = this._noiseLayer('bandpass', 2400, 6, 0);
    this._buildCrickets();
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  _noiseSrc() {
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    s.loopStart = Math.random(); s.start(0, Math.random() * 1.5); return s;
  }
  _noiseLayer(type, freq, q, gain) {
    const src = this._noiseSrc();
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain(); g.gain.value = gain;
    src.connect(f).connect(g).connect(this.amb);
    return { f, g };
  }

  _buildEngine() {
    const ctx = this.ctx;
    this.eOsc1 = ctx.createOscillator(); this.eOsc1.type = 'sawtooth';
    this.eOsc2 = ctx.createOscillator(); this.eOsc2.type = 'square';
    this.eOsc3 = ctx.createOscillator(); this.eOsc3.type = 'triangle';
    this.eFilter = ctx.createBiquadFilter(); this.eFilter.type = 'lowpass'; this.eFilter.Q.value = 2.5;
    const g1 = this.eG1 = ctx.createGain(); g1.gain.value = 0.5;
    const g2 = this.eG2 = ctx.createGain(); g2.gain.value = 0.22;
    const g3 = this.eG3 = ctx.createGain(); g3.gain.value = 0.35;
    // chug: amplitude modulation at firing frequency
    this.eAM = ctx.createGain(); this.eAM.gain.value = 0.6;
    this.eLfo = ctx.createOscillator(); this.eLfo.type = 'sine';
    const lfoDepth = this.eLfoDepth = ctx.createGain(); lfoDepth.gain.value = 0.4;
    this.eLfo.connect(lfoDepth).connect(this.eAM.gain);
    this.eOut = ctx.createGain(); this.eOut.gain.value = 0;
    this.eOsc1.connect(g1).connect(this.eFilter);
    this.eOsc2.connect(g2).connect(this.eFilter);
    this.eOsc3.connect(g3).connect(this.eFilter);
    this.eFilter.connect(this.eAM).connect(this.eOut).connect(this.sfx);
    // exhaust hiss
    const n = this._noiseSrc();
    this.eNoiseF = ctx.createBiquadFilter(); this.eNoiseF.type = 'bandpass'; this.eNoiseF.frequency.value = 800; this.eNoiseF.Q.value = 1.2;
    this.eNoiseG = ctx.createGain(); this.eNoiseG.gain.value = 0.0;
    n.connect(this.eNoiseF).connect(this.eNoiseG).connect(this.eOut);
    [this.eOsc1, this.eOsc2, this.eOsc3, this.eLfo].forEach((o) => o.start());
  }

  _buildHorn() {
    const ctx = this.ctx;
    this.hornG = ctx.createGain(); this.hornG.gain.value = 0;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1600; bp.Q.value = 0.8;
    const o1 = ctx.createOscillator(); o1.type = 'square'; o1.frequency.value = 415;
    const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 494;
    const mix = ctx.createGain(); mix.gain.value = 0.35;
    o1.connect(mix); o2.connect(mix); mix.connect(bp).connect(this.hornG).connect(this.sfx);
    o1.start(); o2.start();
  }

  _buildCrickets() {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 4300;
    const am = ctx.createGain(); am.gain.value = 0;
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 28;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.5;
    lfo.connect(lfoG).connect(am.gain);
    this.cricketG = ctx.createGain(); this.cricketG.gain.value = 0;
    o.connect(am).connect(this.cricketG).connect(this.amb);
    o.start(); lfo.start();
    this.cricketAM = am;
  }

  // --- per-frame update ---------------------------------------------------
  update(dt, s) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const set = (param, v, tc = 0.08) => param.setTargetAtTime(v, t, tc);

    // Engine (profile: single-cylinder commuter, big-single thump, or electric whine)
    const prof = this.engineProfile || 'single';
    if (prof !== this._appliedProfile && this.eG1) {
      this._appliedProfile = prof;
      this.eG1.gain.value = prof === 'ev' ? 0 : prof === 'thump' ? 0.7 : 0.5;
      this.eG2.gain.value = prof === 'ev' ? 0 : prof === 'thump' ? 0.45 : 0.22;
      this.eG3.gain.value = prof === 'ev' ? 0.5 : 0.35;
      this.eLfoDepth.gain.value = prof === 'ev' ? 0 : prof === 'thump' ? 0.7 : 0.4;
    }
    const rpm = s.rpm; // 900..9000
    let f = prof === 'thump' ? lerp(12, 62, clamp((rpm - 900) / 5100, 0, 1)) : lerp(22, 118, clamp((rpm - 900) / 8100, 0, 1));
    if (prof === 'ev') f = 60 + s.speed * 14;
    set(this.eOsc1.frequency, f, 0.04);
    set(this.eOsc2.frequency, f * 0.5, 0.04);
    set(this.eOsc3.frequency, f * 2.01, 0.04);
    set(this.eLfo.frequency, f * 0.5, 0.04);
    set(this.eFilter.frequency, 260 + rpm * 0.22 + s.throttle * 500, 0.05);
    set(this.eOut.gain, s.engineOn ? (prof === 'ev' ? 0.03 + s.throttle * 0.05 : 0.16 + s.throttle * 0.16) * (s.paused ? 0 : 1) : 0, 0.1);
    set(this.eNoiseG.gain, 0.05 + s.throttle * 0.12, 0.1);
    set(this.eNoiseF.frequency, 500 + rpm * 0.2, 0.1);

    set(this.hornG.gain, s.horn && !s.paused ? 0.45 : 0, 0.015);

    const speedN = clamp(s.speed / 25, 0, 1);
    set(this.wind.g.gain, speedN * speedN * 0.35, 0.2);
    set(this.wind.f.frequency, 300 + speedN * 900, 0.2);
    set(this.skid.g.gain, s.skid * 0.25, 0.05);

    // Ambience driven by the world around the rider
    const night = s.night;
    set(this.traffic.g.gain, (0.05 + s.trafficNear * 0.35) * (1 - night * 0.45), 0.5);
    set(this.murmur.g.gain, s.crowdNear * 0.22 * (1 - night * 0.3), 0.5);
    set(this.rain.g.gain, s.rain * 0.3, 0.8);
    set(this.rainLow.g.gain, s.rain * 0.22, 0.8);
    set(this.cricketG.gain, night * (1 - s.rain) * (1 - s.crowdNear) * 0.035, 1.0);
    this.amb.gain.value = s.paused ? 0.25 : 0.9;

    // morning birds around trees / campus
    this.birdTimer -= dt;
    if (s.morning > 0.3 && this.birdTimer <= 0 && s.greenery > 0.2 && !s.paused) {
      this.birdTimer = 0.4 + Math.random() * 2.2;
      this._chirp();
    }
    // wedding dhol
    if (this.dholActive > 0 && !s.paused) {
      this.dholActive -= dt; this.dholTimer -= dt;
      if (this.dholTimer <= 0) {
        const pattern = [0.25, 0.25, 0.125, 0.125, 0.25];
        this._drum(this.dholGain || 0.3, (this._dholI || 0) % 5 === 3 ? 180 : 95);
        this._dholI = (this._dholI || 0) + 1;
        this.dholTimer = pattern[this._dholI % pattern.length];
      }
    }
  }

  dhol(distance) { this.dholActive = 0.6; this.dholGain = clamp(0.5 - distance / 120, 0, 0.45); }

  _chirp() {
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    const g = ctx.createGain(); g.gain.value = 0;
    const p = ctx.createStereoPanner(); p.pan.value = Math.random() * 2 - 1;
    o.connect(g).connect(p).connect(this.amb);
    const base = 2600 + Math.random() * 1800;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const tt = t + i * 0.11;
      o.frequency.setValueAtTime(base, tt); o.frequency.exponentialRampToValueAtTime(base * 1.35, tt + 0.06);
      g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.03, tt + 0.02); g.gain.linearRampToValueAtTime(0, tt + 0.08);
    }
    o.start(t); o.stop(t + n * 0.11 + 0.1);
  }

  _drum(gain, freq) {
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    const g = ctx.createGain();
    o.frequency.setValueAtTime(freq * 1.8, t); o.frequency.exponentialRampToValueAtTime(freq, t + 0.08);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g).connect(this.amb); o.start(t); o.stop(t + 0.3);
  }

  // One-shot horn from an NPC vehicle. pan -1..1, dist metres
  npcHorn(kind, pan, dist) {
    if (!this.started) return;
    const gain = clamp(0.28 - dist / 220, 0, 0.28); if (gain <= 0.01) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const presets = {
      car: [[392, 494], 0.35, 'square'], bus: [[233, 294], 0.7, 'sawtooth'], truck: [[196, 247], 0.8, 'sawtooth'],
      auto: [[640], 0.18, 'triangle'], bike: [[440, 523], 0.25, 'square'], scooter: [[523, 587], 0.22, 'square'],
    };
    const [freqs, dur0, type] = presets[kind] || presets.car;
    const dur = dur0 * (Math.random() < 0.3 ? 2.2 : 1);
    const g = ctx.createGain(); g.gain.value = 0;
    const pn = ctx.createStereoPanner(); pn.pan.value = clamp(pan, -1, 1);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.7;
    g.connect(bp).connect(pn).connect(this.sfx);
    for (const fq of freqs) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = fq * (0.97 + Math.random() * 0.06);
      if (kind === 'auto') { o.frequency.setValueAtTime(fq, t); o.frequency.linearRampToValueAtTime(fq * 0.8, t + dur); }
      o.connect(g); o.start(t); o.stop(t + dur + 0.05);
    }
    g.gain.linearRampToValueAtTime(gain, t + 0.02);
    g.gain.setValueAtTime(gain, t + dur - 0.03);
    g.gain.linearRampToValueAtTime(0, t + dur);
  }

  thud(intensity = 1) {
    if (!this.started) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = this._noiseSrcOnce(0.4);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.5 * intensity, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    n.connect(f).connect(g).connect(this.sfx);
    const clank = ctx.createOscillator(); clank.type = 'square'; clank.frequency.value = 180 + Math.random() * 80;
    const cg = ctx.createGain(); cg.gain.setValueAtTime(0.12 * intensity, t); cg.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    clank.connect(cg).connect(this.sfx); clank.start(t); clank.stop(t + 0.2);
  }

  bump(intensity = 1) {
    if (!this.started) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.35 * intensity, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g).connect(this.sfx); o.start(t); o.stop(t + 0.25);
  }

  _noiseSrcOnce(dur) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.start(this.ctx.currentTime, Math.random(), dur); return s;
  }

  bell() { this._tones([[1568, 0], [2352, 0.002], [3136, 0.004]], 1.8, 'sine', 0.05); }
  cracker(dist) {
    if (!this.started) return;
    const ctx = this.ctx, t = ctx.currentTime + dist / 340 * 0.3;
    const g0 = clamp(0.35 - dist / 400, 0.03, 0.35);
    const n = this._noiseSrcOnce(0.6); const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(g0, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    n.connect(f).connect(g).connect(this.amb);
    for (let i = 0; i < 5; i++) { const c = this._noiseSrcOnce(0.05); const cg = ctx.createGain(); const tt = t + 0.35 + Math.random() * 0.5; cg.gain.setValueAtTime(g0 * 0.4, tt); cg.gain.exponentialRampToValueAtTime(0.001, tt + 0.05); c.connect(cg).connect(this.amb); }
  }
  splash() {
    if (!this.started) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = this._noiseSrcOnce(0.5); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    n.connect(f).connect(g).connect(this.sfx);
  }
  chime() { this._tones([[784, 0], [988, 0.1], [1175, 0.2], [1568, 0.3]], 0.3, 'triangle', 0.1); }

  ping() { this._tones([[880, 0], [1320, 0.09]], 0.12, 'sine', 0.12); }
  coin() { this._tones([[988, 0], [1319, 0.07], [1976, 0.14]], 0.12, 'triangle', 0.14); }
  click() { this._tones([[1200, 0]], 0.03, 'square', 0.04); }
  error() { this._tones([[220, 0], [180, 0.1]], 0.12, 'square', 0.08); }
  fuelTick() { this._tones([[660, 0]], 0.03, 'sine', 0.05); }
  indicator() { this._tones([[1800, 0]], 0.012, 'square', 0.05); }

  _tones(list, dur, type, gain) {
    if (!this.started) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    for (const [f, off] of list) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
      const g = ctx.createGain(); const t = t0 + off;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      o.connect(g).connect(this.sfx); o.start(t); o.stop(t + dur + 0.02);
    }
  }
}
