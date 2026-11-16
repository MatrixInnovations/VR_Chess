import { Object3D } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { MemoryKeyValueStore } from '../ultron/auth/MemoryKeyValueStore'
import type { IHttpTransport } from '../ultron/contracts/http'
import type { GameSession } from '../ultron/session/GameSession'
import { LichessTable } from './LichessTable'
import { XrInputPump, poseFromObject, readXrPoses } from './XrInputPump'

describe('LichessTable sign-out and lobby guards', () => {
  function table(clientId = ''): LichessTable {
    const transport: IHttpTransport = {
      send: vi.fn(async () => ({ status: 500, headers: {}, body: null, text: async () => '' })),
    }
    return new LichessTable(
      {
        openOnline: () => {
          throw new Error('no session')
        },
        cancelSeek: () => undefined,
        retry: async () => undefined,
      },
      transport,
      new MemoryKeyValueStore(),
      clientId,
      'http://localhost/',
    )
  }

  it('refuses login without a client id and drops a missing token on sign-out', async () => {
    const hall = table()
    await expect(hall.beginLogin()).rejects.toThrow(/CLIENT_ID/)
    await hall.logout()
    expect(hall.getSession()).toBeNull()
    expect(hall.tokenSource()).toBeNull()
  })

  it('rejects a blitz seek locally and records stream faults', async () => {
    const hall = table('client')
    await expect(hall.seek({ timeControl: '3+0', rated: false, color: 'random' })).rejects.toThrow()
    await expect(hall.offerOrAcceptDraw('game')).rejects.toThrow(/Not signed in/)
    hall.declineTakeback('game')
    hall.noteFault('unauthorized', 'signed out')
    expect(hall.getState()).toBe('error')
    hall.noteOnline()
    expect(hall.getLastError()).toBeNull()
    await hall.retry()
    expect(hall.getState()).toBe('connecting')
    await hall.cancelSeek('seek')
    expect(hall.waits.currentSeekId()).toBeNull()
  })
})

describe('LichessTable online paths', () => {
  it('restores a stored session and plays seek, challenge, accept, and draw', async () => {
    const store = new MemoryKeyValueStore()
    store.set(
      'ultron.oauth.token',
      JSON.stringify({ accessToken: 'lip_testtokenvalue', expiresAtMs: Date.now() + 60_000 }),
    )
    store.set('ultron.lichess.username', 'Ada')
    const sent: string[] = []
    const transport: IHttpTransport = {
      send: vi.fn(async (request) => {
        sent.push(request.url)
        return { status: 200, headers: {}, body: null, text: async () => '' }
      }),
    }
    const session = {
      snapshot: { gameId: 'game1', ourColor: 'white' as const },
      seek: vi.fn(async () => ({ ok: true })),
      challenge: vi.fn(async () => ({ ok: true })),
      acceptChallenge: vi.fn(async () => ({ ok: true })),
      subscribe: () => () => undefined,
    }
    const hall = new LichessTable(
      {
        openOnline: () => session as unknown as GameSession,
        cancelSeek: () => undefined,
        retry: async () => undefined,
      },
      transport,
      store,
      'client',
      'http://localhost/',
    )
    expect(hall.getSession()?.username).toBe('Ada')
    await expect(hall.seek({ timeControl: '10+0', rated: true, color: 'white' })).resolves.toEqual({
      gameId: 'game1',
      color: 'white',
    })
    await hall.challenge('bob', { timeControl: '3+2', rated: false, color: 'black' })
    await hall.acceptChallenge('chal1')
    await hall.offerOrAcceptDraw('game1')
    await hall.declineDraw('game1')
    hall.declineTakeback('game1')
    hall.noteFault('http', 'dropped')
    expect(hall.getState()).toBe('reconnecting')
    await hall.logout()
    expect(hall.getSession()).toBeNull()
    expect(store.get('ultron.oauth.token')).toBeNull()
    expect(sent.some((url) => url.includes('/draw/yes'))).toBe(true)
    expect(sent.some((url) => url.includes('/takeback/no'))).toBe(true)
  })

  it('surfaces a refused seek, challenge, accept, and draw', async () => {
    const transport: IHttpTransport = {
      send: vi.fn(async () => ({ status: 404, headers: {}, body: null, text: async () => '' })),
    }
    const session = {
      snapshot: { gameId: null, ourColor: null },
      seek: vi.fn(async () => ({ ok: true, kind: 'cancelled' })),
      challenge: vi.fn(async () => ({ ok: false, reason: 'closed' })),
      acceptChallenge: vi.fn(async () => ({ ok: false, reason: 'closed' })),
      subscribe: () => () => undefined,
    }
    const store = new MemoryKeyValueStore()
    store.set(
      'ultron.oauth.token',
      JSON.stringify({ accessToken: 'lip_testtokenvalue', expiresAtMs: Date.now() + 60_000 }),
    )
    const hall = new LichessTable(
      {
        openOnline: () => session as unknown as GameSession,
        cancelSeek: () => undefined,
        retry: async () => undefined,
      },
      transport,
      store,
      'client',
      'http://localhost/',
    )
    await expect(hall.seek({ timeControl: '15+10', rated: false, color: 'random' })).rejects.toThrow()
    await expect(hall.challenge('bob', { timeControl: '5+0', rated: false, color: 'white' })).rejects.toThrow()
    await expect(hall.acceptChallenge('chal')).rejects.toThrow()
    await expect(hall.declineDraw('game1')).rejects.toThrow()
    hall.noteFault('unauthorized', 'token')
    expect(hall.getState()).toBe('error')
  })
})

