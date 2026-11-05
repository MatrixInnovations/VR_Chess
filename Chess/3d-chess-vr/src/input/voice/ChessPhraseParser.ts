import type { MoveIntent, PromotionPiece } from './IInputController'
import type { LegalMove, PieceKind } from './IGameSessionMovePort'

/** What the player asked for. Absent fields are wildcards against the legal-move list. */
interface ParseQuery {
  from?: string
  fromFile?: string
  fromRank?: string
  to?: string
  piece?: PieceKind
  promotion?: PromotionPiece
  castle?: 'kingside' | 'queenside' | 'either'
}

/**
 * Parses spoken chess phrases into move intents, filtered by the session's legal moves.
 *
 * This is a phrase filter, not a rules engine. It never reads a board. Geometry is only
 * used when a legal move has no `piece` tag: knight moves and the four castling squares
 * are unambiguous, but a one-step slide can be a pawn, rook, queen, or king. Ultron should
 * stamp `piece` on each legal move so those phrases do not collide.
 */
export class ChessPhraseParser {
  /**
   * Squares that are castling and nothing else when the session did not name the piece.
   * A rook slide that happens to be e1-g1 is indistinguishable from castling without a piece tag,
   * so an untagged move on these squares is treated as the king. A `piece: 'rook'` tag opts out.
   */
  private static readonly CASTLE_MOVES = new Set(['e1g1', 'e1c1', 'e8g8', 'e8c8'])

  private static readonly NUMBER_WORDS: Record<string, string> = {
    one: '1',
    two: '2',
    three: '3',
    four: '4',
    five: '5',
    six: '6',
    seven: '7',
    eight: '8',
  }

  private static readonly PIECE_WORDS: Record<string, PieceKind> = {
    pawn: 'pawn',
    pawns: 'pawn',
    knight: 'knight',
    knights: 'knight',
    bishop: 'bishop',
    bishops: 'bishop',
    rook: 'rook',
    rooks: 'rook',
    queen: 'queen',
    queens: 'queen',
    king: 'king',
    kings: 'king',
  }

  private static readonly PROMOTION_CODE: Record<'knight' | 'bishop' | 'rook' | 'queen', PromotionPiece> = {
    knight: 'n',
    bishop: 'b',
    rook: 'r',
    queen: 'q',
  }

  private static readonly SAN_PIECE: Record<string, PieceKind> = {
    n: 'knight',
    r: 'rook',
    q: 'queen',
    k: 'king',
  }

  /** Words dropped when they are not the file letter of a square. `to` and `from` stay. */
  private static readonly FILLERS = new Set([
    'uh',
    'um',
    'er',
    'ah',
    'hmm',
    'hm',
    'eh',
    'please',
    'the',
    'an',
    'my',
    'your',
    'just',
    'now',
    'hey',
    'okay',
    'ok',
    'can',
    'you',
    'i',
    'want',
    'like',
    'would',
    'could',
    'lets',
    'let',
    'us',
    'go',
    'ahead',
    'and',
    'then',
    'so',
    'well',
    'actually',
    'basically',
    'yeah',
    'yes',
    'gonna',
    'move',
    'play',
    'put',
    'piece',
    'thanks',
    'thank',
    'check',
    'mate',
    'checkmate',
    'kinda',
    'sort',
    'of',
  ])

  private static readonly DESTINATION_WORDS = new Set([
    'to',
    'takes',
    'take',
    'capture',
    'captures',
    'capturing',
    'onto',
    'x',
  ])

  private static readonly PROMOTE_WORDS = new Set([
    'promote',
    'promotes',
    'promoting',
    'promotion',
    'equals',
    'equal',
  ])

  /**
   * Parse a transcript against the moves GameSession currently allows.
   * @param phrase - Raw transcript, for example `move pawn to e4`.
   * @param legalMoves - Session-legal moves. The array and its entries are not mutated.
   * @returns Zero, one, or many candidate intents. More than one means the phrase is ambiguous.
   */
  parse(phrase: string, legalMoves: readonly LegalMove[]): MoveIntent[] {
    const query = this.extract(phrase)
    if (!query) return []
    const seen = new Set<string>()
    const intents: MoveIntent[] = []
    for (const move of legalMoves) {
      if (!this.matches(move, query)) continue
      const intent = this.toIntent(move, query)
      // The same from/to/promotion can show up twice if the session hands us a duplicate.
      // Two identical candidates would look like an ambiguous phrase and we would refuse to move.
      const key = `${intent.from}|${intent.to}|${intent.promotion ?? ''}`
      if (seen.has(key)) continue
      seen.add(key)
      intents.push(intent)
    }
    return intents
  }

