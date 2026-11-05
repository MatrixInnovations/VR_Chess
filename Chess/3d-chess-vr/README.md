# Chess Hall

A seated 3D chess hall. Play pass-and-play on one screen, or sit down against a person on Lichess. The same board opens in a WebXR session on a Meta Quest Pro, with hand tracking and Touch controllers.

The app is a web app. A native Horizon Store build can wrap this PWA later; platform calls go through `XrPlatform`, `KeyValueStore`, and `LocationPort`.

## Run it

```bash
cd Chess/3d-chess-vr
yarn
yarn dev
```

Open http://localhost:3000. Choose **Pass and play** to use the hall with no account. Press **F** to look around the room, and **F** again to sit back down.

`yarn check:rules` checks move generation, castling, pins, en passant, and the clock.

## Lichess

Log in with the button in the hall. The browser uses OAuth with PKCE against `https://lichess.org`. No password is stored, and no token is written into the repo. After login the access token lives in `sessionStorage` for that tab.

On localhost the public client id `chess-hall-3d` is enough. The redirect URI is `http://localhost:3000/` (or whatever origin you opened). Scopes are `board:play`, `challenge:read`, and `challenge:write`.

If Lichess rejects a deployed redirect URI, create an app at https://lichess.org/account/oauth/app/create with an empty secret and set `NEXT_PUBLIC_LICHESS_CLIENT_ID`. See `.env.example`.

Then:

- **Seek a game** for a random opponent at the minutes and increment you picked. Seeks are unrated unless you change the call.
- **Challenge a username** and wait for them to accept.
- Moves you play on the board are sent as UCI. The opponent's moves are streamed back and animated.
- Resign, offer a draw, or accept one from the dock. The clock on the table follows the Lichess times.

This is human play only. The hall shows legal squares and does not suggest moves, evaluate a position, or call an engine.

## Quest Pro

WebXR needs HTTPS.

1. On the computer, from `Chess/3d-chess-vr`, run `yarn dev`.
2. Give the page a trusted HTTPS address the headset can open. Two ways:
   - `npx localtunnel --port 3000`, then open the printed `https://` URL, or
   - `yarn dev:https` (https://localhost:3443, self-signed) and tunnel it with cloudflared: `cloudflared tunnel --url https://localhost:3443 --no-tls-verify`.
3. Put on the Quest Pro. Open **Meta Quest Browser** and go to that HTTPS URL. A self-signed certificate is not a secure context, so WebXR will not start until the host name is trusted.
4. Allow the page to use VR and hand tracking if asked. Turn hand tracking on in Quest settings if the controllers are the only input you see.
5. Tap **Pass and play** or log in to Lichess first (login is a normal browser page; do it before you enter VR).
6. Tap the **3D / Immersive** switch. The board, pieces, and clock move with you into the session. They are still the same game when you come back.
7. Pinch your thumb and index finger on a piece to lift it. Move it to a gold square and open your fingers. Pinch a brass clock button to tap the clock. With Touch Pro controllers, point the ray and use the trigger.
8. The same switch, or the in-world **3D / VR** block on the table, ends the session. **Table** asks for passthrough (`immersive-ar`) so the board can sit in your room. Immersive VR is the main mode. If the headset declines AR, stay in VR.
9. Desktop without a headset: open `http://localhost:3000/?xr=emulate` and press Immersive. That uses the built-in Quest Pro emulator. The Immersive Web Emulator extension is the other way to rehearse hands.

The scene is in meters, uses one 1024 shadow map, decimated pieces, and asks the headset for 90, 80, or 72 frames per second.

## Controls

| Action | Screen | Headset |
| --- | --- | --- |
| Select a piece | Click | Pinch, or trigger on the ray |
| Move | Click a gold square, or drag | Release the pinch or trigger on a gold square |
| Clock | Shown on the table and in the status line | Pinch a plunger |
| Free look | F, or Free look | Look around |
| Immersive | 3D / Immersive switch, or V | Same switch, or the block on the table |
| Resign / draw | Dock, or the blocks on the table | The blocks on the table |
