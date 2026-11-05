/** Minimal typings for chess.js 0.13, which ships as ESM without its own declarations. */
declare module 'chess.js' {
  export interface ChessPiece {
    type: string;
    color: 'w' | 'b';
  }

  export interface VerboseMove {
    color: 'w' | 'b';
    from: string;
    to: string;
    san: string;
    flags: string;
    piece: string;
    promotion?: string;
  }

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
