import {
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  sRGBEncoding,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from 'three'

import type { PieceMaterialSet } from './PieceMaterialSet'

/**
 * Per-square marble veins from Vision's recipe.
 * The page bakes this once into a texture. Live materials sample that map.
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
  for (int octave = 0; octave < 3; octave++) {
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
  vec2 w = p + 0.22 * vec2(q, fbm(p * 2.4 + 19.2));
  float rid = 1.0 - abs(snoise(w * 2.6 + seed));
  float vein = pow(smoothstep(0.90, 0.995, rid), 2.4);
  return vein;
}
vec3 srgbToLinear(vec3 c) { return pow(c, vec3(2.2)); }
vec3 marbleAlbedo(vec2 uv, vec2 tile, float dark, float veinMix) {
  float seed = fract(sin(dot(tile, vec2(19.17, 73.13))) * 43758.5453);
  float ang = seed * 6.2831853 * 0.70;
  vec2 p = uv - 0.5;
  float c = cos(ang);
  float s = sin(ang);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
  p += vec2(hash11(seed), hash11(seed + 7.1)) * 0.35;
  float q = fbm(p * 2.4 + seed);
  vec2 w = p + 0.22 * vec2(q, fbm(p * 2.4 + 19.2));
  float body = fbm(w * 3.2);
  float vein = marbleVeinAmt(uv, tile);
  vec3 color;
  if (dark > 0.5) {
    vec3 base = mix(srgbToLinear(vec3(0.043, 0.043, 0.047)), srgbToLinear(vec3(0.086, 0.078, 0.071)), body * 0.35);
    vec3 veinC = mix(srgbToLinear(vec3(0.620, 0.460, 0.220)), srgbToLinear(vec3(0.850, 0.680, 0.320)), smoothstep(0.55, 1.0, vein));
    color = mix(base, veinC, clamp(vein * veinMix, 0.0, 1.0));
  } else {
    vec3 base = mix(srgbToLinear(vec3(0.941, 0.922, 0.890)), srgbToLinear(vec3(0.886, 0.867, 0.839)), body * 0.06);
    color = mix(base, srgbToLinear(vec3(0.620, 0.600, 0.580)), clamp(vein, 0.0, 1.0));
  }
  return color;
}
`
/* v8 ignore stop */

/**
 * Draw the vein recipe once into render targets.
 * The live materials then sample those textures instead of running the noise per pixel,
 * and the page does not spend tens of seconds baking them on the CPU.
 */
export function bakeMarbleGpu(gl: WebGLRenderer, materials: PieceMaterialSet, quest: boolean): void {
  if (typeof gl.setRenderTarget !== 'function' || typeof gl.render !== 'function') return
  const size = quest ? 512 : 2048
  const started = typeof performance !== 'undefined' ? performance.now() : 0
  const light = renderMarble(gl, size, 8, false, 1)
  const dark = renderMarble(gl, size, 8, true, 0.85)
  const frame = renderMarble(gl, size, 1, true, 0.1)
  const floor = renderMarble(gl, size, 1, true, 0.12)
  const wall = renderMarble(gl, size, 1, true, 0.12)
  floor.texture.repeat.set(4, 4)
  wall.texture.repeat.set(1.5, 1.5)
  materials.installBakedMarble({
    light: light.texture,
    dark: dark.texture,
    frame: frame.texture,
    floor: floor.texture,
    wall: wall.texture,
    targets: [light, dark, frame, floor, wall],
  })
  if (typeof performance !== 'undefined') {
    const elapsed = performance.now() - started
    const host = globalThis as { __CHESS_BAKE_MS__?: number }
    host.__CHESS_BAKE_MS__ = elapsed
  }
}

function renderMarble(gl: WebGLRenderer, size: number, cells: number, dark: boolean, veinMix: number): WebGLRenderTarget {
  const mipmaps = size > 0 && (size & (size - 1)) === 0
  const target = new WebGLRenderTarget(size, size, {
    magFilter: LinearFilter,
    minFilter: mipmaps ? LinearMipmapLinearFilter : LinearFilter,
    generateMipmaps: mipmaps,
    anisotropy: mipmaps ? 8 : 1,
    wrapS: RepeatWrapping,
    wrapT: RepeatWrapping,
    encoding: sRGBEncoding,
    depthBuffer: false,
    stencilBuffer: false,
  })
  const material = new ShaderMaterial({
    uniforms: {
      uDark: { value: dark ? 1 : 0 },
      uVeinMix: { value: veinMix },
      uCells: { value: cells },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform float uDark;
      uniform float uVeinMix;
      uniform float uCells;
      ${MARBLE_GLSL}
      void main() {
        vec2 tile = floor(vUv * uCells);
        vec2 localUv = fract(vUv * uCells);
        vec3 linear = marbleAlbedo(localUv, tile, uDark, uVeinMix);
        gl_FragColor = vec4(linear, 1.0);
      }
    `,
  })
  const scene = new Scene()
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
  camera.position.z = 1
  const geometry = new PlaneGeometry(2, 2)
  scene.add(new Mesh(geometry, material))
  const previousTarget = gl.getRenderTarget()
  gl.setRenderTarget(target)
  gl.render(scene, camera)
  gl.setRenderTarget(previousTarget)
  geometry.dispose()
  material.dispose()
  return target
}

export type BakedMarbleMaps = {
  light: Texture
  dark: Texture
  frame: Texture
  floor: Texture
  wall: Texture
  targets: WebGLRenderTarget[]
}
