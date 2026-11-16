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

/**
 * Read the board-center pixels immediately after render and publish them
 * on the canvas. Later `getContext` calls from a test would steal the
 * drawing buffer, so the smoke test reads these attributes instead.
 */
export function publishFrameSample(gl: FrameSampleGl): void {
  const canvas = gl.domElement
  if (!canvas?.dataset || canvas.dataset.frame === '1') return
  const context = gl.getContext?.()
  if (!context || canvas.width < 16 || canvas.height < 16) return
  const size = 16
  const x = Math.max(0, Math.floor(canvas.width / 2) - size / 2)
  const y = Math.max(0, Math.floor(canvas.height / 2) - size / 2)
  const pixels = new Uint8Array(size * size * 4)
  context.readPixels(x, y, size, size, context.RGBA, context.UNSIGNED_BYTE, pixels)
  let sum = 0
  let sum2 = 0
  const count = size * size
  for (let index = 0; index < pixels.length; index += 4) {
    const luminance = pixels[index] + pixels[index + 1] + pixels[index + 2]
    sum += luminance
    sum2 += luminance * luminance
  }
  const mean = sum / count
  const variance = sum2 / count - mean * mean
  if (mean <= 12 || variance <= 4) return
  canvas.dataset.frame = '1'
  canvas.dataset.mean = mean.toFixed(2)
  canvas.dataset.variance = variance.toFixed(2)
}