  /** Turn the raw transcript into a filter, or null when it is not a chess phrase. */
  private extract(phrase: string): ParseQuery | null {
    if (!phrase.trim()) return null
    const tokens = this.tokenize(phrase)
    if (tokens.length === 0) return null
    const castle = this.castleQuery(tokens)
    if (castle) return castle
    if (tokens.length === 1) {
      const compact = this.compactQuery(this.rawToken(phrase, tokens[0]))
      if (compact) return compact
    }
    return this.scanWords(tokens)
  }

  /**
   * Normalize speech into tokens.
   * Number words become digits, `e 4` becomes `e4`, and filler is removed.
   * The article `a` is kept only when it is the a-file (`a 4`).
   */
  private tokenize(phrase: string): string[] {
    const raw = this.prepare(phrase).split(' ').filter((token) => token.length > 0)
    const kept: string[] = []
    for (let index = 0; index < raw.length; index += 1) {
      const token = raw[index]
      if (this.isFiller(token, raw[index + 1])) continue
      kept.push(token)
    }
    const merged: string[] = []
    for (let index = 0; index < kept.length; index += 1) {
      const token = kept[index]
      const next = kept[index + 1]
      if (/^[a-h]$/.test(token) && next && /^[1-8]$/.test(next)) {
        merged.push(`${token}${next}`)
        index += 1
        continue
      }
      merged.push(token)
    }
    return merged
  }

