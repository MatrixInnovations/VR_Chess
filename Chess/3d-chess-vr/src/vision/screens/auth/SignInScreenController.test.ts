import { describe, expect, it } from 'vitest'
import { ScreenNavigator } from '../ScreenNavigator'
import { MockLichessAuth } from '../testing/MockLichessAuth'
import { LichessAuthPresenter } from './LichessAuthPresenter'
import { SignInScreenController } from './SignInScreenController'

function harness(): {
  auth: MockLichessAuth
  presenter: LichessAuthPresenter
  navigator: ScreenNavigator
  controller: SignInScreenController
} {
  const auth = new MockLichessAuth()
  const presenter = new LichessAuthPresenter()
  const navigator = new ScreenNavigator()
  return { auth, presenter, navigator, controller: new SignInScreenController(auth, presenter, navigator) }
}

describe('SignInScreenController', () => {
  it('shows the authorize URL and turns a failed start into a denial', async () => {
    const { controller, presenter, auth } = harness()
    await controller.begin()
    expect(presenter.snapshot().phase).toBe('redirecting')
    expect(presenter.snapshot().authorizationUrl).toContain('lichess.org')
    auth.failBegin = true
    await controller.begin()
    expect(presenter.snapshot().phase).toBe('denied')
  })

  it('opens the lobby after a completed redirect and stays put when sign-in is denied', async () => {
    const { controller, presenter, navigator, auth } = harness()
    await controller.complete('https://example.test/?code=abc&state=mock-state')
    expect(presenter.snapshot().username).toBe('vision-tester')
    expect(navigator.screen.name).toBe('lobby')
    auth.failComplete = 'denied'
    await controller.complete('https://example.test/?error=access_denied')
    expect(presenter.snapshot().phase).toBe('denied')
    expect(navigator.screen.name).toBe('sign-in')
  })

  it('denies a completion that returns no session and a continue while signed out', async () => {
    const { controller, presenter, auth } = harness()
    auth.dropSession = true
    await controller.complete('https://example.test/?code=abc&state=mock-state')
    expect(presenter.snapshot().message).toBe('Sign-in finished without a session')
    controller.continueWithSession()
    expect(presenter.snapshot().message).toBe('Not signed in')
  })

  it('signs out, and keeps the session message when logout fails', async () => {
    const { controller, presenter, navigator, auth } = harness()
    auth.seedSession({ username: 'vision-tester', expiresAt: null })
    controller.continueWithSession()
    expect(navigator.screen.name).toBe('lobby')
    await controller.signOut()
    expect(presenter.snapshot().phase).toBe('signed-out')
    auth.seedSession({ username: 'vision-tester', expiresAt: null })
    auth.failLogout = true
    await controller.signOut()
    expect(presenter.snapshot().message).toBe('Sign-out could not be completed')
  })

  it('clears a vanished session on sync', async () => {
    const { controller, presenter, auth } = harness()
    auth.seedSession({ username: 'vision-tester', expiresAt: null })
    controller.sync()
    expect(presenter.snapshot().phase).toBe('signed-in')
    await auth.logout()
    controller.sync()
    expect(presenter.snapshot().phase).toBe('signed-out')
  })
})
