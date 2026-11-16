# Chess Hall

A seated 3D chess hall. You play a person across the table, or a person on Lichess. The same game and the same clock stay put when you switch between the desktop view and immersive WebXR.

## What you can do

- Sit at a wooden board. The camera is at seated eye height.
- Pass and play, with legal-move highlights, a selected-piece highlight, and move slides.
- Sign in to Lichess with OAuth PKCE and seek or challenge a human. The Board API streams the game. Resign, offer or decline a draw, and decline a takeback. No token is stored in the repo.
- Watch the table clock. Offline, a move switches the running side and adds the increment once. Online, Lichess times replace that estimate and do not add the increment again. A stream event that is still behind your move does not rewind the clock.
- Drag a piece with the mouse. In a headset, use Quest Touch controllers or a hand pinch.
- On desktop Chrome or Edge, say “move pawn to e4”. If two pieces can move there, the hall asks which square. Quest Browser does not provide speech recognition, so voice is not part of the headset game.
- Follow the first-run tour. It explains the board, the clock, the menu, voice, and the view switch. It does not block a legal move.
- Press **3D / Immersive** to enter WebXR, or **Table** for passthrough. The session object and the clock object stay the same.

## Lanes this build keeps

| Source | What we kept |
| --- | --- |
| PR #5 Ultron | `GameSession`, chess.js rules, PKCE, Board API client, shared move contracts |
| PR #3 Fridae | Clock domain in `fridae-clock`, adapted through `ChessClockPort` |
| PR #8 (includes PR #2) Mad Scientist | Seated hall, piece meshes, pointer, Touch controllers, hand pinch, clock tap policy |
| PR #1 Vision | View mode, HUD, tour, menu, clock display |
| PR #7 Vision screens | Sign-in, lobby, waiting, game over, reconnect |
| PR #6 Sundae | Spoken move parser and Web Speech adapter |
| PR #4 | Tooling scaffold (lint, coverage, CI). The earlier prototype hall was not copied back; the lanes own those pieces |

## Commands

From `Chess/3d-chess-vr`:

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run test:clock
npm run build
npm run test:e2e
```

`npm test` is `vitest run --coverage`. Changed source stays at or above 80% lines and 75% branches. `GameSession`, `LichessClient`, `ChessPhraseParser`, and `ViewModeManager` stay at or above 90% lines. The Fridae clock package reports its own 90% line gate with `npm run test:clock`.

Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_LICHESS_CLIENT_ID`. The redirect URI is the site origin with a trailing slash. The access token stays in `sessionStorage`.

Quest Browser will not start WebXR on a self-signed certificate. Serve the app over HTTPS you trust, sign in before entering VR, and open `?xr=emulate` only when you want the in-repo Quest Pro emulator.

## Still needs Andrew

- A physical Quest Pro pass: Touch controllers, hand pinch, foveation, and the 72 fps floor.
- A real Lichess account and OAuth app for a live seek. CI never calls lichess.org.
