/**
 * Ultron lane public surface.
 *
 * Mad Scientist should import the session and input contracts from here and
 * delete `src/mad-scientist/contracts` plus the stub session on rebase.
 * Foundation owns the vitest include list; these tests live under `src/ultron`.
 */

export { GameSession, GameSessionHost } from './session/GameSession';
export { OAuthPkceClient } from './auth/OAuthPkceClient';
export { LichessClient } from './lichess/LichessClient';
export { Player } from './players/Player';
export { LocalPlayer } from './players/LocalPlayer';
export { LichessPlayer } from './players/LichessPlayer';
export { Squares, isOnBoard, squareKey, squaresEqual } from './contracts/squares';

export type { IGameSession } from './contracts/IGameSession';
export type { IInputController } from './contracts/IInputController';
export type { IGameSessionViewPort } from './contracts/IGameSessionViewPort';
export type {
  CancelReason,
  MoveIntent,
  MoveSource,
  PieceColor,
  PieceKind,
  PieceSnapshot,
  PromotionPiece,
  Square,
} from './contracts/types';
