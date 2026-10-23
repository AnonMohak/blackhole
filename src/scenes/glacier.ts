import * as THREE from 'three';
import type GUI from 'lil-gui';
import { addParams } from '../dev/gui';
import { SceneBase, type BasePreset } from './base';
import { createCabin, createPines } from './props';
import { applyTerrain, createTerrain, type TerrainParams } from './terrain';
import type { BlackholeScene } from './types';
import { applyWater, createWater, type WaterParams } from './water';

// Scene V: a frozen lake under a snowy range. A cyan black hole, seen from above its disk,
// hangs over the peaks and mirrors in the ice; one A-frame cabin keeps a light on.

type Placement = { x: number; z: number; rotY: number; scale: number };

const PRESET: BasePreset & { ice: WaterParams; mountains: TerrainParams; cabin: Placement } = {
  rig: { x: 0, y: 1.8, z: 0, yaw: 0, pitch: 6, fov: 40, parallax: 1.0, drift: 0.2 },
  atmos: {
    skyTop: '#020610',
    skyHorizon: '#1a2c40',
    skyGradH: 0.35,
    glowColor: '#80c8ff',
    glowIntensity: 0.7,
    glowWidth: 0.04,
    glowAz: 0.8,
    fogDensity: 0.0012,
  },
  sky: {
    bhU: 0.5,
    bhV: 0.3,
    dist: 22,
    incl: 22,
    roll: 0,
    mag: 1.35,
    inner: 2.6,
    outer: 10,
    falloff: 1.6,
    thinBright: 2.5,
    thinOpacity: 2.5,
    thinNA: 2,
    thinNR: 2.2,
    thinContrast: 0.55,
    secondary: 0.35,
    farOuter: 60,
    volDensity: 0,
    volThick: 0.06,
    volFlare: 1,
    volTwist: 8,
    nearFade: 0,
    volAbsorb: 0,
    volNA: 2,
    volNR: 4,
    volContrast: 0.6,
    colorHot: '#f0fbff',
    colorCool: '#4ab8ff',
    doppler: 0.45,
    rotSpeed: 0.6,
    sparkle: 0,
    sparkleBright: 0,
    sparkleLen: 3,
    backSky: '#000000',
    stars: 0.3,
    starBright: 1.2,
    haloColor: '#0c1a3a',
    haloWidth: 0.1,
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
    bloomRadius: 0.5,
    bloomThreshold: 1.2,
    exposure: 1.0,
    contrast: 1.05,
    saturation: 0.95,
    lift: '#02060c',
    gain: '#f4faff',
    vignette: 0.4,
    grain: 0.04,
    aberration: 0.3,
  },
  ground: {
    colorA: '#5a6a80',
    colorB: '#a8b8cc',
    noiseScale: 0.05,
    stretchX: 1,
    reflColor: '#80b0e0',
    reflWidth: 0.02,
    reflAz: 0.8,
    sparkle: 0.03,
    sparkleColor: '#e0f0ff',
  },
  light: {
    elevation: 25,
    color: '#cfe6ff',
    intensity: 1.0,
    ambTop: '#2a3a50',
    ambBottom: '#0a1018',
    wind: 0,
    hemiSky: '#6a8aa8',
    hemiGround: '#1a2230',
    hemiIntensity: 0.8,
    sunIntensity: 2.0,
    localColor: '#ff9a50',
    localIntensity: 0.4,
    localRadius: 10,
    localX: -18,
    localY: 0.5,
    localZ: -36,
  },
  ice: {
    deep: '#0a1824',
    wave: 0.03,
    waveScale: 0.15,
    speed: 0.05,
    fresnel: 0.08,
    reflect: 0.85,
    glintColor: '#000000',
    glintPower: 200,
    glintX: 0,
    glintY: 0,
    glintZ: 0,
    glint2Color: '#ffa860',
    glint2X: -18,
    glint2Y: 3,
    glint2Z: -37,
    radius: 230,
  },
  mountains: {
    height: 300,
    scale: 0.6,
    clearRadius: 450,
    colorLow: '#1a2028',
    colorHigh: '#e8f0f8',
    rim: 1.5,
    ripple: 0.3,
    sparkle: 0,
    flatX: 0,
    flatZ: 0,
    flatR: 0,
  },
  cabin: { x: -18, z: -40, rotY: 0.45, scale: 1 },
};

export function createGlacierScene(renderer: THREE.WebGLRenderer): BlackholeScene {
  const P = structuredClone(PRESET);
  const base = new SceneBase(renderer, P);

  const ice = createWater(base.atmos, base.light, base.sky.rt.texture, P.ice);
  ice.mesh.position.z = -210;
  base.scene.add(ice.mesh);

  const mountains = createTerrain(base.atmos, base.light, P.mountains, 'mountains', 5000, 360, new THREE.Vector2(0, -2300));
  base.scene.add(mountains.mesh);

  const cabin = createCabin();
  base.scene.add(cabin);
  base.scene.add(createPines(90, 30, 160, -78, -36, 5), createPines(70, 40, 180, 22, 70, 9));

  const apply = () => {
    applyWater(ice.uniforms, P.ice);
    applyTerrain(mountains.uniforms, P.mountains);
    cabin.position.set(P.cabin.x, 0, P.cabin.z);
    cabin.rotation.y = P.cabin.rotY;
    cabin.scale.setScalar(P.cabin.scale);
  };
  apply();

  return {
    id: 'glacier',
    label: 'Glacier',
    base,
    params: P,
    update(dt, time) {
      base.updateBase(dt, time);
      ice.uniforms.uProj.value.copy(base.rig.camera.projectionMatrix);
    },
    buildGui(gui: GUI) {
      base.baseGui(gui, apply);
      addParams(gui.addFolder('Ice').close(), P.ice, apply, { wave: [0, 1], waveScale: [0.005, 1, 0.001], fresnel: [0, 0.3], glintPower: [10, 2000] });
      addParams(gui.addFolder('Mountains').close(), P.mountains, apply, { height: [0, 1000], clearRadius: [100, 1200] });
      addParams(gui.addFolder('Cabin').close(), P.cabin, apply, { x: [-80, 80, 0.1], z: [-160, -10, 0.1], rotY: [-3.2, 3.2] });
    },
  };
}
