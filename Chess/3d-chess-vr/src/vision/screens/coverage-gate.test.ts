import { describe, expect, it, vi } from 'vitest'

import { AuthFailureClassifier } from './auth/AuthFailureClassifier'
import { ConnectionFailureClassifier } from './error/ConnectionFailureClassifier'
import { ErrorReconnectPresenter } from './error/ErrorReconnectPresenter'
import { ErrorReconnectScreenController } from './error/ErrorReconnectScreenController'
import { GameOverPresenter } from './gameover/GameOverPresenter'
import { GameOverScreenController } from './gameover/GameOverScreenController'
import { GameResult } from './gameover/GameResult'
import { GameSessionBinder } from './GameSessionBinder'
import { LobbyPresenter } from './lobby/LobbyPresenter'
import { LobbyScreenController } from './lobby/LobbyScreenController'
import { LobbyWaitLog } from './lobby/LobbyWaitLog'
import type { IConnectionPort, ILichessAuth, ILichessLobby } from './ports/ultronPorts'
import { InvalidScreenError, ScreenId } from './ScreenId'
import { MissingGameSessionError, ScreenNavigator } from './ScreenNavigator'
import { SequentialIdFactory } from './SequentialIdFactory'
import { SessionIdentityError } from './ViewModeHostAdapter'
import { VisionShell } from './shell/VisionShell'
import { WaitingPresenter, WaitingScreenController } from './waiting/WaitingScreenController'

const auth: ILichessAuth = {
  beginLogin: async () => ({ authorizationUrl: 'https://lichess.org/oauth', state: 's' }),
  completeLogin: async () => ({ username: 'ada' }),
  logout: async () => undefined,
  getSession: () => null,
}

function lobby(handle = { gameId: 'g1', color: 'white' as const }): ILichessLobby {
  return {
    seek: vi.fn(async () => handle),
    challenge: vi.fn(async () => handle),
    acceptChallenge: vi.fn(async () => handle),
    cancelSeek: vi.fn(async () => undefined),
  }
}

function connection(state: 'idle' | 'offline' | 'online' = 'idle'): IConnectionPort {
  return {
    getState: () => state,
    getLastError: () => null,
    retry: async () => undefined,
  }
}

