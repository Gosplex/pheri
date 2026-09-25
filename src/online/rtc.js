// Live voice and video through Agora (agora-rtc-sdk-ng).
// The SDK is loaded only when a player turns voice on, so solo play stays light.
// Tokens come from the PHERI game server; the Agora App Certificate never reaches the browser.

export class Voice {
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.client = null; this.mic = null; this.cam = null; this.AgoraRTC = null;
    this.joined = false; this.joining = false;
    this.micOn = false; this.camOn = false; this.deafened = false;
    this.pushToTalk = false; this.pttHeld = false;
    this.remote = new Map();        // uid -> { user, audio, video, level, muted }
    this.localMuted = new Set();    // uids I muted locally
    this.speaking = new Map();      // uid -> level 0..1
  }

  async _sdk() {
    if (this.AgoraRTC) return this.AgoraRTC;
    const mod = await import('agora-rtc-sdk-ng');
    this.AgoraRTC = mod.default || mod;
    this.AgoraRTC.setLogLevel?.(3);
    this.AgoraRTC.disableLogUpload?.();
    return this.AgoraRTC;
  }

  static supported() { return !!(navigator.mediaDevices && window.RTCPeerConnection); }

  // cred: { appId, channel, token, uid }
  async join(cred, { mic = true } = {}) {
    if (this.joined || this.joining) return;
    this.joining = true;
    try {
      const A = await this._sdk();
      const client = this.client = A.createClient({ mode: 'rtc', codec: 'vp8' });
      client.on('user-published', async (user, type) => {
        const r = this._r(user);
        if (type === 'audio' && !this.hooks.allowAudio?.(user.uid)) { r.pendingAudio = true; this.hooks.change?.(); return; }
        await client.subscribe(user, type);
        if (type === 'audio') { r.audio = user.audioTrack; this._applyVolume(user.uid); r.audio.play(); }
        if (type === 'video') { r.video = user.videoTrack; this.hooks.videoOn?.(user.uid, r.video); }
        this.hooks.change?.();
      });
      client.on('user-unpublished', (user, type) => {
        const r = this.remote.get(user.uid); if (!r) return;
        if (type === 'audio') r.audio = null;
        if (type === 'video') { r.video = null; this.hooks.videoOff?.(user.uid); }
        this.hooks.change?.();
      });
      client.on('user-left', (user) => { this.hooks.videoOff?.(user.uid); this.remote.delete(user.uid); this.hooks.change?.(); });
      client.on('token-privilege-will-expire', async () => { const c = await this.hooks.renewToken?.(); if (c?.token) await client.renewToken(c.token); });
      client.on('connection-state-change', (cur) => this.hooks.state?.(cur));
      client.enableAudioVolumeIndicator();
      client.on('volume-indicator', (list) => {
        for (const v of list) this.speaking.set(v.uid === 0 ? 'me' : v.uid, Math.min(1, v.level / 60));
        this.hooks.levels?.(this.speaking);
      });
      await Promise.race([
        client.join(cred.appId, cred.channel, cred.token, cred.uid),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Could not reach the voice servers. Check your connection or firewall and try again.')), 15000)),
      ]).catch(async (e) => { try { await client.leave(); } catch { /* ignore */ } this.client = null; throw e; });
      this.joined = true;
      this.uid = cred.uid;
      if (mic) await this.setMic(true);
      this.hooks.change?.();
    } finally { this.joining = false; }
  }

  _r(user) { let r = this.remote.get(user.uid); if (!r) { r = { user, audio: null, video: null }; this.remote.set(user.uid, r); } r.user = user; return r; }

  async setMic(on) {
    if (!this.joined) return;
    if (on && !this.mic) {
      const A = await this._sdk();
      this.mic = await A.createMicrophoneAudioTrack({ AEC: true, ANS: true, AGC: true, encoderConfig: 'speech_standard' });
      await this.client.publish(this.mic);
    }
    this.micOn = on;
    if (this.mic) await this.mic.setMuted(!on || (this.pushToTalk && !this.pttHeld));
    this.hooks.change?.();
  }
  async setPushToTalk(on) { this.pushToTalk = on; if (this.mic) await this.mic.setMuted(!this.micOn || (on && !this.pttHeld)); this.hooks.change?.(); }
  async ptt(held) {
    if (held === this.pttHeld) return;
    this.pttHeld = held;
    if (this.pushToTalk && this.mic && this.micOn) await this.mic.setMuted(!held);
    this.hooks.change?.();
  }

  async setCamera(on, el) {
    if (!this.joined) return;
    if (on) {
      if (!this.cam) {
        const A = await this._sdk();
        this.cam = await A.createCameraVideoTrack({ encoderConfig: '240p_1', optimizationMode: 'motion' });
      }
      await this.cam.setEnabled(true);
      if (!this.client.localTracks.includes(this.cam)) await this.client.publish(this.cam);
      if (el) this.cam.play(el, { mirror: true });
    } else if (this.cam) {
      await this.client.unpublish(this.cam).catch(() => {});
      this.cam.stop(); this.cam.close(); this.cam = null;
    }
    this.camOn = on;
    this.hooks.change?.();
  }

  setDeafened(on) { this.deafened = on; for (const uid of this.remote.keys()) this._applyVolume(uid); this.hooks.change?.(); }
  toggleLocalMute(uid) { if (this.localMuted.has(uid)) this.localMuted.delete(uid); else this.localMuted.add(uid); this._applyVolume(uid); this.hooks.change?.(); }

  // Distance-based volume for proximity voice; called every frame by comms
  setGain(uid, gain) { const r = this.remote.get(uid); if (!r) return; r.gain = gain; this._applyVolume(uid); }
  _applyVolume(uid) {
    const r = this.remote.get(uid); if (!r?.audio) return;
    const g = this.deafened || this.localMuted.has(uid) ? 0 : (r.gain ?? 1);
    r.audio.setVolume(Math.round(g * 100));
  }

  // Team voice: (un)subscribe audio when teams or mode change
  async refreshAudioPolicy() {
    if (!this.joined) return;
    for (const [uid, r] of this.remote) {
      const allow = this.hooks.allowAudio?.(uid) ?? true;
      if (!allow && r.audio) { await this.client.unsubscribe(r.user, 'audio').catch(() => {}); r.audio = null; r.pendingAudio = true; }
      else if (allow && !r.audio && (r.pendingAudio || r.user.hasAudio)) { try { await this.client.subscribe(r.user, 'audio'); r.audio = r.user.audioTrack; r.audio?.play(); this._applyVolume(uid); r.pendingAudio = false; } catch { /* not published */ } }
    }
    this.hooks.change?.();
  }

  async devices() { const A = await this._sdk(); return { mics: await A.getMicrophones().catch(() => []), cams: await A.getCameras().catch(() => []) }; }
  async useMic(deviceId) { if (this.mic) await this.mic.setDevice(deviceId); }
  async useCam(deviceId) { if (this.cam) await this.cam.setDevice(deviceId); }

  async leave() {
    try {
      this.mic?.close(); this.cam?.close();
      await this.client?.leave();
    } catch { /* already gone */ }
    this.mic = null; this.cam = null; this.client = null;
    this.joined = false; this.micOn = false; this.camOn = false; this.remote.clear(); this.speaking.clear();
    this.hooks.change?.();
  }
}
