import * as THREE from 'three';

// Shared atmosphere model. The sky pass, the ground and the vegetation use the same
// uniforms, so the fog at the horizon always matches the sky behind it.

export interface AtmosParams {
  skyTop: string;
  skyHorizon: string;
  skyGradH: number; // sin(elevation) where the gradient reaches skyTop
  glowColor: string; // horizon glow under the black hole
  glowIntensity: number;
  glowWidth: number; // elevation falloff (sin units)
  glowAz: number; // azimuth falloff (radians)
  fogDensity: number;
}

export type AtmosUniforms = ReturnType<typeof createAtmosUniforms>;

export function createAtmosUniforms(p: AtmosParams) {
  return {
    uSkyTop: { value: new THREE.Color(p.skyTop) },
    uSkyHorizon: { value: new THREE.Color(p.skyHorizon) },
    uSkyGradH: { value: p.skyGradH },
    uGlowColor: { value: new THREE.Color(p.glowColor) },
    uGlowIntensity: { value: p.glowIntensity },
    uGlowWidth: { value: p.glowWidth },
    uGlowAz: { value: p.glowAz },
    uFogDensity: { value: p.fogDensity },
    uBhDirW: { value: new THREE.Vector3(0, 0, -1) },
  };
}

export function applyAtmos(u: AtmosUniforms, p: AtmosParams) {
  u.uSkyTop.value.set(p.skyTop);
  u.uSkyHorizon.value.set(p.skyHorizon);
  u.uSkyGradH.value = p.skyGradH;
  u.uGlowColor.value.set(p.glowColor);
  u.uGlowIntensity.value = p.glowIntensity;
  u.uGlowWidth.value = p.glowWidth;
  u.uGlowAz.value = p.glowAz;
  u.uFogDensity.value = p.fogDensity;
}

export const ATMOS_GLSL = /* glsl */ `
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform float uSkyGradH;
uniform vec3 uGlowColor;
uniform float uGlowIntensity;
uniform float uGlowWidth;
uniform float uGlowAz;
uniform float uFogDensity;
uniform vec3 uBhDirW;

vec3 atmosphere(vec3 d) {
  float e = max(d.y, 0.0);
  vec3 col = mix(uSkyHorizon, uSkyTop, pow(smoothstep(0.0, uSkyGradH, e), 0.6));
  vec2 hb = normalize(uBhDirW.xz + 1e-6);
  vec2 hd = normalize(d.xz + 1e-6);
  float az = acos(clamp(dot(hb, hd), -1.0, 1.0));
  float glow = exp(-e / max(uGlowWidth, 1e-4)) * exp(-az * az / max(uGlowAz * uGlowAz, 1e-4));
  return col + uGlowColor * glow * uGlowIntensity;
}

// Exponential distance fog toward the horizon color in the same azimuth.
vec3 applyFog(vec3 col, vec3 worldPos) {
  vec3 dv = worldPos - cameraPosition;
  float f = 1.0 - exp(-length(dv) * uFogDensity);
  vec3 fc = atmosphere(normalize(vec3(dv.x, 0.0, dv.z)));
  return mix(col, fc, f);
}
`;

// JS copy of atmosphere() for three.js built-in materials (scene.fog color).
export function atmosphereJS(u: AtmosUniforms, d: THREE.Vector3, out = new THREE.Color()): THREE.Color {
  const e = Math.max(d.y, 0);
  const s = THREE.MathUtils.smoothstep(e, 0, u.uSkyGradH.value);
  out.copy(u.uSkyHorizon.value).lerp(u.uSkyTop.value, Math.pow(s, 0.6));
  const hb = new THREE.Vector2(u.uBhDirW.value.x, u.uBhDirW.value.z).normalize();
  const hd = new THREE.Vector2(d.x, d.z).normalize();
  const az = Math.acos(THREE.MathUtils.clamp(hb.dot(hd), -1, 1));
  const ga = u.uGlowAz.value;
  const glow = Math.exp(-e / Math.max(u.uGlowWidth.value, 1e-4)) * Math.exp((-az * az) / Math.max(ga * ga, 1e-4));
  const g = u.uGlowColor.value.clone().multiplyScalar(glow * u.uGlowIntensity.value);
  return out.add(g);
}
