import type { BoardPick } from '../mad-scientist/input/picking'
import type { HandTrackingInput } from '../mad-scientist/input/HandTrackingInput'
import type { XRControllerInput } from '../mad-scientist/input/XRControllerInput'
import type { RaycastPicker } from '../mad-scientist/input/RaycastPicker'
import type { Vec3 } from '../mad-scientist/contracts/types'

/** Joint position copied off a WebXR hand pose. */
export interface LooseJoint {
  readonly position?: { readonly x: number; readonly y: number; readonly z: number } | null
}

/**
 * The fields this hall reads off an XR input source.
 * The WebXR library's state is wider; only these members are used.
 */
export interface LooseXrInput {
  readonly id?: string
  readonly type?: string
  readonly handedness?: string
  readonly inputSource?: { readonly handedness?: string; readonly gamepad?: { readonly buttons?: ReadonlyArray<{ readonly pressed?: boolean }> } }
  readonly gamepad?: { readonly buttons?: ReadonlyArray<{ readonly pressed?: boolean }> }
  readonly object?: {
    getWorldPosition?: (target: { set: (x: number, y: number, z: number) => void }) => { x: number; y: number; z: number }
    getWorldDirection?: (target: { set: (x: number, y: number, z: number) => void }) => { x: number; y: number; z: number }
  }
  readonly pose?: { readonly joints?: Readonly<Record<string, LooseJoint | undefined>> }
}

/**
 * Project library input states into {@link XrPoseSource} values.
 * Missing poses become an untracked source so a lost hand cancels instead of submitting.
 * @param inputs - `inputSourceStates` from the XR store.
 */
export function readXrPoses(inputs: readonly LooseXrInput[]): XrPoseSource[] {
  return inputs.map((input, index) => {
    const hand = input.handedness === 'left' || input.inputSource?.handedness === 'left' ? 'left' : 'right'
    const kind = input.type === 'hand' ? 'hand' : 'controller'
    const buttons = input.gamepad?.buttons ?? input.inputSource?.gamepad?.buttons
    const selecting = Boolean(buttons?.[0]?.pressed)
    const origin = worldPoint(input.object?.getWorldPosition)
    const direction = worldPoint(input.object?.getWorldDirection)
    const thumb = joint(input, 'thumb-tip')
    const indexTip = joint(input, 'index-finger-tip')
    const tracked = input.type === 'hand' ? Boolean(thumb && indexTip) : Boolean(origin && direction)
    return {
      id: input.id ?? `${kind}-${hand}-${index}`,
      kind,
      hand,
      selecting,
      tracked,
      origin,
      direction,
      thumbTip: thumb,
      indexTip,
    }
  })
}

function worldPoint(
  read?: (target: { set: (x: number, y: number, z: number) => unknown }) => { x: number; y: number; z: number },
): { x: number; y: number; z: number } | null {
  if (typeof read !== 'function') return null
  const target = {
    x: 0,
    y: 0,
    z: 0,
    set(x: number, y: number, z: number) {
      this.x = x
      this.y = y
      this.z = z
      return this
    },
  }
  const result = read(target)
  if (!result) return { x: target.x, y: target.y, z: target.z }
  return { x: result.x, y: result.y, z: result.z }
}

function joint(input: LooseXrInput, name: string): { x: number; y: number; z: number } | null {
  const position = input.pose?.joints?.[name]?.position
  if (!position) return null
  return { x: position.x, y: position.y, z: position.z }
}

/** One controller or hand pose already in world meters. */
export interface XrPoseSource {
  readonly id: string
  readonly kind: 'controller' | 'hand'
  readonly hand: 'left' | 'right'
  readonly selecting: boolean
  readonly tracked: boolean
  readonly origin: Vec3 | null
  readonly direction: Vec3 | null
  readonly thumbTip: Vec3 | null
  readonly indexTip: Vec3 | null
}

/**
 * Turns XR poses into the hall's controller and hand samples.
 *
 * Select edges become `selectstart` / `selectend`. A lost hand cancels.
 * The pump does not submit moves; {@link XRControllerInput} and
 * {@link HandTrackingInput} do, through the shared grab.
 */
export class XrInputPump {
  private readonly selecting = new Map<string, boolean>()

  /**
   * @param picker - World-ray picker aimed from the controller or the index finger.
   * @param controllers - Touch Pro input.
   * @param hands - Pinch input.
   */
  constructor(
    private readonly picker: RaycastPicker,
    private readonly controllers: XRControllerInput,
    private readonly hands: HandTrackingInput,
  ) {}

  /**
   * Apply every pose from one frame.
   * @param sources - Controllers and hands currently exposed by WebXR.
   */
  push(sources: readonly XrPoseSource[]): void {
    const seen = new Set<string>()
    for (const source of sources) {
      seen.add(source.id)
      if (source.kind === 'controller') this.controller(source)
      else this.hand(source)
    }
    for (const [id, was] of this.selecting) {
      if (seen.has(id) || !was) continue
      this.selecting.set(id, false)
    }
  }

  private controller(source: XrPoseSource): void {
    const was = this.selecting.get(source.id) === true
    if (!source.tracked) {
      if (was) {
        this.controllers.handle({
          type: 'trackinglost',
          hand: source.hand,
          square: null,
          piece: null,
          clock: false,
          world: null,
        })
      }
      this.selecting.set(source.id, false)
      return
    }
    const pick = this.aim(source)
    if (source.selecting && !was) {
      this.controllers.handle({
        type: 'selectstart',
        hand: source.hand,
        square: pick.square,
        piece: pick.piece,
        clock: pick.clock,
        world: pick.world,
      })
    } else if (!source.selecting && was) {
      this.controllers.handle({
        type: 'selectend',
        hand: source.hand,
        square: pick.square,
        piece: pick.piece,
        clock: pick.clock,
        world: pick.world,
      })
    } else if (source.selecting && was && pick.world) {
      this.controllers.handle({
        type: 'selectstart',
        hand: source.hand,
        square: pick.square,
        piece: pick.piece,
        clock: false,
        world: pick.world,
      })
    }
    this.selecting.set(source.id, source.selecting)
  }

  private hand(source: XrPoseSource): void {
    const pick = source.tracked ? this.aim(source) : { square: null, piece: null, clock: false, world: null }
    this.hands.handle({
      tracked: source.tracked && source.thumbTip !== null && source.indexTip !== null,
      thumbTip: source.thumbTip,
      indexTip: source.indexTip,
      square: pick.square,
      piece: pick.piece,
      clock: pick.clock,
      world: pick.world,
    })
  }

  private aim(source: XrPoseSource): BoardPick {
    if (!source.origin || !source.direction) {
      return { square: null, piece: null, clock: false, world: null }
    }
    return this.picker.pickRay(source.origin, source.direction)
  }
}
