import * as THREE from 'three';
import type GUI from 'lil-gui';
import { addParams } from '../dev/gui';
import { SceneBase, type BasePreset } from './base';
import { applyFlowers, createFlowers, type FlowerParams } from './field';
import { createAstronaut, createGradientEnv, loadOptionalModel, replaceWith } from './models';
import type { BlackholeScene } from './types';

// Scene I: an astronaut sits in a violet flower field. The black hole lies on the
// horizon, seen almost edge-on (Interstellar style), in a grey-blue haze.

const PRESET: BasePreset & {
  flowers: FlowerParams;
  fore: FlowerParams;
  astronaut: { x: number; y: number; z: number; rotY: number; scale: number };
} = {
  rig: { x: 0, y: 1.0, z: 0, yaw: 0, pitch: -0.55, fov: 30, parallax: 1.2, drift: 0.2 },
  atmos: {
    skyTop: '#262833',
    skyHorizon: '#3e4050',
    skyGradH: 0.4,
    glowColor: '#ffdcae',
    glowIntensity: 0.8,
    glowWidth: 0.026,
    glowAz: 1.4,
    fogDensity: 0.012,
  },
  sky: {
    bhU: 0.507,
    bhV: 0.374,
    dist: 30,
    incl: 2.5,
    roll: 0,
    mag: 1.18,
    inner: 2.4,
    outer: 22,
    falloff: 1.6,
    thinBright: 6,
    thinOpacity: 3,
    thinNA: 2,
    thinNR: 1.2,
    thinContrast: 0.5,
    farOuter: 4.5,
    secondary: 0.1,
    volDensity: 0,
    volThick: 0.02,
    volFlare: 0,
    volTwist: 0,
    nearFade: 0,
    volAbsorb: 0,
    volNA: 3,
    volNR: 1.5,
    volContrast: 0.2,
    colorHot: '#ffdca6',
    colorCool: '#f0a050',
    doppler: 0,
    rotSpeed: 0.6,
    sparkle: 0,
    sparkleBright: 0,
    sparkleLen: 3,
    backSky: '#000000',
    stars: 0.03,
    starBright: 0.5,
    haloColor: '#1e1a14',
    haloWidth: 0.05,
    haloInside: 0,
    transmit: 1,
    scale: 1,
  },
  post: {
    dof: true,
    focus: 5.0,
    aperture: 3,
    maxBlur: 20,
    farBlur: 0.15,
    bloomStrength: 0.22,
    bloomRadius: 0.12,
    bloomThreshold: 1.8,
    exposure: 1.0,
    contrast: 1.05,
    saturation: 0.95,
    lift: '#06050c',
    gain: '#ffffff',
    vignette: 0.35,
    grain: 0.035,
    aberration: 0.4,
  },
  ground: {
    colorA: '#0d0920',
    colorB: '#241b4a',
    noiseScale: 0.15,
    stretchX: 1,
    reflColor: '#8e86a0',
    reflWidth: 0.015,
    reflAz: 1.2,
    sparkle: 0.02,
    sparkleColor: '#ffc880',
  },
  light: {
    elevation: 8,
    color: '#ffe6c4',
    intensity: 1.2,
    ambTop: '#2c2c4c',
    ambBottom: '#120f24',
    wind: 0.025,
    hemiSky: '#8a8aa8',
    hemiGround: '#2a2050',
    hemiIntensity: 0.55,
    sunIntensity: 2.0,
    localColor: '#000000',
    localIntensity: 0,
    localRadius: 1,
    localX: 0,
    localY: 0,
    localZ: 0,
  },
  flowers: {
    petalA: '#17173a',
    petalB: '#323272',
    leaf: '#141030',
    backLight: 1.5,
    sparkleRate: 0.025,
    sparkleBright: 4,
    sparkleColor: '#ffc070',
    height: 1.15,
  },
  fore: {
    petalA: '#d8d0c8',
    petalB: '#f0e8dc',
    leaf: '#3a3450',
    backLight: 1.0,
    sparkleRate: 0,
    sparkleBright: 0,
    sparkleColor: '#ffffff',
    height: 1.0,
  },
  astronaut: { x: 0.3, y: 0.03, z: -5.0, rotY: 0.2, scale: 1.05 },
};

export function createAstronautScene(renderer: THREE.WebGLRenderer): BlackholeScene {
  const P = structuredClone(PRESET);
  const base = new SceneBase(renderer, P);
  const origin = new THREE.Vector3(P.rig.x, 0, P.rig.z);

  // Detailed heads near the camera, cheap 4-petal heads further out (same material uniforms).
  const flowers = createFlowers(base.atmos, base.light, P.flowers, { count: 170_000, rMin: 0.35, rMax: 12, halfAngle: 34, yaw: 0, seed: 7 }, origin);
  base.scene.add(flowers.mesh);
  const farFlowers = createFlowers(base.atmos, base.light, P.flowers, { count: 230_000, rMin: 12, rMax: 40, halfAngle: 34, yaw: 0, seed: 8 }, origin, true);
  base.scene.add(farFlowers.mesh);
  const fore = createFlowers(base.atmos, base.light, P.fore, { count: 14, rMin: 0.5, rMax: 1.4, halfAngle: 12, yaw: -16, seed: 99 }, origin);
  base.scene.add(fore.mesh);

  const env = createGradientEnv(
    renderer,
    new THREE.Color('#3a3a48'),
    new THREE.Color('#9a9098'),
    new THREE.Color('#1a1430'),
    new THREE.Color(3, 2.6, 2),
    base.bhDir,
  );
  const astro = new THREE.Group();
  astro.add(createAstronaut(env));
  base.scene.add(astro);
  loadOptionalModel('astronaut').then((m) => m && replaceWith(astro, m, env));

  const apply = () => {
    applyFlowers(flowers.uniforms, P.flowers);
    applyFlowers(farFlowers.uniforms, P.flowers);
    applyFlowers(fore.uniforms, P.fore);
    const a = P.astronaut;
    astro.position.set(a.x, a.y, a.z);
    astro.rotation.y = a.rotY;
    astro.scale.setScalar(a.scale);
  };
  apply();

  return {
    id: 'astronaut',
    label: 'Astronaut',
    base,
    update: (dt, time) => base.updateBase(dt, time),
    buildGui(gui: GUI) {
      base.baseGui(gui, apply);
      addParams(gui.addFolder('Flowers').close(), P.flowers, apply, { sparkleRate: [0, 0.2, 0.001] });
      addParams(gui.addFolder('Foreground flowers').close(), P.fore, apply);
      addParams(gui.addFolder('Astronaut').close(), P.astronaut, apply, { x: [-3, 3, 0.01], z: [-12, -1, 0.01], rotY: [-3.2, 3.2] });
    },
    params: P,
  };
}
