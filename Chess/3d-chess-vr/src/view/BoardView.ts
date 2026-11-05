import * as THREE from 'three'
import type { Color } from '../domain/Color'
import type { GameSession } from '../domain/GameSession'
import type { PieceType } from '../domain/Piece'
import { Position } from '../domain/Position'
import { HallMaterials } from './HallMaterials'
import { HallMetrics } from './HallMetrics'
import type { PieceLibrary } from './PieceLibrary'

class PieceActor {
  uid: number
  type: PieceType
  color: Color
  local = new THREE.Vector3()
  from = new THREE.Vector3()
  to = new THREE.Vector3()
  t = 1
  removed = false

  constructor(uid: number, type: PieceType, color: Color, at: THREE.Vector3) {
    this.uid = uid
    this.type = type
    this.color = color
    this.local.copy(at)
    this.from.copy(at)
    this.to.copy(at)
  }
}

class PieceBatch {
  readonly mesh: THREE.InstancedMesh
  uids: number[] = []

  constructor(geometry: THREE.BufferGeometry, material: THREE.Material) {
    this.mesh = new THREE.InstancedMesh(geometry, material, 16)
    this.mesh.count = 0
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
    this.mesh.frustumCulled = false
    this.mesh.userData.kind = 'piece'
    this.mesh.userData.uids = this.uids
  }
}

export class BoardView {
  readonly group = new THREE.Group()
  private readonly actors = new Map<number, PieceActor>()
  private readonly batches = new Map<string, PieceBatch>()
  private readonly lightSquares: THREE.InstancedMesh
  private readonly darkSquares: THREE.InstancedMesh
  private readonly lightSlots: Position[] = []
  private readonly darkSlots: Position[] = []
  private readonly markers: THREE.InstancedMesh
  private readonly rings: THREE.InstancedMesh
  private readonly selection: THREE.Mesh
  private readonly dummy = new THREE.Object3D()
  private readonly scratch = new THREE.Vector3()
  private readonly worldPoint = new THREE.Vector3()
  private readonly lightColor = new THREE.Color('#f3e2c0')
  private readonly darkColor = new THREE.Color('#6a3e24')
  private readonly lastColor = new THREE.Color('#f0d48a')
  private library: PieceLibrary | null = null

