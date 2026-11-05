import type { IGameSession } from '../contracts/IGameSession'
import { isOnBoard, squaresEqual } from '../contracts/squares'
import type {
  CancelReason,
  MoveIntent,
  PieceKind,
  PieceSnapshot,
  Square,
} from '../contracts/types'

/**
 * Options for the lane-local session stub.
 * `legalDestinations` is injected. This class does not search moves.
 */
export interface GameSessionOptions {
  pieces: readonly PieceSnapshot[]
  legalDestinations: Readonly<Record<string, readonly Square[]>>
}

/**
 * Local stand-in for Ultron's GameSession.
 *
 * It is the only object in this lane allowed to accept a move. Legal squares
 * are supplied by the caller (the real session, fed by the Lichess game), so
 * nothing here is a chess engine. Delete this file when the foundation
 * GameSession is on the branch and point imports at that class instead.
 */
export class GameSession implements IGameSession {
  private pieces: PieceSnapshot[]

  private readonly legal: Map<string, Square[]>

  private readonly seenIntentIds = new Set<string>()

  private lastCancel: CancelReason | null = null

  constructor(options: GameSessionOptions) {
    this.pieces = options.pieces.map((piece) => copyPiece(piece))
    this.legal = new Map(
      Object.entries(options.legalDestinations).map(([id, squares]) => [
        id,
        squares.map((square) => ({ ...square })),
      ]),
    )
  }

  /** @inheritdoc */
  getLegalDestinations(pieceId: string): readonly Square[] {
    const found = this.legal.get(pieceId) ?? []
    return found.map((square) => ({ ...square }))
  }

  /**
   * Accept `intent` when the origin matches and the destination was injected
   * as legal. The intent id is remembered only after acceptance, so a rejected
   * drop can be retried with a new gesture but a double submit cannot land twice.
   */
  submitMoveIntent(intent: MoveIntent): boolean {
    if (this.seenIntentIds.has(intent.intentId)) return false
    const index = this.pieces.findIndex((piece) => piece.id === intent.pieceId)
    if (index < 0) return false
    const piece = this.pieces[index]
    if (!squaresEqual(piece.square, intent.from)) return false
    if (!isOnBoard(intent.to)) return false
    const allowed = (this.legal.get(intent.pieceId) ?? []).some((square) =>
      squaresEqual(square, intent.to),
    )
    if (!allowed) return false

    this.seenIntentIds.add(intent.intentId)
    const nextKind = promotedKind(piece, intent)
    // Occupancy bookkeeping for a move the session already accepted.
    // This is not move generation: the destination was on the injected list.
    this.pieces = this.pieces
      .filter((other) => other.id === piece.id || !squaresEqual(other.square, intent.to))
      .map((other) =>
        other.id === piece.id
          ? { ...other, kind: nextKind, square: { file: intent.to.file, rank: intent.to.rank } }
          : other,
      )
    return true
  }

  /** @inheritdoc */
  cancelPendingMove(reason: CancelReason): void {
    this.lastCancel = reason
  }

  /** @inheritdoc */
  getPieces(): readonly PieceSnapshot[] {
    return this.pieces.map((piece) => copyPiece(piece))
  }

  /** Last reason passed to {@link cancelPendingMove}, or null if none. */
  getLastCancelReason(): CancelReason | null {
    return this.lastCancel
  }
}

function copyPiece(piece: PieceSnapshot): PieceSnapshot {
  return { ...piece, square: { ...piece.square } }
}

/**
 * Promotion is applied only when the human intent names one and the piece is a pawn.
 * The stub will not queen a pawn on its own.
 */
function promotedKind(piece: PieceSnapshot, intent: MoveIntent): PieceKind {
  if (intent.promotion && piece.kind === 'pawn') return intent.promotion
  return piece.kind
}
