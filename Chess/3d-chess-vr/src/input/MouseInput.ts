import * as THREE from 'three'
import type { GameSession } from '../domain/GameSession'
import { HallMetrics } from '../view/HallMetrics'
import type { ChessHall } from '../view/ChessHall'
import type { InputRouter } from './InputRouter'
import { PointerRay } from './PointerRay'

export class MouseInput {
  private element: HTMLElement | null = null
  private readonly ndc = new THREE.Vector2()
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -HallMetrics.boardSurface)
  private readonly hitPoint = new THREE.Vector3()
  private readonly raycaster = new THREE.Raycaster()
  private down: { x: number; y: number; uid: number | null } | null = null
  private dragging = false
  private readonly onDown = (event: PointerEvent) => this.pointerDown(event)
  private readonly onMove = (event: PointerEvent) => this.pointerMove(event)
  private readonly onUp = (event: PointerEvent) => this.pointerUp(event)

  constructor(
    private readonly router: InputRouter,
    private readonly hall: ChessHall,
    private readonly session: GameSession,
    private readonly ray: PointerRay,
    private readonly getCamera: () => THREE.Camera,
  ) {}

  attach(element: HTMLElement): void {
    this.element = element
    element.addEventListener('pointerdown', this.onDown)
    element.addEventListener('pointermove', this.onMove)
    element.addEventListener('pointerup', this.onUp)
    element.addEventListener('pointerleave', this.onUp)
  }

  detach(): void {
    if (!this.element) return
    this.element.removeEventListener('pointerdown', this.onDown)
    this.element.removeEventListener('pointermove', this.onMove)
    this.element.removeEventListener('pointerup', this.onUp)
    this.element.removeEventListener('pointerleave', this.onUp)
    this.element = null
  }

  private pointerDown(event: PointerEvent): void {
    if (!this.element || event.button !== 0) return
    const hit = this.cast(event)
    const piece = hit?.kind === 'piece' ? hit.uid : null
    this.down = { x: event.clientX, y: event.clientY, uid: piece }
    this.dragging = false
    if (hit?.kind === 'button') this.router.press(hit)
  }

  private pointerMove(event: PointerEvent): void {
    if (!this.down || this.session.freeLook) return
    const moved = Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y)
    if (!this.dragging && this.down.uid != null && moved > 6) {
      this.dragging = this.session.beginHold(this.down.uid)
    }
    if (!this.dragging) return
    const point = this.pointOnBoard(event)
    if (point) this.session.moveHold(point.x, Math.max(HallMetrics.boardSurface + 0.04, point.y), point.z)
  }

  private pointerUp(event: PointerEvent): void {
    if (!this.down) return
    const dragged = this.dragging
    const uid = this.down.uid
    const startX = this.down.x
    const startY = this.down.y
    this.down = null
    this.dragging = false
    if (dragged) {
      const point = this.pointOnBoard(event)
      this.session.endHold(point ? this.hall.squareFromWorld(point) : null)
      return
    }
    if (
      this.session.freeLook &&
      Math.hypot(event.clientX - startX, event.clientY - startY) > 8
    ) {
      return
    }
    const hit = this.cast(event)
    if (!hit || hit.kind === 'button') return
    if (hit.kind === 'piece' && uid != null) this.router.press(hit)
    else this.router.press(hit)
  }

  private cast(event: PointerEvent) {
    if (!this.element) return null
    const rect = this.element.getBoundingClientRect()
    this.ndc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )
    return this.ray.fromCamera(this.getCamera(), this.ndc, this.hall.pickables())
  }

  private pointOnBoard(event: PointerEvent): THREE.Vector3 | null {
    if (!this.element) return null
    const rect = this.element.getBoundingClientRect()
    this.ndc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(this.ndc, this.getCamera())
    this.plane.constant = -this.hall.boardHeight()
    return this.raycaster.ray.intersectPlane(this.plane, this.hitPoint) ? this.hitPoint : null
  }
}
