import * as THREE from 'three';
import { ATMOS_GLSL, type AtmosUniforms } from '../blackhole/atmosphere';
import { getNoiseTexture } from '../blackhole/noiseTexture';
import type { LightUniforms } from './field';

// Height-field terrain displaced on the GPU: wind-shaped sand dunes or a jagged snowy
// mountain range. Lit by the black hole key light, sky ambient and the shared fog.

export type TerrainKind = 'dunes' | 'mountains';

export interface TerrainParams {
  height: number;
  scale: number; // feature frequency
  clearRadius: number; // flat area around the camera
  colorLow: string;
  colorHigh: string; // dunes: lit crest; mountains: snow
  rim: number; // back-light on crests facing the black hole
  ripple: number; // fine surface ripples (sand) or rock streaks
  sparkle: number;
  flatX: number; // a second flat spot (for a building or vehicle)
  flatZ: number;
  flatR: number;
}

const HEIGHT_GLSL: Record<TerrainKind, string> = {
  dunes: /* glsl */ `
    float terrainHeight(vec2 p) {
      vec2 w = (vec2(textureLod(tNoise, p * 0.0017 * uScale, 0.0).r, textureLod(tNoise, p * 0.0017 * uScale + 0.5, 0.0).g) - 0.5) * 160.0;
      vec2 q = (p + w) * uScale;
      float a = q.x * 0.011 + q.y * 0.0045;
      float ridge = 1.0 - abs(sin(a * 3.14159));
      float h = pow(ridge, 1.8) * (0.55 + 0.9 * textureLod(tNoise, q * 0.0013, 0.0).r);
      h += textureLod(tNoise, q * 0.006, 0.0).g * 0.25;
      return h * uHeight;
    }`,
  mountains: /* glsl */ `
    float terrainHeight(vec2 p) {
      vec2 q = p * uScale;
      // One ridged octave for the main crests, smooth fBm for the rest.
      float n0 = textureLod(tNoise, q * 0.0006, 0.0).r;
      float h = (1.0 - abs(n0 * 2.0 - 1.0)) * 1.1;
      float amp = 0.45;
      float f = 0.0013;
      for (int i = 0; i < 3; i++) {
        h += textureLod(tNoise, q * f + float(i) * 0.37, 0.0).g * amp;
        amp *= 0.45;
        f *= 2.2;
      }
      // Rises with distance through heightAt's clear radius: a range behind the lake.
      return pow(h / 1.9, 2.2) * uHeight;
    }`,
};

export function createTerrain(atmos: AtmosUniforms, light: LightUniforms, p: TerrainParams, kind: TerrainKind, size: number, segments: number, center = new THREE.Vector2(0, -size / 2 + 20)) {
  const uniforms = {
    ...atmos,
    ...light,
    tNoise: { value: getNoiseTexture() },
    uHeight: { value: p.height },
    uScale: { value: p.scale },
    uClear: { value: p.clearRadius },
    uColLow: { value: new THREE.Color(p.colorLow) },
    uColHigh: { value: new THREE.Color(p.colorHigh) },
    uRim: { value: p.rim },
    uRipple: { value: p.ripple },
    uSparkle: { value: p.sparkle },
    uFlat: { value: new THREE.Vector3(p.flatX, p.flatZ, p.flatR) },
  };
  const common = /* glsl */ `
    uniform sampler2D tNoise;
    uniform float uHeight, uScale, uClear;
    uniform vec3 uFlat;
    ${HEIGHT_GLSL[kind]}
    float heightAt(vec2 p) {
      float k = smoothstep(uClear, uClear * 2.5, length(p - cameraPosition.xz));
      if (uFlat.z > 0.0) k *= smoothstep(uFlat.z, uFlat.z * 2.2, length(p - uFlat.xy));
      return terrainHeight(p) * k;
    }
  `;
  const mat = new THREE.ShaderMaterial({
    uniforms,
    defines: { [kind.toUpperCase()]: '' },
    vertexShader: /* glsl */ `
      ${common}
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vH;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        float e = 1.5;
        float h = heightAt(w.xz);
        float hx = heightAt(w.xz + vec2(e, 0.0));
        float hz = heightAt(w.xz + vec2(0.0, e));
        w.y += h;
        vH = h / max(uHeight, 1e-3);
        vNormal = normalize(vec3(h - hx, e, h - hz));
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tNoise;
      uniform vec3 uColLow, uColHigh;
      uniform float uRim, uRipple, uSparkle;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vH;
      ${ATMOS_GLSL}
      uniform vec3 uLightDir, uLightColor, uAmbTop, uAmbBottom;
      uniform float uTime;
      float hash12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
      void main() {
        vec3 N = normalize(vNormal);
        float dist = length(vWorld - cameraPosition);
        // Fine ripples (sand) / streaks (rock), faded out with distance.
        float rf = uRipple / (1.0 + dist * 0.02);
        vec2 rg = vec2(texture2D(tNoise, vWorld.xz * vec2(0.9, 0.25)).r, texture2D(tNoise, vWorld.xz * vec2(0.25, 0.9) + 0.3).g) - 0.5;
        N = normalize(N + vec3(rg.x, 0.0, rg.y) * rf);
        vec3 L = normalize(uLightDir);
        vec3 V = normalize(cameraPosition - vWorld);
        float ndl = max(dot(N, L), 0.0);
        #ifdef MOUNTAINS
          // Snow on flatter, higher faces; dark rock on steep ones.
          float snow = smoothstep(0.55, 0.8, N.y) * smoothstep(0.05, 0.3, vH);
          vec3 albedo = mix(uColLow, uColHigh, snow);
        #else
          vec3 albedo = mix(uColLow, uColHigh, smoothstep(0.1, 0.9, vH));
        #endif
        vec3 amb = mix(uAmbBottom, uAmbTop, N.y * 0.5 + 0.5);
        vec3 col = albedo * (amb + uLightColor * ndl);
        // Back-lit crests toward the black hole.
        float rim = pow(1.0 - max(dot(N, V), 0.0), 4.0) * pow(max(dot(-V, L) * 0.5 + 0.5, 0.0), 2.0);
        col += uLightColor * albedo * rim * uRim;
        if (uSparkle > 0.0) {
          vec2 c = floor(vWorld.xz * 8.0);
          float h = hash12(c);
          float tw = 0.5 + 0.5 * sin(uTime * (1.0 + 3.0 * h) + h * 40.0);
          col += uLightColor * step(1.0 - uSparkle, h) * tw * 3.0 * exp(-dist * 0.03);
        }
        gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
      }`,
  });
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  geo.translate(center.x, 0, center.y);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

export function applyTerrain(u: ReturnType<typeof createTerrain>['uniforms'], p: TerrainParams) {
  u.uHeight.value = p.height;
  u.uScale.value = p.scale;
  u.uClear.value = p.clearRadius;
  u.uColLow.value.set(p.colorLow);
  u.uColHigh.value.set(p.colorHigh);
  u.uRim.value = p.rim;
  u.uRipple.value = p.ripple;
  u.uSparkle.value = p.sparkle;
  u.uFlat.value.set(p.flatX, p.flatZ, p.flatR);
}
