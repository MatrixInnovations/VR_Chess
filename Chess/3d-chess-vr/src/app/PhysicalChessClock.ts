import {
  CanvasTexture,
  Group,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  sRGBEncoding,
} from 'three'

import type { ClockFaceExpiry, IClockFaceSnapshot, IClockSideFace } from '../mad-scientist/hall/ClockViewMirror'
import { ClockMaterials } from '../mad-scientist/hall/ClockMaterials'
import { clockIsLow } from '../ui/clockHud'

const FACE_INK: Record<ClockFaceExpiry, { background: string; digit: string }> = {
  running: { background: '#141210', digit: '#f3efe6' },
  'provisional-expired': { background: '#c9a44c', digit: '#0e0e10' },
  'confirmed-flag': { background: '#1a0505', digit: '#f3efe6' },
  'offline-local-flag': { background: '#f2c2a0', digit: '#140c0a' },
  'no-clock': { background: '#0e0e10', digit: '#d4af37' },
}

/**
 * Metal chess clock on the table, with a thin gold rim.
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
  private readonly rim: Mesh
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
    this.body.castShadow = false
    this.body.receiveShadow = true
    this.body.userData.msRole = 'clock'
    const rimGeo = new PlaneGeometry(0.172, 0.082)
    this.rim = new Mesh(
      rimGeo,
      new MeshStandardMaterial({
        color: 0xf0d78a,
        emissive: 0xc9a44c,
        emissiveIntensity: 0.55,
        metalness: 0.55,
        roughness: 0.18,
      }),
    )
    this.rim.name = 'clock-rim'
    this.rim.rotation.x = -Math.PI / 2
    this.rim.position.y = 0.016
    this.rim.raycast = () => undefined
    this.whiteFace = this.face(-0.038)
    this.blackFace = this.face(0.038)
    this.object.add(this.rim, this.body, this.whiteFace, this.blackFace)
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
    this.rim.geometry.dispose()
    ;(this.rim.material as MeshStandardMaterial).dispose()
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
    const low = clockIsLow(face)
    const signature = `${face.label}|${face.expiry}|${low ? 'low' : ''}`
    mesh.userData.clockLabel = face.label
    mesh.userData.clockSide = side
    if (paint.signature === signature) return
    const drawn = this.redraw(paint, face.label, face.expiry, low)
    paint.signature = signature
    if (!drawn) {
      mesh.material = this.materials.forExpiry(face.expiry)
      return
    }
    if (!paint.material) {
      paint.material = this.materials.forExpiry(face.expiry).clone()
    }
    paint.material.color.set('#ffffff')
    paint.material.emissive.set('#000000')
    paint.material.emissiveIntensity = 0
    paint.material.map = paint.texture
    mesh.material = paint.material
    mesh.userData.clockPainted = face.label
  }

  /** Draw into the one canvas this face already owns. */
  private redraw(paint: FacePaint, label: string, expiry: ClockFaceExpiry, low: boolean): boolean {
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
    const ink = FACE_INK[expiry]
    context.fillStyle = ink.background
    context.fillRect(0, 0, paint.canvas.width, paint.canvas.height)
    if (expiry === 'confirmed-flag' || expiry === 'offline-local-flag') {
      context.strokeStyle = '#ff4d4d'
      context.lineWidth = 8
      context.strokeRect(12, 12, paint.canvas.width - 24, paint.canvas.height - 24)
      context.fillStyle = '#ff4d4d'
      context.font = 'bold 18px Georgia, serif'
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillText('FLAG', paint.canvas.width / 2, 22)
    }
    context.fillStyle = low ? '#ffd8b0' : ink.digit
    context.font = 'bold 64px Georgia, serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(label, paint.canvas.width / 2, paint.canvas.height / 2 + 10)
    if (low) {
      context.fillStyle = '#ffc9a0'
      context.fillRect(18, paint.canvas.height - 16, paint.canvas.width - 36, 10)
    }
    if (!paint.texture) {
      paint.texture = new CanvasTexture(paint.canvas)
      paint.texture.encoding = sRGBEncoding
      paint.texture.magFilter = LinearFilter
      paint.texture.minFilter = LinearFilter
      paint.texture.generateMipmaps = false
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
