import * as THREE from 'three';
import GUI from 'lil-gui';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { createAstronautScene } from './scenes/astronaut';
import { createDunesScene } from './scenes/dunes';
import { createFarmhouseScene } from './scenes/farmhouse';
import { createGlacierScene } from './scenes/glacier';
import { createTideScene } from './scenes/tide';
import type { BlackholeScene } from './scenes/types';
import { Director } from './ui/director';
import { Hud } from './ui/hud';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const query = new URLSearchParams(location.search);
const pixelRatio = Math.min(Number(query.get('dpr')) || window.devicePixelRatio, 1.5);

// Scenes are built on first use (or ahead of time when the browser is idle).
const registry: { id: string; label: string; caption: string; create: (r: THREE.WebGLRenderer) => BlackholeScene }[] = [
  { id: 'astronaut', label: 'Astronaut', caption: 'A violet field, and the disk laid flat across the sky.', create: createAstronautScene },
  { id: 'farmhouse', label: 'Farmhouse', caption: 'Wheat, a porch light, and a sky falling inward.', create: createFarmhouseScene },
  { id: 'tide', label: 'Tide', caption: 'The pier ends where the light starts to bend.', create: createTideScene },
  { id: 'dunes', label: 'Dunes', caption: 'A trailer parked at the edge of spacetime.', create: createDunesScene },
  { id: 'glacier', label: 'Glacier', caption: 'Ice keeps a second copy of the disk.', create: createGlacierScene },
];
const scenes: (BlackholeScene | undefined)[] = registry.map(() => undefined);
const byId = (id: string) => registry.findIndex((s) => s.id === id);
let viewSize = { w: 1, h: 1 };
function getScene(i: number): BlackholeScene {
  let s = scenes[i];
  if (!s) {
    s = scenes[i] = registry[i].create(renderer);
    s.base.setSize(viewSize.w, viewSize.h, pixelRatio);
  }
  return s;
}

