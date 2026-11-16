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

  it('replays a UCI list from the start and rejects a broken list', () => {
    const rules = new ChessJsRules();
    expect(rules.replay('startpos', ['e2e4', 'e7e5'])).toBe(true);
    expect(rules.fen()).toContain('4P3');
    expect(rules.replay('startpos', ['e2e5'])).toBe(false);
  });
});
