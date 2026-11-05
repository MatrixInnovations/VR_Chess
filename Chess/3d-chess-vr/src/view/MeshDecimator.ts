import * as THREE from 'three'

/**
 * Vertex clustering for the high-poly Staunton meshes.
 * The source files are hundreds of thousands of triangles; Quest needs a few thousand.
 */
export class MeshDecimator {
  static toBudget(source: THREE.BufferGeometry, targetVertices: number): THREE.BufferGeometry {
    const position = source.getAttribute('position')
    if (!position) return source
    let cell = MeshDecimator.cellSize(position, 28)
    let best = source
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const next = MeshDecimator.cluster(best, cell)
      if (best !== source) best.dispose()
      best = next
      if (best.getAttribute('position').count <= targetVertices) break
      cell *= 1.7
    }
    best.computeVertexNormals()
    return best
  }

  private static cellSize(position: THREE.BufferGeometry['attributes']['position'], divisions: number): number {
    let minX = Infinity
    let minY = Infinity
    let minZ = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    let maxZ = -Infinity
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i)
      const y = position.getY(i)
      const z = position.getZ(i)
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (z < minZ) minZ = z
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
      if (z > maxZ) maxZ = z
    }
    return Math.max(maxX - minX, maxY - minY, maxZ - minZ) / divisions
  }

  private static cluster(geometry: THREE.BufferGeometry, cell: number): THREE.BufferGeometry {
    const position = geometry.getAttribute('position')
    const index = geometry.getIndex()
    const triangles = index ? index.count / 3 : position.count / 3
    const cells = new Map<string, number>()
    const accum: number[] = []
    const counts: number[] = []
    const remap = new Map<number, number>()

    const vertex = (original: number): number => {
      const known = remap.get(original)
      if (known !== undefined) return known
      const x = position.getX(original)
      const y = position.getY(original)
      const z = position.getZ(original)
      const key = `${Math.round(x / cell)}:${Math.round(y / cell)}:${Math.round(z / cell)}`
      let id = cells.get(key)
      if (id === undefined) {
        id = cells.size
        cells.set(key, id)
        accum.push(x, y, z)
        counts.push(1)
      } else {
        accum[id * 3] += x
        accum[id * 3 + 1] += y
        accum[id * 3 + 2] += z
        counts[id] += 1
      }
      remap.set(original, id)
      return id
    }

    const indices: number[] = []
    for (let triangle = 0; triangle < triangles; triangle += 1) {
      const a = index ? index.getX(triangle * 3) : triangle * 3
      const b = index ? index.getX(triangle * 3 + 1) : triangle * 3 + 1
      const c = index ? index.getX(triangle * 3 + 2) : triangle * 3 + 2
      const ia = vertex(a)
      const ib = vertex(b)
      const ic = vertex(c)
      if (ia === ib || ib === ic || ia === ic) continue
      indices.push(ia, ib, ic)
    }

    const positions = new Float32Array(cells.size * 3)
    for (let i = 0; i < cells.size; i += 1) {
      const count = counts[i] || 1
      positions[i * 3] = accum[i * 3] / count
      positions[i * 3 + 1] = accum[i * 3 + 1] / count
      positions[i * 3 + 2] = accum[i * 3 + 2] / count
    }
    const result = new THREE.BufferGeometry()
    result.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    result.setIndex(indices)
    return result
  }
}
