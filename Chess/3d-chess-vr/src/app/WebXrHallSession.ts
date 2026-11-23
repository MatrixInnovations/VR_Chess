import { createXRStore, type XRStore } from '@react-three/xr'

import type { XrSessionPort } from './XrSessionPort'

/** Same-origin copy of the WebXR input profiles. See public/xr-input-profiles/README.md. */
export const XR_PROFILES_PATH = '/xr-input-profiles/'

/**
 * Absolute URL for the vendored profiles. The XR library joins paths with `new URL`, so a bare path is not enough.
 * @param origin - Page origin. Tests pass a fixed value.
 */
export function xrProfilesBase(origin: string = typeof window === 'undefined' ? 'http://localhost' : window.location.origin): string {
  return new URL(XR_PROFILES_PATH, origin).href
}

/**
 * Opens and closes the WebXR session without owning the chess game.
 *
 * `offerSession` stays off so the browser does not prompt on load.
 * Hand tracking is requested and not required, so Touch controllers still start.
 * `?xr=emulate` turns on the Quest Pro emulator. Without that query, emulation
 * stays off and a desktop tab is not wrapped in a headset.
 */
export class WebXrHallSession implements XrSessionPort {
  /** Last failure from enter or exit. Empty when the last call succeeded. */
  lastError = ''

  private xrStore: XRStore | null = null
  private onEnd: (() => void) | null = null

  /**
   * @param search - Current query string. Tests pass a fixed value.
   */
  constructor(
    private readonly search: () => string = () => (typeof window === 'undefined' ? '' : window.location.search),
  ) {}

  /**
   * The store the React `XR` provider mounts.
   * Created on first read so a unit test that never enters VR does not need WebXR.
   */
  get store(): XRStore {
    if (!this.xrStore) {
      this.xrStore = createXRStore({
        // The CDN default is blocked by connect-src. Without a layout no controller state exists,
        // and a failed hand model unmounts the canvas.
        baseAssetPath: xrProfilesBase(),
        offerSession: false,
        emulate: this.emulator(),
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
        foveation: 1,
        frameBufferScaling: 0.95,
        frameRate: (supported: ArrayLike<number>) => {
          const rates = Array.from(supported)
          if (rates.includes(72)) return 72
          if (rates.includes(80)) return 80
          if (rates.includes(90)) return 90
          return false
        },
      })
      this.xrStore.onSessionEnd(() => {
        this.onEnd?.()
      })
    }
    return this.xrStore
  }

  /**
   * Enter immersive VR.
   * @returns False when the browser did not start a session. {@link WebXrHallSession.lastError} says why.
   */
  async enterVR(): Promise<boolean> {
    try {
      const session = await this.store.enterVR()
      if (!session) {
        this.lastError =
          'No immersive session started. On a Quest Pro, open this page in the Meta Quest Browser over HTTPS.'
        return false
      }
      this.lastError = ''
      return true
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Immersive mode needs a WebXR browser.'
      return false
    }
  }

  /**
   * Enter passthrough. The hall hides its virtual room after this resolves true.
   * @returns False when immersive AR is unavailable.
   */
  async enterAR(): Promise<boolean> {
    try {
      const session = await this.store.enterAR()
      if (!session) {
        this.lastError = 'Passthrough is not available here. Immersive VR is the main way in.'
        return false
      }
      this.lastError = ''
      return true
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Passthrough is not available here.'
      return false
    }
  }

  /** End the current session. Safe when none is running. */
  async exit(): Promise<void> {
    const session = this.xrStore?.getState().session
    if (session) await session.end()
  }

  /**
   * Hear the headset or the browser close the session.
   * @param listener - Returns the hall to the desktop presentation.
   */
  onSessionEnd(listener: () => void): void {
    this.onEnd = listener
  }

  private emulator(): false | { type: 'metaQuestPro'; syntheticEnvironment: null } {
    const params = new URLSearchParams(this.search())
    if (!params.has('xr')) return false
    return { type: 'metaQuestPro', syntheticEnvironment: null }
  }
}
