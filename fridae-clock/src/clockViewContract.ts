import type { ClockEvent } from "./ChessClock.ts"

/**
 * Read-only snapshot fields for Vision and the Mad Scientist physical clock.
 * Values are already in milliseconds. Do not subtract frame deltas or
 * `performance.now()` in the view or the table model.
 *
 * `provisionalFlagColor` is not a loss. `confirmedFlag` is display-only:
 * `server` means Lichess status `outoftime`, `local` means the offline clock
 * reached zero. `null` display milliseconds mean absent or unlimited.
 */
export const CLOCK_SNAPSHOT_FIELDS = [
  "kind",
  "mode",
  "phase",
  "activeColor",
  "whiteDisplayMs",
  "blackDisplayMs",
  "whiteIncrementMs",
  "blackIncrementMs",
  "provisionalFlagColor",
  "confirmedFlag",
  "lichessStatus",
  "terminal",
  "speed",
  "daysPerTurn",
  "ply",
  "expiration",
  "opponentGone",
  "sampledAtMs",
] as const

/** Discrete events from {@link ChessClock.subscribe}. None of these fire per frame. */
export const CLOCK_EVENT_TYPES: readonly ClockEvent["type"][] = [
  "moveApplied",
  "moveIgnored",
  "authoritativeApplied",
  "authoritativeIgnored",
  "provisionalFlag",
  "provisionalFlagCleared",
  "confirmedFlag",
  "paused",
  "resumed",
  "frozen",
  "pauseRejected",
  "resumeRejected",
  "tapIgnored",
  "opponentGoneNoted",
  "disposed",
]
