# VR Chess — Ultron shared contracts draft (Nov 5, 2026 ~3:35 PM ET)
**Status:** working draft for peer alignment before foundation PR lands.  
**Source of truth after merge:** Ultron lane / foundation exports in-repo.  
**Typed source of truth in this branch:** `src/ultron` exports (`IInputController`, `IGameSession`, and the auth/lobby ports in this draft for Vision stubs). Import them from `Chess/3d-chess-vr/src/ultron/index.ts`. This document is the alignment draft; the TypeScript exports are the types peers should compile against.  
**Adopted from:** Mad Scientist PR #2 local stubs (compatible shapes).

## IInputController
```ts
interface IInputController {
  readonly kind: MoveSource
  attach(): void
  detach(): void
  isGrabbing(): boolean
  cancel(reason: CancelReason): void
}
```
Implementations: PointerDragInput, XRControllerInput, HandTrackingInput (Mad Scientist); VoiceCommandInput (Sundae).

## IGameSession (rules boundary — Ultron owns)
```ts
interface IGameSession {
  getLegalDestinations(pieceId: string): readonly Square[]
  submitMoveIntent(intent: MoveIntent): boolean
  cancelPendingMove(reason: CancelReason): void
  getPieces(): readonly PieceSnapshot[]
}
```
Ultron will also expose a **read-only view port** for Vision (id + turn + terminal + legal candidates) that cannot mutate.

## MoveIntent / types
```ts
type MoveSource = 'pointer' | 'xr-controller' | 'hand' | 'voice' // voice added for Sundae
type CancelReason = 'pointer-cancel' | 'tracking-loss' | 'released-origin' | 'detached' | 'rejected'
type PromotionPiece = 'queen' | 'rook' | 'bishop' | 'knight'

interface Square { readonly file: number; readonly rank: number } // file 0=a, rank 0=far
interface MoveIntent {
  readonly intentId: string
  readonly pieceId: string
  readonly from: Square
  readonly to: Square
  readonly source: MoveSource
  readonly promotion?: PromotionPiece
}
```

## Rules
1. One submit per gesture; cancel must not submit.
2. Online: Lichess is authoritative; provisional clock zero ≠ confirmed flag.
3. No engine assist (Lichess ToS).
4. Human promotion only — never auto-queen.
5. Shared grab across devices (HallRuntime pattern) to prevent double-submit.

## Peer actions
- Mad Scientist: keep local stubs until Ultron/foundation export; then delete `src/mad-scientist/contracts` + stub session.
- Vision: keep `IGameSessionViewPort` read-only; expand when Ultron publishes richer port.
- Sundae: use MoveSource `'voice'`; resolve against `getLegalDestinations`; ambiguous → ask origin.
- Fridae: clock logic only; Vision mirrors; provisional vs confirmed.

## Auth / lobby surfaces (Vision screens — Nov 5 ~3:41 PM ET)
Ultron owns implementations; Vision builds screens against these ports (stubs OK until core PR):

```ts
/** PKCE OAuth against Lichess. No secrets in client beyond clientId + redirect. */
interface ILichessAuth {
  beginLogin(): Promise<{ authorizationUrl: string; state: string }>
  completeLogin(callbackUrl: string): Promise<{ accessToken: string; username: string }>
  logout(): Promise<void>
  getSession(): AuthSession | null
}
interface AuthSession { readonly username: string; readonly expiresAt: number | null }

/** Lobby actions — all human play; no engine. */
interface ILichessLobby {
  seek(params: SeekParams): Promise<GameHandle>
  challenge(user: string, params: ChallengeParams): Promise<GameHandle>
  acceptChallenge(challengeId: string): Promise<GameHandle>
  cancelSeek(seekId: string): Promise<void>
}
type SeekParams = { rated: boolean; timeControl: string; color?: 'white' | 'black' | 'random' }
type ChallengeParams = SeekParams
interface GameHandle { readonly gameId: string; readonly color: 'white' | 'black' }

/** Connection / error surface for Vision reconnect + error screens. */
type ConnectionState = 'idle' | 'connecting' | 'online' | 'reconnecting' | 'offline' | 'error'
interface IConnectionPort {
  getState(): ConnectionState
  getLastError(): { code: string; message: string } | null
  retry(): Promise<void>
}
```

Smoke E2E: mock `ILichessAuth` + `ILichessLobby` + Board stream fixtures (Fridae pack); never hit live Lichess in CI.
