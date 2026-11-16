import type { ChallengeRequest, SeekRequest } from '../ultron/lichess/apiTypes'
import { BoardTimeControl } from '../ultron/lichess/BoardTimeControl'

/** A parsed `minutes+increment` label such as `10+0`. */
export interface ParsedClockLabel {
  readonly minutes: number
  readonly increment: number
}

/**
 * Turns a lobby label into a Board API seek or challenge.
 *
 * Seeks are limited to rapid and classical. Direct challenges may also be blitz.
 * Bullet is refused before any request is built.
 */
export class TimeControlLabel {
  /**
   * @param label - Text such as `10+0` or `5+0 blitz (challenge)`.
   * @returns The two numbers, or null when the label is not `N+N`.
   */
  static parse(label: string): ParsedClockLabel | null {
    const match = /(\d+)\s*\+\s*(\d+)/.exec(label)
    if (!match) return null
    return { minutes: Number(match[1]), increment: Number(match[2]) }
  }

  /**
   * @param label - Lobby time-control label.
   * @param rated - Rated flag from the form.
   * @param color - Seat request.
   * @returns A seek, or an error message when the Board API would refuse it.
   */
  static seek(
    label: string,
    rated: boolean,
    color: 'white' | 'black' | 'random',
  ): { ok: true; request: SeekRequest } | { ok: false; message: string } {
    const parsed = TimeControlLabel.parse(label)
    if (!parsed) return { ok: false, message: `Time control ${label} is not minutes+increment` }
    const request: SeekRequest = {
      kind: 'realtime',
      timeMinutes: parsed.minutes,
      incrementSeconds: parsed.increment,
      rated,
      color,
    }
    const issue = BoardTimeControl.validateSeek(request)
    if (issue) return { ok: false, message: issue }
    return { ok: true, request }
  }

  /**
   * @param label - Lobby time-control label.
   * @param rated - Rated flag from the form.
   * @param color - Seat request.
   * @returns A challenge, or an error message when the Board API would refuse it.
   */
  static challenge(
    label: string,
    rated: boolean,
    color: 'white' | 'black' | 'random',
  ): { ok: true; request: ChallengeRequest } | { ok: false; message: string } {
    const parsed = TimeControlLabel.parse(label)
    if (!parsed) return { ok: false, message: `Time control ${label} is not minutes+increment` }
    const request: ChallengeRequest = {
      kind: 'realtime',
      limitSeconds: parsed.minutes * 60,
      incrementSeconds: parsed.increment,
      rated,
      color,
    }
    const issue = BoardTimeControl.validateChallenge(request)
    if (issue) return { ok: false, message: issue }
    return { ok: true, request }
  }
}
