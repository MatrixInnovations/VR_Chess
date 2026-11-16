import { describe, expect, it } from 'vitest'
import type { Mesh, MeshStandardMaterial } from 'three'

import { BOARD_SURFACE_Y } from '../hall/metrics'
import { BoardModel } from '../hall/BoardModel'

describe('BoardModel', () => {
  it('builds 64 squares, a frame, and a lighter color on a8', () => {
    const board = new BoardModel()
    let squares = 0
    board.object.traverse((obj) => {
      if (obj.userData.msRole === 'square') squares += 1
    })
    expect(squares).toBe(64)
    expect(board.object.getObjectByName('board-frame')).toBeTruthy()

    const light = board.squareMesh({ file: 0, rank: 0 }) as Mesh
    const dark = board.squareMesh({ file: 1, rank: 0 }) as Mesh
    const lightHex = (light.material as MeshStandardMaterial).color.getHex()
    const darkHex = (dark.material as MeshStandardMaterial).color.getHex()
    expect(lightHex).toBeGreaterThan(darkHex)
    expect(light.material).toBe(board.squareMesh({ file: 1, rank: 1 })?.material)
    expect(dark.material).toBe(board.squareMesh({ file: 0, rank: 1 })?.material)
    expect(light.material).not.toBe(dark.material)
  })

  it('highlights legal squares and restores the original material', () => {
    const board = new BoardModel()
    const mesh = board.squareMesh({ file: 0, rank: 0 }) as Mesh
    const original = mesh.material

    board.clearHighlights()
    board.highlight([
      { file: 0, rank: 0 },
      { file: 9, rank: 0 },
    ])
    expect(board.isHighlighted({ file: 0, rank: 0 })).toBe(true)
    expect(board.isHighlighted({ file: 1, rank: 0 })).toBe(false)
    expect(board.highlightedSquares()).toEqual([{ file: 0, rank: 0 }])
    expect(mesh.material).not.toBe(original)

    board.highlight([{ file: 1, rank: 1 }])
    expect(board.isHighlighted({ file: 0, rank: 0 })).toBe(false)
    expect(board.isHighlighted({ file: 1, rank: 1 })).toBe(true)

    board.clearHighlights()
    expect(mesh.material).toBe(original)
    expect(board.highlightedSquares()).toEqual([])
    board.clearHighlights()
  })

  it('maps square centers into the seated board and back', () => {
    const board = new BoardModel()
    const near = board.worldPosition({ file: 0, rank: 0 })
    const far = board.worldPosition({ file: 7, rank: 7 })
    expect(near.x).toBeLessThan(0)
    expect(near.z).toBeLessThan(0)
    expect(far.x).toBeGreaterThan(0)
    expect(far.z).toBeGreaterThan(0)
    expect(near.y).toBeCloseTo(BOARD_SURFACE_Y)

    near.x = 100
    expect(board.worldPosition({ file: 0, rank: 0 }).x).not.toBe(100)
    expect(board.squareFromWorld(board.worldPosition({ file: 3, rank: 5 }))).toEqual({
      file: 3,
      rank: 5,
    })
    expect(board.squareFromWorld({ x: 5, z: 5 })).toBeNull()
    expect(board.squareMesh({ file: 8, rank: 0 })).toBeUndefined()
  })

  it('disposes without throwing', () => {
    const board = new BoardModel()
    board.dispose()
    expect(board.object.children).toHaveLength(0)
  })
})