// Final cross-fade of the two graded scene outputs to the screen.
const blend = new FullScreenQuad(
  new THREE.ShaderMaterial({
    uniforms: { tA: { value: null }, tB: { value: null }, uMix: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform sampler2D tA, tB;
      uniform float uMix;
      void main() {
        vec3 a = texture2D(tA, vUv).rgb;
        vec3 b = uMix > 0.0 ? texture2D(tB, vUv).rgb : a;
        float t = uMix * uMix * (3.0 - 2.0 * uMix);
        gl_FragColor = vec4(mix(a, b, t), 1.0);
      }`,
    depthTest: false,
    depthWrite: false,
  }),
);
const blendU = (blend.material as THREE.ShaderMaterial).uniforms;

// ---------------------------------------------------------------- state

let current = Math.max(0, byId(location.hash.slice(1)));
let previous = -1;
let mix = 1; // 0..1 progress of the cross-fade from previous to current
const FADE_SECONDS = 1.6;

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
const nav = document.querySelector('.selector')!;
const buttons = registry.map((r, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.scene = r.id;
  b.innerHTML = `<span class="num">${ROMAN[i]}</span><span class="name">${r.label}</span>`;
  nav.append(b);
  return b;
});
function syncButtons() {
  for (const b of buttons) b.setAttribute('aria-current', String(b.dataset.scene === registry[current].id));
}

const fade = document.getElementById('fade')!;
const director = new Director(fade);
const hud = new Hud();
hud.setScene(registry[current].label, registry[current].caption, ROMAN[current]);

function select(index: number) {
  if (index === current || index < 0) return;
  previous = current;
  current = index;
  mix = 0;
  director.reset();
  hud.setScene(registry[index].label, registry[index].caption, ROMAN[index]);
  if (location.hash.slice(1) !== registry[index].id) history.replaceState(null, '', '#' + registry[index].id);
  syncButtons();
  if (gui) buildGui();
  reference.update();
}

for (const b of buttons) b.addEventListener('click', () => select(byId(b.dataset.scene!)));
window.addEventListener('hashchange', () => select(byId(location.hash.slice(1))));
syncButtons();

// ---------------------------------------------------------------- input

const pointer = new THREE.Vector2();
let idleTimer = 0;
function wake() {
  document.body.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => document.body.classList.add('idle'), 2800);
}
window.addEventListener('pointermove', (e) => {
  pointer.set((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1));
  wake();
});
document.documentElement.addEventListener('pointerleave', () => pointer.set(0, 0));
wake();

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  const k = e.key.toLowerCase();
  const n = Number(k);
  if (n >= 1 && n <= registry.length) select(n - 1);
  else if (k === 'arrowright') select((current + 1) % registry.length);
  else if (k === 'arrowleft') select((current + registry.length - 1) % registry.length);
  else if (k === 'h') document.body.classList.toggle('ui-hidden');
  else if (k === 'g') toggleGui();
  else if (k === 'r' && import.meta.env.DEV) reference.toggle();
  else if (k === 'p') parallaxOn = !parallaxOn;
  else if (k === 'c') toggleCinematic();
  else if (k === 'f') toggleFullscreen();
});
let parallaxOn = !query.has('still');

function toggleCinematic() {
  director.enabled = !director.enabled;
  if (director.enabled) director.reset();
}
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
}
director.enabled = !query.has('still');
document.getElementById('btn-cine')!.addEventListener('click', toggleCinematic);
document.getElementById('btn-full')!.addEventListener('click', toggleFullscreen);
document.getElementById('btn-hide')!.addEventListener('click', () => document.body.classList.toggle('ui-hidden'));

// ---------------------------------------------------------------- dev: reference overlay + GUI

const refImg = document.getElementById('ref') as HTMLImageElement;
const reference = {
  shown: query.has('ref'),
  opacity: 0.5,
  toggle() {
    this.shown = !this.shown;
    this.update();
  },
  update() {
    refImg.hidden = !this.shown;
    refImg.style.opacity = String(this.opacity);
    if (this.shown) refImg.src = `/ref/${registry[current].id}.jpg`;
  },
};
reference.update();

let gui: GUI | null = null;
const fps = { value: 0 };
function buildGui() {
  gui?.destroy();
  gui = new GUI({ title: `Tune: ${registry[current].label}` });
  gui.add(fps, 'value').name('fps').listen().disable();
  if (import.meta.env.DEV) {
    // Reference images live in ref/ (git-ignored) and are only served by the dev server.
    gui.add(reference, 'shown').name('reference (R)').onChange(() => reference.update());
    gui.add(reference, 'opacity', 0, 1).name('ref opacity').onChange(() => reference.update());
  }
  gui.add(
    {
      copy: () => {
        const json = JSON.stringify(getScene(current).params, null, 2);
        navigator.clipboard?.writeText(json).catch(() => {});
        console.log(json);
      },
    },
    'copy',
  ).name('copy preset JSON');
  getScene(current).buildGui(gui);
}
function toggleGui() {
  if (gui) {
    gui.destroy();
    gui = null;
  } else buildGui();
}
if (query.has('gui')) buildGui();

// ---------------------------------------------------------------- size + loop

function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(w, h, false);
  viewSize = { w, h };
  for (const s of scenes) s?.base.setSize(w, h, pixelRatio);
}
window.addEventListener('resize', resize);
resize();

const timer = new THREE.Timer();
let frames = 0;
let fpsTime = 0;
let first = true;

function frame() {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.1);
  const time = timer.getElapsed();

  const pointerNow = parallaxOn ? pointer : new THREE.Vector2();
  const active = getScene(current);
  director.update(dt, active.shots, active.base.rig.offset);
  const draw = (i: number) => {
    const s = getScene(i);
    s.base.rig.setPointer(pointerNow.x, pointerNow.y);
    s.update(dt, time);
    return s.base.render(renderer, dt, time);
  };

  if (mix < 1 && previous >= 0) {
    mix = Math.min(1, mix + dt / FADE_SECONDS);
    blendU.tA.value = draw(previous);
    blendU.tB.value = draw(current);
    blendU.uMix.value = mix;
  } else {
    blendU.tA.value = draw(current);
    blendU.uMix.value = 0;
  }
  renderer.setRenderTarget(null);
  blend.render(renderer);

  if (first) {
    first = false;
    prewarm();
  }
  hud.update(dt, {
    alt: active.base.rig.camera.position.y,
    horizon: active.base.P.sky.dist,
    time,
    fps: fps.value,
    cinematic: director.enabled,
  });
  frames++;
  fpsTime += dt;
  if (fpsTime > 0.5) {
    fps.value = Math.round(frames / fpsTime);
    frames = 0;
    fpsTime = 0;
  }
}
renderer.setAnimationLoop(frame);

// Build the other scenes one at a time while the browser is idle, and compile their
// shaders, so switching later does not stall.
function prewarm() {
  const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 200));
  const next = () => {
    const i = scenes.findIndex((s) => !s);
    if (i < 0) return;
    const s = getScene(i);
    renderer.compileAsync(s.base.scene, s.base.rig.camera).finally(() => idle(next));
  };
  idle(next);
}

// Debug hook for automated screenshots: window.__bh.select(i), window.__bh.scenes / get(i).
Object.assign(window, { __bh: { select, scenes, get: getScene, renderer, director } });
