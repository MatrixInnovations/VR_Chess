import { describe, expect, it } from 'vitest'
import { Group } from 'three'

import type { PieceKind } from '../contracts/types'
import { BoardModel } from '../hall/BoardModel'
import { PieceMaterialSet } from '../hall/PieceMaterialSet'
import { PieceModel } from '../hall/PieceModel'
import { whitePawn } from './helpers'

const kinds: PieceKind[] = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king']

describe('PieceMaterialSet', () => {
  it('keeps a distinct material for each color and finish', () => {
    const set = new PieceMaterialSet()
    const white = set.get('white', 'idle')
    const black = set.get('black', 'idle')
    const selected = set.get('white', 'selected')
    const dragging = set.get('black', 'dragging')

    expect(white).not.toBe(black)
    expect(white.color.getHex()).not.toBe(black.color.getHex())
    expect(selected.emissiveIntensity).toBeGreaterThan(0)
    expect(white.emissiveIntensity).toBe(0)
    expect(dragging.transparent).toBe(true)
    expect(dragging.opacity).toBeLessThan(1)
  })
})

describe('PieceModel', () => {
  it('constructs every kind and swaps materials without sharing the idle material', () => {
    const board = new BoardModel()
    const materials = new PieceMaterialSet()

    for (const kind of kinds) {
      const model = new PieceModel(whitePawn({ id: kind, kind }), materials, board)
      expect(model.object).toBeInstanceOf(Group)
      expect(model.object.name).toBe(`piece-${kind}`)
      expect(model.meshes().length).toBeGreaterThan(0)
    }

    const pawn = new PieceModel(whitePawn(), materials, board)
    const idle = pawn.currentMaterial()
    pawn.applyFinish('selected')
    expect(pawn.currentMaterial()).not.toBe(idle)
    expect(pawn.currentMaterial().emissiveIntensity).toBeGreaterThan(0)

    materials.apply(pawn, 'white', 'dragging')
    expect(pawn.currentMaterial().transparent).toBe(true)

    pawn.applyFinish('idle')
    expect(pawn.currentMaterial()).toBe(idle)

    const home = board.worldPosition(whitePawn().square)
    expect(pawn.object.position.x).toBeCloseTo(home.x)
    expect(pawn.object.position.z).toBeCloseTo(home.z)
    expect(pawn.getSquare()).toEqual(whitePawn().square)
  })

  it('previews in the air without changing the logical square, then snaps back', () => {
    const board = new BoardModel()
    const materials = new PieceMaterialSet()
    const pawn = new PieceModel(whitePawn(), materials, board)
    pawn.setPreviewPosition({ x: 1, y: 2, z: 3 })
    expect(pawn.object.position.x).toBeCloseTo(1)
    expect(pawn.getSquare()).toEqual({ file: 4, rank: 6 })

    pawn.snapToSquare({ file: 0, rank: 1 })
    const next = board.worldPosition({ file: 0, rank: 1 })
    expect(pawn.getSquare()).toEqual({ file: 0, rank: 1 })
    expect(pawn.object.position.x).toBeCloseTo(next.x)
    expect(pawn.object.position.y).toBeCloseTo(next.y)
    expect(pawn.object.position.z).toBeCloseTo(next.z)
  })

  it('rejects an unknown kind and disposes its own geometry', () => {
    const board = new BoardModel()
    const materials = new PieceMaterialSet()
    expect(
      () =>
        new PieceModel(
          whitePawn({ kind: 'dragon' as PieceKind }),
          materials,
          board,
        ),
    ).toThrow(/dragon/)

    const pawn = new PieceModel(whitePawn(), materials, board)
    const parent = new Group()
    parent.add(pawn.object)
    pawn.dispose()
    expect(pawn.object.parent).toBeNull()
    materials.dispose()
  })
})
