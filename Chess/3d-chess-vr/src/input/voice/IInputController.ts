/**
 * Shared input contract.
 *
 * Ultron owns the canonical `IInputController` and `MoveIntent`. This file is a
 * local stub until the Jarvis foundation branch exists. Keep it thin so that
 * pull request wins on merge: voice submits intents, and it does not grow
 * rules, board writes, or device-specific fields.
 */

/** Promotion piece a pawn move may name. Matches the usual UCI suffix. */
export type PromotionPiece = 'q' | 'r' | 'b' | 'n'

/** Which human input channel produced an intent. Voice is Sundae's channel. */
export type MoveSource = 'voice' | 'pointer' | 'xr-controller' | 'hand'

/**
 * One human move ready for `GameSession.submitMoveIntent`.
 * The session is the only validator. Input must not apply this to a board.
 */
export interface MoveIntent {
  /** Origin square in algebraic notation, such as `e2`. Omitted only when the channel cannot name it. */
  from?: string
  /** Destination square in algebraic notation, such as `e4`. */
  to: string
  /** Promotion piece when the player named one or the session listed one. */
  promotion?: PromotionPiece
  /** Source channel. Voice always sets this to `voice` before submit. */
  source: MoveSource
}

/**
 * Device-neutral input controller.
 * Pointer, XR, hand, and voice each implement this and submit through GameSession.
 */
export interface IInputController {
  /** Begin capturing for this modality. Resolves on a soft failure instead of throwing. */
  start(): Promise<void>
  /** Stop capturing and cancel any in-flight recognition or gesture. */
  stop(): Promise<void>
  /** True while this controller is capturing. */
  isActive(): boolean
}
