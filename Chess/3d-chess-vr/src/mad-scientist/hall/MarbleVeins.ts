import { BufferAttribute, BufferGeometry, MeshPhysicalMaterial } from 'three'

/**
 * Per-square marble veins from Vision's recipe.
 * One shared physical material; the seed is a vertex attribute, not 64 shaders.
 */
/* v8 ignore start */
const MARBLE_GLSL = /* glsl */ `
float hash11(float n) { return fract(sin(n) * 43758.5453123); }
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289v(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289v(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  for (int octave = 0; octave < 5; octave++) {
    value += amplitude * snoise(p * frequency);
    frequency *= 2.05;
    amplitude *= 0.5;
  }
  return value * 0.5 + 0.5;
}
float marbleVeinAmt(vec2 uv, vec2 tile) {
  float seed = fract(sin(dot(tile, vec2(19.17, 73.13))) * 43758.5453);
  float ang = seed * 6.2831853 * 0.70;
  vec2 p = uv - 0.5;
  float c = cos(ang);
  float s = sin(ang);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
  p += vec2(hash11(seed), hash11(seed + 7.1)) * 0.35;
  float q = fbm(p * 2.4 + seed);
  vec2 w = p + 0.45 * vec2(q, fbm(p * 2.4 + 19.2));
  float rid = 1.0 - abs(snoise(w * 3.2 + seed));
  float vein = pow(smoothstep(0.82, 0.97, rid), 2.4);
  return vein;
}
vec3 srgbToLinear(vec3 c) { return pow(c, vec3(2.2)); }
vec3 marbleAlbedo(vec2 uv, vec2 tile, float dark) {
  float seed = fract(sin(dot(tile, vec2(19.17, 73.13))) * 43758.5453);
  float ang = seed * 6.2831853 * 0.70;
  vec2 p = uv - 0.5;
  float c = cos(ang);
  float s = sin(ang);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
  p += vec2(hash11(seed), hash11(seed + 7.1)) * 0.35;
  float q = fbm(p * 2.4 + seed);
  vec2 w = p + 0.45 * vec2(q, fbm(p * 2.4 + 19.2));
  float body = fbm(w * 3.2);
  float vein = marbleVeinAmt(uv, tile);
  vec3 color;
  if (dark > 0.5) {
    vec3 base = mix(srgbToLinear(vec3(0.043, 0.043, 0.047)), srgbToLinear(vec3(0.086, 0.078, 0.071)), body * 0.35);
    vec3 veinC = mix(srgbToLinear(vec3(0.290, 0.271, 0.243)), srgbToLinear(vec3(0.416, 0.396, 0.361)), smoothstep(0.55, 1.0, vein));
    color = mix(base, veinC, clamp(vein * 0.85, 0.0, 1.0));
  } else {
    vec3 base = mix(srgbToLinear(vec3(0.941, 0.922, 0.890)), srgbToLinear(vec3(0.886, 0.867, 0.839)), body * 0.15);
    color = mix(base, srgbToLinear(vec3(0.431, 0.416, 0.392)), clamp(vein, 0.0, 1.0));
  }
  return color;
}
`
/* v8 ignore stop */

/** Stamp a file/rank seed onto every vertex so neighboring squares do not repeat. */
export function stampTileSeed(geometry: BufferGeometry, file: number, rank: number): void {
  const count = geometry.getAttribute('position').count
  const data = new Float32Array(count * 2)
  for (let index = 0; index < count; index += 1) {
    data[index * 2] = file
    data[index * 2 + 1] = rank
  }
  geometry.setAttribute('tileSeed', new BufferAttribute(data, 2))
}

/** Compile the vein recipe into a shared physical material. */
export function applyMarbleVeins(material: MeshPhysicalMaterial, dark: boolean): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uMarbleDark = { value: dark ? 1 : 0 }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 tileSeed;\nvarying vec2 vTileSeed;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvTileSeed = tileSeed;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vTileSeed;\nuniform float uMarbleDark;\n${MARBLE_GLSL}`)
      .replace('#include <map_fragment>', 'diffuseColor.rgb = marbleAlbedo(vUv, vTileSeed, uMarbleDark);')
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + marbleVeinAmt(vUv, vTileSeed) * 0.06, 0.05, 0.35);',
      )
  }
  material.customProgramCacheKey = () => (dark ? 'marble-dark' : 'marble-light')
}
