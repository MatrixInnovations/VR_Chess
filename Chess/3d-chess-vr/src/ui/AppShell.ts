import { FirstRunGuide } from '../domain/FirstRunGuide'
import { GameSession } from '../domain/GameSession'
import { Observable } from '../domain/Observable'
import { LichessClient } from '../lichess/LichessClient'
import { BrowserLocation } from '../platform/LocationPort'
import { PwaInstaller } from '../platform/PwaInstaller'
import { WebStorageStore } from '../platform/WebStorageStore'
import { WebXrPlatform } from '../platform/WebXrPlatform'
import { ViewModeManager } from '../view/ViewModeManager'

export class AppShell extends Observable {
  readonly lichess: LichessClient
  readonly session: GameSession
  readonly platform: WebXrPlatform
  readonly viewMode: ViewModeManager
  piecesReady = false
  loadLabel = 'Setting the table…'
  private booted = false

  private constructor() {
    super()
    const sessionStore = new WebStorageStore('session')
    const localStore = new WebStorageStore('local')
    this.lichess = new LichessClient(sessionStore, new BrowserLocation())
    const guide = new FirstRunGuide(localStore)
    this.session = new GameSession(this.lichess, guide)
    this.platform = new WebXrPlatform()
    this.viewMode = new ViewModeManager(this.platform)
  }

  static create(): AppShell {
    if (!singleton) singleton = new AppShell()
    return singleton
  }

  boot(): void {
    if (this.booted) return
    this.booted = true
    new PwaInstaller().register()
    void this.session.boot()
  }

  markReady(): void {
    this.piecesReady = true
    this.loadLabel = ''
    this.notify()
  }

  markLoading(label: string): void {
    this.loadLabel = label
    this.notify()
  }
}

let singleton: AppShell | null = null
