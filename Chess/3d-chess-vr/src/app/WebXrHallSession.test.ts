import { describe, expect, it, vi } from 'vitest'

const session = { end: vi.fn(async () => undefined) }
const store = {
  enterVR: vi.fn(async (): Promise<typeof session | null> => session),
  enterAR: vi.fn(async (): Promise<typeof session | null> => session),
  getState: () => ({ session }),
  onSessionEnd: (listener: () => void) => listener,
}

vi.mock('@react-three/xr', () => ({
  createXRStore: () => store,
}))

import { WebXrHallSession } from './WebXrHallSession'

describe('WebXrHallSession', () => {
  it('enters and leaves VR, and reports a missing session', async () => {
    const xr = new WebXrHallSession(() => '')
    let ended = 0
    xr.onSessionEnd(() => {
      ended += 1
    })
    store.enterVR.mockResolvedValueOnce(session)
    expect(await xr.enterVR()).toBe(true)
    expect(xr.lastError).toBe('')
    store.enterVR.mockResolvedValueOnce(null)
    expect(await xr.enterVR()).toBe(false)
    expect(xr.lastError).toMatch(/Quest/)
    store.enterVR.mockRejectedValueOnce(new Error('no headset'))
    expect(await xr.enterVR()).toBe(false)
    expect(xr.lastError).toBe('no headset')
    store.enterVR.mockRejectedValueOnce('nope')
    expect(await xr.enterVR()).toBe(false)
    store.enterAR.mockResolvedValueOnce(null)
    expect(await xr.enterAR()).toBe(false)
    store.enterAR.mockRejectedValueOnce(new Error('no ar'))
    expect(await xr.enterAR()).toBe(false)
    store.enterAR.mockRejectedValueOnce('nope')
    expect(await xr.enterAR()).toBe(false)
    store.enterAR.mockResolvedValueOnce(session)
    expect(await xr.enterAR()).toBe(true)
    await xr.exit()
    expect(session.end).toHaveBeenCalled()
    expect(ended).toBe(0)
    const emulate = new WebXrHallSession(() => '?xr=1')
    expect(emulate.store).toBeTruthy()
  })
})
