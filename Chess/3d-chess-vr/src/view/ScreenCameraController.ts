import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { HallMetrics } from './HallMetrics'

export class ScreenCameraController {
  private readonly controls: OrbitControls
  private readonly seat = new THREE.Vector3(HallMetrics.eye.x, HallMetrics.eye.y, HallMetrics.eye.z)
  private readonly look = new THREE.Vector3(HallMetrics.look.x, HallMetrics.look.y, HallMetrics.look.z)

  constructor(private readonly camera: THREE.Camera, element: HTMLElement) {
    this.controls = new OrbitControls(camera, element)
    this.controls.target.copy(this.look)
    this.controls.enablePan = false
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.minDistance = 0.38
    this.controls.maxDistance = 3.4
    this.controls.minPolarAngle = 0.4
    this.controls.maxPolarAngle = 1.35
    this.controls.enabled = false
    camera.position.copy(this.seat)
    camera.lookAt(this.look)
  }

  update(dt: number, presenting: boolean, freeLook: boolean): void {
    if (presenting) {
      this.controls.enabled = false
      return
    }
    this.controls.enabled = freeLook
    if (freeLook) {
      this.controls.update()
      return
    }
    const blend = 1 - Math.pow(0.001, dt)
    this.camera.position.lerp(this.seat, this.camera.position.distanceTo(this.seat) > 1.2 ? 1 : blend)
    this.controls.target.copy(this.look)
    this.camera.lookAt(this.look)
  }

  dispose(): void {
    this.controls.dispose()
  }
}
