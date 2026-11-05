import type { Color, CorrespondenceDays, GameStatusName, VariantKey } from '../contracts/types';

/** Official real-time or correspondence seek body. Times use the seek schema: minutes and increment seconds. */
export type SeekRequest =
  | {
      readonly kind: 'realtime';
      readonly timeMinutes: number;
      readonly incrementSeconds: number;
      readonly rated?: boolean;
      readonly color?: Color | 'random';
      readonly variant?: VariantKey;
      readonly ratingRange?: string;
    }
  | {
      readonly kind: 'correspondence';
      readonly days: CorrespondenceDays;
      readonly rated?: boolean;
      readonly color?: Color | 'random';
      readonly variant?: VariantKey;
      readonly ratingRange?: string;
    };

/** Challenge body. Real-time clocks use `clock.limit` seconds, not seek minutes. */
export type ChallengeRequest =
  | {
      readonly kind: 'realtime';
      readonly limitSeconds: number;
      readonly incrementSeconds: number;
      readonly rated?: boolean;
      readonly color?: Color | 'random';
      readonly variant?: VariantKey;
    }
  | {
      readonly kind: 'correspondence';
      readonly days: CorrespondenceDays;
      readonly rated?: boolean;
      readonly color?: Color | 'random';
      readonly variant?: VariantKey;
    };

/** Decline reasons accepted by `POST /api/challenge/{challengeId}/decline`. */
export type DeclineReason =
  | 'generic'
  | 'later'
  | 'tooFast'
  | 'tooSlow'
  | 'timeControl'
  | 'rated'
  | 'casual'
  | 'standard'
  | 'variant'
  | 'noBot'
  | 'onlyBot';

/** Mutable portion of a board stream event. `moves` is the full UCI list, not a delta. */
export interface GameStatePayload {
  readonly moves: readonly string[];
  readonly wtime: number;
  readonly btime: number;
  readonly winc: number;
  readonly binc: number;
  readonly status: GameStatusName;
  readonly winner: Color | null;
  readonly wdraw: boolean;
  readonly bdraw: boolean;
}

/** Events from `GET /api/board/game/stream/{gameId}`. */
export type BoardGameEvent =
  | {
      readonly type: 'gameFull';
      readonly id: string;
      readonly initialFen: string;
      readonly variant: VariantKey;
      readonly whiteId: string;
      readonly blackId: string;
      readonly state: GameStatePayload;
    }
  | { readonly type: 'gameState'; readonly state: GameStatePayload }
  | { readonly type: 'opponentGone'; readonly gone: boolean; readonly claimWinInSeconds: number | null };

/** Events from `GET /api/stream/event`. */
export type IncomingEvent =
  | { readonly type: 'gameStart'; readonly gameId: string; readonly color: Color; readonly compatBoard: boolean | null }
  | { readonly type: 'gameFinish'; readonly gameId: string }
  | { readonly type: 'challenge'; readonly challengeId: string }
  | { readonly type: 'challengeCanceled'; readonly challengeId: string }
  | { readonly type: 'challengeDeclined'; readonly challengeId: string };

/** Failure of a stream that is not itself a chess event. */
export interface StreamFault {
  readonly code: 'unauthorized' | 'rate-limited' | 'not-found' | 'network' | 'malformed' | 'reconnect-exhausted' | 'cancelled' | 'http';
  readonly message: string;
  readonly httpStatus?: number;
}

/** Consumer of one NDJSON stream. */
export interface StreamListener<T> {
  /**
   * @param event - One parsed event.
   */
  onEvent(event: T): void;
  /**
   * @param fault - A stream problem. A malformed line does not by itself submit a move.
   */
  onFault(fault: StreamFault): void;
}

/** Account payload we depend on. Extra Lichess fields are ignored. */
export type AccountResult =
  | { readonly ok: true; readonly id: string; readonly username: string }
  | { readonly ok: false; readonly result: import('./TransportResult').TransportResult };
