import { BoxGeometry, BufferGeometry, LatheGeometry, SphereGeometry } from 'three'
import { mergeBufferGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import type { PieceKind } from '../contracts/types'
import { buildKnightHead } from './KnightHead'
import { KING_HEIGHT_M } from './metrics'
import { LATHE_SEGMENTS, PROFILE } from './PieceProfiles'

const flat = (geometry: BufferGeometry) => (geometry.index ? geometry.toNonIndexed() : geometry)

function merge(parts: BufferGeometry[]): BufferGeometry {
  const prepared = parts.map(flat)
  const out = mergeBufferGeometries(prepared)
  for (const part of parts) part.dispose()
  for (const part of prepared) {
    if (!parts.includes(part)) part.dispose()
  }
  if (!out) throw new Error('piece geometry merge failed')
  out.computeBoundingSphere()
  out.computeBoundingBox()
  return out
}

const lathe = (kind: keyof typeof PROFILE) => new LatheGeometry([...PROFILE[kind]], LATHE_SEGMENTS)

const box = (w: number, h: number, d: number, x: number, y: number, z: number, rotY = 0) => {
  const geometry = new BoxGeometry(w, h, d)
  if (rotY) geometry.rotateY(rotY)
  geometry.translate(x, y, z)
  return geometry
}

/**
 * Pinch a visible mitre slit into the bishop, then reinforce it with a thin dark-reading groove.
 * The vertex pinch alone only catches a few meridians at 24 segments.
 */
export function carveMitreSlit(geometry: BufferGeometry): BufferGeometry {
  const position = geometry.getAttribute('position')
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index)
    const y = position.getY(index)
    const z = position.getZ(index)
    if (y < 0.0405 || y > 0.0535) continue
    const theta = Math.atan2(z, x)
    const centre = ((y - 0.047) / 0.0065) * 0.3
    const distance = Math.abs(theta - centre)
    const halfWidth = 0.55
    if (distance < halfWidth) {
      const pull = 1 - 0.72 * (1 - distance / halfWidth)
      position.setXYZ(index, x * pull, y, z * pull)
    }
  }
  position.needsUpdate = true
  geometry.computeVertexNormals()
  return geometry
}

function build(kind: PieceKind): BufferGeometry {
  switch (kind) {
    case 'king':
      return merge([
        lathe('king'),
        box(0.0042, 0.0095, 0.0042, 0, 0.07995, 0),
        box(0.0095, 0.0034, 0.0042, 0, 0.0812, 0),
      ])
    case 'queen':
      return merge([lathe('queen'), new SphereGeometry(0.0037, 10, 6).translate(0, 0.0707, 0)])
    case 'bishop':
      return merge([
        carveMitreSlit(lathe('bishop')),
        box(0.0008, 0.014, 0.012, 0.006, 0.048, 0, 0.35),
      ])
    case 'knight':
      return merge([lathe('knightBase'), buildKnightHead()])
    case 'rook': {
      const parts: BufferGeometry[] = [lathe('rook')]
      for (let index = 0; index < 6; index += 1) {
        const angle = (index / 6) * Math.PI * 2
        parts.push(box(0.0069, 0.0066, 0.0028, Math.sin(angle) * 0.0119, 0.0477, Math.cos(angle) * 0.0119, angle))
      }
      return merge(parts)
    }
    case 'pawn':
      return merge([lathe('pawn')])
    default:
      throw new Error(`unknown piece kind ${String(kind)}`)
  }
}

const cache = new Map<PieceKind, BufferGeometry>()

let fit = 0

/** Scale every kind so the king stands at {@link KING_HEIGHT_M}. */
function unitScale(): number {
  if (fit) return fit
  const king = build('king')
  king.computeBoundingBox()
  const height = king.boundingBox?.max.y || KING_HEIGHT_M
  fit = KING_HEIGHT_M / height
  king.scale(fit, fit, fit)
  cache.set('king', king)
  return fit
}

/** One geometry per kind, shared by both colours. PieceModel must not dispose it. */
export function pieceGeometry(kind: PieceKind): BufferGeometry {
  const existing = cache.get(kind)
  if (existing) return existing
  const scale = unitScale()
  if (kind === 'king') return cache.get('king') as BufferGeometry
  const geometry = build(kind)
  geometry.scale(scale, scale, scale)
  cache.set(kind, geometry)
  return geometry
}

/** Release the shared piece geometries. ChessHall calls this on teardown. */
export function disposePieceGeometries(): void {
  for (const geometry of cache.values()) geometry.dispose()
  cache.clear()
}