describe('XR poses', () => {
  it('aims a real object along local negative Z', () => {
    const object = new Object3D()
    const pose = poseFromObject(object)
    expect(pose.direction.z).toBeLessThan(0)
    const gripOnly = readXrPoses([
      { id: 'right', type: 'controller', handedness: 'right', object, gamepad: { buttons: [{ pressed: true }] } },
    ])
    expect(gripOnly[0]?.tracked).toBe(false)
    const sources = readXrPoses(
      [
        {
          id: 'right',
          type: 'controller',
          handedness: 'right',
          object,
          gamepad: { buttons: [{ pressed: true }] },
          inputSource: { targetRaySpace: { id: 'ray' } },
        },
        {
          id: 'left',
          type: 'hand',
          handedness: 'left',
          inputSource: {
            handedness: 'left',
            targetRaySpace: { id: 'hand-ray' },
            hand: { get: () => ({}) },
          },
        },
      ],
      {
        getPose: () => ({
          transform: { position: { x: 0, y: 1, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
        }),
        getJointPose: () => ({
          transform: { position: { x: 1, y: 2, z: 3 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
        }),
      },
      {},
    )
    expect(sources[0]?.tracked).toBe(true)
    expect(sources[0]?.selecting).toBe(true)
    expect(sources[0]?.direction?.z).toBeLessThan(0)
    expect(sources[1]?.hand).toBe('left')
    expect(sources[1]?.thumbTip).toEqual({ x: 1, y: 2, z: 3 })
  })

  it('presses, drags, and releases a controller, and samples a hand', () => {
    const events: string[] = []
    const picker = { pickRay: () => ({ square: { file: 4, rank: 4 }, piece: null, clock: false, world: { x: 0, y: 0, z: 0 } }) }
    const controllers = { handle: (sample: { type: string }) => events.push(sample.type) }
    const hands = { handle: () => events.push('hand') }
    const pump = new XrInputPump(
      picker as never,
      controllers as never,
      hands as never,
    )
    const pose = {
      id: 'right-controller',
      kind: 'controller' as const,
      hand: 'right' as const,
      selecting: true,
      tracked: true,
      origin: { x: 0, y: 1, z: 1 },
      direction: { x: 0, y: 0, z: -1 },
      thumbTip: null,
      indexTip: null,
    }
    pump.push([pose])
    pump.push([pose])
    pump.push([{ ...pose, tracked: false }])
    pump.push([pose])
    pump.push([{ ...pose, selecting: false }])
    pump.push([
      {
        ...pose,
        id: 'left-hand',
        kind: 'hand',
        hand: 'left',
        tracked: true,
        thumbTip: { x: 0, y: 1, z: 0 },
        indexTip: { x: 0, y: 1, z: 0.02 },
      },
    ])
    expect(events).toContain('selectstart')
    expect(events).toContain('selectend')
    expect(events).toContain('hand')
    expect(events).toContain('trackinglost')
  })
})
