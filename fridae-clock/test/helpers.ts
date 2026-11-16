/** Builders for clock tests. Plain data only — no domain imports. */

export function state(partial: Record<string, unknown> = {}) {
  return {
    type: "gameState" as const,
    moves: "",
    wtime: 300_000,
    btime: 300_000,
    winc: 0,
    binc: 0,
    status: "started",
    ...partial,
  }
}

export function full(partial: Record<string, unknown> = {}) {
  const { state: statePartial, ...rest } = partial
  return {
    type: "gameFull" as const,
    id: "g1",
    initialFen: "startpos",
    speed: "blitz",
    clock: { initial: 300_000, increment: 0 },
    ...rest,
    state: state(statePartial as Record<string, unknown> | undefined),
  }
}

export function auth(partial: Record<string, unknown> = {}) {
  return {
    generation: 1,
    ply: 0,
    whiteMs: 300_000,
    blackMs: 300_000,
    whiteIncrementMs: 0,
    blackIncrementMs: 0,
    sideToMove: "white" as const,
    status: "started",
    winner: null,
    kind: "realtime" as const,
    speed: "blitz" as const,
    daysPerTurn: null,
    expiration: null,
    ...partial,
  }
}
