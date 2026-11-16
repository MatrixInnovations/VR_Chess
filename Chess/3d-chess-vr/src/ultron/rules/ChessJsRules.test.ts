import { describe, expect, it } from 'vitest';

import { ChessJsRules } from './ChessJsRules';

describe('ChessJsRules', () => {
  it('lists the twenty initial legal moves and plays e2e4', () => {
    const rules = new ChessJsRules();
    expect(rules.legalMoves()).toHaveLength(20);
    expect(rules.turn()).toBe('white');
    const played = rules.play({ from: 'e2', to: 'e4' });
    expect(played?.uci).toBe('e2e4');
    expect(rules.fen()).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
    expect(rules.turn()).toBe('black');
  });

  it('does not mutate the position when a move is illegal', () => {
    const rules = new ChessJsRules();
    const before = rules.fen();
    expect(rules.play({ from: 'e2', to: 'e5' })).toBeNull();
    expect(rules.fen()).toBe(before);
  });

  it('requires an explicit promotion and then plays it', () => {
    const rules = new ChessJsRules('k7/4P3/8/8/8/8/8/4K3 w - - 0 1');
    expect(rules.isPromotionRequired('e7', 'e8')).toBe(true);
    expect(rules.play({ from: 'e7', to: 'e8' })).toBeNull();
    expect(rules.fen().startsWith('k3Q')).toBe(false);
    const played = rules.play({ from: 'e7', to: 'e8', promotion: 'q' });
    expect(played?.uci).toBe('e7e8q');
    expect(rules.fen().includes('Q')).toBe(true);
  });

  it('recognises fool\'s mate and per-side mating material', () => {
    const rules = new ChessJsRules();
    for (const move of [
      { from: 'f2', to: 'f3' },
      { from: 'e7', to: 'e5' },
      { from: 'g2', to: 'g4' },
      { from: 'd8', to: 'h4' },
    ]) {
      expect(rules.play(move)).not.toBeNull();
    }
    expect(rules.isCheckmate()).toBe(true);
    expect(rules.isTerminal()).toBe(true);

    const bare = new ChessJsRules('k7/8/8/8/8/8/8/K6N w - - 0 1');
    expect(bare.opponentHasMatingMaterial('white')).toBe(false);
    expect(bare.opponentHasMatingMaterial('black')).toBe(false);
    const queen = new ChessJsRules('k7/8/8/8/8/8/8/KQ6 w - - 0 1');
    expect(queen.opponentHasMatingMaterial('black')).toBe(true);
  });

  it('castles both ways, refuses castling through check, and plays en passant only on the next ply', () => {
    const kingside = new ChessJsRules('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    expect(kingside.play({ from: 'e1', to: 'g1' })?.uci).toBe('e1g1');
    const queenside = new ChessJsRules('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    expect(queenside.play({ from: 'e1', to: 'c1' })?.uci).toBe('e1c1');
    const throughCheck = new ChessJsRules('4q3/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    expect(throughCheck.play({ from: 'e1', to: 'g1' })).toBeNull();

    const enPassant = new ChessJsRules('rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3');
    expect(enPassant.play({ from: 'e5', to: 'd6' })?.uci).toBe('e5d6');
    const missed = new ChessJsRules('rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3');
    expect(missed.play({ from: 'a2', to: 'a3' })).not.toBeNull();
    expect(missed.legalMoves().some((move) => move.to === 'd6' && move.from === 'e5')).toBe(false);
  });

  it('replays an underpromotion and recognises threefold, the 50-move rule, and insufficient material', () => {
    const promoted = new ChessJsRules();
    expect(promoted.replay('k7/4P3/8/8/8/8/8/4K3 w - - 0 1', ['e7e8n'])).toBe(true);
    expect(promoted.fen().toLowerCase()).toContain('n');

    const repeated = new ChessJsRules();
    expect(
      repeated.replay('startpos', ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8']),
    ).toBe(true);
    expect(repeated.isDraw()).toBe(true);

    expect(new ChessJsRules('k7/8/8/8/8/8/8/K7 w - - 100 60').isDraw()).toBe(true);
    expect(new ChessJsRules('k7/8/8/8/8/8/8/K7 w - - 0 1').isDraw()).toBe(true);
  });

  it('replays a UCI list from the start and rejects a broken list', () => {
    const rules = new ChessJsRules();
    expect(rules.replay('startpos', ['e2e4', 'e7e5'])).toBe(true);
    expect(rules.fen()).toContain('4P3');
    expect(rules.replay('startpos', ['e2e5'])).toBe(false);
  });
});
