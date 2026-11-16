/** Minimal typings for chess.js 0.13, which ships as ESM without its own declarations. */
declare module 'chess.js' {
  /** A piece on a chess.js board square. */
  export interface ChessPiece {
    type: string;
    color: 'w' | 'b';
  }

  /** One legal move reported by chess.js. */
  export interface VerboseMove {
    color: 'w' | 'b';
    from: string;
    to: string;
    san: string;
    flags: string;
    piece: string;
    promotion?: string;
  }

  /** The chess.js game object used by {@link ChessJsRules}. */
  export interface ChessInstance {
    fen(): string;
    turn(): 'w' | 'b';
    load(fen: string): boolean;
    reset(): void;
    moves(options: { verbose: true; square?: string }): VerboseMove[];
    move(move: { from: string; to: string; promotion?: string }): VerboseMove | null;
    in_checkmate(): boolean;
    in_stalemate(): boolean;
    in_draw(): boolean;
    game_over(): boolean;
    board(): Array<Array<ChessPiece | null>>;
  }

  export function Chess(fen?: string): ChessInstance;
}
