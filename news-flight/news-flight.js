// News Flight — fly a broom low over a flower meadow; every balloon carries one item of news.
// Loaded only after the visitor presses PLAY. Visual ideas after Petalwake (MIT, Jacob Miller).
import * as THREE from '../vendor/three/three.module.min.js';
import { records, recordsEnabled, ORIGINAL_RECORD, formatTime } from './records.js';
import { groundH, makeSky, makeClouds, makeCliffs, makeGround, makeGrass, makeFlowers, Petals, SUN_DIR, PALETTE } from './world.js';

const BALLOON_COLORS = ['#ff6f61', '#f2b84b', '#5cc8a8', '#5aa9e6', '#a78bfa', '#f472b6', '#fb923c', '#2dd4bf', '#ef5350', '#6d83e8'];
const PETAL_COLORS = ['#f48fb8', '#f7a8c9', '#fbcfe1', '#ffffff', '#ec6fa6', '#fde7f0'].map((h) => new THREE.Color(h));

function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
const clamp = THREE.MathUtils.clamp;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

function ensureCss() {
  if (document.getElementById('nf-css')) return Promise.resolve();
  return new Promise((res) => {
    const l = document.createElement('link');
    l.id = 'nf-css'; l.rel = 'stylesheet'; l.href = new URL('./news-flight.css', import.meta.url).href;
    l.onload = l.onerror = () => res();
    document.head.appendChild(l);
  });
}

// ------------------------------------------------------------------------------------------
// The rider on her broom (low-poly, built from primitives)
// ------------------------------------------------------------------------------------------
function makeRider() {
  const g = new THREE.Group();
  const tilt = new THREE.Group(); g.add(tilt);
  const M = (hex, rough = 0.8) => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, flatShading: true });
  const wood = M('#8a5a2b'), straw = M('#d9a441'), strawDark = M('#b07f2a'), coat = M('#d39a2c'), coatDark = M('#9c6a1d');
  const skin = M('#f1c9a5'), hair = M('#2b211c'), hat = M('#5e2748'), hatBand = M('#c9a14a', 0.5), boot = M('#3a2a22'), cape = M('#7b2d43');

  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 2.0, 6), wood);
  stick.rotation.x = Math.PI / 2; stick.position.set(0, 0, -0.15); tilt.add(stick);
  const bristles = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.62, 9, 1, true), straw);
  bristles.rotation.x = -Math.PI / 2; bristles.position.set(0, 0, 1.12); tilt.add(bristles);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.07, 8), strawDark);
  band.rotation.x = Math.PI / 2; band.position.set(0, 0, 0.83); tilt.add(band);

  const body = new THREE.Group(); body.position.set(0, 0.06, 0.12); tilt.add(body);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.3, 3, 8), coat);
  torso.position.set(0, 0.36, 0); torso.rotation.x = -0.38; body.add(torso);
  const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.27, 0.32, 8, 1, true), coatDark);
  skirt.position.set(0, 0.12, 0.04); body.add(skirt);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.32, 2, 6), coatDark);
    leg.position.set(0.13 * s, -0.08, -0.12); leg.rotation.set(0.9, 0, 0.25 * s); body.add(leg);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 5), boot);
    b.position.set(0.18 * s, -0.24, -0.3); body.add(b);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.34, 2, 6), coat);
    arm.position.set(0.15 * s, 0.33, -0.22); arm.rotation.set(1.15, 0, -0.18 * s); body.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), skin);
    hand.position.set(0.09 * s, 0.17, -0.42); body.add(hand);
  }
  const head = new THREE.Group(); head.position.set(0, 0.72, -0.12); body.add(head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), skin));
  const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.138, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), hair);
  hairM.rotation.x = 0.5; head.add(hairM);
  const hatG = new THREE.Group(); hatG.position.set(0, 0.09, 0.02); hatG.rotation.x = 0.28; head.add(hatG);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.025, 14), hat); hatG.add(brim);
  const hb = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.175, 0.06, 12), hatBand); hb.position.y = 0.04; hatG.add(hb);
  const cone1 = new THREE.Mesh(new THREE.ConeGeometry(0.165, 0.32, 12), hat); cone1.position.y = 0.2; hatG.add(cone1);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 8), hat); tip.position.set(0, 0.38, 0.06); tip.rotation.x = 0.5; hatG.add(tip);

  // cape: a strip of cloth whose vertices ripple in the wind
  const capeGeo = new THREE.PlaneGeometry(0.42, 0.85, 3, 8);
  capeGeo.translate(0, -0.425, 0);
  const capeMesh = new THREE.Mesh(capeGeo, new THREE.MeshStandardMaterial({ color: '#7b2d43', roughness: 0.85, side: THREE.DoubleSide, flatShading: true }));
  capeMesh.position.set(0, 0.58, 0.1); capeMesh.rotation.x = -1.2; body.add(capeMesh);
  const capeBase = capeGeo.attributes.position.array.slice();

  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return {
    group: g, tilt, hatG, cape: capeMesh,
    animate(t, speedK) {
      const p = capeGeo.attributes.position.array;
      for (let i = 0; i < p.length; i += 3) {
        const y = capeBase[i + 1];                 // 0 .. -0.85 along the cape
        const k = -y / 0.85;
        p[i] = capeBase[i] + Math.sin(t * 14 + k * 5) * 0.03 * k * (0.5 + speedK);
        p[i + 2] = capeBase[i + 2] + Math.sin(t * 11 + k * 6 + capeBase[i] * 4) * 0.09 * k * (0.4 + speedK);
      }
      capeGeo.attributes.position.needsUpdate = true;
      capeMesh.rotation.x = -1.05 - 0.35 * speedK;
      hatG.rotation.z = Math.sin(t * 9) * 0.04 * speedK;
      bristles.scale.set(1 + Math.sin(t * 20) * 0.03 * speedK, 1, 1);
    },
  };
}

