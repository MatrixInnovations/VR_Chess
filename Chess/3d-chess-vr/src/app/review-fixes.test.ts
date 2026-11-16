import { Object3D } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { MemoryKeyValueStore } from '../ultron/auth/MemoryKeyValueStore'
import type { IHttpTransport } from '../ultron/contracts/http'
import { LichessTable } from './LichessTable'
import { poseFromObject, readXrPoses } from './XrInputPump'

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

describe('XR poses', () => {
  it('aims a real object along local negative Z', () => {
    const object = new Object3D()
    const pose = poseFromObject(object)
    expect(pose.direction.z).toBeLessThan(0)
    const sources = readXrPoses([
      { id: 'right', type: 'controller', handedness: 'right', object, gamepad: { buttons: [{ pressed: true }] } },
      {
        id: 'left',
        type: 'hand',
        handedness: 'left',
        inputSource: {
          handedness: 'left',
          hand: { get: () => ({}) },
        },
      },
    ], {
      getJointPose: () => ({ transform: { position: { x: 1, y: 2, z: 3 }, orientation: { x: 0, y: 0, z: 0, w: 1 } } }),
    }, {})
    expect(sources[0]?.tracked).toBe(true)
    expect(sources[0]?.selecting).toBe(true)
    expect(sources[1]?.hand).toBe('left')
    expect(sources[1]?.thumbTip).toEqual({ x: 1, y: 2, z: 3 })
  })
})
