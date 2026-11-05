import type { Color } from '../domain/Color'
import type { KeyValueStore } from '../platform/KeyValueStore'
import type { LocationPort } from '../platform/LocationPort'
import {
  ClockSnapshot,
  GameFullEvent,
  IncomingChallenge,
  LichessError,
} from './LichessModels'
import { Pkce } from './Pkce'

export type SeekColor = Color | 'random'

/**
 * Official Lichess Board API. Human games only: this client never requests
 * an engine move, evaluation, or opening suggestion.
 */
export class LichessClient {
  username: string | null = null
  private token: string | null = null
  private listener: LichessListener | null = null
  private eventsAbort: AbortController | null = null
  private gameAbort: AbortController | null = null
  private seekAbort: AbortController | null = null
  private readonly tokenKey = 'chess-hall.token'
  private readonly verifierKey = 'chess-hall.pkce.verifier'
  private readonly stateKey = 'chess-hall.pkce.state'
  private readonly scopes = 'board:play challenge:read challenge:write'

  constructor(
    private readonly tokens: KeyValueStore,
    private readonly location: LocationPort,
    private readonly clientId = process.env.NEXT_PUBLIC_LICHESS_CLIENT_ID || 'chess-hall-3d',
  ) {}

  setListener(listener: LichessListener): void {
    this.listener = listener
  }

  get loggedIn(): boolean {
    return !!this.token
  }

  async resume(): Promise<void> {
    const params = new URLSearchParams(this.location.search)
    const code = params.get('code')
    if (params.get('error')) {
      this.listener?.onError(params.get('error_description') || 'Lichess login was cancelled.')
      this.location.stripQuery()
    } else if (code) {
      try {
        await this.exchange(code, params.get('state'))
      } catch (error) {
        this.listener?.onError(error instanceof Error ? error.message : 'Lichess login failed.')
      }
      this.location.stripQuery()
    }
    this.token = this.tokens.get(this.tokenKey)
    if (!this.token) return
    try {
      await this.loadAccount()
      this.openEvents()
    } catch (error) {
      this.tokens.remove(this.tokenKey)
      this.token = null
      this.listener?.onError(error instanceof Error ? error.message : 'Could not reach Lichess.')
    }
  }

  async login(): Promise<void> {
    const pkce = await Pkce.create()
    this.tokens.set(this.verifierKey, pkce.verifier)
    this.tokens.set(this.stateKey, pkce.state)
    const redirect = `${this.location.origin}/`
    const url = new URL('https://lichess.org/oauth')
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', this.clientId)
    url.searchParams.set('redirect_uri', redirect)
    url.searchParams.set('code_challenge_method', 'S256')
    url.searchParams.set('code_challenge', pkce.challenge)
    url.searchParams.set('scope', this.scopes)
    url.searchParams.set('state', pkce.state)
    this.location.assign(url.toString())
  }

  async logout(): Promise<void> {
    const token = this.token
    this.eventsAbort?.abort()
    this.gameAbort?.abort()
    this.seekAbort?.abort()
    this.token = null
    this.username = null
    this.tokens.remove(this.tokenKey)
    this.listener?.onAccount(null)
    if (!token) return
    try {
      await fetch('https://lichess.org/api/token', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch {
      // The local session is already cleared.
    }
  }

  async seek(minutes: number, increment: number, color: SeekColor, rated = false): Promise<void> {
    this.cancelSeek()
    this.seekAbort = new AbortController()
    this.listener?.onSeeking(`Seeking ${minutes}+${increment}…`)
    const body = new URLSearchParams({
      rated: String(rated),
      time: String(minutes),
      increment: String(increment),
      variant: 'standard',
      color,
      ratingRange: '',
    })
    try {
      const response = await this.send('/api/board/seek', { method: 'POST', body, signal: this.seekAbort.signal })
      await this.readNdjson(response, () => undefined, this.seekAbort.signal)
    } catch (error) {
      if (this.seekAbort.signal.aborted) return
      throw error
    } finally {
      this.listener?.onSeeking(null)
    }
  }

  cancelSeek(): void {
    this.seekAbort?.abort()
    this.seekAbort = null
  }

  async challenge(username: string, minutes: number, increment: number, color: SeekColor): Promise<void> {
    const body = new URLSearchParams({
      rated: 'false',
      'clock.limit': String(minutes * 60),
      'clock.increment': String(increment),
      variant: 'standard',
      color,
      keepAliveStream: 'false',
    })
    await this.send(`/api/challenge/${encodeURIComponent(username)}`, { method: 'POST', body })
    this.listener?.onNotice(`Challenge sent to ${username}.`)
  }

  async acceptChallenge(id: string): Promise<void> {
    await this.send(`/api/challenge/${encodeURIComponent(id)}/accept`, { method: 'POST' })
    this.listener?.onIncoming(null)
  }

  async declineChallenge(id: string): Promise<void> {
    await this.send(`/api/challenge/${encodeURIComponent(id)}/decline`, { method: 'POST' })
    this.listener?.onIncoming(null)
  }

  watchGame(gameId: string): void {
    this.gameAbort?.abort()
    this.gameAbort = new AbortController()
    const signal = this.gameAbort.signal
    void this.send(`/api/board/game/stream/${gameId}`, {
      headers: { Accept: 'application/x-ndjson' },
      signal,
    })
      .then((response) => this.readNdjson(response, (value) => this.onGameEvent(value), signal))
      .catch((error) => {
        if (signal.aborted) return
        this.listener?.onError(error instanceof Error ? error.message : 'Game stream stopped.')
      })
  }

  stopGame(): void {
    this.gameAbort?.abort()
    this.gameAbort = null
  }

  async move(gameId: string, uci: string): Promise<void> {
    await this.send(`/api/board/game/${gameId}/move/${uci}`, { method: 'POST' })
  }

  async resign(gameId: string): Promise<void> {
    await this.send(`/api/board/game/${gameId}/resign`, { method: 'POST' })
  }

  async draw(gameId: string, accept: boolean): Promise<void> {
    await this.send(`/api/board/game/${gameId}/draw/${accept ? 'yes' : 'no'}`, { method: 'POST' })
  }

  async declineTakeback(gameId: string): Promise<void> {
    await this.send(`/api/board/game/${gameId}/takeback/no`, { method: 'POST' })
  }

  private async exchange(code: string, state: string | null): Promise<void> {
    const expected = this.tokens.get(this.stateKey)
    const verifier = this.tokens.get(this.verifierKey)
    this.tokens.remove(this.stateKey)
    this.tokens.remove(this.verifierKey)
    if (!verifier || !state || state !== expected) {
      throw new LichessError('Login could not be verified. Start it again from the hall.')
    }
    const redirect = `${this.location.origin}/`
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      redirect_uri: redirect,
      client_id: this.clientId,
    })
    const response = await fetch('https://lichess.org/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!response.ok) {
      throw new LichessError(await this.readError(response))
    }
    const payload = (await response.json()) as { access_token?: string }
    if (!payload.access_token) throw new LichessError('Lichess did not return a token.')
    this.token = payload.access_token
    this.tokens.set(this.tokenKey, payload.access_token)
  }

