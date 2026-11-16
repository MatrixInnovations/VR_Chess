import { CanvasTexture, Group, Mesh, MeshStandardMaterial, PlaneGeometry, sRGBEncoding } from 'three'

import type { IClockFaceSnapshot, IClockSideFace } from '../mad-scientist/hall/ClockViewMirror'
import { ClockMaterials } from '../mad-scientist/hall/ClockMaterials'

/**
 * Wooden chess clock on the table.
 *
 * Face colors come from {@link ClockMaterials}. Digits are painted from the
 * label Fridae already formatted, at most a few times a second.
 * The mesh is tagged `msRole: clock` so a ray on either face is a clock tap,
 * never a move.
 */
export class PhysicalChessClock {
  /** Root placed on the table, to the right of the board. */
  readonly object = new Group()

  private readonly materials = new ClockMaterials()
  private readonly body: Mesh
  private readonly whiteFace: Mesh
  private readonly blackFace: Mesh
  private readonly textures: CanvasTexture[] = []
  private readonly clones: MeshStandardMaterial[] = []
  private lastWhite = ''
  private lastBlack = ''

  /**
   * Creates the instance.
   */
  constructor() {
    this.object.name = 'physical-chess-clock'
    const bodyGeo = new PlaneGeometry(0.16, 0.07)
    this.body = new Mesh(bodyGeo, this.materials.body)
    this.body.rotation.x = -Math.PI / 2
    this.body.position.y = 0.02
    this.body.castShadow = true
    this.body.receiveShadow = true
    this.body.userData.msRole = 'clock'
    this.whiteFace = this.face(-0.038)
    this.blackFace = this.face(0.038)
    this.object.add(this.body, this.whiteFace, this.blackFace)
  }

  /**
   * Paint both faces from a mirror snapshot.
   * Identical labels do not allocate another texture.
   * @param faces - Presentation from {@link ClockViewMirror}.
   */
  apply(faces: IClockFaceSnapshot): void {
    this.paint(this.whiteFace, faces.white, 'white')
    this.paint(this.blackFace, faces.black, 'black')
  }

  /** Release geometries, materials, and digit textures. */
  dispose(): void {
    this.object.removeFromParent()
    this.body.geometry.dispose()
    this.whiteFace.geometry.dispose()
    this.blackFace.geometry.dispose()
    for (const texture of this.textures) texture.dispose()
    for (const material of this.clones) material.dispose()
    this.materials.dispose()
  }

  private face(x: number): Mesh {
    const mesh = new Mesh(new PlaneGeometry(0.06, 0.032), this.materials.running)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(x, 0.025, 0)
    mesh.userData.msRole = 'clock'
    return mesh
  }

  private paint(mesh: Mesh, face: IClockSideFace, side: 'white' | 'black'): void {
    const material = this.materials.forExpiry(face.expiry)
    mesh.material = material
    mesh.userData.clockLabel = face.label
    mesh.userData.clockSide = side
    const previous = side === 'white' ? this.lastWhite : this.lastBlack
    if (previous === face.label && mesh.userData.clockPainted === face.label) return
    if (side === 'white') this.lastWhite = face.label
    else this.lastBlack = face.label
    const texture = this.drawLabel(face.label, face.expiry === 'no-clock')
    if (!texture) return
    const next = material.clone()
    next.map = texture
    next.color.set('#ffffff')
    this.clones.push(next)
    mesh.material = next
    mesh.userData.clockPainted = face.label
    this.textures.push(texture)
  }

  private drawLabel(label: string, muted: boolean): CanvasTexture | null {
    if (typeof document === 'undefined') return null
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 128
    let context: CanvasRenderingContext2D | null = null
    try {
      context = canvas.getContext('2d')
    } catch {
      return null
    }
    if (!context) return null
    context.fillStyle = muted ? '#8d939c' : '#14181e'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = muted ? '#2a3038' : '#f4efe4'
    context.font = 'bold 72px Georgia, serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(label, canvas.width / 2, canvas.height / 2)
    const texture = new CanvasTexture(canvas)
    texture.encoding = sRGBEncoding
    texture.needsUpdate = true
    return texture
  }
}
