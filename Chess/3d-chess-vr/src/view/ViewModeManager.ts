import { Observable } from '../domain/Observable'
import type { XrPlatform } from '../platform/XrPlatform'

export type ViewMode = 'screen' | 'immersive-vr' | 'immersive-ar'

export class ViewModeManager extends Observable {
  mode: ViewMode = 'screen'
  message = ''

  constructor(private readonly platform: XrPlatform) {
    super()
    platform.onSessionEnd(() => {
      if (this.mode === 'screen') return
      this.mode = 'screen'
      this.message = ''
      this.notify()
    })
  }

  get immersive(): boolean {
    return this.mode !== 'screen'
  }

  async toggle(): Promise<void> {
    if (this.mode === 'screen') await this.enterVr()
    else await this.exit()
  }

  async enterVr(): Promise<void> {
    await this.enter('immersive-vr')
  }

  async enterAr(): Promise<void> {
    await this.enter('immersive-ar')
  }

  async exit(): Promise<void> {
    await this.platform.exit()
    this.mode = 'screen'
    this.message = ''
    this.notify()
  }

  private async enter(mode: 'immersive-vr' | 'immersive-ar'): Promise<void> {
    try {
      if (mode === 'immersive-vr') await this.platform.enterImmersiveVr()
      else await this.platform.enterImmersiveAr()
      this.mode = mode
      this.message = ''
    } catch (error) {
      this.mode = 'screen'
      this.message =
        error instanceof Error
          ? error.message
          : 'Immersive mode needs a WebXR browser such as the Meta Quest Browser.'
    }
    this.notify()
  }
}
