# Foundation salvage

PR #4 briefly contained a full hall prototype (seated room, Lichess client, XR input, clock, HUD). That code was removed so the lane PRs stay the owners. This note is what that prototype had that the open lanes do not already cover. Nothing here should be copied back onto the foundation branch.

## Already owned elsewhere

Do not rebuild these on the foundation branch:

- View mode, HUD, tour, and a clock readout: Vision, PR #1 (`src/vision`).
- Seated hall in meters, pinch-to-move, controller ray, Quest frame budget (72 floor, 90 target): Mad Scientist, PR #2 (`src/mad-scientist`). Their square is 0.05 m, table top 0.74 m, seated eye at y 1.18 and z 0.62.
- Clock domain and Lichess time-control sync: Fridae, PR #3 (`fridae-clock`).
- PKCE, Board API seek/challenge, game stream, resign, abort, and `GameSession`: Ultron, PR #5 (`src/ultron`). Seek `time` is minutes. Challenge `clock.limit` is seconds. Tokens stay in web storage and are not logged.

## Not in any lane

### Draw offers and takebacks

Ultron's `LichessClient` posts seek, move, resign, and abort. It does not post draw or takeback. The removed client did:

- `POST /api/board/game/{gameId}/draw/yes` to offer or accept.
- `POST /api/board/game/{gameId}/draw/no` to decline.
- `POST /api/board/game/{gameId}/takeback/no` once, when `gameState` has the opponent's takeback flag (`wtakeback` / `btakeback`). The board did not rewind.
- `wdraw` / `bdraw` on `gameState` are the incoming draw flags.

### Optimistic clock versus a late stream event

If the local move list is already ahead of a `gameState` whose `moves` string is a prefix of that list, ignore that event's `wtime` / `btime`. Applying them puts the clock back on the side that just moved. The next event that includes the move is the one to trust. Times are milliseconds.

### Stock piece files

`Chess/3d-chess-vr/public/*.gltf` is still the original set. Mad Scientist does not load it. The meshes are too heavy to draw on a Quest as shipped (index counts roughly: pawn 168k, rook 54k, knight 136k, bishop 213k, queen 197k, king 273k). Each node is scaled by about 0.0254. A loader has to fit the piece to a few centimetres and decimate before instancing, or the frame budget in PR #2 will not hold.

### WebXR session knobs

Vision models desktop versus immersive. It does not open the session. The removed adapter used `@react-three/xr` `createXRStore` with:

- `offerSession: false` so the browser does not prompt on load.
- Hand tracking requested but not required, so Touch controllers still start a session.
- `foveation: 0.4`, `frameBufferScaling: 1`.
- `frameRate` picks 90 if the device lists it, otherwise 80, otherwise 72.
- `?xr=emulate` turns on the in-repo Quest Pro emulator with `syntheticEnvironment: null`. Without the query, emulation stays off so a normal desktop view is not wrapped in a headset.

Passthrough was a separate `enterAR()` (`immersive-ar`). The virtual room hides and the board is placed once, about 0.58 m in front of the headset, with the surface clamped between 0.70 m and 0.86 m (`headY - 0.39`, then clamped). It was not anchored to a detected real table.

Quest Browser will not start WebXR on a self-signed certificate. Serve the dev app and put a trusted HTTPS name in front of it (`npx localtunnel --port 3000`, or a tunnel onto a local TLS port). Log in to Lichess before entering VR. The system Quest menu, or the same mode switch, exits. The game object must live outside the XR session so the clock survives the transition.

### Voice

`ChessPhraseParser` was never added. There is no phrase grammar to recover.

### Private socket rooms

`main` had a socket.io room (join, chat, shared camera). This branch does not restore it, and none of the lane PRs do either. It is unrelated to Lichess play. Recover it from `main` only if a private room is still a requirement.
