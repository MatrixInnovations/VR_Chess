import { Observable } from './Observable'
import type { KeyValueStore } from '../platform/KeyValueStore'

export class GuideStep {
  title: string
  body: string

  constructor(title: string, body: string) {
    this.title = title
    this.body = body
  }
}

export class FirstRunGuide extends Observable {
  readonly steps: GuideStep[]
  index = 0
  open = false
  private readonly storageKey = 'chess-hall.guide'

  constructor(private readonly store: KeyValueStore) {
    super()
    this.steps = [
      new GuideStep(
        'You are seated',
        'This is your side of the board. Your pieces are nearest. Drag is off until you ask to look around.',
      ),
      new GuideStep(
        'Lift a piece',
        'Click a piece, or in a headset pinch your thumb and index finger around it. Gold marks are the legal squares. Release the piece there.',
      ),
      new GuideStep(
        'The clock',
        'The clock on the table shows both times and switches when a move is made. In a headset, pinch a clock button to tap it.',
      ),
      new GuideStep(
        'Look around, or step inside',
        'Press F for free look, then F again to sit back down. The switch at the top right enters a full WebXR session. Hands work, and Touch controllers are the fallback. The game and the clock stay as they are.',
      ),
      new GuideStep(
        'A person, not an engine',
        'Pass and play is two people at this board. Lichess uses your own login and the official Board API. Legal squares are shown. Nothing suggests a move.',
      ),
    ]
  }

  get current(): GuideStep {
    return this.steps[this.index]
  }

  presentIfNew(): void {
    if (this.store.get(this.storageKey) === 'done') return
    this.open = true
    this.index = 0
    this.notify()
  }

  next(): void {
    if (this.index < this.steps.length - 1) {
      this.index += 1
    } else {
      this.dismiss()
      return
    }
    this.notify()
  }

  back(): void {
    this.index = Math.max(0, this.index - 1)
    this.notify()
  }

  dismiss(): void {
    this.open = false
    this.store.set(this.storageKey, 'done')
    this.notify()
  }

  reopen(): void {
    this.open = true
    this.index = 0
    this.notify()
  }
}
