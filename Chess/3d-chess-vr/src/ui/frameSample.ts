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
 * Mark the canvas after a real render. Headless Playwright's readPixels stays
 * zero even when the board is on screen, so the smoke test screenshots the
 * canvas instead of reading the drawing buffer.
 */
export function publishFrameSample(gl: FrameSampleGl): void {
  const canvas = gl.domElement
  if (!canvas?.dataset || canvas.dataset.frame === '1') return
  if (canvas.width < 16 || canvas.height < 16) return
  canvas.dataset.frame = '1'
}
