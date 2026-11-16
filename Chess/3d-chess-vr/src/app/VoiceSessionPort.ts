import type { IGameSessionMovePort, LegalMove } from '../input/voice/IGameSessionMovePort'
import type { MoveIntent, PromotionPiece } from '../input/voice/IInputController'
import { Squares } from '../ultron/contracts/squares'
import type { GameSession } from '../ultron/session/GameSession'
import { SequentialIds } from '../ultron/session/SequentialIds'
import type { PromotionPiece as NamedPromotion } from '../ultron/contracts/types'

/**
 * Adapts Ultron's session to the voice port.
 *
 * Phrases are filtered against `legalMoveCandidates`. This class does not
 * generate moves and does not guess when several pieces can reach the square.
 */
export class VoiceSessionPort implements IGameSessionMovePort {
  private readonly ids = new SequentialIds('voice')

  /**
   * @param session - The only object allowed to accept the move.
   * @param onClarify - Shown when the phrase matches more than one move.
   */
  constructor(
    private session: GameSession,
    private readonly onClarify: (message: string) => void,
  ) {}

  /**
   * Follow a replacement session.
   * @param session - Next game. The voice port object itself stays put.
   */
  retarget(session: GameSession): void {
    this.session = session
  }

  /** Legal moves for the side to move, with the piece kind filled in from the board. */
  legalMoves(): readonly LegalMove[] {
    return this.session.legalMoveCandidates().map((move) => {
      const from = Squares.fromAlgebraic(move.from)
      const piece = from
        ? this.session.getPieces().find((item) => item.square.file === from.file && item.square.rank === from.rank)
        : undefined
      return {
        from: move.from,
        to: move.to,
        promotion: move.promotion,
        piece: piece?.kind,
      }
    })
  }

  /**
   * Submit one spoken move.
   * @param intent - Algebraic move from the phrase parser.
   * @returns False when the session rejects it.
   */
  submitMoveIntent(intent: MoveIntent): boolean {
    if (!intent.from) {
      this.requestOriginClarification([intent])
      return false
    }
    const from = Squares.fromAlgebraic(intent.from)
    const to = Squares.fromAlgebraic(intent.to)
    if (!from || !to) return false
    const piece = this.session
      .getPieces()
      .find((item) => item.square.file === from.file && item.square.rank === from.rank)
    if (!piece) return false
    return this.session.submitMoveIntent({
      intentId: this.ids.next(),
      pieceId: piece.id,
      from,
      to,
      source: 'voice',
      promotion: VoiceSessionPort.named(intent.promotion),
    })
  }

  /**
   * Ask which origin the player meant. Does not submit.
   * @param candidates - Legal moves that fit the phrase.
   */
  requestOriginClarification(candidates: readonly MoveIntent[]): void {
    const origins = candidates
      .map((candidate) => candidate.from)
      .filter((square): square is string => Boolean(square))
    const list = origins.length > 0 ? origins.join(' or ') : 'the origin square'
    this.onClarify(`Which piece? Say the square, for example ${list}.`)
  }

  private static named(letter: PromotionPiece | undefined): NamedPromotion | undefined {
    if (letter === 'q') return 'queen'
    if (letter === 'r') return 'rook'
    if (letter === 'b') return 'bishop'
    if (letter === 'n') return 'knight'
    return undefined
  }
}
