import { CanvasTexture, DataTexture, RGBAFormat, RepeatWrapping, sRGBEncoding, Texture } from 'three'

/**
 * Runtime marble. Pixel data only, so the page does not fetch an image
 * and the production script policy stays `'self'`.
 */
/** 2K on desktop, smaller on Quest and in unit tests. */
export function marbleResolution(): number {
  if (typeof process !== 'undefined' && process.env.VITEST) return 64
  if (typeof navigator !== 'undefined' && /Quest|Oculus/i.test(navigator.userAgent)) return 256
  return 2048
}

export function marbleTexture(tone: 'black' | 'cream'): DataTexture {
  const size = marbleResolution()
  const data = new Uint8Array(size * size * 4)
  const black = tone === 'black'
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const warp = fbm(x * 0.03, y * 0.03)
      const n = fbm(x * 0.02 + warp * 3.5, y * 0.02 - warp * 2.2)
      const vein = Math.pow(Math.abs(Math.sin((x * 0.045 + warp * 8) + n * 14)), 10)
      const hair = Math.pow(Math.abs(Math.sin(y * 0.08 + n * 9)), 14)
      const i = (y * size + x) * 4
      if (black) {
        const spark = vein > 0.55 || hair > 0.72 ? 170 + n * 70 : vein * 40
        data[i] = clamp(14 + n * 10 + spark)
        data[i + 1] = clamp(14 + n * 10 + spark)
        data[i + 2] = clamp(16 + n * 12 + spark)
      } else {
        const shade = vein > 0.62 || hair > 0.78 ? 55 : vein * 18
        data[i] = clamp(236 - n * 14 - shade)
        data[i + 1] = clamp(228 - n * 16 - shade)
        data[i + 2] = clamp(214 - n * 18 - shade * 0.6)
      }
      data[i + 3] = 255
    }
  }
  return publish(data, size)
}

/**
 * Champagne glyphs for the 32 mm frame band.
 * The rest of the texture is transparent so the marble and gold show through.
 * Pixel y = 0 is white's near edge (+Z). a is at -X. Rank 1 is nearest white.
 * Browsers get a 2048 Georgia canvas. Tests and SSR keep a small data texture.
 */
export function coordinateBorderTexture(): Texture {
  if (typeof document !== 'undefined') {
    try {
      return coordinateCanvasTexture(2048)
    } catch {
      return coordinateDataTexture(256)
    }
  }
  return coordinateDataTexture(256)
}

/** Draws a–h and 1–8. Cap height is 48px, about 0.011 m on the 0.464 m board. */
export function paintCoordinateGlyphs(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.clearRect(0, 0, size, size)
  ctx.fillStyle = '#E8D4B0'
  ctx.font = '400 48px Georgia'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const band = (0.032 / 0.464) * size
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
  const ranks = ['1', '2', '3', '4', '5', '6', '7', '8']
  for (let index = 0; index < 8; index += 1) {
    const along = band + ((index + 0.5) / 8) * (size - band * 2)
    ctx.fillText(files[index], along, band / 2)
    ctx.save()
    ctx.translate(along, size - band / 2)
    ctx.rotate(Math.PI)
    ctx.fillText(files[index], 0, 0)
    ctx.restore()
    ctx.save()
    ctx.translate(band / 2, along)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText(ranks[index], 0, 0)
    ctx.restore()
    ctx.save()
    ctx.translate(size - band / 2, along)
    ctx.rotate(Math.PI / 2)
    ctx.fillText(ranks[index], 0, 0)
    ctx.restore()
  }
}

function coordinateCanvasTexture(size: number): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d context')
  paintCoordinateGlyphs(ctx, size)
  const texture = new CanvasTexture(canvas)
  texture.encoding = sRGBEncoding
  texture.flipY = false
  texture.needsUpdate = true
  return texture
}

function coordinateDataTexture(size: number): DataTexture {
  const data = new Uint8Array(size * size * 4)
  const band = Math.round((0.032 / 0.464) * size)
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
  const ranks = ['1', '2', '3', '4', '5', '6', '7', '8']
  for (let index = 0; index < 8; index += 1) {
    const along = band + ((index + 0.5) / 8) * (size - band * 2)
    stamp(data, size, files[index], along, band / 2)
    stamp(data, size, files[index], along, size - band / 2)
    stamp(data, size, ranks[index], band / 2, along)
    stamp(data, size, ranks[index], size - band / 2, along)
  }
  const texture = publish(data, size)
  texture.flipY = false
  return texture
}

function publish(data: Uint8Array, size: number): DataTexture {
  const texture = new DataTexture(data, size, size, RGBAFormat)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.encoding = sRGBEncoding
  texture.needsUpdate = true
  return texture
}

function stamp(data: Uint8Array, size: number, glyph: string, cx: number, cy: number): void {
  const rows = FONT[glyph]
  if (!rows) return
  const scale = 3
  const width = rows[0].length * scale
  const height = rows.length * scale
  const left = Math.round(cx - width / 2)
  const top = Math.round(cy - height / 2)
  for (let row = 0; row < rows.length; row += 1) {
    for (let col = 0; col < rows[row].length; col += 1) {
      if (rows[row][col] !== '1') continue
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          const x = left + col * scale + dx
          const y = top + row * scale + dy
          if (x < 0 || y < 0 || x >= size || y >= size) continue
          const i = (y * size + x) * 4
          data[i] = 255
          data[i + 1] = 255
          data[i + 2] = 255
          data[i + 3] = 255
        }
      }
    }
  }
}

