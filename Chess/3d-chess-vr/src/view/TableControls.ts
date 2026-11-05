import * as THREE from 'three'
import type { GameSession } from '../domain/GameSession'
import type { HallMaterials } from './HallMaterials'

export class TableButton extends THREE.Mesh {
  constructor(label: string, id: string, width: number, materials: HallMaterials) {
    const texture = materials.textures.text(label, 512, 128, '#f6edd8')
    super(
      new THREE.BoxGeometry(width, 0.012, 0.05),
      new THREE.MeshStandardMaterial({ map: texture, color: '#3a2a1c', roughness: 0.6 }),
    )
    this.castShadow = true
    this.userData.kind = 'button'
    this.userData.id = id
  }
}

export class TableControls {
  readonly group = new THREE.Group()
  readonly buttons: THREE.Object3D[] = []
  private readonly sit: TableButton
  private readonly resign: TableButton
  private readonly draw: TableButton
  private readonly result: THREE.Mesh
  private readonly promotions: TableButton[]
  private resultKey = ''

  constructor(
    private readonly session: GameSession,
    private readonly materials: HallMaterials,
  ) {
    const toggle = new TableButton('3D  /  VR', 'toggle-view', 0.16, materials)
    toggle.position.set(-0.56, 0.748, 0.4)
    this.sit = new TableButton('Sit down', 'sit-down', 0.22, materials)
    this.sit.position.set(0, 0.748, 0.42)
    this.resign = new TableButton('Resign', 'resign', 0.12, materials)
    this.resign.position.set(0.22, 0.748, 0.42)
    this.draw = new TableButton('Draw', 'draw', 0.1, materials)
    this.draw.position.set(0.36, 0.748, 0.42)
    this.result = new THREE.Mesh(
      new THREE.PlaneGeometry(0.46, 0.12),
      new THREE.MeshBasicMaterial({ transparent: true }),
    )
    this.result.position.set(0, 1.05, 0)
    this.result.visible = false
    this.promotions = [
      new TableButton('Queen', 'promo-queen', 0.12, materials),
      new TableButton('Rook', 'promo-rook', 0.12, materials),
      new TableButton('Bishop', 'promo-bishop', 0.12, materials),
      new TableButton('Knight', 'promo-knight', 0.12, materials),
    ]
    this.promotions.forEach((button, index) => {
      button.position.set(-0.22 + index * 0.14, 0.82, 0.18)
      button.visible = false
    })
    this.group.add(toggle, this.sit, this.resign, this.draw, this.result, ...this.promotions)
    this.buttons.push(toggle, this.sit, this.resign, this.draw, ...this.promotions)
  }

  update(): void {
    const playing = this.session.phase === 'playing'
    const lobby = this.session.phase === 'lobby'
    this.sit.visible = lobby
    this.resign.visible = playing
    this.draw.visible = playing
    const promoting = !!this.session.pending
    for (const button of this.promotions) button.visible = promoting
    const over = this.session.gameOver
    if (!over) {
      this.result.visible = false
      this.resultKey = ''
      return
    }
    const key = `${over.title}|${over.detail}`
    this.result.visible = true
    if (key === this.resultKey) return
    this.resultKey = key
    const material = this.result.material as THREE.MeshBasicMaterial
    material.map?.dispose()
    material.map = this.materials.textures.text(`${over.title}  ·  ${over.detail}`, 1024, 256)
    material.needsUpdate = true
  }
}
