import * as THREE from 'three';
import type GUI from 'lil-gui';
import { addParams } from '../dev/gui';
import { SceneBase, type BasePreset } from './base';
import { addModel, createGradientEnv } from './models';
import { createPier } from './props';
import type { BlackholeScene } from './types';
import { applyWater, createWater, type WaterParams } from './water';

// Scene III: a pier runs out into a still night sea. A blue-white black hole stands on
// the horizon and lays a long reflection across the water; a lighthouse sweeps its beam.

const PIER_LENGTH = 34;

const PRESET: BasePreset & { water: WaterParams; lighthouse: { x: number; z: number; rotY: number; beam: number } } = {
  rig: { x: 0, y: 2.7, z: 4, yaw: 0, pitch: 2.5, fov: 40, parallax: 1.0, drift: 0.2 },
  atmos: {
    skyTop: '#02050c',
    skyHorizon: '#0b1a2a',
    skyGradH: 0.3,
    glowColor: '#6ab0ff',
    glowIntensity: 0.6,
    glowWidth: 0.03,
    glowAz: 0.7,
    fogDensity: 0.002,
  },
  sky: {
    bhU: 0.5,
    bhV: 0.33,
    dist: 26,
    incl: 9,
    roll: 0,
    mag: 1.5,
    inner: 2.6,
    outer: 14,
    falloff: 1.8,
    thinBright: 3,
    thinOpacity: 2,
    thinNA: 2,
    thinNR: 1.6,
    thinContrast: 0.5,
    secondary: 0.25,
    farOuter: 6,
    volDensity: 0,
    volThick: 0.05,
    volFlare: 1,
    volTwist: 6,
    nearFade: 0,
    volAbsorb: 0,
    volNA: 2,
    volNR: 3,
    volContrast: 0.6,
    colorHot: '#eaf4ff',
    colorCool: '#6aa8ff',
    doppler: 0.55,
    rotSpeed: 0.6,
    sparkle: 0,
    sparkleBright: 0,
    sparkleLen: 3,
    backSky: '#000000',
    stars: 0.3,
    starBright: 1.2,
    haloColor: '#0a1830',
    haloWidth: 0.08,
    haloInside: 0,
    transmit: 1,
    scale: 1,
  },
  post: {
    dof: false,
    focus: 30,
    aperture: 0.5,
    maxBlur: 8,
    farBlur: 0.2,
    bloomStrength: 0.35,
    bloomRadius: 0.4,
    bloomThreshold: 1.2,
    exposure: 1.0,
    contrast: 1.05,
    saturation: 1,
    lift: '#02040a',
    gain: '#f0f6ff',
    vignette: 0.4,
    grain: 0.04,
    aberration: 0.3,
  },
  ground: {
    colorA: '#010204',
    colorB: '#020408',
    noiseScale: 0.1,
    stretchX: 1,
    reflColor: '#000000',
    reflWidth: 0.02,
    reflAz: 1,
    sparkle: 0,
    sparkleColor: '#ffffff',
  },
  light: {
    elevation: 10,
    color: '#bcd8ff',
    intensity: 0.8,
    ambTop: '#0c1626',
    ambBottom: '#020408',
    wind: 0,
    hemiSky: '#3a5070',
    hemiGround: '#05080c',
    hemiIntensity: 0.6,
    sunIntensity: 1.5,
    localColor: '#000000',
    localIntensity: 0,
    localRadius: 1,
    localX: 0,
    localY: 0,
    localZ: 0,
  },
  water: {
    deep: '#01040a',
    wave: 0.12,
    waveScale: 0.05,
    speed: 1,
    fresnel: 0.04,
    reflect: 1,
    glintColor: '#ffb070',
    glintPower: 300,
    glintX: 0,
    glintY: 0,
    glintZ: 0,
    glint2Color: '#ffd9a0',
    glint2X: 68,
    glint2Y: 15.5,
    glint2Z: -188,
    radius: 3000,
  },
  lighthouse: { x: 68, z: -188, rotY: 0.4, beam: 0.18 },
};

function createBeam(): THREE.Mesh {
  // A long cone from the lamp, fading along its length; additive so it adds light only.
  const len = 120;
  const geo = new THREE.ConeGeometry(9, len, 24, 1, true);
  geo.translate(0, -len / 2, 0);
  geo.rotateZ(Math.PI / 2); // apex at the origin, pointing +X
  const mat = new THREE.ShaderMaterial({
    uniforms: { uStrength: { value: 0.18 }, uColor: { value: new THREE.Color(1.0, 0.85, 0.6) } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying float vT;
      void main() { vT = position.x / 120.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      varying float vT;
      uniform float uStrength;
      uniform vec3 uColor;
      void main() { gl_FragColor = vec4(uColor * uStrength * pow(1.0 - clamp(vT, 0.0, 1.0), 2.0), 1.0); }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  return m;
}

export function createTideScene(renderer: THREE.WebGLRenderer): BlackholeScene {
  const P = structuredClone(PRESET);
  const base = new SceneBase(renderer, P);
  base.ground.mesh.visible = false;

  const water = createWater(base.atmos, base.light, base.sky.rt.texture, P.water);
  base.scene.add(water.mesh);

  const pier = createPier(PIER_LENGTH);
  base.scene.add(pier.group);
  P.water.glintX = pier.lanternPos.x;
  P.water.glintY = pier.lanternPos.y;
  P.water.glintZ = pier.lanternPos.z;

  const env = createGradientEnv(renderer, new THREE.Color('#050a14'), new THREE.Color('#1a3050'), new THREE.Color('#020408'), new THREE.Color(1.5, 2, 3), base.bhDir);
  const lighthouse = new THREE.Group();
  base.scene.add(lighthouse);
  addModel(lighthouse, 'lighthouse', env);
  const beamPivot = new THREE.Group();
  beamPivot.position.y = 15.45;
  const beam = createBeam();
  beamPivot.add(beam);
  lighthouse.add(beamPivot);
  const lamp = new THREE.PointLight(0xffd090, 400, 120, 2);
  lamp.position.y = 15.45;
  lighthouse.add(lamp);

  const apply = () => {
    applyWater(water.uniforms, P.water);
    const L = P.lighthouse;
    lighthouse.position.set(L.x, 0, L.z);
    lighthouse.rotation.y = L.rotY;
    (beam.material as THREE.ShaderMaterial).uniforms.uStrength.value = L.beam;
  };
  apply();

  return {
    id: 'tide',
    label: 'Tide',
    base,
    params: P,
    update(dt, time) {
      base.updateBase(dt, time);
      water.uniforms.uProj.value.copy(base.rig.camera.projectionMatrix);
      beamPivot.rotation.y = time * 0.6;
    },
    buildGui(gui: GUI) {
      base.baseGui(gui, apply);
      addParams(gui.addFolder('Water').close(), P.water, apply, { wave: [0, 2], waveScale: [0.005, 0.5, 0.001], fresnel: [0, 0.3], glintPower: [10, 2000] });
      addParams(gui.addFolder('Lighthouse').close(), P.lighthouse, apply, { x: [-200, 200, 0.5], z: [-400, -40, 0.5], rotY: [-3.2, 3.2], beam: [0, 1] });
    },
  };
}