  /** Lowercase, expand castling notation, and spell out number words before tokenization. */
  private prepare(phrase: string): string {
    let text = phrase.toLowerCase().replace(/['’]/g, '')
    // Three-part castle notation has to be replaced before the two-part form, or `o-o-o` becomes two castles.
    text = text.replace(/[0o]\s*-\s*[0o]\s*-\s*[0o]/g, ' queensidecastle ')
    text = text.replace(/[0o]\s*-\s*[0o]/g, ' kingsidecastle ')
    text = text.replace(/[=]/g, ' equals ')
    text = text.replace(/-/g, ' ')
    text = text.replace(/[^a-z0-9\s]/g, ' ')
    text = text.replace(/\bcastling\b/g, 'castle')
    text = text.replace(/\bking\s+side\b/g, 'kingside')
    text = text.replace(/\bqueen\s+side\b/g, 'queenside')
    text = text.replace(/\b(one|two|three|four|five|six|seven|eight)\b/g, (word) => {
      return ChessPhraseParser.NUMBER_WORDS[word]
    })
    return text.replace(/\s+/g, ' ').trim()
  }

  /** A lone `a` is an article unless the next token is a rank, in which case it is the a-file. */
  private isFiller(token: string, next: string | undefined): boolean {
    if (token === 'a') return !(next && /^[1-8]$/.test(next))
    return ChessPhraseParser.FILLERS.has(token)
  }

  /** Recover the original casing of a single compact token such as `Bxc5` or `Nf3`. */
  private rawToken(phrase: string, normalized: string): string {
    const index = phrase.toLowerCase().indexOf(normalized.toLowerCase())
    if (index < 0) return normalized
    return phrase.slice(index, index + normalized.length)
  }

  /** Castle phrases are handled before square phrases so `kingside` is not read as a king move. */
  private castleQuery(tokens: string[]): ParseQuery | null {
    const hasQueen =
      tokens.includes('queenside') ||
      tokens.includes('queensidecastle') ||
      (tokens.includes('long') && tokens.includes('castle'))
    const hasKing =
      tokens.includes('kingside') ||
      tokens.includes('kingsidecastle') ||
      (tokens.includes('short') && tokens.includes('castle'))
    if (!hasQueen && !hasKing && !tokens.includes('castle')) return null
    // "castle kingside queenside" names both wings. Returning no query refuses the phrase
    // instead of picking a wing inside this class.
    if (hasQueen && hasKing) return null
    if (hasQueen) return { castle: 'queenside' }
    if (hasKing) return { castle: 'kingside' }
    return { castle: 'either' }
  }

  /**
   * UCI (`e2e4`, `e7e8q`) and compact SAN (`Nf3`, `exd5`, `Bxc5`).
   * A lowercase `b` is the b-file. An uppercase `B` is a bishop, matching algebraic case.
   * @returns Null when the token is a word such as `knight` rather than a compact move.
   */
  private compactQuery(raw: string): ParseQuery | null {
    const original = raw.trim().replace(/[+#]+$/g, '')
    const token = original.toLowerCase()
    const uci = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(token)
    if (uci) {
      const query: ParseQuery = { from: uci[1], to: uci[2] }
      if (uci[3]) query.promotion = uci[3] as PromotionPiece
      return query
    }
    return this.sanQuery(original, token)
  }

  /** Compact SAN after UCI has already been ruled out. */
  private sanQuery(original: string, token: string): ParseQuery | null {
    let body = token
    let piece: PieceKind | undefined
    if (/^B/.test(original)) {
      piece = 'bishop'
      body = token.slice(1)
    } else {
      const lead = /^([nrqk])(.*)$/.exec(body)
      if (lead) {
        piece = ChessPhraseParser.SAN_PIECE[lead[1]]
        body = lead[2]
      }
    }
    const rest = /^([a-h])?([1-8])?x?([a-h][1-8])(?:=?([qrbn]))?$/.exec(body)
    if (!rest) return null
    const [, file, rank, dest, promo] = rest
    const query: ParseQuery = { to: dest, piece: piece ?? 'pawn' }
    // A full origin square (`e2e4`) is UCI and is handled earlier. SAN disambiguation is only a file or a rank.
    if (file && rank) query.from = `${file}${rank}`
    else if (file) query.fromFile = file
    else if (rank) query.fromRank = rank
    if (promo) query.promotion = promo as PromotionPiece
    return query
  }

  /**
   * Spoken form: `pawn to e4`, `knight on g1 to f3`, `pawn to e8 queen`.
   * A single square with no piece word is a pawn move, which is what SAN `e4` means.
   * A square after `from` stays an origin even when no destination was spoken.
   */
  private scanWords(tokens: string[]): ParseQuery | null {
    let mover: PieceKind | undefined
    let promotion: PromotionPiece | undefined
    let from: string | undefined
    let to: string | undefined
    let explicitFrom = false
    let expectingFrom = false
    let expectingTo = false
    let sawPromote = false
    let sawChess = false

    for (const token of tokens) {
      if (ChessPhraseParser.PROMOTE_WORDS.has(token)) {
        sawPromote = true
        sawChess = true
        continue
      }
      if (token === 'from') {
        expectingFrom = true
        explicitFrom = true
        expectingTo = false
        continue
      }
      // "captures on e4" uses `on` as a destination, while "knight on g1" uses it as an origin.
      if (token === 'on' || token === 'at') {
        if (!expectingTo) {
          expectingFrom = true
          explicitFrom = true
        }
        continue
      }
      if (ChessPhraseParser.DESTINATION_WORDS.has(token)) {
        expectingTo = true
        expectingFrom = false
        sawChess = true
        continue
      }
      if (this.isSquare(token)) {
        sawChess = true
        if (expectingFrom && !from) {
          from = token
          expectingFrom = false
          continue
        }
        if ((expectingTo || from) && !to) {
          to = token
          expectingTo = false
          continue
        }
        // A third square is ignored. Two squares are from and to; more than that is not a move phrase we guess through.
        if (!from && !to) from = token
        continue
      }
      const spokenPromotion = this.promotionFromToken(token)
      if (sawPromote && spokenPromotion) {
        promotion = spokenPromotion
        sawPromote = false
        sawChess = true
        continue
      }
      const piece = ChessPhraseParser.PIECE_WORDS[token]
      if (!piece) continue
      sawChess = true
      if (!mover) {
        mover = piece
        continue
      }
      // A second piece word is the promotion (`pawn to e8 queen`), never a second mover.
      // King and pawn are not promotion pieces, so they do not narrow the list.
      if (piece !== 'king' && piece !== 'pawn') {
        promotion = ChessPhraseParser.PROMOTION_CODE[piece]
      }
    }

    if (!sawChess) return null
    if (from && !to && !explicitFrom) {
      to = from
      from = undefined
      if (!mover) mover = 'pawn'
    }
    if (!to && !from && !mover && !promotion) return null

    const query: ParseQuery = {}
    if (from) query.from = from
    if (to) query.to = to
    if (mover) query.piece = mover
    if (promotion) query.promotion = promotion
    return query
  }

  /** Queen, rook, bishop, knight, or the UCI letters, once the phrase has said `promote` or `equals`. */
  private promotionFromToken(token: string): PromotionPiece | undefined {
    if (token === 'q' || token === 'r' || token === 'b' || token === 'n') return token
    const piece = ChessPhraseParser.PIECE_WORDS[token]
    if (!piece || piece === 'king' || piece === 'pawn') return undefined
    return ChessPhraseParser.PROMOTION_CODE[piece]
  }

  /** Copy one legal move into an intent. Spoken promotion fills in a session move that omitted it. */
  private toIntent(move: LegalMove, query: ParseQuery): MoveIntent {
    const intent: MoveIntent = {
      from: move.from.toLowerCase(),
      to: move.to.toLowerCase(),
      source: 'voice',
    }
    const promotion = query.promotion ?? move.promotion
    if (promotion) intent.promotion = promotion
    return intent
  }

  /** True when this legal move is one of the things the phrase allowed. */
  private matches(move: LegalMove, query: ParseQuery): boolean {
    const squares = this.normalizedSquares(move)
    if (!squares) return false
    if (query.castle) {
      if (!this.isCastleMove(move)) return false
      if (query.castle === 'kingside' && squares.to[0] !== 'g') return false
      if (query.castle === 'queenside' && squares.to[0] !== 'c') return false
      return true
    }
    if (query.from && squares.from !== query.from) return false
    if (query.fromFile && squares.from[0] !== query.fromFile) return false
    if (query.fromRank && squares.from[1] !== query.fromRank) return false
    if (query.to && squares.to !== query.to) return false
    if (query.piece && !this.pieceMatches(move, query.piece)) return false
    if (!this.promotionOk(move, query)) return false
    return true
  }

  /** Reject anything that is not a real algebraic square so a bad session entry cannot throw. */
  private normalizedSquares(move: LegalMove): { from: string; to: string } | null {
    if (typeof move.from !== 'string' || typeof move.to !== 'string') return null
    const from = move.from.toLowerCase()
    const to = move.to.toLowerCase()
    if (!this.isSquare(from) || !this.isSquare(to)) return null
    return { from, to }
  }

  private isSquare(value: string): boolean {
    return /^[a-h][1-8]$/.test(value)
  }

  /** Castling is a king move of two files along the home rank, from e to g or e to c. */
  private isCastleMove(move: LegalMove): boolean {
    if (move.piece && move.piece !== 'king') return false
    const key = `${move.from.toLowerCase()}${move.to.toLowerCase()}`
    return ChessPhraseParser.CASTLE_MOVES.has(key)
  }

  /**
   * Prefer the session's piece tag. Without one, infer from the square delta.
   * Untagged castling squares are kings only, so `rook to g1` cannot castle by accident
   * when the only legal move is e1-g1 and nobody tagged it.
   */
  private pieceMatches(move: LegalMove, piece: PieceKind): boolean {
    if (move.piece) return move.piece === piece
    const from = move.from.toLowerCase()
    const to = move.to.toLowerCase()
    if (ChessPhraseParser.CASTLE_MOVES.has(`${from}${to}`)) return piece === 'king'
    return this.inferredPieces(from, to).has(piece)
  }

  /**
   * A spoken promotion is kept when the session listed that promotion, or when the move
   * reaches the last rank and can be a pawn. Otherwise the phrase does not match.
   */
  private promotionOk(move: LegalMove, query: ParseQuery): boolean {
    if (!query.promotion) return true
    if (move.promotion) return move.promotion === query.promotion
    const toRank = move.to.toLowerCase()[1]
    if (toRank !== '8' && toRank !== '1') return false
    if (move.piece) return move.piece === 'pawn'
    return this.inferredPieces(move.from.toLowerCase(), move.to.toLowerCase()).has('pawn')
  }

  /**
   * Piece kinds that could produce this delta if the session did not say which piece moved.
   * Color is unknown, so pawn direction is not restricted. A zero delta matches nothing.
   */
  private inferredPieces(from: string, to: string): Set<PieceKind> {
    const pieces = new Set<PieceKind>()
    const fileDelta = Math.abs(this.fileIndex(from) - this.fileIndex(to))
    const rankDelta = Math.abs(this.rankNumber(from) - this.rankNumber(to))
    if (fileDelta === 0 && rankDelta === 0) return pieces
    if ((fileDelta === 1 && rankDelta === 2) || (fileDelta === 2 && rankDelta === 1)) {
      pieces.add('knight')
    }
    if (fileDelta <= 1 && rankDelta <= 1) pieces.add('king')
    if (fileDelta === rankDelta) {
      pieces.add('bishop')
      pieces.add('queen')
    }
    if (fileDelta === 0 || rankDelta === 0) {
      pieces.add('rook')
      pieces.add('queen')
    }
    const fromRank = this.rankNumber(from)
    if (fileDelta === 0 && rankDelta === 1) pieces.add('pawn')
    if (fileDelta === 0 && rankDelta === 2 && (fromRank === 2 || fromRank === 7)) {
      pieces.add('pawn')
    }
    if (fileDelta === 1 && rankDelta === 1) pieces.add('pawn')
    return pieces
  }

  private fileIndex(square: string): number {
    return square.charCodeAt(0) - 97
  }

  private rankNumber(square: string): number {
    return Number(square[1])
  }
}