  constructor(
    private readonly session: GameSession,
    private readonly materials: HallMaterials,
  ) {
    this.group.position.y = HallMetrics.boardSurface - 0.009
    const square = new THREE.BoxGeometry(HallMetrics.square * 0.96, 0.01, HallMetrics.square * 0.96)
    this.lightSquares = this.squares(square, materials.lightSquare, this.lightSlots, true)
    this.darkSquares = this.squares(square, materials.darkSquare, this.darkSlots, false)
    this.markers = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.01, 0.01, 0.004, 16), materials.marker, 32)
    this.markers.count = 0
    this.markers.frustumCulled = false
    this.rings = new THREE.InstancedMesh(new THREE.RingGeometry(0.016, 0.024, 20), materials.capture, 16)
    this.rings.count = 0
    this.rings.frustumCulled = false
    this.selection = new THREE.Mesh(new THREE.RingGeometry(0.02, 0.026, 24), materials.capture)
    this.selection.rotation.x = -Math.PI / 2
    this.selection.visible = false
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.5), materials.walnut)
    frame.position.y = -0.008
    frame.receiveShadow = true
    this.group.add(frame, this.lightSquares, this.darkSquares, this.markers, this.rings, this.selection)
    this.addLabels()
  }

  useLibrary(library: PieceLibrary): void {
    this.library = library
    const types: PieceType[] = ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king']
    const colors: Color[] = ['white', 'black']
    for (const type of types) {
      const geometry = library.geometry(type)
      if (!geometry) continue
      for (const color of colors) {
        const material = color === 'white' ? this.materials.ivory : this.materials.ebony
        const batch = new PieceBatch(geometry, material)
        this.batches.set(`${type}-${color}`, batch)
        this.group.add(batch.mesh)
      }
    }
  }

  update(dt: number): void {
    this.group.rotation.y = this.session.seat === 'black' ? Math.PI : 0
    if (!this.library) return
    const live = new Set<number>()
    for (const piece of this.session.board.pieces()) {
      live.add(piece.uid)
      const target = this.localSquare(piece.position, 0.009)
      let actor = this.actors.get(piece.uid)
      if (!actor) {
        actor = new PieceActor(piece.uid, piece.type, piece.color, target)
        this.actors.set(piece.uid, actor)
      }
      actor.type = piece.type
      actor.color = piece.color
      actor.removed = false
      if (this.session.heldUid === piece.uid && this.session.heldPoint) {
        this.worldPoint.set(this.session.heldPoint.x, this.session.heldPoint.y, this.session.heldPoint.z)
        this.group.worldToLocal(this.worldPoint)
        this.worldPoint.y = Math.max(0.03, this.worldPoint.y)
        actor.local.copy(this.worldPoint)
        actor.to.copy(this.worldPoint)
        actor.t = 1
      } else if (this.session.snap) {
        actor.local.copy(target)
        actor.to.copy(target)
        actor.from.copy(target)
        actor.t = 1
      } else if (actor.t >= 1 && actor.to.distanceToSquared(target) > 1e-8) {
        actor.from.copy(actor.local)
        actor.to.copy(target)
        actor.t = 0
      }
      if (actor.t < 1) {
        const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.01 : 0.4
        actor.t = Math.min(1, actor.t + dt / duration)
        const k = actor.t * actor.t * (3 - 2 * actor.t)
        actor.local.lerpVectors(actor.from, actor.to, k)
        actor.local.y = 0.009 + Math.sin(k * Math.PI) * 0.03
      }
    }
    for (const [uid, actor] of this.actors) {
      if (live.has(uid)) continue
      actor.removed = true
      actor.local.y -= dt * 0.25
      actor.t += dt / 0.3
      if (actor.t > 1.2) this.actors.delete(uid)
    }
    this.session.snap = false
    this.writePieces()
    this.writeMarkers()
    this.writeSquareColors()
  }

  nearestPiece(point: THREE.Vector3, maxDistance: number): number | null {
    let best: number | null = null
    let bestDistance = maxDistance
    for (const actor of this.actors.values()) {
      if (actor.removed) continue
      this.group.localToWorld(this.scratch.copy(actor.local))
      const distance = this.scratch.distanceTo(point)
      if (distance < bestDistance) {
        bestDistance = distance
        best = actor.uid
      }
    }
    return best
  }

  squareFromWorld(point: THREE.Vector3): Position | null {
    this.scratch.copy(point)
    this.group.worldToLocal(this.scratch)
    const file = Math.round(this.scratch.x / HallMetrics.square + 3.5)
    const rank = Math.round(this.scratch.z / HallMetrics.square + 3.5)
    const position = new Position(file, rank)
    if (!position.inBounds()) return null
    const center = HallMetrics.fileRank(position)
    const dx = this.scratch.x - center.x
    const dz = this.scratch.z - center.z
    if (Math.hypot(dx, dz) > HallMetrics.square * 0.68) return null
    return position
  }

  private squares(
    geometry: THREE.BoxGeometry,
    material: THREE.Material,
    slots: Position[],
    light: boolean,
  ): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, 32)
    mesh.receiveShadow = true
    mesh.castShadow = false
    let index = 0
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        if (((x + y) % 2 === 0) !== light) continue
        const position = new Position(x, y)
        slots.push(position)
        const spot = HallMetrics.fileRank(position)
        this.dummy.position.set(spot.x, 0.004, spot.z)
        this.dummy.scale.set(1, 1, 1)
        this.dummy.rotation.set(0, 0, 0)
        this.dummy.updateMatrix()
        mesh.setMatrixAt(index, this.dummy.matrix)
        mesh.setColorAt(index, light ? this.lightColor : this.darkColor)
        index += 1
      }
    }
    mesh.count = index
    mesh.userData.kind = 'square'
    mesh.userData.slots = slots
    return mesh
  }

  private writePieces(): void {
    for (const batch of this.batches.values()) batch.uids.length = 0
    for (const actor of this.actors.values()) {
      const batch = this.batches.get(`${actor.type}-${actor.color}`)
      if (!batch) continue
      const index = batch.uids.length
      batch.uids.push(actor.uid)
      const yaw = (actor.color === 'black' ? Math.PI : 0) + (actor.type === 'knight' ? Math.PI / 2 : 0)
      this.dummy.position.copy(actor.local)
      this.dummy.rotation.set(0, yaw, 0)
      this.dummy.scale.set(actor.removed ? 0.001 : 1, actor.removed ? 0.001 : 1, actor.removed ? 0.001 : 1)
      this.dummy.updateMatrix()
      batch.mesh.setMatrixAt(index, this.dummy.matrix)
    }
    for (const batch of this.batches.values()) {
      batch.mesh.count = batch.uids.length
      batch.mesh.instanceMatrix.needsUpdate = true
    }
  }

  private writeMarkers(): void {
    let dots = 0
    let rings = 0
    for (const move of this.session.legal) {
      const spot = HallMetrics.fileRank(move.to)
      this.dummy.position.set(spot.x, 0.012, spot.z)
      this.dummy.rotation.set(0, 0, 0)
      this.dummy.scale.set(1, 1, 1)
      this.dummy.updateMatrix()
      if (move.kind === 'capture' || move.kind === 'enPassant') {
        this.dummy.rotation.x = -Math.PI / 2
        this.dummy.updateMatrix()
        this.rings.setMatrixAt(rings, this.dummy.matrix)
        this.dummy.rotation.set(0, 0, 0)
        rings += 1
      } else {
        this.markers.setMatrixAt(dots, this.dummy.matrix)
        dots += 1
      }
    }
    this.markers.count = dots
    this.rings.count = rings
    this.markers.instanceMatrix.needsUpdate = true
    this.rings.instanceMatrix.needsUpdate = true
    const selected = this.session.selectedUid
      ? this.session.board.pieceByUid(this.session.selectedUid)
      : null
    if (!selected) {
      this.selection.visible = false
      return
    }
    const spot = HallMetrics.fileRank(selected.position)
    this.selection.visible = true
    this.selection.position.set(spot.x, 0.012, spot.z)
  }

  private writeSquareColors(): void {
    this.tint(this.lightSquares, this.lightSlots, this.lightColor)
    this.tint(this.darkSquares, this.darkSlots, this.darkColor)
  }

  private tint(mesh: THREE.InstancedMesh, slots: Position[], base: THREE.Color): void {
    const from = this.session.board.lastFrom
    const to = this.session.board.lastTo
    for (let i = 0; i < slots.length; i += 1) {
      const slot = slots[i]
      const marked = (from && slot.equals(from)) || (to && slot.equals(to))
      mesh.setColorAt(i, marked ? this.lastColor : base)
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }

  private localSquare(position: Position, y: number): THREE.Vector3 {
    const spot = HallMetrics.fileRank(position)
    return new THREE.Vector3(spot.x, y, spot.z)
  }

  private addLabels(): void {
    const files = 'abcdefgh'
    const near = this.materials.textures.text(files.split('').join('   '), 1024, 96)
    const far = this.materials.textures.text('hgfedcba'.split('').join('   '), 1024, 96)
    const ranksNear = this.materials.textures.text('1  2  3  4  5  6  7  8', 1024, 96)
    const plane = new THREE.PlaneGeometry(0.44, 0.028)
    const make = (texture: THREE.Texture, x: number, z: number, yaw: number) => {
      const mesh = new THREE.Mesh(
        plane,
        new THREE.MeshBasicMaterial({ map: texture, transparent: true }),
      )
      mesh.position.set(x, 0.004, z)
      mesh.rotation.x = -Math.PI / 2
      mesh.rotation.z = yaw
      this.group.add(mesh)
    }
    make(near, 0, 0.242, 0)
    make(far, 0, -0.242, Math.PI)
    make(ranksNear, -0.242, 0, Math.PI / 2)
    make(ranksNear, 0.242, 0, -Math.PI / 2)
  }
}