function clamp(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function hash(ix: number, iy: number): number {
  const n = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453
  return n - Math.floor(n)
}

function noise(x: number, y: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  const a = hash(x0, y0)
  const b = hash(x0 + 1, y0)
  const c = hash(x0, y0 + 1)
  const d = hash(x0 + 1, y0 + 1)
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + c * (1 - ux) * uy + d * ux * uy
}

function fbm(x: number, y: number): number {
  let value = 0
  let amplitude = 0.5
  let frequency = 1
  for (let octave = 0; octave < 4; octave += 1) {
    value += amplitude * noise(x * frequency, y * frequency)
    amplitude *= 0.5
    frequency *= 2
  }
  return value
}

const FONT: Record<string, readonly string[]> = {
  a: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  b: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  c: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  d: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  e: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  f: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  g: ['01111', '10000', '10000', '10111', '10001', '10001', '01110'],
  h: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  '6': ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
}

/** Shared micro-scratch maps so every metal piece uses one roughness and one normal. */
export function scratchMaps(): { roughness: DataTexture; normal: DataTexture } {
  const size = Math.min(128, marbleResolution())
  const rough = new Uint8Array(size * size * 4)
  const normal = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const n = fbm(x * 0.15, y * 0.15)
      const scratch = Math.abs(Math.sin(x * 0.7 + n * 6)) > 0.97 ? 0.35 : 0
      const i = (y * size + x) * 4
      const value = clamp(210 + n * 30 + scratch * 16)
      rough[i] = value
      rough[i + 1] = value
      rough[i + 2] = value
      rough[i + 3] = 255
      const dx = fbm((x + 1) * 0.15, y * 0.15) - fbm((x - 1) * 0.15, y * 0.15)
      const dy = fbm(x * 0.15, (y + 1) * 0.15) - fbm(x * 0.15, (y - 1) * 0.15)
      normal[i] = clamp(128 + dx * 90)
      normal[i + 1] = clamp(128 + dy * 90)
      normal[i + 2] = 255
      normal[i + 3] = 255
    }
  }
  return { roughness: publish(rough, size), normal: publish(normal, size) }
}

/** Keeps the texture type in the public signature without importing it twice. */
export type MarbleMap = Texture

/** 2048 on desktop, 1024 on Quest, tiny under Vitest so the suite stays fast. */
export function marbleBakeSize(): number {
  if (typeof process !== 'undefined' && process.env.VITEST) return 64
  if (typeof navigator !== 'undefined' && /Quest|Oculus/i.test(navigator.userAgent)) return 1024
  return 2048
}

export interface MarbleBakeOptions {
  size: number
  dark: boolean
  /** How strongly veins replace the body. Floor is 0.35, walls 0.25, board dark 0.85. */
  veinMix: number
  /** 8 makes a unique tile per square. 1 is a repeating slab. */
  cells: number
  base?: readonly [number, number, number]
}

/** One-time marble albedo. The fragment shader no longer evaluates noise every frame. */
export function bakeMarble(options: MarbleBakeOptions): DataTexture {
  const { size, dark, veinMix, cells } = options
  const base = options.base ?? (dark ? [11, 11, 12] : [240, 235, 227])
  const vein = dark ? [74, 69, 62] : [110, 106, 100]
  const data = new Uint8Array(size * size * 4)
  const cell = size / cells
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const file = Math.min(cells - 1, Math.floor(x / cell))
      const rank = Math.min(cells - 1, Math.floor(y / cell))
      const u = (x - file * cell) / cell
      const v = (y - rank * cell) / cell
      const seed = fract(Math.sin(file * 19.17 + rank * 73.13) * 43758.5453)
      const amount = veinAmount(u, v, seed)
      const mix = dark ? Math.min(1, amount * veinMix) : Math.min(1, amount)
      const body = dark ? 0.35 : 0.06
      const cloud = fbm(u * 3.2 + seed, v * 3.2 + seed)
      const i = (y * size + x) * 4
      data[i] = clamp(base[0] * (1 - body * cloud) * (1 - mix) + vein[0] * mix)
      data[i + 1] = clamp(base[1] * (1 - body * cloud) * (1 - mix) + vein[1] * mix)
      data[i + 2] = clamp(base[2] * (1 - body * cloud) * (1 - mix) + vein[2] * mix)
      data[i + 3] = 255
    }
  }
  const texture = publish(data, size)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.flipY = false
  return texture
}

function veinAmount(u: number, v: number, seed: number): number {
  const angle = seed * Math.PI * 2 * 0.7
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const px = u - 0.5
  const py = v - 0.5
  const rx = cos * px - sin * py + 0.5 + fract(Math.sin(seed) * 43758.5453) * 0.35
  const ry = sin * px + cos * py + 0.5 + fract(Math.sin(seed + 7.1) * 43758.5453) * 0.35
  const q = fbm(rx * 2.4 + seed, ry * 2.4 + seed)
  const q2 = fbm(rx * 2.4 + 19.2, ry * 2.4 + 19.2)
  const wx = rx + 0.22 * q
  const wy = ry + 0.22 * q2
  const ridged = 1 - Math.abs(noiseSigned(wx * 3.6 + seed, wy * 3.6 + seed))
  let vein = smoothstep(0.72, 0.98, ridged) ** 1.8
  const hair = 1 - Math.abs(noiseSigned(wx * 7.2, wy * 7.2))
  vein += 0.18 * smoothstep(0.8, 0.98, hair) ** 2.2
  return vein
}

function noiseSigned(x: number, y: number): number {
  return noise(x, y) * 2 - 1
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function fract(value: number): number {
  return value - Math.floor(value)
}
