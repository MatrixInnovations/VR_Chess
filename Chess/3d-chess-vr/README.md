# Chess Hall foundation

This branch is the scaffold other lanes merge onto. It does not contain the hall, the clock, Lichess play, XR input, or the HUD. Those belong to the lane pull requests.

## Lanes

| PR | Lane | Folder | Owns |
| --- | --- | --- | --- |
| #1 | Vision UI | `Chess/3d-chess-vr/src/vision` | View mode, HUD, tour, clock display |
| #2 | Mad Scientist | `Chess/3d-chess-vr/src/mad-scientist` | Seated hall and human input |
| #3 | Fridae | `fridae-clock` | Chess clock domain |
| #5 | Ultron | `Chess/3d-chess-vr/src/ultron` | Lichess session, PKCE, move rules |

Each folder has a README that only points at the owner. Do not implement a lane on this branch.

`GameSession`, `ChessClock`, `LichessClient`, `ChessPhraseParser`, and `ViewModeManager` are lane classes. When one of those files is part of the coverage report, CI requires at least 90% line coverage. This branch does not add them. `ChessPhraseParser` is not in any open lane yet.

## Commands

From `Chess/3d-chess-vr`:

```bash
npm ci
npx tsc --noEmit
npm run lint
npm test
```

`npm test` is `vitest run --coverage`. Scaffold source must stay at or above 80% lines and 75% branches. `npm run lint` uses the flat config and does not prompt.

`react-360` and `react-360-web` are not dependencies. They peer-depend on React 16 and block `npm ci` on this React 18 app. `@react-three/postprocessing` and `framer-motion-3d` are also omitted: their peer ranges do not install next to the three.js and React versions this repo resolves. Details that were removed with the earlier hall prototype are in `FOUNDATION-SALVAGE.md`.

## CI

`.github/workflows/ci.yml` runs on pull requests and pushes: `npm ci`, `tsc --noEmit`, `npm run lint`, `vitest run --coverage`, in `Chess/3d-chess-vr`.
