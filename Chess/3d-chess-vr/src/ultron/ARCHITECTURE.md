# Ultron lane

Human Lichess play and same-device local play. `GameSession` is the only object that validates and submits a move. Pointer, controller, hand, and voice all go through it.

## Shared contracts for other lanes

Import from `src/ultron/index.ts`:

| Contract | Path |
| --- | --- |
| `IGameSession` | `src/ultron/contracts/IGameSession.ts` |
| `IInputController` | `src/ultron/contracts/IInputController.ts` |
| `MoveIntent`, `Square`, `MoveSource`, `CancelReason`, `PieceSnapshot` | `src/ultron/contracts/types.ts` |
| `isOnBoard`, `squaresEqual`, `squareKey` | `src/ultron/contracts/squares.ts` |
| `IGameSessionViewPort` | `src/ultron/contracts/IGameSessionViewPort.ts` |

`Square.file` 0 is the a-file. `Square.rank` 0 is the far rank (existing board y = 0), so e2 is `{ file: 4, rank: 6 }`. `MoveSource` is `pointer | xr-controller | hand | voice`. Promotion on `MoveIntent` is `queen | rook | bishop | knight`. The session does not invent a queen.

Piece ids from the standard start: `white-pawn-5` is the e-pawn, `white-king` and `black-queen` are the royal pieces, and doubled pieces use `-1` on the queenside and `-2` on the kingside.

Mad Scientist can delete `src/mad-scientist/contracts` and `src/mad-scientist/session/GameSession.ts` on rebase and point grabs at this `IGameSession`. This branch does not edit that lane.

Vision's read-only port is `IGameSessionViewPort` (`id`, `getSnapshot`, `legalMoveCandidates`, `subscribe`). It has no submit method. The stub `src/vision/ports/IGameSessionViewPort.ts` only has `id`; rebase should re-export this richer port.

## Online authority

`LichessClient` speaks only to the official Board API (`board:play`, challenge read/write). Seeks and moves are posted once. Dropped GET streams may resume. A clock that shows zero stays provisional until Lichess sends a terminal status. `OAuthPkceClient` uses S256 PKCE against `https://lichess.org/oauth` and `POST /api/token`. Tokens and verifiers are not logged.

`LocalPlayer` is the other human on this device. Offline games do not call the network. There is no engine.

## Tests

`yarn test` runs `vitest run src/ultron` and does not add a root `vitest.config.ts`, so it does not replace Vision's include list. When foundation's runner lands, add `src/ultron/**/*.test.ts` to that include. Do not merge this branch to main from here.
