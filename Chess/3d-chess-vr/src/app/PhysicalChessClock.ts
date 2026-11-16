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
  private readonly faces: Record<'white' | 'black', FacePaint> = {
    white: { signature: '', canvas: null, texture: null, material: null },
    black: { signature: '', canvas: null, texture: null, material: null },
  }

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
    for (const face of [this.faces.white, this.faces.black]) {
      face.texture?.dispose()
      face.material?.dispose()
    }
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
    const paint = this.faces[side]
    const signature = `${face.label}|${face.expiry}`
    mesh.userData.clockLabel = face.label
    mesh.userData.clockSide = side
    if (paint.signature === signature) return
    const drawn = this.redraw(paint, face.label, face.expiry === 'no-clock')
    paint.signature = signature
    if (!drawn) {
      mesh.material = this.materials.forExpiry(face.expiry)
      return
    }
    if (!paint.material) {
      paint.material = this.materials.forExpiry(face.expiry).clone()
      paint.material.map = paint.texture
      paint.material.color.set('#ffffff')
    } else {
      const source = this.materials.forExpiry(face.expiry)
      paint.material.color.copy(source.color)
      paint.material.emissive.copy(source.emissive)
      paint.material.emissiveIntensity = source.emissiveIntensity
      paint.material.map = paint.texture
    }
    mesh.material = paint.material
    mesh.userData.clockPainted = face.label
  }

  /** Draw into the one canvas this face already owns. */
  private redraw(paint: FacePaint, label: string, muted: boolean): boolean {
    if (typeof document === 'undefined') return false
    if (!paint.canvas) {
      paint.canvas = document.createElement('canvas')
      paint.canvas.width = 256
      paint.canvas.height = 128
    }
    let context: CanvasRenderingContext2D | null = null
    try {
      context = paint.canvas.getContext('2d')
    } catch {
      return false
    }
    if (!context) return false
    context.fillStyle = muted ? '#8d939c' : '#14181e'
    context.fillRect(0, 0, paint.canvas.width, paint.canvas.height)
    context.fillStyle = muted ? '#2a3038' : '#f4efe4'
    context.font = 'bold 72px Georgia, serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(label, paint.canvas.width / 2, paint.canvas.height / 2)
    if (!paint.texture) {
      paint.texture = new CanvasTexture(paint.canvas)
      paint.texture.encoding = sRGBEncoding
    }
    paint.texture.needsUpdate = true
    return true
  }
}

/** One canvas and one texture for a clock face. Redraws do not allocate another. */
interface FacePaint {
  signature: string
  canvas: HTMLCanvasElement | null
  texture: CanvasTexture | null
  material: MeshStandardMaterial | null
}
