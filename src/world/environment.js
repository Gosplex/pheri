import * as THREE from 'three';
import { clamp, lerp, smoothstep, Rng } from '../core/rng.js';

// Keyframed look for each hour. Colours are sRGB hex.
const KEYS = [
  //  h    skyTop    horizon   fog       sun       sunI  hemiSky   hemiGnd   hemiI  exposure
  [0,    0x070a18, 0x1c2440, 0x151b2e, 0x8aa0ff, 0.00, 0x4a5a8c, 0x1a1712, 1.15, 1.1],
  [4.8,  0x070a18, 0x1c2440, 0x151b2e, 0x8aa0ff, 0.00, 0x4a5a8c, 0x1a1712, 1.15, 1.1],
  [5.8,  0x2a3563, 0xd68a5c, 0x6f5b5b, 0xff9a52, 0.6,  0x7a80aa, 0x3b2f28, 0.95, 1.05],
  [6.6,  0x5a86c4, 0xf2b27a, 0xc9a98a, 0xffc07a, 1.8,  0x9fb6d8, 0x6b5a45, 0.8,  0.95],
  [8.5,  0x4d8fd6, 0xcfe0ee, 0xc8d6de, 0xfff0d8, 2.8,  0xbfd4ea, 0x7d6b52, 0.95, 0.9],
  [12,   0x3f86d6, 0xd9e6ee, 0xd3dde2, 0xfffaf0, 3.2,  0xcadcf0, 0x85735a, 1.0,  0.85],
  [16,   0x4a8bd2, 0xe3dccc, 0xd8d2c4, 0xfff0d6, 2.8,  0xc6d4e6, 0x846f55, 0.95, 0.9],
  [17.8, 0x4f6fb0, 0xf0a868, 0xd29a74, 0xffa65a, 1.8,  0xa7a9c9, 0x7a5b40, 1.0,  0.95],
  [18.6, 0x2b2f63, 0xe0704a, 0x8c5a55, 0xff7a3d, 0.7,  0x8a80aa, 0x4a3328, 1.0,  1.05],
  [19.4, 0x0e1230, 0x3b2d4f, 0x2a2438, 0x8aa0ff, 0.0,  0x55608f, 0x221c1a, 1.1,  1.1],
  [24,   0x070a18, 0x1c2440, 0x151b2e, 0x8aa0ff, 0.00, 0x4a5a8c, 0x1a1712, 1.15, 1.1],
];

const cA = new THREE.Color(), cB = new THREE.Color();
function lerpColor(out, a, b, t) { cA.set(a); cB.set(b); return out.copy(cA).lerp(cB, t); }

