import { describe, expect, it } from 'vitest'

import { publishFrameSample } from './frameSample'

describe('publishFrameSample', () => {
  it('marks the canvas after it has a real drawing size', () => {
    const dataset: DOMStringMap = {}
    publishFrameSample({ domElement: { width: 8, height: 8, dataset } })
    expect(dataset.frame).toBeUndefined()
    publishFrameSample({ domElement: { width: 1280, height: 800, dataset } })
    expect(dataset.frame).toBe('1')
    publishFrameSample({ domElement: { width: 1280, height: 800, dataset } })
    expect(dataset.frame).toBe('1')
  })
})
