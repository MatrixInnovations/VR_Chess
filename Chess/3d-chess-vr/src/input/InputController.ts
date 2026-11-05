import * as THREE from 'three'
import type { GameSession } from '../domain/GameSession'
import type { ChessHall } from '../view/ChessHall'
import type { ViewModeManager } from '../view/ViewModeManager'
import { ControllerInput } from './ControllerInput'
import { HandTrackingInput } from './HandTrackingInput'
import { InputRouter } from './InputRouter'
import { MouseInput } from './MouseInput'
import { PointerRay } from './PointerRay'

export class InputController {
  private readonly mouse: MouseInput
  private readonly hands: HandTrackingInput
  private readonly controllers: ControllerInput
  private readonly onKey = (event: KeyboardEvent) => this.key(event)

  constructor(
    private readonly session: GameSession,
    private readonly viewMode: ViewModeManager,
    hall: ChessHall,
    getCamera: () => THREE.Camera,
  ) {
    const ray = new PointerRay()
    const router = new InputRouter(session, viewMode, hall)
    this.mouse = new MouseInput(router, hall, session, ray, getCamera)
    this.hands = new HandTrackingInput(router, hall, session)
    this.controllers = new ControllerInput(router, hall, session, ray)
  }

  attach(element: HTMLElement, scene: THREE.Scene): void {
    this.mouse.attach(element)
    scene.add(this.controllers.rayMesh)
    window.addEventListener('keydown', this.onKey)
  }

  detach(): void {
    this.mouse.detach()
    this.controllers.rayMesh.removeFromParent()
    window.removeEventListener('keydown', this.onKey)
  }

  update(renderer: THREE.WebGLRenderer, frame: XRFrame | undefined): void {
    if (!renderer.xr.isPresenting) return
    this.hands.update(frame, renderer)
    this.controllers.update(frame, renderer)
  }

  private key(event: KeyboardEvent): void {
    const target = event.target
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
    if (event.key === 'f' || event.key === 'F') {
      this.session.toggleFreeLook()
      return
    }
    if (event.key === 'Escape') {
      if (this.session.guide.open) this.session.guide.dismiss()
      else this.session.clearSelection()
    }
    if (event.key === 'v' || event.key === 'V') void this.viewMode.toggle()
  }
}
