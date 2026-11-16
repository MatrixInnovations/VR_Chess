import type { Color, InputSource, PromotionLetter } from './types';

/**
 * A committed user action. Input controllers submit these to {@link IGameCommandSink}.
 * Partial gestures must not construct a move intent.
 */
export type SessionIntent = SessionMove | CancelIntent | ResignIntent | AbortIntent;

/**
 * Internal move used by voice and tests.
 * Board grabs use {@link MoveIntent} instead, which carries a piece id and file/rank squares.
 */
export interface SessionMove {
  readonly kind: 'move';
  readonly id: string;
  readonly source: InputSource;
  readonly to: string;
  /** Omitted when the user named only a destination. The session asks if more than one piece can move there. */
  readonly from?: string;
  /** Required for promotions. Omitting it asks the user; it is never guessed. */
  readonly promotion?: PromotionLetter;
  /** Which local human is moving. Required offline. Online it must match our color when present. */
  readonly seat?: Color;
}

/** Drop the current gesture or in-flight command. This must not become a move. */
export interface CancelIntent {
  readonly kind: 'cancel';
  readonly id: string;
  readonly source: InputSource;
}

/** Resign the seated side. Online, Lichess confirms the result on the stream. */
export interface ResignIntent {
  readonly kind: 'resign';
  readonly id: string;
  readonly source: InputSource;
  readonly seat?: Color;
}

/** Ask to abort. Offline games that already finished reject this. */
export interface AbortIntent {
  readonly kind: 'abort';
  readonly id: string;
  readonly source: InputSource;
}
