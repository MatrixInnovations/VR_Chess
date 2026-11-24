import { BufferGeometry, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'

import { buildKnightHead, KNIGHT_HEAD_TRIANGLE_BUDGET, knightHeadParts } from '../hall/KnightHead'
import { PROFILE } from '../hall/PieceProfiles'

const corners = (geometry: BufferGeometry, triangle: number) => {
  const position = geometry.getAttribute('position')
  const index = geometry.getIndex()
  const at = (k: number) => (index ? index.getX(triangle * 3 + k) : triangle * 3 + k)
  return [0, 1, 2].map((k) => ({ id: at(k), p: new Vector3().fromBufferAttribute(position, at(k)) }))
}

const triangles = (geometry: BufferGeometry) =>
  (geometry.getIndex()?.count ?? geometry.getAttribute('position').count) / 3

function signedVolume(geometry: BufferGeometry): number {
  let volume = 0
  for (let t = 0; t < triangles(geometry); t += 1) {
    const [a, b, c] = corners(geometry, t)
    volume += a!.p.dot(b!.p.clone().cross(c!.p)) / 6
  }
  return volume
}

describe('knight head', () => {
  it('stays inside the per-knight triangle budget', () => {
    const head = buildKnightHead()
    expect(triangles(head)).toBeLessThanOrEqual(KNIGHT_HEAD_TRIANGLE_BUDGET)
    head.dispose()
  })

  it('is built from closed parts whose faces and normals all point outward', () => {
    for (const part of knightHeadParts()) {
      expect(signedVolume(part)).toBeGreaterThan(0)
      // Every vertex is shared around the seam, so the shading is one smooth surface.
      const position = part.getAttribute('position')
      const unique = new Set<string>()
      for (let i = 0; i < position.count; i += 1) {
        unique.add(`${position.getX(i).toFixed(7)},${position.getY(i).toFixed(7)},${position.getZ(i).toFixed(7)}`)
      }
      expect(unique.size).toBe(position.count)
      part.dispose()
    }
    const head = buildKnightHead()
    const normal = head.getAttribute('normal')
    let opposing = 0
    for (let t = 0; t < triangles(head); t += 1) {
      const [a, b, c] = corners(head, t)
      const face = b!.p.clone().sub(a!.p).cross(c!.p.clone().sub(a!.p))
      if (face.lengthSq() < 1e-16) continue
      face.normalize()
      for (const corner of [a!, b!, c!]) {
        const n = new Vector3().fromBufferAttribute(normal, corner.id)
        expect(n.length()).toBeCloseTo(1, 3)
        if (n.dot(face) <= 0) opposing += 1
      }
    }
    expect(opposing).toBe(0)
    head.dispose()
  })

  it('sits on the knight base and reads as a horse from the side', () => {
    const head = buildKnightHead()
    head.computeBoundingBox()
    const box = head.boundingBox!
    const baseTop = Math.max(...PROFILE.knightBase.map((point) => point.y))
    const baseRadius = Math.max(...PROFILE.knightBase.map((point) => point.x))
    expect(box.min.y).toBeLessThan(baseTop)
    expect(box.min.y).toBeGreaterThan(0)
    for (const value of [box.min.x, box.max.x, box.min.z, box.max.z]) expect(Math.abs(value)).toBeLessThan(baseRadius)

    const position = head.getAttribute('position')
    let top = new Vector3(0, -1, 0)
    let muzzle = new Vector3(-1, 0, 0)
    let back = new Vector3(1, 0, 0)
    for (let i = 0; i < position.count; i += 1) {
      const p = new Vector3().fromBufferAttribute(position, i)
      if (p.y > top.y) top = p
      if (p.x > muzzle.x) muzzle = p
      if (p.x < back.x) back = p
    }
    // Ears are the highest point, set back over the poll and off the centre line.
    expect(Math.abs(top.z)).toBeGreaterThan(0.002)
    expect(top.x).toBeLessThan(0)
    // The muzzle points forward and down, well below the ears.
    expect(muzzle.y).toBeLessThan(top.y - 0.015)
    expect(muzzle.y).toBeGreaterThan(baseTop + 0.01)
    // The mane ridge is the back-most point, up the neck.
    expect(back.y).toBeGreaterThan(0.025)
    head.dispose()
  })
})
