import { BoxGeometry, BufferGeometry, ExtrudeGeometry, Shape, SphereGeometry } from 'three'
import { mergeBufferGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const mm = (value: number) => value / 1000

/** Side-view horse. The muzzle points to +X. */
export function knightShape(): Shape {
  const shape = new Shape()
  shape.moveTo(mm(-8.5), mm(13.5))
  shape.lineTo(mm(7.5), mm(13.5))
  shape.quadraticCurveTo(mm(10), mm(20), mm(7.5), mm(27))
  shape.lineTo(mm(5), mm(31.5))
  shape.quadraticCurveTo(mm(7), mm(35.5), mm(12), mm(37.5))
  shape.quadraticCurveTo(mm(16.5), mm(39), mm(16.8), mm(42.5))
  shape.quadraticCurveTo(mm(16.8), mm(46), mm(13), mm(47.5))
  shape.lineTo(mm(7.5), mm(51))
  shape.lineTo(mm(5.5), mm(53.2))
  shape.lineTo(mm(4.6), mm(55.0))
  shape.lineTo(mm(2), mm(53.6))
  shape.lineTo(mm(0.4), mm(55.2 - 0.6))
  shape.lineTo(mm(-1.4), mm(52.6))
  shape.quadraticCurveTo(mm(-6), mm(50.5), mm(-8.5), mm(45))
  shape.quadraticCurveTo(mm(-11.5), mm(37), mm(-11), mm(28))
  shape.quadraticCurveTo(mm(-10.5), mm(20), mm(-8.5), mm(13.5))
  return shape
}

/**
 * Staunton horse: a rounded profile, a muzzle bulb, a jaw, an ear, and a mane.
 * The silhouette is still the side view. The cross-section is an oval, not a slab.
 */
export function buildKnightHead(): BufferGeometry {
  const geometry = new ExtrudeGeometry(knightShape(), {
    depth: 0.028,
    steps: 1,
    curveSegments: 16,
    bevelEnabled: true,
    bevelThickness: 0.003,
    bevelSize: 0.0026,
    bevelOffset: 0,
    bevelSegments: 4,
  })
  geometry.translate(0, 0, -0.014)
  shapeKnight(geometry)
  const head = geometry.toNonIndexed()
  geometry.dispose()
  const parts = [
    head,
    place(new BoxGeometry(0.0034, 0.02, 0.012), -0.0065, 0.047, 0, 0.6),
    place(new BoxGeometry(0.0026, 0.012, 0.009), 0.0005, 0.053, 0, -0.35),
    place(new SphereGeometry(0.0064, 12, 8), 0.013, 0.039, 0, 0, 1.35, 0.7, 0.92),
    place(new SphereGeometry(0.0052, 10, 7), 0.0075, 0.032, 0, 0, 1.15, 0.75, 0.88),
    place(new SphereGeometry(0.0034, 8, 6), -0.0005, 0.0565, 0, 0, 0.5, 1.55, 0.62),
  ]
  const merged = mergeBufferGeometries(parts)
  for (const part of parts) part.dispose()
  if (!merged) throw new Error('knight head merge failed')
  merged.computeVertexNormals()
  return merged
}

function place(
  geometry: BufferGeometry,
  x: number,
  y: number,
  z: number,
  rotZ = 0,
  sx = 1,
  sy = 1,
  sz = 1,
): BufferGeometry {
  geometry.scale(sx, sy, sz)
  geometry.rotateZ(rotZ)
  geometry.translate(x, y, z)
  const flat = geometry.toNonIndexed()
  geometry.dispose()
  return flat
}

function shapeKnight(geometry: ExtrudeGeometry): void {
  const position = geometry.getAttribute('position')
  const half = 0.018
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index)
    const y = position.getY(index)
    const z = position.getZ(index)
    const muzzle = Math.max(0, (x - 0.004) / 0.012)
    const cheek = Math.exp(-((x - 0.0) ** 2 + (y - 0.042) ** 2) / 5e-5)
    const neck = y < 0.032 ? 1.18 : 1
    const nz = Math.min(1, Math.abs(z) / half)
    const round = Math.sqrt(Math.max(0.22, 1 - nz * nz))
    const thickness = half * round * (1 - 0.4 * muzzle) * (1 + 0.3 * cheek) * neck
    position.setZ(index, Math.sign(z) * thickness)
  }
  position.needsUpdate = true
  geometry.computeVertexNormals()
}
