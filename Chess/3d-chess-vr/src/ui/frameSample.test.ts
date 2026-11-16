import { describe, expect, it } from 'vitest'

import { publishFrameSample } from './frameSample'

describe('publishFrameSample', () => {
  it('publishes a center sample only after the frame has color', () => {
    const dataset: DOMStringMap = {}
    const blank = new Uint8Array(16 * 16 * 4)
    publishFrameSample({
      domElement: { width: 1280, height: 800, dataset },
      getContext: () => ({
        RGBA: 0x1908,
        UNSIGNED_BYTE: 0x1401,
        readPixels(_x, _y, _w, _h, _format, _type, pixels) {
          pixels.set(blank)
        },
      }),
    })
    expect(dataset.frame).toBeUndefined()

    publishFrameSample({
      domElement: { width: 1280, height: 800, dataset },
      getContext: () => ({
        RGBA: 0x1908,
        UNSIGNED_BYTE: 0x1401,
        readPixels(_x, _y, _w, _h, _format, _type, pixels) {
          for (let index = 0; index < pixels.length; index += 4) {
            pixels[index] = index % 32
            pixels[index + 1] = 40
            pixels[index + 2] = 80
            pixels[index + 3] = 255
          }
        },
      }),
    })
    expect(dataset.frame).toBe('1')
    expect(Number(dataset.mean)).toBeGreaterThan(12)
    expect(Number(dataset.variance)).toBeGreaterThan(4)

    dataset.mean = '1'
    publishFrameSample({
      domElement: { width: 1280, height: 800, dataset },
      getContext: () => {
        throw new Error('should not read again')
      },
    })
    expect(dataset.mean).toBe('1')
  })
})