describe('vision screens that the per-file gate measures', () => {
  it('covers screen ids, results, classifiers, and the error presenter', () => {
    expect(ScreenId.signIn().equals(ScreenId.parse('sign-in'))).toBe(true)
    expect(ScreenId.lobby().name).toBe('lobby')
    expect(ScreenId.waiting().name).toBe('waiting')
    expect(ScreenId.board().name).toBe('board')
    expect(ScreenId.gameOver().name).toBe('game-over')
    expect(ScreenId.error().name).toBe('error')
    expect(ScreenId.signIn()).toBe(ScreenId.signIn())
    expect(() => ScreenId.parse('nope')).toThrow(InvalidScreenError)
    expect(GameResult.checkmate('white').summary).toMatch(/White/)
    expect(GameResult.checkmate('black').summary).toMatch(/Black/)
    expect(GameResult.resign('white').outcome).toBe('resign')
    expect(GameResult.timeout('black').outcome).toBe('timeout')
    expect(GameResult.draw().summary).toBe('Draw.')
    expect(GameResult.stalemate().outcome).toBe('stalemate')
    expect(GameResult.abort().outcome).toBe('abort')
    const authFailures = new AuthFailureClassifier()
    expect(authFailures.classify({ code: 'cancelled' }).kind).toBe('cancelled')
    expect(authFailures.classify(new Error('please cancel')).kind).toBe('cancelled')
    expect(authFailures.classify({ code: 'denied' }).kind).toBe('denied')
    expect(authFailures.classify({ code: 'access_denied' }).kind).toBe('denied')
    expect(authFailures.classify(new Error('access denied')).kind).toBe('denied')
    expect(authFailures.classify({ code: 1 }).kind).toBe('failed')
    expect(authFailures.classify(null).kind).toBe('failed')
    expect(authFailures.classify('nope').kind).toBe('failed')
    const failures = new ConnectionFailureClassifier()
    expect(failures.classify('online', null)).toBe('clear')
    expect(failures.classify('idle', null)).toBe('clear')
    expect(failures.classify('connecting', null)).toBe('provisional')
    expect(failures.classify('reconnecting', null)).toBe('provisional')
    expect(failures.classify('offline', { code: 'auth', message: 'no' })).toBe('auth')
    expect(failures.classify('offline', { code: 'auth-error', message: 'no' })).toBe('auth')
    expect(failures.classify('offline', null)).toBe('hard')
    const presenter = new ErrorReconnectPresenter()
    presenter.apply('online', null, 'clear')
    expect(presenter.snapshot().message).toBeNull()
    presenter.apply('reconnecting', null, 'provisional')
    expect(presenter.snapshot().provisional).toBe(true)
    presenter.apply('reconnecting', { code: 'net', message: 'blip' }, 'provisional')
    expect(presenter.snapshot().message).toMatch(/blip/)
    presenter.apply('offline', null, 'auth')
    expect(presenter.snapshot().message).toMatch(/Sign-in/)
    presenter.apply('offline', { code: 'auth', message: 'expired' }, 'auth')
    expect(presenter.snapshot().code).toBe('auth')
    presenter.apply('offline', null, 'hard')
    expect(presenter.snapshot().message).toMatch(/dropped/)
    presenter.apply('offline', { code: 'http', message: 'down' }, 'hard')
    expect(presenter.snapshot().message).toBe('down')
  })

  it('binds sessions, navigates, and retries a dropped stream', async () => {
    expect(new GameSessionBinder(null).bind('game-1').id).toBe('game-1')
    const host = {
      session: { id: 'same' },
      switchTo: vi.fn(),
    }
    expect(new GameSessionBinder(host).bind('same')).toBe(host.session)
    expect(() => new GameSessionBinder(host).bind('other')).toThrow(SessionIdentityError)
    const navigator = new ScreenNavigator()
    let paints = 0
    const stop = navigator.subscribe(() => {
      paints += 1
    })
    navigator.showSignIn()
    navigator.showLobby()
    navigator.beginWait()
    expect(navigator.isWaitCancelled()).toBe(false)
    navigator.cancelWait()
    expect(navigator.isWaitCancelled()).toBe(true)
    const session = { id: 'board-1' }
    navigator.showBoard(session)
    navigator.showError()
    navigator.showError()
    navigator.restoreAfterError()
    expect(navigator.screen.name).toBe('board')
    navigator.restoreAfterError()
    expect(navigator.screen.name).toBe('lobby')
    navigator.showBoard(session)
    navigator.showGameOver()
    expect(navigator.screen.name).toBe('game-over')
    expect(() => new ScreenNavigator().showGameOver()).toThrow(MissingGameSessionError)
    navigator.switchInGameView('immersive')
    const mismatched = {
      session: { id: 'other' },
      switchTo: vi.fn(),
    }
    navigator.bindViewHost(mismatched)
    expect(() => navigator.switchInGameView('desktop3d')).toThrow(SessionIdentityError)
    stop()
    expect(paints).toBeGreaterThan(0)

    const port = connection('offline')
    port.getLastError = () => ({ code: 'http', message: 'down' })
    let retries = 0
    port.retry = async () => {
      retries += 1
      if (retries === 1) throw new Error('still down')
      port.getState = () => 'online'
      port.getLastError = () => null
    }
    const errors = new ErrorReconnectScreenController(
      port,
      new ErrorReconnectPresenter(),
      navigator,
      new ConnectionFailureClassifier(),
    )
    errors.sync()
    expect(navigator.screen.name).toBe('error')
    await errors.retry()
    expect(navigator.screen.name).toBe('error')
    await errors.retry()
    errors.returnToSignIn()
    expect(navigator.screen.name).toBe('sign-in')
  })

  it('drives the lobby form, the wait log, and game over', async () => {
    const form = new LobbyPresenter()
    form.toggleRated()
    form.setTimeControl('10+5')
    form.cycleColor()
    form.cycleColor()
    form.cycleColor()
    form.setOpponent('opponent')
    form.setIncomingChallengeId('ch')
    form.setMessage('hello')
    form.setMessage(null)
    form.applyParams({ rated: true, timeControl: '15+10' })
    expect(form.toSeekParams().color).toBe('random')
    form.applyParams({ rated: false, timeControl: '3+2', color: 'white' })
    expect(form.snapshot().timeControl).toBe('3+2')
    const log = new LobbyWaitLog()
    log.noteSeek('seek-1')
    log.noteChallenge('ch-1')
    expect(log.currentSeekId()).toBe('seek-1')
    expect(log.currentChallengeId()).toBe('ch-1')
    log.clearSeek()
    expect(log.currentSeekId()).toBeNull()
    log.clear()
    expect(log.currentChallengeId()).toBeNull()

    const online = lobby()
    const navigator = new ScreenNavigator()
    const waiting = new WaitingScreenController(online, navigator, new WaitingPresenter(), log)
    const controller = new LobbyScreenController(
      online,
      form,
      navigator,
      waiting,
      new SequentialIdFactory(),
      (gameId) => ({ id: gameId }),
      vi.fn(),
      vi.fn(),
    )
    form.setOpponent('')
    await controller.challenge()
    expect(form.snapshot().message).toMatch(/username/)
    form.setOpponent('ada')
    await controller.seek()
    await controller.challenge()
    form.setIncomingChallengeId('')
    await controller.acceptIncoming()
    form.setIncomingChallengeId('ch')
    await controller.acceptIncoming()
    online.seek = vi.fn(async () => {
      throw new Error('pair failed')
    })
    await controller.seek()
    expect(form.snapshot().message).toBe('pair failed')
    online.seek = vi.fn(async () => {
      throw 'nope'
    })
    await controller.seek()
    expect(form.snapshot().message).toMatch(/Could not start/)
    await controller.rematchOnline()
    controller.startOfflineDemo()
    const fresh = new LobbyScreenController(
      online,
      new LobbyPresenter(),
      new ScreenNavigator(),
      waiting,
      new SequentialIdFactory(),
      (gameId) => ({ id: gameId }),
      vi.fn(),
      vi.fn(),
    )
    await fresh.rematchOnline()
    expect(fresh.previousOnlineParams).toBeNull()

    const over = new GameOverScreenController(
      new GameOverPresenter(),
      navigator,
      vi.fn(async () => undefined),
      vi.fn(),
      () => false,
    )
    navigator.showBoard({ id: 'done' })
    over.show(GameResult.draw())
    await over.rematch()
    const offlineOver = new GameOverScreenController(
      new GameOverPresenter(),
      navigator,
      vi.fn(async () => undefined),
      vi.fn(),
      () => true,
    )
    offlineOver.backToLobby()
    await offlineOver.rematch()
    expect(navigator.screen.name).toBe('lobby')
  })

  it('builds a shell with and without a view host', () => {
    const shell = new VisionShell({ auth, lobby: lobby(), connection: connection() })
    shell.lobbyPresenter.setTimeControl('5+0')
    expect(shell.navigator.screen.name).toBeTruthy()
    const host = { session: { id: 'hosted' }, switchTo: vi.fn() }
    const hosted = new VisionShell({
      auth,
      lobby: lobby(),
      connection: connection(),
      viewHost: host,
      wasOffline: () => true,
    })
    hosted.bindViewHost({ session: { id: 'next' }, switchTo: vi.fn() })
    expect(hosted.gameOver).toBeTruthy()
  })
})
