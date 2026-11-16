import { ExtrudeGeometry, Shape } from 'three'

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

/** Extruded, bevelled horse head with a narrowed muzzle and cheek swell. */
export function buildKnightHead(): ExtrudeGeometry {
  const geometry = new ExtrudeGeometry(knightShape(), {
    depth: 0.016,
    steps: 1,
    curveSegments: 8,
    bevelEnabled: true,
    bevelThickness: 0.0015,
    bevelSize: 0.001,
    bevelOffset: 0,
    bevelSegments: 3,
  })
  geometry.translate(0, 0, -0.008)
  shapeKnight(geometry)
  return geometry
}

function shapeKnight(geometry: ExtrudeGeometry): void {
  const position = geometry.getAttribute('position')
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index)
    const y = position.getY(index)
    const z = position.getZ(index)
    const muzzle = Math.max(0, (x - 0.006) / 0.0108)
    const cheek = Math.exp(-((x - 0.002) ** 2 + (y - 0.044) ** 2) / 4e-5)
    const neck = y < 0.03 ? 1 + 0.15 * (1 - y / 0.03) : 1
    position.setZ(index, z * (1 - 0.55 * muzzle) * (1 + 0.22 * cheek) * neck)
  }
  position.needsUpdate = true
  geometry.computeVertexNormals()
}
