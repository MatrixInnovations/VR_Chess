import { render } from '@testing-library/react'
import { Group } from 'three'
import { describe, expect, it, vi } from 'vitest'

const frames: Array<(state: unknown, delta: number, frame?: unknown) => void> = []

vi.mock('@react-three/fiber', () => {
  const React = require('react') as typeof import('react')
  return {
    Canvas: (props: { children?: React.ReactNode; onCreated?: (state: unknown) => void }) => {
      props.onCreated?.({
        gl: {
          domElement: {
            addEventListener() {
              return undefined
            },
            removeEventListener() {
              return undefined
            },
            getBoundingClientRect() {
              return { left: 0, top: 0, width: 800, height: 600 }
            },
          },
          shadowMap: { autoUpdate: true, needsUpdate: false },
          xr: { getReferenceSpace: () => ({ name: 'local-floor' }) },
        },
      })
      return React.createElement('div', null, props.children)
    },
    useFrame: (callback: (state: unknown, delta: number, frame?: unknown) => void) => {
      frames.push(callback)
    },
  }
})

vi.mock('@react-three/xr', () => {
  const React = require('react') as typeof import('react')
  const { Group: OriginGroup } = require('three') as typeof import('three')
  return {
    XR: (props: { children?: React.ReactNode }) => React.createElement('div', null, props.children),
    XROrigin: React.forwardRef(
      (props: { position?: [number, number, number] }, ref: React.Ref<Group>) => {
        const group = new OriginGroup()
        if (props.position) group.position.set(props.position[0], props.position[1], props.position[2])
        group.updateMatrixWorld(true)
        if (typeof ref === 'function') ref(group)
        else if (ref) (ref as { current: Group | null }).current = group
        return null
      },
    ),
    useXR: (selector?: (state: { inputSourceStates: readonly unknown[] }) => unknown) => {
      const inputs = [
        {
          id: 'left-hand',
          type: 'hand',
          handedness: 'left',
          inputSource: {
            handedness: 'left',
            targetRaySpace: { id: 'hand-ray' },
            hand: { get: (name: string) => ({ name }) },
          },
        },
      ]
      return selector ? selector({ inputSourceStates: inputs }) : { inputSourceStates: inputs }
    },
    createXRStore: () => ({
      enterVR: async () => undefined,
      enterAR: async () => undefined,
      getState: () => ({}),
      onSessionEnd: () => () => undefined,
    }),
  }
})

import { ChessApplication } from '../app/ChessApplication'
import type { XrPoseSource } from '../app/XrInputPump'
import { ChessHallPage } from './ChessHallPage'

describe('ChessHallPage XR frame path', () => {
  it('reads hand joints from the frame and shifts them by the seated origin', () => {
    frames.length = 0
    const model = new ChessApplication({
      now: () => 0,
      xr: undefined,
    })
    const pushed: XrPoseSource[][] = []
    vi.spyOn(model, 'pushXr').mockImplementation((sources) => {
      pushed.push(sources.map((source) => ({ ...source, thumbTip: source.thumbTip ? { ...source.thumbTip } : null, indexTip: source.indexTip ? { ...source.indexTip } : null, origin: source.origin ? { ...source.origin } : null, direction: source.direction ? { ...source.direction } : null })))
    })
    render(<ChessHallPage app={model} />)
    const frame = {
      getPose: () => ({
        transform: { position: { x: 0, y: 1.2, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
      }),
      getJointPose: () => ({
        transform: { position: { x: 0.02, y: 1.1, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
      }),
    }
    const state = {
      gl: {
        shadowMap: { needsUpdate: false },
        xr: { getReferenceSpace: () => ({ name: 'local-floor' }) },
      },
    }
    for (const callback of frames) callback(state, 0, frame)
    const hand = pushed.flat().find((source) => source.kind === 'hand')
    expect(hand?.tracked).toBe(true)
    expect(hand?.thumbTip?.z).toBeCloseTo(0.62)
    expect(hand?.origin?.z).toBeCloseTo(0.62)
    expect(hand?.indexTip?.z).toBeCloseTo(0.62)
    if (hand?.thumbTip && hand.indexTip) {
      const gap = Math.hypot(hand.thumbTip.x - hand.indexTip.x, hand.thumbTip.y - hand.indexTip.y, hand.thumbTip.z - hand.indexTip.z)
      expect(gap).toBe(0)
    }
  })

  it('pinches the e2 pawn and completes e2-e4 when the hand opens', () => {
    frames.length = 0
    let time = 0
    const model = new ChessApplication({ now: () => time, xr: undefined })
    const pawn = model.runtime.hall.getPieces().find((piece) => piece.id === 'white-pawn-5')
    expect(pawn?.getSquare()).toEqual({ file: 4, rank: 6 })
    const home = model.runtime.hall.board.worldPosition({ file: 4, rank: 6 })
    const dest = model.runtime.hall.board.worldPosition({ file: 4, rank: 4 })
    render(<ChessHallPage app={model} />)
    const down = { x: -Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 }
    let aim = home
    let spread = 0.01
    const frame = {
      getPose: () => ({
        transform: {
          position: { x: aim.x, y: aim.y + 0.25, z: aim.z - 0.62 },
          orientation: down,
        },
      }),
      getJointPose: (joint: { name?: string }) => {
        const index = joint.name === 'index-finger-tip'
        return {
          transform: {
            position: { x: aim.x + (index ? spread : 0), y: aim.y + 0.04, z: aim.z - 0.62 },
            orientation: { x: 0, y: 0, z: 0, w: 1 },
          },
        }
      },
    }
    const state = {
      gl: {
        shadowMap: { needsUpdate: false, autoUpdate: false },
        xr: { getReferenceSpace: () => ({ name: 'local-floor' }) },
      },
    }
    for (const callback of frames) callback(state, 0, frame)
    expect(model.runtime.grab.isGrabbing()).toBe(true)
    aim = dest
    spread = 0.06
    for (const callback of frames) callback(state, 0, frame)
    expect(model.runtime.grab.isGrabbing()).toBe(false)
    expect(model.game.getPieces().find((piece) => piece.id === 'white-pawn-5')?.square).toEqual({ file: 4, rank: 4 })
    time = 5_000
    model.frame(time)
    expect(pawn?.getSquare()).toEqual({ file: 4, rank: 4 })
  })
})
