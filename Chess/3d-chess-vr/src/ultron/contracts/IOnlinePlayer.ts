import type { BoardGameEvent, IncomingEvent, SeekRequest, StreamFault } from '../lichess/apiTypes';
import type { DeclineReason } from '../lichess/apiTypes';
import { TransportResult } from '../lichess/TransportResult';

/**
 * Callbacks the online player uses to push authoritative Lichess facts into the session.
 * The inbox does not accept move intents.
 */
export interface ILichessInbox {
  /**
   * @param username - Account username.
   * @param id - Account id.
   */
  onAccount(username: string, id: string): void;
  /**
   * @param event - A board-stream event.
   */
  onBoardEvent(event: BoardGameEvent): void;
  /**
   * @param event - An incoming-event-stream event.
   */
  onIncoming(event: IncomingEvent): void;
  /**
   * @param fault - Stream or account failure.
   */
  onStreamFault(fault: StreamFault): void;
}

/**
 * Online human transport. {@link LichessPlayer} is the production implementation.
 * The session validates moves before calling `playMove`.
 */
export interface IOnlinePlayer {
  /**
   * @param inbox - Session that receives stream facts.
   */
  bindInbox(inbox: ILichessInbox): void;
  /**
   * @param signal - Abort signal.
   */
  start(signal: AbortSignal): Promise<TransportResult>;
  /**
   * @param gameId - Game id.
   * @param uci - Already validated UCI.
   * @param signal - Abort signal. Aborting must not cause a second post.
   */
  playMove(gameId: string, uci: string, signal: AbortSignal): Promise<TransportResult>;
  /**
   * @param request - Seek parameters. The implementation opens the event stream first.
   * @param signal - Aborting cancels the seek by closing the connection.
   */
  seek(request: SeekRequest, signal: AbortSignal): Promise<TransportResult>;
  /** Abort the open seek, if any. */
  cancelSeek(): void;
  /**
   * @param username - Opponent.
   * @param request - Challenge parameters.
   * @param signal - Abort signal.
   */
  challenge(username: string, request: import('../lichess/apiTypes').ChallengeRequest, signal: AbortSignal): Promise<TransportResult>;
  /**
   * @param challengeId - Challenge id.
   * @param signal - Abort signal.
   */
  acceptChallenge(challengeId: string, signal: AbortSignal): Promise<TransportResult>;
  /**
   * @param challengeId - Challenge id.
   * @param reason - Decline reason.
   * @param signal - Abort signal.
   */
  declineChallenge(challengeId: string, reason: DeclineReason, signal: AbortSignal): Promise<TransportResult>;
  /**
   * @param gameId - Game id.
   * @param signal - Abort signal.
   */
  resign(gameId: string, signal: AbortSignal): Promise<TransportResult>;
  /**
   * @param gameId - Game id.
   * @param signal - Abort signal.
   */
  abortGame(gameId: string, signal: AbortSignal): Promise<TransportResult>;
  /** Stop streams without sending a move. */
  dispose(): void;
}
