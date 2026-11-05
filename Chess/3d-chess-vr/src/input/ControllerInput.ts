import * as THREE from 'three'
import type { GameSession } from '../domain/GameSession'
import type { ChessHall } from '../view/ChessHall'
import { PointerRay } from './PointerRay'
import type { InputRouter } from './InputRouter'

interface ControllerGrip {
  pressed: boolean
  uid: number | null
}

/** Touch controller fallback. Trigger to pick up, release over a legal square. */
export class ControllerInput {
  readonly rayMesh: THREE.Mesh
  private readonly grips = new Map<string, ControllerGrip>()
  private readonly origin = new THREE.Vector3()
  private readonly direction = new THREE.Vector3()
  private readonly quaternion = new THREE.Quaternion()
  private readonly point = new THREE.Vector3()
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  private readonly up = new THREE.Vector3(0, 1, 0)
  private readonly rayLine = new THREE.Ray()
  private readonly ray: PointerRay

  constructor(
    private readonly router: InputRouter,
    private readonly hall: ChessHall,
    private readonly session: GameSession,
    ray: PointerRay,
  ) {
    this.ray = ray
    this.rayMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0015, 0.0015, 1, 5),
      new THREE.MeshBasicMaterial({ color: '#e1c27a' }),
    )
    this.rayMesh.visible = false
    this.rayMesh.frustumCulled = false
  }

  update(frame: XRFrame | undefined, renderer: THREE.WebGLRenderer): void {
    const session = renderer.xr.getSession()
    const space = renderer.xr.getReferenceSpace()
    this.rayMesh.visible = false
    if (!frame || !session || !space) return
    for (const source of session.inputSources) {
      if (source.hand || !source.targetRaySpace || !source.gamepad) continue
      const pose = frame.getPose(source.targetRaySpace, space)
      if (!pose) continue
      const position = pose.transform.position
      const orientation = pose.transform.orientation
      this.origin.set(position.x, position.y, position.z)
      this.quaternion.set(orientation.x, orientation.y, orientation.z, orientation.w)
      this.direction.set(0, 0, -1).applyQuaternion(this.quaternion)
      const key = source.handedness || 'controller'
      const grip = this.grips.get(key) ?? { pressed: false, uid: null }
      this.grips.set(key, grip)
      const trigger = source.gamepad.buttons[0]?.pressed ?? false
      this.showRay(this.origin, this.direction)
      if (trigger && !grip.pressed) {
        const hit = this.ray.fromWorld(this.origin, this.direction, this.hall.pickables())
        if (hit?.kind === 'button') this.router.press(hit, this.origin)
        else if (hit?.kind === 'piece' && hit.uid != null && this.session.beginHold(hit.uid)) {
          grip.uid = hit.uid
        } else if (hit?.kind === 'square' && hit.square) this.session.selectSquare(hit.square)
      } else if (trigger && grip.uid != null) {
        const drop = this.onBoard(this.origin, this.direction)
        if (drop) this.session.moveHold(drop.x, drop.y + 0.04, drop.z)
      } else if (!trigger && grip.pressed && grip.uid != null) {
        const drop = this.onBoard(this.origin, this.direction)
        this.session.endHold(drop ? this.hall.squareFromWorld(drop) : null)
        grip.uid = null
      }
      grip.pressed = trigger
    }
  }

  private showRay(origin: THREE.Vector3, direction: THREE.Vector3): void {
    const length = 1.4
    this.rayMesh.visible = true
    this.rayMesh.position.copy(origin).addScaledVector(direction, length / 2)
    this.rayMesh.quaternion.setFromUnitVectors(this.up, direction)
    this.rayMesh.scale.set(1, length, 1)
  }

  private onBoard(origin: THREE.Vector3, direction: THREE.Vector3): THREE.Vector3 | null {
    this.plane.constant = -this.hall.boardHeight()
    this.rayLine.set(origin, direction)
    return this.rayLine.intersectPlane(this.plane, this.point) ? this.point : null
  }
}
