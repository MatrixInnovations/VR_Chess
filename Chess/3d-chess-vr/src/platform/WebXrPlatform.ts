import { createXRStore, type XRStore } from '@react-three/xr'
import type { XrPlatform } from './XrPlatform'

/**
 * WebXR adapter. A native Quest shell can replace this class without
 * touching the hall, the clock, or the game session.
 *
 * Hand and controller meshes come from the public WebXR input-profile set.
 */
export class WebXrPlatform implements XrPlatform {
  readonly store: XRStore

  constructor() {
    this.store = createXRStore({
      offerSession: false,
      emulate: WebXrPlatform.emulator(),
      handTracking: true,
      hand: {
        teleportPointer: false,
        rayPointer: false,
        grabPointer: false,
        touchPointer: false,
      },
      controller: {
        teleportPointer: false,
        rayPointer: false,
        grabPointer: false,
      },
      gaze: false,
      screenInput: false,
      transientPointer: false,
      anchors: false,
      meshDetection: false,
      planeDetection: false,
      depthSensing: false,
      hitTest: true,
      domOverlay: false,
      foveation: 0.4,
      frameBufferScaling: 1,
      frameRate: (supported: ArrayLike<number>) => {
        const rates = Array.from(supported)
        if (rates.includes(90)) return 90
        if (rates.includes(80)) return 80
        if (rates.includes(72)) return 72
        return false
      },
    })
  }

  async enterImmersiveVr(): Promise<void> {
    const session = await this.store.enterVR()
    if (!session) {
      throw new Error(
        'No immersive session started. On a Quest Pro, open this page in the Meta Quest Browser over HTTPS.',
      )
    }
  }

  async enterImmersiveAr(): Promise<void> {
    const session = await this.store.enterAR()
    if (!session) {
      throw new Error('Passthrough is not available here. Immersive VR is the main way in.')
    }
  }

  async exit(): Promise<void> {
    await this.store.getState().session?.end()
  }

  onSessionEnd(listener: () => void): void {
    this.store.onSessionEnd(listener)
  }

  private static emulator(): false | { type: 'metaQuestPro'; syntheticEnvironment: null } {
    if (typeof window === 'undefined') return false
    const params = new URLSearchParams(window.location.search)
    if (!params.has('xr')) return false
    return { type: 'metaQuestPro', syntheticEnvironment: null }
  }
}
