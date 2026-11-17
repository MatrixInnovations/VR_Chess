import { describe, expect, it } from 'vitest'

import { PIECE_LUMINANCE_MEAN, PIECE_LUMINANCE_STDDEV, publishFrameSample, readCenterProbe, readLuminanceStats } from './frameSample'

describe('publishFrameSample', () => {
  it('marks the canvas after it has a real drawing size', () => {
    const dataset: DOMStringMap = {}
    publishFrameSample({ domElement: { width: 8, height: 8, dataset } })
    expect(dataset.frame).toBeUndefined()
    publishFrameSample({ domElement: { width: 1280, height: 800, dataset } })
    expect(dataset.frame).toBe('1')
    expect(dataset.frames).toBe('1')
    publishFrameSample({ domElement: { width: 1280, height: 800, dataset } })
    expect(dataset.frames).toBe('1')
    for (let index = 0; index < 10; index += 1) {
      publishFrameSample({ domElement: { width: 1280, height: 800, dataset } })
    }
    expect(dataset.frames).toBe('2')
    publishFrameSample({ domElement: { width: 1280, height: 800, dataset } }, true)
    expect(dataset.frames).toBe('2')
  })

  it('stays under the paint threshold when the drawing buffer is blank', () => {
    const blank = readCenterProbe({
      domElement: { width: 64, height: 64 },
      getContext: () => ({
        readPixels(_x, _y, _width, _height, _format, _type, pixels) {
          pixels.fill(0)
        },
        RGBA: 0,
        UNSIGNED_BYTE: 0,
      }),
    })
    expect((blank?.mean ?? 0) > 12 && (blank?.variance ?? 0) > 4).toBe(false)
    let origin = { x: 0, y: 0 }
    readCenterProbe(
      {
        domElement: { width: 200, height: 100 },
        getContext: () => ({
          readPixels(x: number, y: number) {
            origin = { x, y }
          },
          RGBA: 0,
          UNSIGNED_BYTE: 0,
        }),
      },
      { x: 0, y: -0.5 },
    )
    expect(origin.x).toBeLessThan(100)
    expect(origin.y).toBeLessThan(40)
  })

  it('reports luminance spread above the piece threshold when the patch is shaded', () => {
    const flat = readLuminanceStats(
      {
        domElement: { width: 64, height: 64 },
        getContext: () => ({
          readPixels(_x, _y, _w, _h, _format, _type, pixels) {
            for (let index = 0; index < pixels.length; index += 4) {
              pixels[index] = 140
              pixels[index + 1] = 140
              pixels[index + 2] = 140
              pixels[index + 3] = 255
            }
          },
          RGBA: 0,
          UNSIGNED_BYTE: 0,
        }),
      },
      { x: 0, y: 0 },
      32,
    )
    expect(flat?.stddev ?? 99).toBeLessThan(PIECE_LUMINANCE_STDDEV)
    const shaded = readLuminanceStats(
      {
        domElement: { width: 64, height: 64 },
        getContext: () => ({
          readPixels(_x, _y, width, _h, _format, _type, pixels) {
            for (let index = 0; index < pixels.length; index += 4) {
              const column = (index / 4) % width
              const tone = column < width / 2 ? 30 : 210
              pixels[index] = tone
              pixels[index + 1] = tone
              pixels[index + 2] = tone
              pixels[index + 3] = 255
            }
          },
          RGBA: 0,
          UNSIGNED_BYTE: 0,
        }),
      },
      { x: 0, y: 0 },
      32,
    )
    expect(shaded?.stddev ?? 0).toBeGreaterThan(PIECE_LUMINANCE_STDDEV)
    expect(shaded?.mean ?? 0).toBeGreaterThan(PIECE_LUMINANCE_MEAN)
    expect(readLuminanceStats(
      { domElement: { width: 64, height: 64 }, getContext: () => null },
      { x: 2, y: 0 },
    )).toBeNull()
  })
})