export class Environment {
  constructor(scene, renderer, quality) {
    this.scene = scene; this.renderer = renderer;
    this.time = 7.5; this.day = 1;
    this.weather = 'clear'; this.target = { cloud: 0, rain: 0 };
    this.cloud = 0; this.rain = 0; this.wet = 0;
    this.nextWeatherChange = 3; // game hours
    this.rng = new Rng(Date.now() & 0xffff);
    this.lightning = 0;

    // Sky dome
    const skyGeo = new THREE.SphereGeometry(900, 32, 16);
    this.skyUniforms = {
      top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3() },
      sunColor: { value: new THREE.Color() }, night: { value: 0 }, cloud: { value: 0 }, time: { value: 0 },
    };
    const skyMat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*p; gl_Position.z = gl_Position.w; }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor; uniform float night; uniform float cloud; uniform float time;
        varying vec3 vDir;
        float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          float a=hash(vec3(i,0.)), b=hash(vec3(i+vec2(1,0),0.)), c=hash(vec3(i+vec2(0,1),0.)), d=hash(vec3(i+vec2(1,1),0.));
          return mix(mix(a,b,f.x),mix(c,d,f.x),f.y); }
        void main(){
          vec3 d = normalize(vDir);
          float h = clamp(d.y, -0.2, 1.0);
          vec3 col = mix(horizon, top, pow(max(h,0.0), 0.55));
          float sd = max(dot(d, normalize(sunDir)), 0.0);
          col += sunColor * (pow(sd, 900.0) * 6.0 + pow(sd, 12.0) * 0.35) * (1.0 - cloud*0.8);
          // moon opposite the sun
          float md = max(dot(d, -normalize(sunDir)), 0.0);
          col += vec3(0.85,0.9,1.0) * pow(md, 1600.0) * 3.0 * night;
          // stars
          vec3 sp = floor(d * 220.0);
          float st = step(0.9975, hash(sp)) * smoothstep(0.05, 0.3, d.y) * night * (1.0 - cloud);
          col += vec3(st) * (0.6 + 0.4*sin(time*3.0 + hash(sp)*40.0));
          // clouds
          vec2 cp = d.xz / max(d.y, 0.08) * 1.3 + vec2(time*0.01, 0.0);
          float c = noise(cp) * 0.6 + noise(cp*2.3) * 0.3 + noise(cp*5.1)*0.1;
          float cov = smoothstep(0.62 - cloud*0.45, 0.95 - cloud*0.3, c) * smoothstep(0.0, 0.25, d.y);
          vec3 cloudCol = mix(vec3(0.95,0.93,0.9), vec3(0.45,0.47,0.52), cloud) * (0.25 + 0.75*(1.0-night));
          cloudCol += sunColor * 0.25 * (1.0-night);
          col = mix(col, cloudCol, cov * 0.85);
          col = mix(col, horizon, smoothstep(0.02, -0.12, d.y));
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(skyGeo, skyMat);
    this.sky.frustumCulled = false; this.sky.renderOrder = -10;
    scene.add(this.sky);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = quality !== 'low';
    const sm = quality === 'high' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(sm, sm);
    const S = quality === 'high' ? 70 : 55;
    Object.assign(this.sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 400 });
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun); scene.add(this.sun.target);
    this.moon = new THREE.DirectionalLight(0x9fb4ff, 0.25);
    scene.add(this.moon); scene.add(this.moon.target);

    this.fog = new THREE.Fog(0xcccccc, 60, 520);
    scene.fog = this.fog;

    // Rain: GPU-animated streaks around the camera
    const N = quality === 'low' ? 2500 : 6000;
    const pos = new Float32Array(N * 6), seed = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const x = (Math.random() - 0.5) * 60, y = Math.random() * 30, z = (Math.random() - 0.5) * 60;
      pos.set([x, y, z, x, y, z], i * 6); seed[i * 2] = 0; seed[i * 2 + 1] = 1;
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    rg.setAttribute('endp', new THREE.BufferAttribute(seed, 1));
    this.rainUniforms = { time: { value: 0 }, center: { value: new THREE.Vector3() }, opacity: { value: 0 }, wind: { value: new THREE.Vector2(1.5, 0.5) } };
    const rm = new THREE.ShaderMaterial({
      uniforms: this.rainUniforms, transparent: true, depthWrite: false,
      vertexShader: `attribute float endp; uniform float time; uniform vec3 center; uniform vec2 wind;
        void main(){ vec3 p = position; float fall = mod(p.y - time*22.0, 30.0);
          vec3 w = vec3(mod(p.x - center.x + 30.0, 60.0) - 30.0 + center.x, fall + center.y - 8.0, mod(p.z - center.z + 30.0, 60.0) - 30.0 + center.z);
          w.xz += wind * (fall/30.0);
          w += endp * vec3(wind.x*0.03, 0.55, wind.y*0.03);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(w,1.0); }`,
      fragmentShader: `uniform float opacity; void main(){ gl_FragColor = vec4(0.75,0.8,0.9, opacity); }`,
    });
    this.rainMesh = new THREE.LineSegments(rg, rm);
    this.rainMesh.frustumCulled = false; this.rainMesh.visible = false;
    scene.add(this.rainMesh);

    this.state = { night: 0, sunElev: 0, morning: 0, evening: 0, hour: 7.5 };
    this._cols = { top: new THREE.Color(), hor: new THREE.Color(), fog: new THREE.Color(), sun: new THREE.Color(), hs: new THREE.Color(), hg: new THREE.Color() };
  }

  setWeatherMode(mode) {
    this.mode = mode;
    if (mode === 'clear') this.target = { cloud: 0.05, rain: 0 };
    else if (mode === 'cloudy') this.target = { cloud: 0.75, rain: 0 };
    else if (mode === 'rain') this.target = { cloud: 1, rain: 1 };
  }

  forceWeather(kind) { // used by random events
    this.weather = kind;
    this.target = kind === 'rain' ? { cloud: 1, rain: 1 } : kind === 'cloudy' ? { cloud: 0.7, rain: 0 } : { cloud: 0.1, rain: 0 };
    this.nextWeatherChange = this.hoursAhead(this.rng.float(1.5, 3));
  }
  hoursAhead(h) { return (this.time + h) % 24; }

  update(dt, hoursPerSecond, camPos) {
    const prev = this.time;
    this.time += dt * hoursPerSecond;
    if (this.time >= 24) { this.time -= 24; this.day++; }
    const t = this.time;

    // Dynamic weather: late-monsoon Rajkot, mostly clear with the occasional shower
    if (this.mode === 'dynamic') {
      const crossed = prev <= this.nextWeatherChange && t > this.nextWeatherChange || (prev > t && this.nextWeatherChange < t);
      if (crossed) {
        const r = this.rng.next();
        this.weather = r < 0.55 ? 'clear' : r < 0.82 ? 'cloudy' : 'rain';
        this.forceWeather(this.weather);
      }
    }
    const k = 1 - Math.exp(-dt * 0.35);
    this.cloud = lerp(this.cloud, this.target.cloud, k);
    this.rain = lerp(this.rain, this.target.rain, k * 0.8);
    this.wet = clamp(this.wet + (this.rain > 0.3 ? dt * 0.08 : -dt * 0.01), 0, 1);

    // Sun path: rises ~6:15, sets ~18:45
    const dayT = (t - 6.25) / 12.5; // 0..1 during daylight
    const elev = Math.sin(dayT * Math.PI) * 1.15;
    const az = dayT * Math.PI;
    const sunDir = new THREE.Vector3(Math.cos(az) * 0.9, Math.sin(elev * 0.9), 0.35 + Math.sin(az) * 0.3).normalize();
    this.sunDir = sunDir;
    const night = 1 - smoothstep(-0.12, 0.1, sunDir.y);
    this.state.night = night;
    this.state.sunElev = sunDir.y;
    this.state.hour = t;
    this.state.morning = smoothstep(5.5, 6.5, t) * (1 - smoothstep(9, 10.5, t));
    this.state.evening = smoothstep(17, 18.5, t) * (1 - smoothstep(21, 22.5, t));

    // Keyframe blend
    let i = 0; while (i < KEYS.length - 2 && KEYS[i + 1][0] <= t) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const f = clamp((t - a[0]) / (b[0] - a[0]), 0, 1);
    const C = this._cols;
    lerpColor(C.top, a[1], b[1], f); lerpColor(C.hor, a[2], b[2], f); lerpColor(C.fog, a[3], b[3], f);
    lerpColor(C.sun, a[4], b[4], f); lerpColor(C.hs, a[6], b[6], f); lerpColor(C.hg, a[7], b[7], f);
    const sunI = lerp(a[5], b[5], f), hemiI = lerp(a[8], b[8], f), exposure = lerp(a[9], b[9], f);

    // clouds/rain desaturate and darken
    const grey = new THREE.Color(0x8a9099).multiplyScalar(1 - night * 0.85);
    const cl = this.cloud * 0.7 + this.rain * 0.3;
    C.top.lerp(grey, cl * 0.8); C.hor.lerp(grey, cl * 0.6); C.fog.lerp(grey, cl * 0.7);

    this.skyUniforms.top.value.copy(C.top); this.skyUniforms.horizon.value.copy(C.hor);
    this.skyUniforms.sunDir.value.copy(sunDir); this.skyUniforms.sunColor.value.copy(C.sun);
    this.skyUniforms.night.value = night; this.skyUniforms.cloud.value = this.cloud;
    this.skyUniforms.time.value += dt;

    this.sun.color.copy(C.sun);
    this.sun.intensity = sunI * (1 - this.cloud * 0.6) * (1 - this.rain * 0.3);
    this.hemi.color.copy(C.hs); this.hemi.groundColor.copy(C.hg);
    this.hemi.intensity = hemiI * (1 - this.rain * 0.15) + this.lightning * 3;
    this.moon.intensity = night * 0.6 * (1 - this.cloud * 0.6);
    this.fog.color.copy(C.fog);
    this.fog.near = lerp(70, 25, this.rain) - night * 20;
    this.fog.far = lerp(520, 210, this.rain) - night * 110;
    this.renderer.toneMappingExposure = exposure;

    if (camPos) {
      this.sky.position.copy(camPos);
      const target = new THREE.Vector3(camPos.x, 0, camPos.z);
      this.sun.position.copy(target).addScaledVector(sunDir.y > 0 ? sunDir : sunDir.clone().negate(), 150);
      this.sun.target.position.copy(target);
      this.moon.position.copy(target).addScaledVector(sunDir.clone().negate().setY(Math.abs(sunDir.y) + 0.3), 150);
      this.moon.target.position.copy(target);
      this.rainUniforms.center.value.copy(camPos);
    }
    this.rainUniforms.time.value += dt;
    this.rainUniforms.opacity.value = this.rain * 0.35;
    this.rainMesh.visible = this.rain > 0.02;

    // occasional lightning during heavy rain
    this.lightning = Math.max(0, this.lightning - dt * 4);
    if (this.rain > 0.8 && Math.random() < dt * 0.05) this.lightning = 1;
    return this.state;
  }

  get hourString() {
    const h = Math.floor(this.time), m = Math.floor((this.time - h) * 60);
    const hh = ((h + 11) % 12) + 1;
    return `${hh}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  }
  get phaseName() {
    const t = this.time;
    if (t < 5) return 'Late night'; if (t < 7) return 'Early morning'; if (t < 11) return 'Morning';
    if (t < 16) return 'Afternoon'; if (t < 19) return 'Evening'; if (t < 22.5) return 'Night'; return 'Late night';
  }
}
