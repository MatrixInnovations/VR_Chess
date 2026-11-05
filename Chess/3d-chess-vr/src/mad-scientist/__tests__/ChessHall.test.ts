import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'

import { ClockTapTarget } from '../hall/ClockTapTarget'
import { ChessHall } from '../hall/ChessHall'
import { HallLighting } from '../hall/HallLighting'
import {
  BOARD_SURFACE_Y,
  SEATED_EYE_HEIGHT_M,
  SEATED_EYE_Z_M,
} from '../hall/metrics'
import { PieceMaterialSet } from '../hall/PieceMaterialSet'
import { whitePawn } from './helpers'

describe('HallLighting', () => {
  it('uses one shadow-casting light sized for a Quest Pro frame budget', () => {
    const lighting = new HallLighting()
    const lights = lighting.lights()
    expect(lights).toHaveLength(3)
    expect(lights.filter((light) => light.castShadow)).toHaveLength(1)
    expect(lighting.key.shadow.mapSize.x).toBe(512)
    expect(lighting.key.shadow.mapSize.y).toBe(512)
    for (const light of lights) {
      expect(Number.isFinite(light.intensity)).toBe(true)
      expect(light.intensity).toBeGreaterThan(0)
    }
    const parent = lighting.object.parent
    expect(parent).toBeNull()
    lighting.dispose()
    expect(lighting.object.parent).toBeNull()
    expect(lighting.object.children).toHaveLength(0)
  })
})

describe('ClockTapTarget', () => {
  it('invokes the latest tap callback and knows its own volume', () => {
    const clock = new ClockTapTarget({ x: 0.4, y: 0.8, z: 0.05 })
    let first = 0
    let second = 0
    clock.setOnTap(() => {
      first += 1
    })
    clock.setOnTap(() => {
      second += 1
    })
    clock.tap()
    expect(first).toBe(0)
    expect(second).toBe(1)
    clock.setOnTap(null)
    clock.tap()
    expect(second).toBe(1)

    const center = clock.object.position
    expect(clock.containsWorldPoint({ x: center.x, y: center.y, z: center.z })).toBe(true)
    const outside = { x: center.x + 0.2, y: center.y, z: center.z }
    expect(clock.containsWorldPoint(outside)).toBe(false)
    expect(clock.containsWorldPoint(outside, 0.25)).toBe(true)
    clock.dispose()
  })
})

describe('ChessHall', () => {
  it('builds a room, table, and seated human-eye camera aimed at the board', () => {
    const hall = new ChessHall()
    for (const name of [
      'floor',
      'ceiling',
      'wall-north',
      'wall-south',
      'wall-east',
      'wall-west',
      'table',
      'table-leg-0',
      'table-leg-1',
      'table-leg-2',
      'table-leg-3',
      'board',
      'clock-tap-target',
    ]) {
      expect(hall.root.getObjectByName(name), name).toBeTruthy()
    }

    const table = hall.root.getObjectByName('table') as { receiveShadow?: boolean }
    expect(table.receiveShadow).toBe(true)
    expect(hall.camera).toBeInstanceOf(PerspectiveCamera)
    expect(hall.camera.fov).toBeGreaterThanOrEqual(40)
    expect(hall.camera.fov).toBeLessThanOrEqual(70)
    expect(hall.lighting.lights().filter((light) => light.castShadow)).toHaveLength(1)

    const eye = hall.getSeatedEyePosition()
    expect(eye.y).toBeCloseTo(SEATED_EYE_HEIGHT_M)
    expect(eye.z).toBeCloseTo(SEATED_EYE_Z_M)
    expect(eye.y).toBeGreaterThan(1)
    expect(eye.y).toBeLessThan(1.35)
    expect(eye.z).toBeGreaterThan(0.3)

    const toBoard = new Vector3(0, BOARD_SURFACE_Y, 0).sub(eye).normalize()
    const facing = new Vector3()
    hall.camera.updateMatrixWorld(true)
    hall.camera.getWorldDirection(facing)
    expect(facing.dot(toBoard)).toBeGreaterThan(0.98)

    const clock = hall.clockTap.object.position
    expect(hall.board.squareFromWorld(clock)).toBeNull()
    expect(hall.getPiece('missing')).toBeUndefined()
    expect(hall.getPieces()).toEqual([])
  })

  it('places pieces on their squares and swaps materials through the shared set', () => {
    const materials = new PieceMaterialSet()
    const hall = new ChessHall({ pieces: [whitePawn()], materials })
    expect(hall.materials).toBe(materials)
    const piece = hall.getPiece('white-pawn-1')
    expect(piece).toBeTruthy()
    const home = hall.board.worldPosition(whitePawn().square)
    expect(piece?.object.position.x).toBeCloseTo(home.x)
    expect(piece?.object.position.z).toBeCloseTo(home.z)
    expect(piece?.object.parent?.name).toBe('pieces')

    const before = piece!.currentMaterial()
    piece!.applyFinish('selected')
    expect(piece!.currentMaterial()).not.toBe(before)

    hall.dispose()
    expect(hall.root.children).toHaveLength(0)
  })
})
