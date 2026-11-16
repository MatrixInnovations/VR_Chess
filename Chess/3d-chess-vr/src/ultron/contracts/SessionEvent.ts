import type { LegalMove, ViewMode } from './types';
import type { RejectReason } from './types';

/**
 * Immutable facts the session emits.
 * Views may render them. They are not a second way to submit a move.
 */
export type SessionEvent =
  | { readonly type: 'origin-required'; readonly intentId: string; readonly to: string; readonly candidates: readonly LegalMove[] }
  | { readonly type: 'promotion-required'; readonly intentId: string; readonly from: string; readonly to: string }
  | { readonly type: 'move-rejected'; readonly intentId: string; readonly reason: RejectReason }
  | { readonly type: 'move-unconfirmed'; readonly intentId: string; readonly uci: string }
  | { readonly type: 'move-confirmed'; readonly uci: string }
  | { readonly type: 'clock-provisional'; readonly color: 'white' | 'black' }
  | { readonly type: 'game-finished'; readonly status: string; readonly winner: 'white' | 'black' | null }
  | { readonly type: 'view-mode'; readonly mode: ViewMode }
  | { readonly type: 'stream-fault'; readonly code: string; readonly message: string }
  | { readonly type: 'reconciliation-error'; readonly message: string }
  | { readonly type: 'challenge'; readonly challengeId: string; readonly action: 'received' | 'canceled' | 'declined' }
  | { readonly type: 'seek'; readonly action: 'opened' | 'closed' }
  | { readonly type: 'disposed' };

/** Result of {@link IGameCommandSink.submit}. `ok` does not always mean Lichess has echoed the move. */
export type SubmitResult =
  | {
      readonly ok: true;
      readonly kind: 'move';
      readonly commandId: string;
      readonly uci: string;
      readonly authority: 'local' | 'lichess-accepted' | 'lichess-unconfirmed';
    }
  | { readonly ok: true; readonly kind: 'cancelled'; readonly commandId: string }
  | {
      readonly ok: true;
      readonly kind: 'resign-sent' | 'abort-sent' | 'seek-opened' | 'challenge-sent' | 'challenge-accepted' | 'challenge-declined';
      readonly commandId: string;
    }
  | { readonly ok: false; readonly reason: RejectReason; readonly candidates?: readonly LegalMove[] };
