import { PerspectiveCamera } from 'three'

import type { PieceSnapshot } from '../contracts/types'
import type { ChessHall } from '../hall/ChessHall'
import { RaycastPicker } from '../input/RaycastPicker'
import type { BoardPick, IPointerPicker } from '../input/picking'
import { HallRuntime } from '../runtime/HallRuntime'
import { GameSession } from '../session/GameSession'

/** A DOM-or-test surface that can hear pointer samples. */
export interface PointerSurface {
  addEventListener(type: string, listener: (event: PointerSurfaceEvent) => void): void
  removeEventListener(type: string, listener: (event: PointerSurfaceEvent) => void): void
  getBoundingClientRect(): { left: number; top: number; width: number; height: number }
}

/** The fields {@link HallDemo} reads off a pointer event. */
export interface PointerSurfaceEvent {
  clientX: number
  clientY: number
  pointerId: number
}

/** What {@link HallDemoPage} passes to the fiber canvas. */
export interface HallDemoMount {
  camera: PerspectiveCamera
  hall: ChessHall
  onCreated(state: { gl: { domElement: PointerSurface } }): void
}

const EMPTY_PICK: BoardPick = { square: null, piece: null, clock: false, world: null }

/**
 * Forwards picks once the hall exists.
 * HallRuntime needs a picker in its constructor, and the raycaster needs the hall.
 */
class PickerBridge implements IPointerPicker {
  private inner: IPointerPicker | null = null

  /** Start using `picker` for later samples. */
  use(picker: IPointerPicker): void {
    this.inner = picker
  }

  /** @inheritdoc */
  pick(x: number, y: number): BoardPick {
    if (!this.inner) return EMPTY_PICK
    return this.inner.pick(x, y)
  }
}

/**
 * A few pieces so the smoke page is not an empty table.
 * No legal-move list: this is not a chess engine.
 */
export function demoLineup(): PieceSnapshot[] {
  return [
    { id: 'white-king', kind: 'king', color: 'white', square: { file: 4, rank: 7 } },
    { id: 'white-queen', kind: 'queen', color: 'white', square: { file: 3, rank: 7 } },
    { id: 'white-pawn', kind: 'pawn', color: 'white', square: { file: 4, rank: 6 } },
    { id: 'black-king', kind: 'king', color: 'black', square: { file: 4, rank: 0 } },
    { id: 'black-queen', kind: 'queen', color: 'black', square: { file: 3, rank: 0 } },
    { id: 'black-pawn', kind: 'pawn', color: 'black', square: { file: 4, rank: 1 } },
  ]
}

/**
 * Local smoke harness for {@link ChessHall}.
 *
 * It builds a hall, a session with an empty legal-move list, and pointer
 * wiring. It does not replace the live game page.
 */
export class HallDemo {
  /** Runtime that owns the hall, the budget, and the pointer. */
  readonly runtime: HallRuntime

  private readonly raycaster: RaycastPicker

  private surface: PointerSurface | null = null

  private readonly onDown = (event: PointerSurfaceEvent): void => {
    this.dispatch('down', event)
  }

  private readonly onMove = (event: PointerSurfaceEvent): void => {
    this.dispatch('move', event)
  }

  private readonly onUp = (event: PointerSurfaceEvent): void => {
    this.dispatch('up', event)
  }

  private readonly onCancel = (event: PointerSurfaceEvent): void => {
    this.dispatch('cancel', event)
  }

  constructor() {
    const bridge = new PickerBridge()
    const session = new GameSession({
      pieces: demoLineup(),
      legalDestinations: {},
    })
    this.runtime = new HallRuntime({ session, picker: bridge })
    this.raycaster = new RaycastPicker(this.runtime.hall.camera, this.runtime.hall, {
      width: 1,
      height: 1,
    })
    bridge.use(this.raycaster)
  }

  /** The seated hall. */
  get hall(): ChessHall {
    return this.runtime.hall
  }

  /**
   * Listen on `surface` and raycast into the hall.
   * Calling this again replaces the previous surface.
   */
  attachPointer(surface: PointerSurface): void {
    this.detach()
    this.surface = surface
    const rect = surface.getBoundingClientRect()
    // A hidden canvas reports 0. The raycaster divides by the viewport size.
    this.raycaster.setViewport({
      width: Math.max(1, rect.width),
      height: Math.max(1, rect.height),
    })
    surface.addEventListener('pointerdown', this.onDown)
    surface.addEventListener('pointermove', this.onMove)
    surface.addEventListener('pointerup', this.onUp)
    surface.addEventListener('pointercancel', this.onCancel)
    this.runtime.pointer.attach()
  }

  /** Remove the current surface listeners. Safe when nothing is attached. */
  detach(): void {
    const surface = this.surface
    if (!surface) return
    surface.removeEventListener('pointerdown', this.onDown)
    surface.removeEventListener('pointermove', this.onMove)
    surface.removeEventListener('pointerup', this.onUp)
    surface.removeEventListener('pointercancel', this.onCancel)
    this.runtime.pointer.detach()
    this.surface = null
  }

  /** Detach input and release the hall. */
  dispose(): void {
    this.detach()
    this.runtime.dispose()
  }

  private dispatch(type: 'down' | 'move' | 'up' | 'cancel', event: PointerSurfaceEvent): void {
    const surface = this.surface
    if (!surface) return
    const rect = surface.getBoundingClientRect()
    this.runtime.pointer.handle({
      type,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      pointerId: event.pointerId,
    })
  }
}

/**
 * Canvas props for the thin demo page.
 * `onCreated` attaches the WebGL canvas as the pointer surface.
 */
export function hallDemoMount(demo: HallDemo): HallDemoMount {
  return {
    camera: demo.hall.camera,
    hall: demo.hall,
    onCreated(state) {
      demo.attachPointer(state.gl.domElement)
    },
  }
}
