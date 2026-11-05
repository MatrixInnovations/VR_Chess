import type { ChallengeParams, GameHandle, ILichessLobby, SeekParams } from '../ports/ultronPorts'
import { LobbyWaitLog } from '../lobby/LobbyWaitLog'
import { PendingHandle } from './PendingHandle'

/** Lobby method names recorded for assertions. */
export type LobbyCallName = 'seek' | 'challenge' | 'acceptChallenge' | 'cancelSeek'

/** One recorded port call. */
export interface ILobbyCall {
  readonly method: LobbyCallName
  readonly args: readonly unknown[]
}

/**
 * In-memory {@link ILichessLobby}.
 * Seek, challenge, and accept stay pending until the test or `autoPair`
 * resolves them. Nothing in this class opens a socket.
 */
export class MockLichessLobby implements ILichessLobby {
  /** Calls in order. */
  readonly calls: ILobbyCall[] = []
  /** When true, a seek resolves on a microtask with {@link MockLichessLobby.pairedGameId}. */
  autoPair = false
  /** Game id used by auto-pair. */
  pairedGameId = 'game-auto'
  /** Color used by auto-pair. */
  pairedColor: 'white' | 'black' = 'white'
  /** When set, the next matching method rejects once and does not open a wait. */
  failNext: 'none' | 'seek' | 'challenge' | 'accept' = 'none'
  private seekWait: PendingHandle<GameHandle> | null = null
  private challengeWait: PendingHandle<GameHandle> | null = null
  private acceptWait: PendingHandle<GameHandle> | null = null
  private sequence = 0

  /**
   * @param waits - Log that receives the seek id before `seek` resolves.
   */
  constructor(private readonly waits: LobbyWaitLog) {}

  /** @inheritdoc */
  seek(params: SeekParams): Promise<GameHandle> {
    this.calls.push({ method: 'seek', args: [params] })
    if (this.consumeFail('seek')) return Promise.reject(new Error('seek failed'))
    const id = this.mint('seek')
    this.waits.noteSeek(id)
    const pending = new PendingHandle<GameHandle>()
    this.seekWait = pending
    if (this.autoPair) {
      queueMicrotask(() => {
        if (this.seekWait === pending) {
          this.pairSeek({ gameId: this.pairedGameId, color: this.pairedColor })
        }
      })
    }
    return pending.promise
  }

  /** @inheritdoc */
  challenge(user: string, params: ChallengeParams): Promise<GameHandle> {
    this.calls.push({ method: 'challenge', args: [user, params] })
    if (this.consumeFail('challenge')) return Promise.reject(new Error('challenge failed'))
    this.waits.noteChallenge(this.mint('challenge'))
    const pending = new PendingHandle<GameHandle>()
    this.challengeWait = pending
    return pending.promise
  }

  /** @inheritdoc */
  acceptChallenge(challengeId: string): Promise<GameHandle> {
    this.calls.push({ method: 'acceptChallenge', args: [challengeId] })
    if (this.consumeFail('accept')) return Promise.reject(new Error('accept failed'))
    const pending = new PendingHandle<GameHandle>()
    this.acceptWait = pending
    return pending.promise
  }

  /** @inheritdoc */
  async cancelSeek(seekId: string): Promise<void> {
    this.calls.push({ method: 'cancelSeek', args: [seekId] })
    if (this.seekWait && this.waits.currentSeekId() === seekId) {
      const pending = this.seekWait
      this.seekWait = null
      this.waits.clearSeek()
      pending.reject(new Error('seek cancelled'))
    }
  }

  /**
   * Pair the open seek.
   * Does nothing when no seek is waiting, so a late pair after cancel is a no-op.
   * @param handle - Game the screen should mount.
   */
  pairSeek(handle: GameHandle): void {
    this.settle(this.seekWait, handle, () => {
      this.seekWait = null
      this.waits.clearSeek()
    })
  }

  /**
   * Pair the open challenge.
   * @param handle - Game the screen should mount.
   */
  pairChallenge(handle: GameHandle): void {
    this.settle(this.challengeWait, handle, () => {
      this.challengeWait = null
    })
  }

  /**
   * Pair the open accept.
   * @param handle - Game the screen should mount.
   */
  pairAccept(handle: GameHandle): void {
    this.settle(this.acceptWait, handle, () => {
      this.acceptWait = null
    })
  }

  private settle(
    pending: PendingHandle<GameHandle> | null,
    handle: GameHandle,
    clear: () => void,
  ): void {
    if (!pending) return
    clear()
    pending.resolve(handle)
  }

  private consumeFail(kind: 'seek' | 'challenge' | 'accept'): boolean {
    if (this.failNext !== kind) return false
    this.failNext = 'none'
    return true
  }

  private mint(prefix: string): string {
    this.sequence += 1
    return `${prefix}-${this.sequence}`
  }
}
