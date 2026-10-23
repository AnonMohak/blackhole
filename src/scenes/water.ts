import * as THREE from 'three';
import { ATMOS_GLSL, type AtmosUniforms } from '../blackhole/atmosphere';
import { getNoiseTexture } from '../blackhole/noiseTexture';
import type { LightUniforms } from './field';

// Water (or ice) that mirrors the black hole sky. The sky is at infinity, so the reflection
// of a direction is just the sky target sampled where that direction lands on screen;
// directions that leave the screen fall back to the atmosphere model.

export interface WaterParams {
  deep: string;
  wave: number; // normal strength
  waveScale: number; // ripple frequency
  speed: number;
  fresnel: number; // reflectance at normal incidence
  reflect: number; // reflection brightness
  glintColor: string; // a warm point light reflected as a streak (lantern, window)
  glintPower: number;
  glintX: number;
  glintY: number;
  glintZ: number;
  glint2Color: string; // a second, far light (lighthouse lamp, cabin window)
  glint2X: number;
  glint2Y: number;
  glint2Z: number;
  radius: number; // size of the water disc
}

export function createWater(atmos: AtmosUniforms, light: LightUniforms, sky: THREE.Texture, p: WaterParams) {
  const uniforms = {
    ...atmos,
    uTime: light.uTime,
    tSky: { value: sky },
    tNoise: { value: getNoiseTexture() },
    uProj: { value: new THREE.Matrix4() },
    uDeep: { value: new THREE.Color(p.deep) },
    uWave: { value: p.wave },
    uWaveScale: { value: p.waveScale },
    uSpeed: { value: p.speed },
    uFresnel: { value: p.fresnel },
    uReflect: { value: p.reflect },
    uGlintColor: { value: new THREE.Color(p.glintColor) },
    uGlintPower: { value: p.glintPower },
    uGlintPos: { value: new THREE.Vector3(p.glintX, p.glintY, p.glintZ) },
    uGlint2Color: { value: new THREE.Color(p.glint2Color) },
    uGlint2Pos: { value: new THREE.Vector3(p.glint2X, p.glint2Y, p.glint2Z) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld;
      uniform sampler2D tSky, tNoise;
      uniform mat4 uProj;
      uniform vec3 uDeep, uGlintColor, uGlintPos, uGlint2Color, uGlint2Pos;
      uniform float uTime, uWave, uWaveScale, uSpeed, uFresnel, uReflect, uGlintPower;
      ${ATMOS_GLSL}

      float height(vec2 p) {
        vec2 a = p * uWaveScale + vec2(0.02, 0.013) * uTime * uSpeed;
        vec2 b = p * uWaveScale * vec2(2.7, 3.4) - vec2(0.017, -0.021) * uTime * uSpeed;
        return texture2D(tNoise, a).r + 0.5 * texture2D(tNoise, b).g;
      }

      void main() {
        vec3 dv = vWorld - cameraPosition;
        float dist = length(dv);
        vec3 V = dv / dist;
        // Ripple normal from the height field; flatten with distance against aliasing.
        float e = 0.02 / uWaveScale;
        float h = height(vWorld.xz);
        vec2 g = vec2(height(vWorld.xz + vec2(e, 0.0)) - h, height(vWorld.xz + vec2(0.0, e)) - h) / e;
        float k = uWave / (1.0 + dist * 0.015);
        // Stretch ripples toward the viewer, like long-period swell.
        vec3 N = normalize(vec3(-g.x * k, 1.0, -g.y * k * 2.0));
        vec3 R = reflect(V, N);
        R.y = abs(R.y) + 0.002;

        vec4 clip = uProj * viewMatrix * vec4(cameraPosition + R * 5000.0, 1.0);
        vec2 suv = clip.xy / clip.w * 0.5 + 0.5;
        vec3 fallback = atmosphere(R);
        vec3 refl = fallback;
        if (clip.w > 0.0) {
          float edge = smoothstep(0.0, 0.04, suv.x) * smoothstep(1.0, 0.96, suv.x) * smoothstep(1.0, 0.94, suv.y);
          refl = mix(fallback, texture2D(tSky, clamp(suv, 0.001, 0.999)).rgb, edge * step(0.0, suv.y));
        }
        float F = uFresnel + (1.0 - uFresnel) * pow(1.0 - max(dot(-V, N), 0.0), 5.0);
        vec3 col = mix(uDeep, refl * uReflect, F);
        vec3 L = normalize(uGlintPos - vWorld);
        col += uGlintColor * pow(max(dot(R, L), 0.0), uGlintPower) * F * 4.0;
        vec3 L2 = normalize(uGlint2Pos - vWorld);
        col += uGlint2Color * pow(max(dot(R, L2), 0.0), uGlintPower * 4.0) * F * 4.0;
        gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
      }`,
  });
  const geo = new THREE.CircleGeometry(p.radius, 128);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.01;
  mesh.renderOrder = -5;
  return { mesh, uniforms };
}

export function applyWater(u: ReturnType<typeof createWater>['uniforms'], p: WaterParams) {
  u.uDeep.value.set(p.deep);
  u.uWave.value = p.wave;
  u.uWaveScale.value = p.waveScale;
  u.uSpeed.value = p.speed;
  u.uFresnel.value = p.fresnel;
  u.uReflect.value = p.reflect;
  u.uGlintColor.value.set(p.glintColor);
  u.uGlintPower.value = p.glintPower;
  u.uGlintPos.value.set(p.glintX, p.glintY, p.glintZ);
  u.uGlint2Color.value.set(p.glint2Color);
  u.uGlint2Pos.value.set(p.glint2X, p.glint2Y, p.glint2Z);
}
