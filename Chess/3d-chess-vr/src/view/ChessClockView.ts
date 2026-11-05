import * as THREE from 'three'
import type { Color } from '../domain/Color'
import { Side } from '../domain/Color'
import { ChessClock } from '../domain/ChessClock'
import type { GameSession } from '../domain/GameSession'
import type { HallMaterials } from './HallMaterials'

export class ChessClockView {
  readonly group = new THREE.Group()
  readonly buttons: THREE.Object3D[] = []
  private readonly nearFace: THREE.Mesh
  private readonly farFace: THREE.Mesh
  private readonly nearPlunger: THREE.Mesh
  private readonly farPlunger: THREE.Mesh
  private nearText = ''
  private farText = ''
  private nearActive = false
  private farActive = false
  private seenTap = 0
  private bump = 0
  private bumpSide: Color | null = null

  constructor(
    private readonly session: GameSession,
    materials: HallMaterials,
  ) {
    this.group.position.set(0.4, 0.78, 0.2)
    this.group.rotation.set(0.72, -0.15, 0)
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.1), materials.ebony)
    body.castShadow = true
    body.receiveShadow = true
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.008, 0.08), materials.brass)
    trim.position.y = 0.02
    this.nearFace = this.face(-0.052)
    this.farFace = this.face(0.052)
    this.nearPlunger = this.plunger(-0.052, 'clock-near', materials)
    this.farPlunger = this.plunger(0.052, 'clock-far', materials)
    this.group.add(body, trim, this.nearFace, this.farFace, this.nearPlunger, this.farPlunger)
    this.buttons.push(this.nearPlunger, this.farPlunger)
  }

  update(dt: number): void {
    if (!this.session.clock.enabled || this.session.phase === 'lobby') {
      this.group.visible = false
      return
    }
    this.group.visible = true
    const near = this.session.seat
    const far = Side.opposite(near)
    this.paint(this.nearFace, near, this.session.clock.active === near, 'near')
    this.paint(this.farFace, far, this.session.clock.active === far, 'far')
    const down = 0.006
    this.nearPlunger.position.y = this.session.clock.active === near ? 0.03 : 0.03 + down
    this.farPlunger.position.y = this.session.clock.active === far ? 0.03 : 0.03 + down
    if (this.session.clockTap !== this.seenTap) {
      this.seenTap = this.session.clockTap
      this.bumpSide = this.session.clockTapSide
      this.bump = 0.12
    }
    if (this.bump > 0 && this.bumpSide) {
      this.bump = Math.max(0, this.bump - dt)
      const plunger = this.bumpSide === near ? this.nearPlunger : this.farPlunger
      plunger.position.y -= 0.004
    }
  }

  private paint(mesh: THREE.Mesh, color: Color, active: boolean, which: 'near' | 'far'): void {
    const text = this.session.clock.enabled ? ChessClock.format(this.session.clock.remaining(color)) : '--'
    const changed =
      which === 'near'
        ? text !== this.nearText || active !== this.nearActive
        : text !== this.farText || active !== this.farActive
    if (!changed) return
    if (which === 'near') {
      this.nearText = text
      this.nearActive = active
    } else {
      this.farText = text
      this.farActive = active
    }
    const material = mesh.material as THREE.MeshBasicMaterial
    material.map?.dispose()
    material.map = this.session && mesh.parent
      ? this.draw(text, active)
      : this.draw(text, active)
    material.needsUpdate = true
  }

  private draw(text: string, active: boolean): THREE.CanvasTexture {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 128
    const context = canvas.getContext('2d')
    if (!context) return new THREE.CanvasTexture(canvas)
    context.fillStyle = active ? '#1c140c' : '#100e0c'
    context.fillRect(0, 0, 256, 128)
    context.fillStyle = active ? '#ffe7a8' : '#c6a56a'
    context.font = '700 84px Georgia, serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(text, 128, 70)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
  }

  private face(z: number): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.082, 0.04),
      new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide }),
    )
    mesh.position.set(z, 0.028, 0.01)
    mesh.rotation.x = -Math.PI / 2
    return mesh
  }

  private plunger(z: number, id: string, materials: HallMaterials): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.012, 16), materials.brass)
    mesh.position.set(z, 0.04, -0.02)
    mesh.castShadow = true
    mesh.userData.kind = 'button'
    mesh.userData.id = id
    return mesh
  }
}