  private async loadAccount(): Promise<void> {
    const response = await this.send('/api/account')
    const payload = (await response.json()) as { username?: string }
    this.username = payload.username ?? null
    this.listener?.onAccount(this.username)
  }

  private openEvents(): void {
    this.eventsAbort?.abort()
    this.eventsAbort = new AbortController()
    const signal = this.eventsAbort.signal
    void this.send('/api/stream/event', { headers: { Accept: 'application/x-ndjson' }, signal })
      .then((response) => this.readNdjson(response, (value) => this.onEvent(value), signal))
      .catch((error) => {
        if (signal.aborted) return
        this.listener?.onError(error instanceof Error ? error.message : 'Lichess event stream stopped.')
      })
  }

  private onEvent(value: unknown): void {
    const record = asRecord(value)
    if (record.type === 'gameStart') {
      const game = asRecord(record.game)
      const gameId = typeof game.gameId === 'string' ? game.gameId : typeof game.id === 'string' ? game.id : ''
      const color = game.color === 'black' ? 'black' : 'white'
      if (gameId) {
        this.cancelSeek()
        this.listener?.onGameStart(gameId, color)
      }
      return
    }
    if (record.type === 'challenge') {
      this.listener?.onIncoming(IncomingChallenge.fromJson(record))
      return
    }
    if (record.type === 'challengeCanceled' || record.type === 'challengeDeclined') {
      this.listener?.onIncoming(null)
    }
  }

  private onGameEvent(value: unknown): void {
    const record = asRecord(value)
    if (record.type === 'gameFull') {
      this.listener?.onGameFull(GameFullEvent.fromJson(record))
      return
    }
    if (record.type === 'gameState') {
      this.listener?.onGameState(ClockSnapshot.fromJson(record))
      return
    }
    if (record.type === 'opponentGone') {
      const gone = record.gone === true
      this.listener?.onNotice(gone ? 'Your opponent left the board.' : 'Your opponent is back.')
    }
  }

  private async send(path: string, init: RequestInit = {}): Promise<Response> {
    if (!this.token) throw new LichessError('Log in to Lichess first.')
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${this.token}`)
    const response = await fetch(`https://lichess.org${path}`, { ...init, headers })
    if (!response.ok) throw new LichessError(await this.readError(response))
    return response
  }

  private async readNdjson(
    response: Response,
    onValue: (value: unknown) => void,
    signal: AbortSignal,
  ): Promise<void> {
    const reader = response.body?.getReader()
    if (!reader) return
    const decoder = new TextDecoder()
    let buffer = ''
    while (!signal.aborted) {
      const chunk = await reader.read()
      if (chunk.done) break
      buffer += decoder.decode(chunk.value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          onValue(JSON.parse(trimmed))
        } catch {
          // Ignore a partial or non-JSON keepalive line.
        }
      }
    }
  }

  private async readError(response: Response): Promise<string> {
    try {
      const text = await response.text()
      if (!text) return `Lichess returned ${response.status}.`
      try {
        const payload = JSON.parse(text) as { error?: string; global?: string[] }
        if (payload.error) return payload.error
        if (payload.global?.length) return payload.global.join(' ')
      } catch {
        return text.slice(0, 180)
      }
      return text.slice(0, 180)
    } catch {
      return `Lichess returned ${response.status}.`
    }
  }
}

export interface LichessListener {
  onAccount(username: string | null): void
  onSeeking(message: string | null): void
  onGameStart(gameId: string, color: Color): void
  onGameFull(event: GameFullEvent): void
  onGameState(state: ClockSnapshot): void
  onIncoming(challenge: IncomingChallenge | null): void
  onNotice(message: string): void
  onError(message: string): void
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') return value as Record<string, unknown>
  return {}
}
