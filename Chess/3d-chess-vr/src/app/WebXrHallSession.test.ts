import { describe, expect, it, vi } from 'vitest'

const session = { end: vi.fn(async () => undefined) }
const store = {
  enterVR: vi.fn(async (): Promise<typeof session | null> => session),
  enterAR: vi.fn(async (): Promise<typeof session | null> => session),
  getState: () => ({ session }),
  onSessionEnd: (listener: () => void) => listener,
}

const created: Array<Record<string, unknown>> = []

vi.mock('@react-three/xr', () => ({
  createXRStore: (options: Record<string, unknown>) => {
    created.push(options)
    return store
  },
}))

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { WebXrHallSession, xrProfilesBase, XR_PROFILES_PATH } from './WebXrHallSession'

const publicDir = join(__dirname, '..', '..', 'public')

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

  it('loads controller layouts and hand models from this origin, not the blocked CDN', () => {
    created.length = 0
    void new WebXrHallSession(() => '').store
    const base = created[0]?.baseAssetPath
    expect(typeof base).toBe('string')
    expect(new URL(String(base)).origin).toBe(new URL(xrProfilesBase()).origin)
    expect(String(base).endsWith(XR_PROFILES_PATH)).toBe(true)
    expect(xrProfilesBase('https://vr-chess-hall.netlify.app')).toBe('https://vr-chess-hall.netlify.app/xr-input-profiles/')
  })

  it('ships every profile and model the Quest controllers and hands ask for', () => {
    const root = join(publicDir, 'xr-input-profiles')
    const list = JSON.parse(readFileSync(join(root, 'profilesList.json'), 'utf8')) as Record<string, { path: string }>
    for (const id of ['meta-quest-touch-pro', 'meta-quest-touch-plus', 'oculus-touch-v3', 'oculus-touch-v2', 'generic-trigger', 'generic-hand']) {
      expect(list[id], id).toBeDefined()
    }
    for (const entry of Object.values(list)) {
      const profilePath = join(root, entry.path)
      expect(existsSync(profilePath), profilePath).toBe(true)
      const profile = JSON.parse(readFileSync(profilePath, 'utf8')) as { layouts: Record<string, { assetPath?: string }> }
      for (const layout of Object.values(profile.layouts)) {
        if (layout.assetPath) expect(existsSync(join(profilePath, '..', layout.assetPath)), layout.assetPath).toBe(true)
      }
    }
    expect(existsSync(join(root, 'generic-hand', 'left.glb'))).toBe(true)
    expect(existsSync(join(root, 'generic-hand', 'right.glb'))).toBe(true)
  })
})
