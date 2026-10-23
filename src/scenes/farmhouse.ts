import * as THREE from 'three';
import type GUI from 'lil-gui';
import { addParams } from '../dev/gui';
import { SceneBase, type BasePreset } from './base';
import { applyWheat, createWheat, type WheatParams } from './field';
import { createGradientEnv, createHouse, createPickup, swapIn } from './models';
import type { BlackholeScene } from './types';

// Scene II: a lone farmhouse and a pickup in a wheat field at night. A huge black hole
// sits on the horizon, wrapped in a thick, streaky, swirling disk.

type Placement = { x: number; z: number; rotY: number; scale: number };

const PRESET: BasePreset & { wheat: WheatParams; house: Placement; truck: Placement } = {
  rig: { x: 0, y: 2.0, z: 0, yaw: 0, pitch: 10.05, fov: 35, parallax: 1.0, drift: 0.15 },
  atmos: {
    skyTop: '#0a0705',
    skyHorizon: '#2a1a0c',
    skyGradH: 0.25,
    glowColor: '#ffb258',
    glowIntensity: 1.2,
    glowWidth: 0.025,
    glowAz: 0.5,
    fogDensity: 0.0025,
  },
  sky: {
    bhU: 0.447,
    bhV: 0.7,
    dist: 20,
    incl: 14,
    roll: 0,
    mag: 1.72,
    inner: 1.7,
    outer: 5.5,
    falloff: 2.6,
    thinBright: 2,
    thinOpacity: 0,
    thinNA: 2,
    thinNR: 4,
    thinContrast: 0.6,
    farOuter: 60,
    secondary: 1,
    volDensity: 1.6,
    volThick: 0.18,
    volFlare: 0.9,
    volTwist: 12,
    nearFade: 1,
    volAbsorb: 0.2,
    volNA: 1,
    volNR: 20,
    volContrast: 0.9,
    colorHot: '#fff0c8',
    colorCool: '#c8661c',
    doppler: 0.6,
    rotSpeed: 0.8,
    sparkle: 0.015,
    sparkleBright: 4,
    sparkleLen: 4,
    backSky: '#050403',
    stars: 0.12,
    starBright: 0.6,
    haloColor: '#3a2510',
    haloWidth: 0.15,
    haloInside: 0.6,
    transmit: 1,
    scale: 0.85,
  },
  post: {
    dof: false,
    focus: 50,
    aperture: 0.5,
    maxBlur: 8,
    farBlur: 0.2,
    bloomStrength: 0.5,
    bloomRadius: 0.7,
    bloomThreshold: 0.7,
    exposure: 1.0,
    contrast: 1.1,
    saturation: 0.9,
    lift: '#050302',
    gain: '#fff2e0',
    vignette: 0.45,
    grain: 0.05,
    aberration: 0.3,
  },
  ground: {
    colorA: '#120a05',
    colorB: '#3a220e',
    noiseScale: 0.12,
    stretchX: 20,
    reflColor: '#ffc060',
    reflWidth: 0.014,
    reflAz: 0.35,
    sparkle: 0,
    sparkleColor: '#ffffff',
  },
  light: {
    elevation: 20,
    color: '#ffb15a',
    intensity: 1.0,
    ambTop: '#1e1208',
    ambBottom: '#0a0603',
    wind: 0.04,
    hemiSky: '#6a4a2a',
    hemiGround: '#140c06',
    hemiIntensity: 0.6,
    sunIntensity: 1.6,
    localColor: '#ff8a3a',
    localIntensity: 0.5,
    localRadius: 6,
    localX: 14,
    localY: 1,
    localZ: -56,
  },
  wheat: {
    stem: '#2a1a0c',
    head: '#8a5a28',
    backLight: 1.0,
    height: 0.45,
    widthScale: 1.0,
  },
  house: { x: 17.6, z: -60.6, rotY: -0.3, scale: 0.88 },
  truck: { x: -1.3, z: -50, rotY: 0, scale: 1 },
};

export function createFarmhouseScene(renderer: THREE.WebGLRenderer): BlackholeScene {
  const P = structuredClone(PRESET);
  const base = new SceneBase(renderer, P);
  const origin = new THREE.Vector3(P.rig.x, 0, P.rig.z);

  const wheat = createWheat(base.atmos, base.light, P.wheat, { count: 600_000, rMin: 1.0, rMax: 70, halfAngle: 38, yaw: 0, seed: 11, exclude: [
      { x: P.truck.x, z: P.truck.z, r: 10 },
      { x: P.house.x - 2, z: P.house.z, r: 11 },
    ] }, origin);
  base.scene.add(wheat.mesh);

  const house = new THREE.Group();
  house.add(createHouse());
  base.scene.add(house);
  const truck = new THREE.Group();
  truck.add(createPickup());
  base.scene.add(truck);
  const env = createGradientEnv(renderer, new THREE.Color('#0a0603'), new THREE.Color('#6a4018'), new THREE.Color('#120a04'), new THREE.Color(3, 1.8, 0.7), base.bhDir);
  swapIn(house, 'house', env, 0.35, 0.22);
  // Warm light from the windows and the porch onto the yard and the wheat.
  for (const [x, y, z, i] of [
    [-3, 2.4, 6.8, 12],
    [3.2, 2.2, 5.2, 8],
  ] as const) {
    const l = new THREE.PointLight(0xff9a4a, i, 20, 2);
    l.position.set(x, y, z);
    house.add(l);
  }
  swapIn(truck, 'truck', env, 0.8);

  const place = (o: THREE.Object3D, p: Placement) => {
    o.position.set(p.x, 0, p.z);
    o.rotation.y = p.rotY;
    o.scale.setScalar(p.scale);
  };
  const apply = () => {
    applyWheat(wheat.uniforms, P.wheat);
    place(house, P.house);
    place(truck, P.truck);
  };
  apply();

  return {
    id: 'farmhouse',
    label: 'Farmhouse',
    base,
    shots: [
      { d: 16, from: {}, to: { x: 2, y: -0.4, z: -14, fov: -2 } },
      { d: 14, from: { x: 4, y: -0.8, z: -33, yaw: -13, pitch: -4 }, to: { x: 6.5, y: -0.6, z: -36, yaw: -17, pitch: -4 } },
      { d: 12, from: { x: -8, y: -0.9, z: -30, yaw: 6 }, to: { x: -4, y: -0.9, z: -32, yaw: 2 } },
      { d: 14, from: { y: 2 }, to: { y: 16, z: 8, pitch: -10 } },
    ],
    update: (dt, time) => base.updateBase(dt, time),
    buildGui(gui: GUI) {
      base.baseGui(gui, apply);
      addParams(gui.addFolder('Wheat').close(), P.wheat, apply);
      addParams(gui.addFolder('House').close(), P.house, apply, { x: [-40, 40, 0.1], z: [-120, -20, 0.1], rotY: [-3.2, 3.2] });
      addParams(gui.addFolder('Truck').close(), P.truck, apply, { x: [-40, 40, 0.1], z: [-120, -20, 0.1], rotY: [-3.2, 3.2] });
    },
    params: P,
  };
}
