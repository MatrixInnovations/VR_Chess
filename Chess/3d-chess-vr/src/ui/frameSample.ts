/** A renderer that can read its own drawing buffer right after a frame. */
export interface FrameSampleGl {
  domElement?: {
    width: number
    height: number
    dataset?: DOMStringMap
  }
  getContext?: () => {
    readPixels: (
      x: number,
      y: number,
      width: number,
      height: number,
      format: number,
      type: number,
      pixels: Uint8Array,
    ) => void
    RGBA: number
    UNSIGNED_BYTE: number
  } | null
}

/** Center-pixel sample taken immediately after gl.render. */
export interface FrameProbe {
  mean: number
  variance: number
  frames: number
}

let sampleTick = 0
let probeFrames = 0

/**
 * Mark the canvas after a real render.
 * DOM writes are throttled. XR skips them. The pixel probe is separate.
 */
export function publishFrameSample(gl: FrameSampleGl, presenting = false): void {
  if (presenting) return
  const canvas = gl.domElement
  if (!canvas?.dataset) return
  if (canvas.width < 16 || canvas.height < 16) return
  sampleTick += 1
  if (sampleTick !== 1 && sampleTick % 12 !== 0) return
  canvas.dataset.frame = '1'
  canvas.dataset.frames = String(Number(canvas.dataset.frames ?? '0') + 1)
}

const probePixels = new Uint8Array(16 * 16 * 4)

/**
 * Read the center of the drawing buffer right after the frame is presented.
 * A blank buffer stays near zero, so a test that disables rendering fails.
 */
export function readCenterProbe(gl: FrameSampleGl, ndc?: { x: number; y: number }): FrameProbe | null {
  const canvas = gl.domElement
  const context = gl.getContext?.()
  if (!canvas || !context || canvas.width < 16 || canvas.height < 16) return null
  const size = 16
  const onBoard = ndc !== undefined && ndc.x >= -1 && ndc.x <= 1 && ndc.y >= -1 && ndc.y <= 1
  const originX = onBoard ? (ndc.x * 0.5 + 0.5) * canvas.width : canvas.width / 2
  const originY = onBoard ? (ndc.y * 0.5 + 0.5) * canvas.height : canvas.height / 2
  const x = Math.max(0, Math.min(canvas.width - size, Math.floor(originX - size / 2)))
  const y = Math.max(0, Math.min(canvas.height - size, Math.floor(originY - size / 2)))
  context.readPixels(x, y, size, size, context.RGBA, context.UNSIGNED_BYTE, probePixels)
  let sum = 0
  let sum2 = 0
  const count = size * size
  for (let index = 0; index < probePixels.length; index += 4) {
    const luminance = probePixels[index] + probePixels[index + 1] + probePixels[index + 2]
    sum += luminance
    sum2 += luminance * luminance
  }
  const mean = sum / count
  probeFrames += 1
  return { mean, variance: sum2 / count - mean * mean, frames: probeFrames }
}