// ------------------------------------------------------------------------------------------
// Balloons
// ------------------------------------------------------------------------------------------
function balloonGeometry(R, H) {
  const pts = [];
  pts.push(new THREE.Vector2(0.0001, -H / 2 - 0.12));
  pts.push(new THREE.Vector2(0.09, -H / 2 - 0.06));
  for (let i = 1; i <= 24; i++) {
    const a = (i / 24) * Math.PI;
    let y = -Math.cos(a) * H / 2, r = Math.sin(a) * R;
    if (y < 0) r *= 1 - 0.38 * Math.pow(-y / (H / 2), 2);
    pts.push(new THREE.Vector2(Math.max(r, 0.0001), y));
  }
  return new THREE.LatheGeometry(pts, 28);
}

function tagTexture(text, hex) {
  const W = 256, H = 112;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const r = 26;
  g.fillStyle = '#fffaf1';
  g.beginPath(); if (g.roundRect) g.roundRect(6, 6, W - 12, H - 12, r); else g.rect(6, 6, W - 12, H - 12); g.fill();
  g.lineWidth = 5; g.strokeStyle = hex; g.stroke();
  g.fillStyle = '#1d2a46';
  g.font = '600 52px "Inter", "Helvetica Neue", Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, W / 2, H / 2 + 2);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function ringTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 30, 64, 64, 62);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function blobTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(20,40,10,0.55)'); gr.addColorStop(1, 'rgba(20,40,10,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

// ------------------------------------------------------------------------------------------
// Post: radial speed blur, a touch of chromatic aberration and a vignette (one pass)
// ------------------------------------------------------------------------------------------
function makePost() {
  const mat = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: { tScene: { value: null }, uSpeed: { value: 0 }, uAspect: { value: 1 } },
    vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tScene; uniform float uSpeed, uAspect;
      varying vec2 vUv;
      void main() {
        vec2 c = vUv - vec2(0.5, 0.47);
        float r = length(c * vec2(uAspect, 1.0));
        float blur = uSpeed * 0.055 * smoothstep(0.12, 0.85, r);
        vec3 acc = vec3(0.0);
        for (int i = 0; i < 9; i++) {
          float f = 1.0 - blur * float(i) / 8.0;
          acc += texture2D(tScene, vec2(0.5, 0.47) + c * f).rgb;
        }
        acc /= 9.0;
        float ca = (0.001 + uSpeed * 0.003) * r * r * 4.0;
        acc.r = mix(acc.r, texture2D(tScene, vec2(0.5, 0.47) + c * (1.0 + ca)).r, 0.6);
        acc.b = mix(acc.b, texture2D(tScene, vec2(0.5, 0.47) + c * (1.0 - ca)).b, 0.6);
        acc *= 1.0 - 0.32 * smoothstep(0.45, 1.05, r);
        gl_FragColor = vec4(acc, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false;
  const scene = new THREE.Scene(); scene.add(mesh);
  return { scene, mat, cam: new THREE.Camera() };
}

// ------------------------------------------------------------------------------------------
// Sound: synthesised pop + a soft wind bed (no files)
// ------------------------------------------------------------------------------------------
function makeAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return { pop() {}, wind() {}, setMuted() {}, close() {} };
  const ctx = new AC();
  const master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const windSrc = ctx.createBufferSource(); windSrc.buffer = noise; windSrc.loop = true;
  const windF = ctx.createBiquadFilter(); windF.type = 'bandpass'; windF.frequency.value = 500; windF.Q.value = 0.6;
  const windG = ctx.createGain(); windG.gain.value = 0;
  windSrc.connect(windF).connect(windG).connect(master); windSrc.start();
  let muted = false;
  return {
    pop() {
      if (muted) return;
      const t = ctx.currentTime;
      const s = ctx.createBufferSource(); s.buffer = noise;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1700; f.Q.value = 0.7;
      const gn = ctx.createGain(); gn.gain.setValueAtTime(0.55, t); gn.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      s.connect(f).connect(gn).connect(master); s.start(t); s.stop(t + 0.2);
      const o = ctx.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(880, t); o.frequency.exponentialRampToValueAtTime(220, t + 0.12);
      const og = ctx.createGain(); og.gain.setValueAtTime(0.18, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      o.connect(og).connect(master); o.start(t); o.stop(t + 0.16);
      // a little chime a beat later
      const ch = ctx.createOscillator(); ch.type = 'sine'; ch.frequency.value = 1318.5;
      const cg = ctx.createGain(); cg.gain.setValueAtTime(0.0001, t + 0.06); cg.gain.exponentialRampToValueAtTime(0.09, t + 0.08); cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      ch.connect(cg).connect(master); ch.start(t + 0.06); ch.stop(t + 0.75);
    },
    wind(k) {
      windG.gain.setTargetAtTime(muted ? 0 : 0.012 + 0.05 * k * k, ctx.currentTime, 0.2);
      windF.frequency.setTargetAtTime(380 + 700 * k, ctx.currentTime, 0.2);
    },
    setMuted(m) { muted = m; if (m) windG.gain.setTargetAtTime(0, ctx.currentTime, 0.05); },
    suspend() { ctx.suspend(); }, resume() { ctx.resume(); },
    close() { try { ctx.close(); } catch (e) { /* already closed */ } },
  };
}

// ------------------------------------------------------------------------------------------
// The game
// ------------------------------------------------------------------------------------------
export async function start(stage, { news, onExit, reducedMotion = false }) {
  await ensureCss();
  const touch = matchMedia('(pointer: coarse)').matches;
  const lowPower = touch || (navigator.hardwareConcurrency || 8) <= 4;

  // ---------- DOM ----------
  const root = el('div', 'nf-root');
  root.tabIndex = 0;
  root.setAttribute('role', 'application');
  root.setAttribute('aria-label', 'News Flight game. Fly into balloons to read each news item. Press Escape to return to the list.');
  const canvas = el('canvas', 'nf-canvas');
  root.appendChild(canvas);
  const total = news.length;
  const hud = el('div', 'nf-hud', `
    <div class="nf-tl">
      <div class="nf-count"><b class="nf-got">0</b><span class="nf-of">/ ${total}</span><span class="nf-label">news</span></div>
      <div class="nf-compass" title="Nearest balloon"><svg viewBox="-12 -12 24 24" width="18" height="18" aria-hidden="true"><path d="M0 -9 L6 7 L0 3.5 L-6 7 Z" fill="currentColor"/></svg><span class="nf-dist"></span></div>
    </div>
    <div class="nf-tr">
      <button type="button" class="nf-btn nf-mute" aria-label="Mute sound" title="Sound"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path class="nf-wave" d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg></button>
      <button type="button" class="nf-btn nf-full" aria-label="Full screen" title="Full screen"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg></button>
      <button type="button" class="nf-btn nf-close" aria-label="Back to the news list" title="Back to list (Esc)"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
    </div>
    <div class="nf-hint">${touch
      ? 'Drag to steer &nbsp;·&nbsp; hold <b>Boost</b> to speed up &nbsp;·&nbsp; fly into a balloon to read it'
      : '<kbd>A</kbd><kbd>D</kbd> turn &nbsp; <kbd>W</kbd><kbd>S</kbd> climb / dive &nbsp; <kbd>Shift</kbd> boost &nbsp; <kbd>Space</kbd> slow &nbsp;·&nbsp; or drag with the mouse &nbsp;·&nbsp; fly into a balloon'}</div>
    ${touch ? '<button type="button" class="nf-boost" aria-label="Boost">Boost</button>' : ''}
    <div class="nf-card" aria-live="polite" hidden><div class="nf-card-date"></div><div class="nf-card-text"></div><div class="nf-card-count"></div></div>
  `);
  root.appendChild(hud);
  const loading = el('div', 'nf-loading', '<div class="nf-loading-inner"><div class="nf-loader"><i></i><i></i><i></i></div><p>Growing the meadow…</p></div>');
  root.appendChild(loading);
  const pause = el('button', 'nf-pause', '<span>Paused</span><small>Click to keep flying</small>');
  pause.type = 'button'; pause.hidden = true;
  root.appendChild(pause);
  const done = el('div', 'nf-done');
  done.hidden = true;
  root.appendChild(done);
  stage.appendChild(root);
  await new Promise((r) => requestAnimationFrame(r));

  const $ = (s) => root.querySelector(s);
  const gotEl = $('.nf-got'), compass = $('.nf-compass'), compassSvg = $('.nf-compass svg'), distEl = $('.nf-dist');
  const card = $('.nf-card'), cardDate = $('.nf-card-date'), cardText = $('.nf-card-text'), cardCount = $('.nf-card-count');
  const hint = $('.nf-hint');

  // ---------- renderer ----------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  let pixelRatio = Math.min(window.devicePixelRatio || 1, lowPower ? 1.25 : 1.6);
  renderer.setPixelRatio(pixelRatio);
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(PALETTE.horizon.clone(), 150, 1600);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 5000);

  scene.add(new THREE.HemisphereLight('#cfe3ff', '#6e9a45', 1.35));
  const sun = new THREE.DirectionalLight('#fff1d8', 2.4);
  sun.position.copy(SUN_DIR).multiplyScalar(100);
  scene.add(sun); scene.add(sun.target);

  const sky = makeSky(); scene.add(sky);
  const clouds = makeClouds(); scene.add(clouds);
  const cliffs = makeCliffs(); scene.add(cliffs);
  const ground = makeGround(); scene.add(ground);
  const GR = lowPower ? 64 : 84, FR = lowPower ? 104 : 140;
  const grass = makeGrass(lowPower ? 9000 : 22000, GR); scene.add(grass);
  const flowers = makeFlowers(lowPower ? 18000 : 44000, FR); scene.add(flowers);
  const NR = lowPower ? 40 : 50;
  const flowersNear = makeFlowers(lowPower ? 12000 : 30000, NR, 314, 0.9); scene.add(flowersNear);
  const petals = new Petals(lowPower ? 900 : 1600); scene.add(petals.mesh);

  const rider = makeRider(); scene.add(rider.group);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.4), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; scene.add(shadow);

  // ---------- balloons ----------
  const ringTex = ringTexture();
  const BR = 1.55, BH = 2.05;
  const bGeo = balloonGeometry(BR, BH);
  const balloons = news.map((n, i) => {
    const hex = BALLOON_COLORS[i % BALLOON_COLORS.length];
    const color = new THREE.Color(hex);
    const group = new THREE.Group();
    const body = new THREE.Mesh(bGeo, new THREE.MeshStandardMaterial({ color, roughness: 0.28, metalness: 0.0, emissive: color, emissiveIntensity: 0.12 }));
    group.add(body);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55 }));
    shine.scale.set(0.7, 1.2, 0.4); shine.position.set(-0.62, 0.45, 0.95); group.add(shine);
    const strPts = []; for (let k = 0; k <= 12; k++) strPts.push(new THREE.Vector3(0, -BH / 2 - 0.12 - k * 0.3, 0));
    const strGeo = new THREE.BufferGeometry().setFromPoints(strPts);
    const string = new THREE.Line(strGeo, new THREE.LineBasicMaterial({ color: '#f5efe2', transparent: true, opacity: 0.85 }));
    group.add(string);
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTexture(n.date, hex), fog: false, depthWrite: false }));
    tag.scale.set(1.9, 0.83, 1); tag.position.set(0, -BH / 2 - 0.12 - 3.6 - 0.4, 0);
    group.add(tag);
    // a meandering course ahead of the start, at mixed heights
    const along = 60 + i * 52;
    const side = Math.sin(i * 1.35 + 0.4) * 34 + (i % 2 ? 9 : -9);
    const x = side, z = -along;
    const alt = 6 + ((i * 5) % 4) * 3.2;
    const y = groundH(x, z) + alt;
    group.position.set(x, y, z);
    scene.add(group);
    return { i, n, color, group, body, string, strPts, strGeo, tag, home: new THREE.Vector3(x, y, z), popped: false, phase: i * 1.7 };
  });
  const rings = [];

  // ---------- post ----------
  const post = makePost();
  post.mat.uniforms.tScene.value = rt.texture;

  // ---------- state ----------
  const st = {
    pos: new THREE.Vector3(0, groundH(0, 30) + 3.2, 30), yaw: 0, pitch: 0, roll: 0, speed: 14,
    vel: new THREE.Vector3(), t: 0, timeScale: 1, slowmo: 0, got: 0,
    focused: true, visible: true, running: true, finished: false,
  };
  const camPos = new THREE.Vector3(0, st.pos.y + 2.5, st.pos.z + 7);
  const keys = new Set();
  const drag = { on: false, id: null, x0: 0, y0: 0, dx: 0, dy: 0, btn: 0 };
  let boostTouch = false;
  const wind = new THREE.Vector3(1.6, 0, 0.7);
  const fwd = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  let petalAcc = 0, ambAcc = 0;

  // ---------- input ----------
  const GAME_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space'];
  const onKey = (e) => {
    if (e.target && e.target.tagName === 'INPUT') return;
    if (e.type === 'keydown' && e.code === 'Escape') {
      if (document.fullscreenElement) return;        // the browser leaves full screen first
      e.preventDefault(); exit(); return;
    }
    if (!GAME_KEYS.includes(e.code)) return;
    e.preventDefault();
    if (e.type === 'keydown') keys.add(e.code); else keys.delete(e.code);
  };
  root.addEventListener('keydown', onKey);
  root.addEventListener('keyup', onKey);
  root.addEventListener('blur', () => { keys.clear(); });
  canvas.addEventListener('pointerdown', (e) => {
    root.focus({ preventScroll: true });
    drag.on = true; drag.id = e.pointerId; drag.x0 = e.clientX; drag.y0 = e.clientY; drag.dx = drag.dy = 0; drag.btn = e.button;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag.on || e.pointerId !== drag.id) return;
    drag.dx = e.clientX - drag.x0; drag.dy = e.clientY - drag.y0;
  });
  const endDrag = (e) => { if (e.pointerId === drag.id) { drag.on = false; drag.dx = drag.dy = 0; } };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  const boostBtn = $('.nf-boost');
  if (boostBtn) {
    boostBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); boostTouch = true; boostBtn.classList.add('is-on'); });
    const off = () => { boostTouch = false; boostBtn.classList.remove('is-on'); };
    boostBtn.addEventListener('pointerup', off); boostBtn.addEventListener('pointercancel', off); boostBtn.addEventListener('pointerleave', off);
  }

  // ---------- audio + buttons ----------
  const audio = makeAudio();
  let muted = false;
  $('.nf-mute').addEventListener('click', () => {
    muted = !muted; audio.setMuted(muted);
    $('.nf-mute').classList.toggle('is-muted', muted);
    $('.nf-mute').setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
  });
  const fsBtn = $('.nf-full');
  const canFS = !!(stage.requestFullscreen || stage.webkitRequestFullscreen);
  fsBtn.addEventListener('click', async () => {
    const isFS = document.fullscreenElement === stage || stage.classList.contains('nf-pseudo-fs');
    if (isFS) {
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      stage.classList.remove('nf-pseudo-fs');
    } else if (canFS) {
      await (stage.requestFullscreen ? stage.requestFullscreen() : stage.webkitRequestFullscreen())?.catch?.(() => stage.classList.add('nf-pseudo-fs'));
    } else stage.classList.add('nf-pseudo-fs');
    root.focus({ preventScroll: true });
  });
  $('.nf-close').addEventListener('click', () => exit());
  pause.addEventListener('click', () => { root.focus({ preventScroll: true }); });

  // pause when the page loses focus (keys would go elsewhere) or the game scrolls out of view
  const onFocusIn = () => { st.focused = true; pause.hidden = true; };
  const onFocusOut = () => {
    setTimeout(() => {
      if (!root.contains(document.activeElement) && !st.finished && st.running) { st.focused = false; pause.hidden = false; }
    }, 0);
  };
  root.addEventListener('focusin', onFocusIn);
  root.addEventListener('focusout', onFocusOut);
  const io = new IntersectionObserver(([en]) => { st.visible = en.isIntersecting; }, { threshold: 0.15 });
  io.observe(root);
  const onVis = () => { if (document.hidden) audio.suspend?.(); else audio.resume?.(); };
  document.addEventListener('visibilitychange', onVis);

  // ---------- size ----------
  const resize = () => {
    const w = Math.max(1, root.clientWidth), h = Math.max(1, root.clientHeight);
    renderer.setSize(w, h, false);
    rt.setSize(Math.floor(w * pixelRatio), Math.floor(h * pixelRatio));
    camera.aspect = w / h; camera.updateProjectionMatrix();
    post.mat.uniforms.uAspect.value = w / h;
  };
  const ro = new ResizeObserver(resize); ro.observe(root); resize();

  // ---------- records: each flight is timed by the server from start to the last balloon ----------
  let run = null;
  const startRun = () => {
    run = { idP: recordsEnabled ? records.start().catch(() => null) : Promise.resolve(null), local: 0, ms: null, completeP: null, saved: null };
  };
  const completeRun = () => {
    const r = run;
    r.completeP = r.idP
      .then((id) => (id ? records.complete(id).then((ms) => { r.ms = ms; r.id = id; return ms; }) : null))
      .catch(() => null);
  };

  // ---------- news card ----------
  let cardTimer = 0;
  const showCard = (b) => {
    cardDate.textContent = b.n.date;
    cardDate.style.setProperty('--c', '#' + b.color.getHexString(THREE.SRGBColorSpace));
    cardText.innerHTML = b.n.html;
    cardText.querySelectorAll('a').forEach((a) => { a.target = '_blank'; a.rel = 'noopener noreferrer'; });
    cardCount.textContent = `${st.got} / ${total}`;
    card.hidden = false;
    card.classList.remove('is-in'); void card.offsetWidth; card.classList.add('is-in');
    cardTimer = 7;
  };

  const TROPHY = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M7 4h10v3a5 5 0 0 1-10 0V4zM5 5H3v1.5A3.5 3.5 0 0 0 6.5 10M19 5h2v1.5A3.5 3.5 0 0 1 17.5 10M12 12v4M8.5 20h7M9.5 16h5v4h-5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  const showDone = () => {
    st.finished = true;
    card.classList.remove('is-in'); card.hidden = true; cardTimer = 0;
    renderSummary();
    done.hidden = false;
    requestAnimationFrame(() => done.classList.add('is-in'));
    done.querySelector('.nf-done-again').focus({ preventScroll: true });
  };

  function renderSummary() {
    const items = news.map((n, i) => `<li><span class="nf-done-date" style="--c:${BALLOON_COLORS[i % BALLOON_COLORS.length]}">${n.date}</span><span>${n.html}</span></li>`).join('');
    done.innerHTML = `<div class="nf-done-card"><p class="nf-done-kicker">All ${total} balloons caught <span class="nf-done-time"></span></p><h3>That’s all the news — thanks for flying by.</h3><ol>${items}</ol>
      <div class="nf-done-actions"><button type="button" class="nf-rec-open">${TROPHY}Type Your Records</button><span class="nf-done-right"><button type="button" class="nf-done-again">Fly again</button><button type="button" class="nf-done-back">Back to the list</button></span></div></div>`;
    done.querySelectorAll('a').forEach((a) => { a.target = '_blank'; a.rel = 'noopener noreferrer'; });
    const timeEl = done.querySelector('.nf-done-time');
    const r = run;
    timeEl.textContent = '· ' + formatTime((r.ms ?? r.local * 1000));
    if (r.completeP) r.completeP.then((ms) => { if (ms != null && timeEl.isConnected) timeEl.textContent = '· ' + formatTime(ms); });
    done.querySelector('.nf-done-again').addEventListener('click', reset);
    done.querySelector('.nf-done-back').addEventListener('click', () => exit());
    done.querySelector('.nf-rec-open').addEventListener('click', openRecords);
  }

  function openRecords() {
    const r = run;
    done.innerHTML = `<div class="nf-done-card nf-rec">
      <div class="nf-rec-head"><button type="button" class="nf-rec-back" aria-label="Back to the summary"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <div><p class="nf-done-kicker">${TROPHY} Records</p><h3>Fastest flights through the news</h3></div></div>
      <form class="nf-rec-form" novalidate>
        <div class="nf-rec-you"><span>Your flight</span><b class="nf-rec-you-time">…</b></div>
        <div class="nf-rec-row"><input type="text" name="player" maxlength="24" placeholder="Type your name" autocomplete="nickname" spellcheck="false" aria-label="Your name for the records board"><button type="submit">Save</button></div>
        <p class="nf-rec-msg">Leave it blank if you’d rather not be on the board — nothing is recorded without a name.</p>
      </form>
      <ol class="nf-rec-list" aria-label="Records board"><li class="nf-rec-note">Loading the board…</li></ol>
    </div>`;
    const $$ = (q) => done.querySelector(q);
    const form = $$('.nf-rec-form'), input = $$('input'), saveBtn = $$('.nf-rec-row button'), msg = $$('.nf-rec-msg'), youTime = $$('.nf-rec-you-time'), list = $$('.nf-rec-list');
    $$('.nf-rec-back').addEventListener('click', () => { renderSummary(); done.querySelector('.nf-rec-open').focus({ preventScroll: true }); });
    try { input.value = localStorage.getItem('nf-name') || ''; } catch (e) { /* storage blocked */ }

    const lock = (text, cls) => { input.disabled = true; saveBtn.disabled = true; msg.textContent = text; msg.className = 'nf-rec-msg' + (cls ? ' ' + cls : ''); };
    const showSaved = () => { input.value = r.saved.name; lock(`Saved — you’re #${r.saved.rank} on the board.`, 'is-ok'); saveBtn.textContent = 'Saved'; };

    const renderList = (rows, totalRows, failed) => {
      list.textContent = '';
      const entries = rows.map((x, i) => ({ name: x.name, ms: x.ms, rank: i + 1 }));
      const mine = r.saved;
      if (mine && !entries.some((x) => x.rank === mine.rank && x.ms === mine.ms)) entries.push({ gap: true }, { name: mine.name, ms: mine.ms, rank: mine.rank });
      if (totalRows > entries.filter((x) => !x.gap).length && !(mine && mine.rank === totalRows)) entries.push({ gap: true });
      entries.push({ name: ORIGINAL_RECORD.name, label: ORIGINAL_RECORD.label, rank: totalRows + 1, original: true });
      for (const x of entries) {
        const li = document.createElement('li');
        if (x.gap) { li.className = 'nf-rec-gap'; li.textContent = '⋯'; list.appendChild(li); continue; }
        if (x.original) li.classList.add('is-original');
        if (mine && x.rank === mine.rank && x.ms === mine.ms && x.name === mine.name) li.classList.add('is-you');
        const rank = document.createElement('span'); rank.className = 'nf-rec-rank'; rank.textContent = x.rank;
        const name = document.createElement('span'); name.className = 'nf-rec-name'; name.textContent = x.name;
        if (x.original) { const tag = document.createElement('small'); tag.textContent = 'the original flight'; name.appendChild(tag); }
        const time = document.createElement('span'); time.className = 'nf-rec-time'; time.textContent = x.label || formatTime(x.ms);
        li.append(rank, name, time);
        list.appendChild(li);
      }
      if (failed && recordsEnabled) {
        const li = document.createElement('li'); li.className = 'nf-rec-note';
        li.textContent = 'Couldn’t load the other flights just now.';
        list.insertBefore(li, list.firstChild);
      }
    };
    const loadList = () => (recordsEnabled ? records.top(10) : Promise.reject(new Error('off')))
      .then(({ rows, total: t }) => renderList(rows, t, false))
      .catch(() => renderList([], 0, true));

    youTime.textContent = formatTime(r.ms ?? r.local * 1000);
    if (r.saved) showSaved();
    else if (!recordsEnabled) lock('The shared records board isn’t switched on yet, so this flight can’t be saved.');
    else {
      saveBtn.disabled = true;
      Promise.resolve(r.completeP).then((ms) => {
        if (!done.contains(form)) return;
        if (ms == null) { lock('Couldn’t reach the records board just now, so this flight can’t be saved.'); return; }
        youTime.textContent = formatTime(ms);
        saveBtn.disabled = false;
      });
    }
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (r.saved || saveBtn.disabled) return;
      const player = input.value.trim();
      if (!player) { msg.textContent = 'Type a name to save — or just go back, and nothing is recorded.'; msg.className = 'nf-rec-msg is-warn'; input.focus(); return; }
      saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
      records.save(r.id, player).then((res) => {
        r.saved = res;
        try { localStorage.setItem('nf-name', res.name); } catch (err) { /* storage blocked */ }
        showSaved(); loadList();
      }).catch((err) => {
        saveBtn.disabled = false; saveBtn.textContent = 'Save';
        msg.textContent = err.server ? err.message : 'Couldn’t reach the records board — please try again.';
        msg.className = 'nf-rec-msg is-warn';
      });
    });
    loadList();
    if (!input.disabled) setTimeout(() => input.focus({ preventScroll: true }), 50);
  }

  function reset() {
    st.got = 0; st.finished = false; gotEl.textContent = '0';
    for (const b of balloons) { b.popped = false; b.group.visible = true; b.group.scale.setScalar(1); }
    st.pos.set(0, groundH(0, 30) + 3.2, 30); st.yaw = 0; st.pitch = 0; st.speed = 14;
    done.classList.remove('is-in'); done.hidden = true; card.hidden = true;
    startRun();
    root.focus({ preventScroll: true });
  }

  const pop = (b) => {
    b.popped = true; st.got++;
    gotEl.textContent = String(st.got);
    gotEl.parentElement.classList.remove('is-bump'); void gotEl.offsetWidth; gotEl.parentElement.classList.add('is-bump');
    audio.pop();
    const p = b.group.position;
    const tints = [b.color, b.color.clone().offsetHSL(0.03, 0, 0.12), new THREE.Color('#ffffff'), new THREE.Color('#f2c14e')];
    for (let k = 0; k < 90; k++) {
      tmp.set(Math.random() - 0.5, Math.random() - 0.35, Math.random() - 0.5).normalize().multiplyScalar(5 + Math.random() * 9);
      petals.spawn(p.x + tmp.x * 0.15, p.y + tmp.y * 0.15, p.z + tmp.z * 0.15, tmp.x + st.vel.x * 0.3, tmp.y + 2, tmp.z + st.vel.z * 0.3,
        tints[k % tints.length], 0.22 + Math.random() * 0.18, 1.8 + Math.random() * 1.4, 1);
    }
    for (let k = 0; k < 40; k++) {
      tmp.set(Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5).normalize().multiplyScalar(4 + Math.random() * 6);
      petals.spawn(p.x, p.y, p.z, tmp.x, tmp.y + 1.5, tmp.z, PETAL_COLORS[k % PETAL_COLORS.length], 0.3 + Math.random() * 0.25, 2.5 + Math.random() * 2, 0);
    }
    const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, color: b.color, transparent: true, depthWrite: false, fog: false }));
    ring.position.copy(p); ring.scale.setScalar(0.5); scene.add(ring);
    rings.push({ s: ring, t: 0 });
    if (!reducedMotion) st.slowmo = 0.45;
    showCard(b);
    if (st.got === total) { completeRun(); setTimeout(() => { if (!disposed) showDone(); }, 1600); }
  };

  // ---------- loop ----------
  let disposed = false, raf = 0, last = performance.now(), fpsAcc = 0, fpsN = 0, fpsChecked = false;
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    let dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!st.visible || document.hidden) return;
    const playing = st.focused && !st.finished;

    // adaptive resolution after the first couple of seconds
    if (!fpsChecked) {
      fpsAcc += dt; fpsN++;
      if (fpsAcc > 2.5) {
        fpsChecked = true;
        const fps = fpsN / fpsAcc;
        if (fps < 42 && pixelRatio > 0.9) { pixelRatio = Math.max(0.85, pixelRatio * 0.72); renderer.setPixelRatio(pixelRatio); resize(); }
      }
    }

    if (st.slowmo > 0) { st.slowmo -= dt; st.timeScale = damp(st.timeScale, 0.35, 18, dt); }
    else st.timeScale = damp(st.timeScale, 1, 5, dt);
    const realDt = dt;
    if (playing && run) run.local += realDt;
    if (!st.focused && !st.finished) dt = 0;      // paused: freeze the world, keep drawing it
    dt *= st.timeScale;
    st.t += dt;

    // --- controls
    let turn = 0, climb = 0, boost = false, brake = false;
    if (playing) {
      if (keys.has('KeyA') || keys.has('ArrowLeft')) turn += 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) turn -= 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) climb += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) climb -= 1;
      boost = keys.has('ShiftLeft') || keys.has('ShiftRight') || boostTouch;
      brake = keys.has('Space');
      if (drag.on) {
        const s = touch ? 90 : 140;
        turn += clamp(-drag.dx / s, -1, 1);
        climb += clamp(-drag.dy / s, -1, 1);
        if (!touch && drag.btn === 2) brake = true;
      }
      turn = clamp(turn, -1, 1); climb = clamp(climb, -1, 1);
    }

    // --- flight
    const target = boost ? 33 : brake ? 8 : 19;
    st.speed = damp(st.speed, playing ? target : 10, boost ? 1.6 : 1.2, dt);
    st.yaw += turn * (1.25 + 0.35 * (1 - st.speed / 33)) * dt;
    const alt = st.pos.y - groundH(st.pos.x, st.pos.z);
    let pitchT = climb * 0.55;
    if (climb === 0) pitchT = clamp((4.0 - alt) * 0.05, -0.18, 0.18) * 0.6;   // gently hold a low cruise
    st.pitch = damp(st.pitch, pitchT, 3, dt);
    st.roll = damp(st.roll, turn * 0.62 + climb * 0.0, 4, dt);
    // keep inside a friendly radius
    const rad = Math.hypot(st.pos.x, st.pos.z + 220);
    if (rad > 700) {
      const toC = Math.atan2(-(st.pos.x), -(st.pos.z + 220));
      let dyaw = Math.atan2(Math.sin(toC - (st.yaw + Math.PI)), Math.cos(toC - (st.yaw + Math.PI)));
      st.yaw += clamp(dyaw, -1, 1) * 0.8 * dt;
    }
    fwd.set(-Math.sin(st.yaw) * Math.cos(st.pitch), Math.sin(st.pitch), -Math.cos(st.yaw) * Math.cos(st.pitch));
    st.vel.copy(fwd).multiplyScalar(st.speed);
    st.pos.addScaledVector(st.vel, dt);
    const gh = groundH(st.pos.x, st.pos.z);
    if (st.pos.y < gh + 0.85) { st.pos.y = gh + 0.85; if (st.pitch < 0) st.pitch *= 0.5; }
    if (st.pos.y > gh + 48) st.pos.y = damp(st.pos.y, gh + 48, 4, dt);
    const speedK = clamp((st.speed - 8) / 25, 0, 1);

    // rider pose
    rider.group.position.copy(st.pos);
    rider.group.rotation.set(0, st.yaw, 0);
    rider.tilt.rotation.set(st.pitch * 0.9 + Math.sin(st.t * 2.2) * 0.02, 0, st.roll);
    rider.tilt.position.y = Math.sin(st.t * 2.6) * 0.06;
    rider.animate(st.t, speedK);
    shadow.position.set(st.pos.x, gh + 0.06, st.pos.z);
    shadow.rotation.z = -st.yaw;
    shadow.material.opacity = clamp(1 - (alt - 0.8) / 10, 0, 1);

    // --- petals torn up by the wake
    const lowK = 1 - THREE.MathUtils.smoothstep(alt, 1.2, 7.5);
    petalAcc += dt * lowK * (30 + 320 * speedK * speedK);
    tmp2.set(Math.cos(st.yaw), 0, -Math.sin(st.yaw));         // right vector
    while (petalAcc > 1) {
      petalAcc -= 1;
      const side = (Math.random() - 0.5) * 2;
      const back = 0.5 + Math.random() * 3.5;
      const x = st.pos.x - fwd.x * back + tmp2.x * side * 2.6;
      const z = st.pos.z - fwd.z * back + tmp2.z * side * 2.6;
      const y = groundH(x, z) + 0.35 + Math.random() * 0.3;
      const out = 2 + Math.random() * 4.5 * (0.4 + speedK);
      petals.spawn(x, y, z,
        tmp2.x * side * out + st.vel.x * 0.28, 1.5 + Math.random() * 3.5 * (0.5 + speedK), tmp2.z * side * out + st.vel.z * 0.28,
        PETAL_COLORS[(Math.random() * PETAL_COLORS.length) | 0], 0.11 + Math.random() * 0.13, 2.5 + Math.random() * 3.2, 0);
    }
    // a few petals always drifting through the air around you
    ambAcc += dt * 14;
    while (ambAcc > 1) {
      ambAcc -= 1;
      const a = Math.random() * 6.283, r = 6 + Math.random() * 30;
      const x = st.pos.x + Math.cos(a) * r + fwd.x * 15, z = st.pos.z + Math.sin(a) * r + fwd.z * 15;
      petals.spawn(x, groundH(x, z) + 1 + Math.random() * 7, z, wind.x, 0.3, wind.z, PETAL_COLORS[(Math.random() * 6) | 0], 0.12 + Math.random() * 0.1, 4 + Math.random() * 3, 0);
    }
    petals.update(dt, st.t, wind, st.pos, st.vel);

    // --- balloons
    let nearest = null, nd = Infinity;
    for (const b of balloons) {
      if (b.popped) {
        if (b.group.visible) { b.group.scale.multiplyScalar(Math.max(0, 1 - dt * 12)); if (b.group.scale.x < 0.05) b.group.visible = false; }
        continue;
      }
      const bob = Math.sin(st.t * 0.9 + b.phase) * 0.55;
      b.group.position.set(b.home.x + Math.sin(st.t * 0.4 + b.phase) * 0.6, b.home.y + bob, b.home.z);
      b.body.rotation.y = st.t * 0.3 + b.phase;
      b.group.rotation.z = Math.sin(st.t * 0.7 + b.phase) * 0.06;
      // string sways
      for (let k = 0; k < b.strPts.length; k++) {
        const kk = k / (b.strPts.length - 1);
        b.strPts[k].x = Math.sin(st.t * 1.6 + b.phase + kk * 2.5) * 0.25 * kk;
      }
      b.strGeo.setFromPoints(b.strPts);
      b.tag.position.x = b.strPts[b.strPts.length - 1].x;
      const d = tmp.copy(b.group.position).sub(st.pos);
      const dist = d.length();
      if (dist < nd) { nd = dist; nearest = b; }
      tmp.copy(st.pos); tmp.y += 0.5;
      if (playing && tmp.distanceTo(b.group.position) < BR * 1.05 + 0.7) pop(b);
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]; r.t += dt;
      r.s.scale.setScalar(0.5 + r.t * 16); r.s.material.opacity = Math.max(0, 1 - r.t / 0.4);
      if (r.t > 0.4) { scene.remove(r.s); r.s.material.dispose(); rings.splice(i, 1); }
    }

    // --- camera: chase from behind and a little above
    const back = 6.2 + speedK * 1.4, up = 2.0 + speedK * 0.3;
    tmp.set(st.pos.x + Math.sin(st.yaw) * back, st.pos.y + up - st.pitch * 2.0, st.pos.z + Math.cos(st.yaw) * back);
    const cg = groundH(tmp.x, tmp.z) + 0.9;
    if (tmp.y < cg) tmp.y = cg;
    camPos.x = damp(camPos.x, tmp.x, 6, dt); camPos.y = damp(camPos.y, tmp.y, 5, dt); camPos.z = damp(camPos.z, tmp.z, 6, dt);
    camera.position.copy(camPos);
    camera.lookAt(st.pos.x - Math.sin(st.yaw) * 9, st.pos.y + 0.9 + st.pitch * 3, st.pos.z - Math.cos(st.yaw) * 9);
    if (!reducedMotion) camera.rotateZ(-st.roll * 0.12);
    const fov = 60 + speedK * 16;
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = damp(camera.fov, fov, 3, dt); camera.updateProjectionMatrix(); }

    // --- world follows
    sky.position.copy(camera.position);
    clouds.userData.update(camera.position, st.t);
    cliffs.position.set(camera.position.x, 0, camera.position.z);
    ground.userData.update(camera.position);
    sun.position.copy(st.pos).addScaledVector(SUN_DIR, 100); sun.target.position.copy(st.pos);
    const wakeW = speedK * 0.85 + 0.15;
    for (const [m, R] of [[grass, GR], [flowers, FR], [flowersNear, NR]]) {
      const u = m.material.uniforms;
      u.uTime.value = st.t;
      u.uCenter.value.set(camera.position.x - Math.sin(st.yaw) * R * 0.28, camera.position.z - Math.cos(st.yaw) * R * 0.28);
      u.uRider.value.set(st.pos.x, st.pos.y, st.pos.z, wakeW);
    }

    // --- HUD
    if (nearest && !st.finished) {
      compass.hidden = false;
      const a = Math.atan2(nearest.group.position.x - st.pos.x, nearest.group.position.z - st.pos.z);
      const rel = a - (st.yaw + Math.PI);
      compassSvg.style.transform = `rotate(${-rel * 180 / Math.PI}deg)`;
      distEl.textContent = `${Math.round(nd)} m`;
      compass.style.setProperty('--c', '#' + nearest.color.getHexString(THREE.SRGBColorSpace));
    } else compass.hidden = true;
    if (cardTimer > 0 && dt > 0) { cardTimer -= realDt; if (cardTimer <= 0) card.classList.remove('is-in'); }
    audio.wind(playing ? speedK : 0);
    if (st.t > 10 && !hint.classList.contains('is-out')) hint.classList.add('is-out');

    // --- render
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    post.mat.uniforms.uSpeed.value = damp(post.mat.uniforms.uSpeed.value, playing && !reducedMotion ? speedK : 0, 4, dt);
    renderer.render(post.scene, post.cam);
  };

  // warm up shaders, then reveal
  renderer.compile(scene, camera);
  raf = requestAnimationFrame(frame);
  setTimeout(() => {
    loading.classList.add('is-out');
    setTimeout(() => loading.remove(), 600);
    startRun();
    root.focus({ preventScroll: true });
  }, 250);

  function exit() {
    if (disposed) return;
    if (document.fullscreenElement === stage) document.exitFullscreen().catch(() => {});
    stage.classList.remove('nf-pseudo-fs');
    destroy();
    onExit?.();
  }

  function destroy() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    ro.disconnect(); io.disconnect();
    document.removeEventListener('visibilitychange', onVis);
    audio.close();
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { for (const m of [].concat(o.material)) { for (const v of Object.values(m)) if (v && v.isTexture) v.dispose(); m.dispose(); } }
    });
    rt.dispose(); post.mat.dispose();
    renderer.dispose();
    renderer.forceContextLoss?.();
    root.remove();
  }

  root.__nf = { st, balloons };   // handle for automated visual tests
  return { destroy, exit };
}
