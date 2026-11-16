import { Object3D, Quaternion, Vector3 } from 'three'

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
/** A WebXR pose transform. Position is meters. Orientation is a quaternion. */
export interface XrTransform {
  readonly position: { readonly x: number; readonly y: number; readonly z: number }
  readonly orientation: { readonly x: number; readonly y: number; readonly z: number; readonly w: number }
}

/**
 * The slice of an XR frame the hall needs.
 * Tests pass a fake. The page passes the real `XRFrame`.
 */
export interface XrFrameLike {
  getPose?(space: unknown, referenceSpace: unknown): { transform: XrTransform } | null
  getJointPose?(joint: unknown, referenceSpace: unknown): { transform: XrTransform } | null
}

/** One XR input source, shaped like react-three/xr 6.6. */
export interface LooseXrInput {
  readonly id?: string
  readonly type?: string
  readonly handedness?: string
  readonly inputSource?: {
    readonly handedness?: string
    readonly targetRaySpace?: unknown
    readonly gamepad?: { readonly buttons?: ReadonlyArray<{ readonly pressed?: boolean }> }
    readonly hand?: { get(joint: string): unknown }
  }
  readonly gamepad?: { readonly buttons?: ReadonlyArray<{ readonly pressed?: boolean }> }
  /** Grip-space model. Used only when no target-ray pose is available. */
  readonly object?: Object3D
  /** Gesture buffer from the XR library. It is not a joint map. */
  readonly pose?: { readonly data?: Float32Array; readonly joints?: Readonly<Record<string, LooseJoint | undefined>> }
}

/**
 * Project library input states into {@link XrPoseSource} values.
 * Missing poses become an untracked source so a lost hand cancels instead of submitting.
 * @param inputs - `inputSourceStates` from the XR store.
 */
const scratchOrigin = new Vector3()
const scratchQuat = new Quaternion()
const scratchDir = new Vector3()

/**
 * Aiming ray for an object. WebXR target rays point along local −Z, not +Z.
 * @param object - A real three.js object. The matrix world is updated first.
 * @returns Origin and the −Z direction. Never throws on a normal Object3D.
 */
export function poseFromObject(object: Object3D): { origin: Vec3; direction: Vec3 } {
  object.updateWorldMatrix(true, false)
  scratchOrigin.setFromMatrixPosition(object.matrixWorld)
  scratchQuat.setFromRotationMatrix(object.matrixWorld)
  scratchDir.set(0, 0, -1).applyQuaternion(scratchQuat)
  return {
    origin: { x: scratchOrigin.x, y: scratchOrigin.y, z: scratchOrigin.z },
    direction: { x: scratchDir.x, y: scratchDir.y, z: scratchDir.z },
  }
}

/**
 * Project library input states into {@link XrPoseSource} values.
 * Controller and hand aim come from `targetRaySpace` when a frame is present.
 * @param inputs - `inputSourceStates` from the XR store.
 * @param frame - Current XR frame, or null on the desktop.
 * @param referenceSpace - Session reference space passed to `getPose`.
 */
export function readXrPoses(
  inputs: readonly LooseXrInput[],
  frame: XrFrameLike | null = null,
  referenceSpace: unknown = null,
): XrPoseSource[] {
  return inputs.map((input, index) => {
    const hand = input.handedness === 'left' || input.inputSource?.handedness === 'left' ? 'left' : 'right'
    const kind = input.type === 'hand' ? 'hand' : 'controller'
    const buttons = input.gamepad?.buttons ?? input.inputSource?.gamepad?.buttons
    const selecting = Boolean(buttons?.[0]?.pressed)
    const aimed = aimOf(input, frame, referenceSpace)
    const thumb = jointPosition(input, frame, referenceSpace, 'thumb-tip')
    const indexTip = jointPosition(input, frame, referenceSpace, 'index-finger-tip')
    const tracked = kind === 'hand' ? Boolean(thumb && indexTip) : Boolean(aimed)
    return {
      id: input.id ?? `${kind}-${hand}-${index}`,
      kind,
      hand,
      selecting,
      tracked,
      origin: aimed?.origin ?? null,
      direction: aimed?.direction ?? null,
      thumbTip: thumb,
      indexTip,
    }
  })
}

function aimOf(
  input: LooseXrInput,
  frame: XrFrameLike | null,
  referenceSpace: unknown,
): { origin: Vec3; direction: Vec3 } | null {
  const space = input.inputSource?.targetRaySpace
  const pose = space && frame?.getPose ? frame.getPose(space, referenceSpace) : null
  if (pose) return rayFromTransform(pose.transform)
  if (input.object) return poseFromObject(input.object)
  return null
}

function jointPosition(
  input: LooseXrInput,
  frame: XrFrameLike | null,
  referenceSpace: unknown,
  name: string,
): Vec3 | null {
  const joint = input.inputSource?.hand?.get(name)
  const pose = joint && frame?.getJointPose ? frame.getJointPose(joint, referenceSpace) : null
  if (!pose) return null
  const position = pose.transform.position
  return { x: position.x, y: position.y, z: position.z }
}

function rayFromTransform(transform: XrTransform): { origin: Vec3; direction: Vec3 } {
  scratchQuat.set(transform.orientation.x, transform.orientation.y, transform.orientation.z, transform.orientation.w)
  scratchDir.set(0, 0, -1).applyQuaternion(scratchQuat)
  return {
    origin: { x: transform.position.x, y: transform.position.y, z: transform.position.z },
    direction: { x: scratchDir.x, y: scratchDir.y, z: scratchDir.z },
  }
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
      hand: source.hand,
    })
  }

  private aim(source: XrPoseSource): BoardPick {
    if (!source.origin || !source.direction) {
      return { square: null, piece: null, clock: false, world: null }
    }
    return this.picker.pickRay(source.origin, source.direction)
  }
}
