import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three'
import { mergeBufferGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const mm = (value: number) => value / 1000
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const bell = (x: number, centre: number, width: number) => Math.exp(-(((x - centre) / width) ** 2))
const smooth = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}
/** Angle wrapped to [-PI, PI]. */
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle))

type Point = readonly [number, number, number]

/** A cubic Bezier spine in millimetres. */
export class Spine {
  /** Four control points, start to end. */
  constructor(private readonly p: readonly [Point, Point, Point, Point]) {}

  /** Point at s in [0, 1]. */
  at(s: number): Vector3 {
    const [a, b, c, d] = this.p
    const u = 1 - s
    const w = [u * u * u, 3 * u * u * s, 3 * u * s * s, s * s * s]
    return new Vector3(
      w[0]! * a[0] + w[1]! * b[0] + w[2]! * c[0] + w[3]! * d[0],
      w[0]! * a[1] + w[1]! * b[1] + w[2]! * c[1] + w[3]! * d[1],
      w[0]! * a[2] + w[1]! * b[2] + w[2]! * c[2] + w[3]! * d[2],
    )
  }

  /** Unit tangent at s in [0, 1]. */
  tangent(s: number): Vector3 {
    const [a, b, c, d] = this.p
    const u = 1 - s
    const w = [-3 * u * u, 3 * u * u - 6 * u * s, 6 * u * s - 3 * s * s, 3 * s * s]
    return new Vector3(
      w[0]! * a[0] + w[1]! * b[0] + w[2]! * c[0] + w[3]! * d[0],
      w[0]! * a[1] + w[1]! * b[1] + w[2]! * c[1] + w[3]! * d[1],
      w[0]! * a[2] + w[1]! * b[2] + w[2]! * c[2] + w[3]! * d[2],
    ).normalize()
  }
}

/**
 * A rounded cross-section in millimetres. Angle 0 points along the frame normal (up or back),
 * PI points the other way (chin or throat), and +-PI/2 are the cheeks.
 */
export interface Section {
  /** Radius on the angle-0 side. */
  upper(s: number): number
  /** Radius on the angle-PI side. */
  lower(s: number): number
  /** Half width across the cheeks. */
  half(s: number): number
  /** 0 at the rounded ends, 1 in between. */
  envelope(s: number): number
  /** Extra outward offset, for the mane, eye sockets and nostrils. */
  relief?(s: number, angle: number): number
}

/** Rings along the spine and segments around each ring. */
export interface LoftDetail {
  readonly rings: number
  readonly segments: number
}

/**
 * Loft elliptical rings along a curved spine and close both ends with a pole.
 * The rings share vertices around the seam, so computeVertexNormals gives one smooth surface.
 */
