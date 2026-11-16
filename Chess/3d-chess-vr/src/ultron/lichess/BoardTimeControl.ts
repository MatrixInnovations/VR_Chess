import type { ChallengeRequest, SeekRequest } from './apiTypes';

/** Lichess speed name from the public estimated-duration table. */
export type TimeCategory = 'ultrabullet' | 'bullet' | 'blitz' | 'rapid' | 'classical';

const CORRESPONDENCE_DAYS = new Set([1, 2, 3, 5, 7, 10, 14]);

/**
 * Board API time-control gate.
 *
 * Estimated duration is `initial seconds + 40 * increment`, from
 * https://lichess.org/faq#time-controls. The Board API tag allows rapid,
 * classical, and correspondence seeks. Direct challenges may also be blitz.
 * Bullet and ultrabullet are refused before any request is sent.
 */
export class BoardTimeControl {
  /**
   * @param initialSeconds - Clock initial time in seconds.
   * @param incrementSeconds - Fischer increment in seconds.
   * @returns Estimated duration in seconds.
   */
  static estimateSeconds(initialSeconds: number, incrementSeconds: number): number {
    return initialSeconds + 40 * incrementSeconds;
  }

  /**
   * @param initialSeconds - Clock initial time in seconds.
   * @param incrementSeconds - Fischer increment in seconds.
   * @returns The Lichess speed category.
   */
  static category(initialSeconds: number, incrementSeconds: number): TimeCategory {
    const estimate = BoardTimeControl.estimateSeconds(initialSeconds, incrementSeconds);
    if (estimate <= 29) return 'ultrabullet';
    if (estimate <= 179) return 'bullet';
    if (estimate <= 479) return 'blitz';
    if (estimate <= 1499) return 'rapid';
    return 'classical';
  }

  /**
   * @param seek - Seek the caller wants to create.
   * @returns An error message, or null when the seek matches the published rules.
   */
  static validateSeek(seek: SeekRequest): string | null {
    if (seek.kind === 'correspondence') {
      return CORRESPONDENCE_DAYS.has(seek.days) ? null : 'Correspondence days must be 1, 2, 3, 5, 7, 10, or 14';
    }
    if (!Number.isFinite(seek.timeMinutes) || seek.timeMinutes < 0 || seek.timeMinutes > 180) {
      return 'Seek time must be between 0 and 180 minutes';
    }
    if (!Number.isInteger(seek.incrementSeconds) || seek.incrementSeconds < 0 || seek.incrementSeconds > 180) {
      return 'Seek increment must be an integer from 0 to 180 seconds';
    }
    const category = BoardTimeControl.category(seek.timeMinutes * 60, seek.incrementSeconds);
    if (category !== 'rapid' && category !== 'classical') {
      return `Board API seeks allow rapid and classical only; this clock is ${category}`;
    }
    return null;
  }

  /**
   * @param challenge - Direct challenge.
   * @returns An error message, or null when the challenge matches the published rules.
   */
  static validateChallenge(challenge: ChallengeRequest): string | null {
    if (challenge.kind === 'correspondence') {
      return CORRESPONDENCE_DAYS.has(challenge.days) ? null : 'Correspondence days must be 1, 2, 3, 5, 7, 10, or 14';
    }
    if (!BoardTimeControl.limitAllowed(challenge.limitSeconds)) {
      return 'clock.limit must be 0, 15, 30, 45, 60, 90, or a multiple of 60 up to 10800';
    }
    if (!Number.isInteger(challenge.incrementSeconds) || challenge.incrementSeconds < 0 || challenge.incrementSeconds > 60) {
      return 'Challenge increment must be an integer from 0 to 60 seconds';
    }
    const category = BoardTimeControl.category(challenge.limitSeconds, challenge.incrementSeconds);
    if (category === 'ultrabullet' || category === 'bullet') {
      return `Board API challenges allow blitz, rapid, and classical; this clock is ${category}`;
    }
    return null;
  }

  private static limitAllowed(limitSeconds: number): boolean {
    if (!Number.isInteger(limitSeconds) || limitSeconds < 0 || limitSeconds > 10800) return false;
    if (limitSeconds === 0 || limitSeconds === 15 || limitSeconds === 30 || limitSeconds === 45 || limitSeconds === 60) {
      return true;
    }
    if (limitSeconds === 90) return true;
    return limitSeconds % 60 === 0;
  }
}
