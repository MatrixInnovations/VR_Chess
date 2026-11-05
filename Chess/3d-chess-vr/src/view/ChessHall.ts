import * as THREE from 'three'
import type { GameSession } from '../domain/GameSession'
import type { HallMaterials } from './HallMaterials'
import { HallMetrics } from './HallMetrics'
import { BoardView } from './BoardView'
import { ChessClockView } from './ChessClockView'
import { PieceLibrary } from './PieceLibrary'
import { RoomScenery } from './RoomScenery'
import { TableControls } from './TableControls'
import type { ViewMode } from './ViewModeManager'
import { XrPlacement } from './XrPlacement'

export class ChessHall extends THREE.Group {
  readonly boardView: BoardView
  readonly clockView: ChessClockView
  readonly controls: TableControls
  private readonly scenery: RoomScenery
  private readonly placement = new XrPlacement()
  private readonly namePlate: THREE.Mesh
  private nameKey = ''

  constructor(
    private readonly session: GameSession,
    materials: HallMaterials,
  ) {
    super()
    this.scenery = new RoomScenery(materials)
    this.boardView = new BoardView(session, materials)
    this.clockView = new ChessClockView(session, materials)
    this.controls = new TableControls(session, materials)
    this.namePlate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.28, 0.06),
      new THREE.MeshBasicMaterial({ transparent: true }),
    )
    this.namePlate.position.set(0, 0.8, -0.52)
    this.namePlate.rotation.x = -1.05
    this.add(this.scenery, this.boardView.group, this.clockView.group, this.controls.group, this.namePlate)
  }

  async load(library: PieceLibrary, onProgress?: (label: string) => void): Promise<void> {
    await library.load(onProgress)
    this.boardView.useLibrary(library)
  }

  update(dt: number, presenting: boolean, mode: ViewMode, camera: THREE.Camera): void {
    if (presenting) this.placement.placeOnce(this, camera)
    else this.placement.reset(this)
    this.scenery.setPresentation(mode)
    this.boardView.update(dt)
    this.clockView.update(dt)
    this.controls.update()
    this.writeName()
  }

  pickables(): THREE.Object3D[] {
    const objects: THREE.Object3D[] = []
    this.boardView.group.traverse((child) => {
      const kind = child.userData.kind
      if (kind === 'square' || kind === 'piece') objects.push(child)
    })
    objects.push(...this.controls.buttons, ...this.clockView.buttons)
    return objects
  }

  nearestPiece(point: THREE.Vector3, maxDistance: number): number | null {
    return this.boardView.nearestPiece(point, maxDistance)
  }

  nearestButton(point: THREE.Vector3, maxDistance: number): string | null {
    let best: string | null = null
    let bestDistance = maxDistance
    const scratch = new THREE.Vector3()
    for (const button of [...this.controls.buttons, ...this.clockView.buttons]) {
      if (!button.visible) continue
      button.getWorldPosition(scratch)
      const distance = scratch.distanceTo(point)
      if (distance < bestDistance) {
        bestDistance = distance
        best = String(button.userData.id ?? '')
      }
    }
    return best
  }

  squareFromWorld(point: THREE.Vector3) {
    return this.boardView.squareFromWorld(point)
  }

  boardHeight(): number {
    return this.position.y + HallMetrics.boardSurface
  }

  private writeName(): void {
    const name =
      this.session.phase === 'lobby' ? 'The hall' : this.session.opponent().name || 'Guest'
    if (name === this.nameKey) return
    this.nameKey = name
    const material = this.namePlate.material as THREE.MeshBasicMaterial
    material.map?.dispose()
    material.map = new THREE.CanvasTexture(ChessHall.plate(name))
    material.map.colorSpace = THREE.SRGBColorSpace
    material.needsUpdate = true
  }

  private static plate(name: string): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 128
    const context = canvas.getContext('2d')
    if (!context) return canvas
    context.fillStyle = '#2a2118'
    context.fillRect(0, 0, 512, 128)
    context.strokeStyle = '#c6a15b'
    context.strokeRect(8, 8, 496, 112)
    context.fillStyle = '#f4ead8'
    context.font = '600 54px Georgia, serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(name, 256, 64)
    return canvas
  }
}