export function loft(spine: Spine, section: Section, detail: LoftDetail): BufferGeometry {
  const { rings, segments } = detail
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const z = new Vector3(0, 0, 1)
  const push = (point: Vector3, u: number, v: number) => {
    positions.push(mm(point.x), mm(point.y), mm(point.z))
    uvs.push(u, v)
  }
  push(spine.at(0), 0.5, 0)
  for (let ring = 1; ring <= rings; ring += 1) {
    const s = ring / (rings + 1)
    const centre = spine.at(s)
    const tangent = spine.tangent(s)
    const normal = new Vector3().crossVectors(z, tangent).normalize()
    const binormal = new Vector3().crossVectors(tangent, normal).normalize()
    const envelope = section.envelope(s)
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = (segment / segments) * Math.PI * 2
      const c = Math.cos(angle)
      const sn = Math.sin(angle)
      const along = c * (c >= 0 ? section.upper(s) : section.lower(s))
      const across = sn * section.half(s)
      const length = Math.hypot(along, across) || 1
      const relief = section.relief ? section.relief(s, wrap(angle)) : 0
      const scale = envelope * (1 + relief / length)
      const point = centre
        .clone()
        .addScaledVector(normal, along * scale)
        .addScaledVector(binormal, across * scale)
      push(point, segment / segments, s)
    }
  }
  push(spine.at(1), 0.5, 1)
  const ringStart = (ring: number) => 1 + (ring - 1) * segments
  const last = 1 + rings * segments
  for (let segment = 0; segment < segments; segment += 1) {
    const next = (segment + 1) % segments
    indices.push(0, ringStart(1) + next, ringStart(1) + segment)
    for (let ring = 1; ring < rings; ring += 1) {
      const a = ringStart(ring) + segment
      const b = ringStart(ring) + next
      const c = ringStart(ring + 1) + segment
      const d = ringStart(ring + 1) + next
      indices.push(a, b, c, b, d, c)
    }
    indices.push(ringStart(rings) + segment, ringStart(rings) + next, last)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/** Rounded at both ends: a dome of length `start` at s=0 and `end` at s=1. */
const domes = (start: number, end: number) => (s: number) =>
  Math.sqrt(Math.min(1, s / start)) * Math.sqrt(Math.min(1, (1 - s) / end))

/** Crested neck. The chest is full at the front and the mane ridge runs up the back. */
const NECK_SPINE = new Spine([
  [1, 10, 0],
  [-1, 21, 0],
  [-4, 32, 0],
  [-4.5, 44, 0],
])
const NECK: Section = {
  upper: (s) => lerp(8, 6.5, s),
  lower: (s) => lerp(10.5, 7, s) + 1 * bell(s, 0.25, 0.15),
  half: (s) => lerp(8.5, 6.6, s),
  envelope: domes(0.06, 0.3),
  relief: (s, angle) => 2.1 * smooth(0.22, 0.45, s) * bell(angle, 0, 0.34) * (1 + 0.07 * Math.sin(s * Math.PI * 10)),
}

/** Skull to muzzle. A deep jowl under the cheek, eye sockets above it, and flared nostrils. */
const HEAD_SPINE = new Spine([
  [-8, 47.5, 0],
  [0.5, 43.5, 0],
  [8, 37, 0],
  [14.5, 30.5, 0],
])
const HEAD: Section = {
  upper: (s) => lerp(6.5, 4.5, s),
  lower: (s) => lerp(6, 4.2, s) + 6 * bell(s, 0.25, 0.17),
  half: (s) => lerp(7, 4.6, s) + 1.6 * bell(s, 0.3, 0.14) + 0.6 * bell(s, 0.92, 0.06),
  envelope: domes(0.22, 0.12),
  relief: (s, angle) => {
    const side = Math.abs(angle)
    const socket = -2 * bell(s, 0.36, 0.07) * bell(side, 1.0, 0.28)
    const brow = 0.9 * bell(s, 0.31, 0.06) * bell(side, 0.62, 0.2)
    const nostril = -0.7 * bell(s, 0.9, 0.04) * bell(side, 1.75, 0.3)
    const mouth = -0.55 * smooth(0.72, 0.84, s) * bell(side, 2.35, 0.14)
    return socket + brow + nostril + mouth
  },
}

const ear = (side: 1 | -1): BufferGeometry =>
  loft(
    new Spine([
      [-2.5, 49.5, side * 3],
      [-2.4, 51.8, side * 3.3],
      [-2.1, 54.2, side * 3.6],
      [-1.4, 56.5, side * 3.9],
    ]),
    {
      upper: () => 2.2,
      lower: () => 1.7,
      half: () => 1.5,
      envelope: (s) => Math.sqrt(Math.min(1, s / 0.15)) * (1 - s) ** 0.6,
    },
    EAR_DETAIL,
  )

/** Ring and segment counts. The pieces are the same on every tier, so this is the Quest budget too. */
export const NECK_DETAIL: LoftDetail = { rings: 20, segments: 24 }
export const HEAD_DETAIL: LoftDetail = { rings: 22, segments: 24 }
export const EAR_DETAIL: LoftDetail = { rings: 5, segments: 10 }

/** Most triangles one knight head may add, so four knights stay inside the Quest frame budget. */
export const KNIGHT_HEAD_TRIANGLE_BUDGET = 2400

/** The indexed, closed parts of the head: neck, skull and muzzle, and the two ears. */
export function knightHeadParts(): BufferGeometry[] {
  return [loft(NECK_SPINE, NECK, NECK_DETAIL), loft(HEAD_SPINE, HEAD, HEAD_DETAIL), ear(1), ear(-1)]
}

/**
 * Staunton horse head sculpted from lofted rounded sections: a crested neck with a mane ridge,
 * a skull with eye sockets and a deep jaw, a tapered muzzle with nostrils, and two ears.
 * The muzzle points to +X. It sits on the lathed `knightBase` and shares its materials.
 */
export function buildKnightHead(): BufferGeometry {
  const parts = knightHeadParts()
  const flat = parts.map((part) => part.toNonIndexed())
  for (const part of parts) part.dispose()
  const merged = mergeBufferGeometries(flat)
  for (const part of flat) part.dispose()
  if (!merged) throw new Error('knight head merge failed')
  return merged
}
