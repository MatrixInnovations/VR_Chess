import { describe, expect, it } from 'vitest'
import { Group, MeshBasicMaterial, MeshLambertMaterial, MeshStandardMaterial } from 'three'

import type { PieceKind } from '../contracts/types'
import { BoardModel } from '../hall/BoardModel'
import { PerformanceBudget } from '../hall/PerformanceBudget'
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
    expect((selected as MeshStandardMaterial).emissiveIntensity).toBeGreaterThan(0)
    expect((white as MeshStandardMaterial).emissiveIntensity).toBeGreaterThan(0.05)
    expect((white as MeshStandardMaterial).emissive.getHex()).toBe(0xb4b8c0)
    expect(dragging.transparent).toBe(true)
    expect(dragging.opacity).toBeLessThan(1)
  })

  it('uses marble and metal finishes and keeps the Quest material budget shared', () => {
    const set = new PieceMaterialSet()
    const cream = set.boardSquare('light')
    const marble = set.boardSquare('dark')
    const white = set.get('white', 'idle')
    const black = set.get('black', 'idle')
    const budget = set.gpuBudget()

    expect(cream).not.toBe(marble)
    expect(cream.color.getHex()).toBe(0xffffff)
    expect(marble.color.getHex()).toBe(0xffffff)
    const creamPixel = (cream.map as { image: { data: Uint8Array } }).image.data
    const marblePixel = (marble.map as { image: { data: Uint8Array } }).image.data
    expect(creamPixel[0]).toBeGreaterThan(180)
    expect(marblePixel[0]).toBeLessThan(80)
    expect(cream).toBeInstanceOf(MeshBasicMaterial)
    expect(marble).toBeInstanceOf(MeshBasicMaterial)
    expect(white).toBeInstanceOf(MeshStandardMaterial)
    expect(black).toBeInstanceOf(MeshStandardMaterial)
    expect((white as MeshStandardMaterial).roughness).toBeCloseTo(0.18)
    expect((white as MeshStandardMaterial).metalness).toBeCloseTo(0.78)
    expect((black as MeshStandardMaterial).metalness).toBeCloseTo(0.8)
    expect((white as MeshStandardMaterial).envMapIntensity).toBeCloseTo(1.05)
    expect((black as MeshStandardMaterial).envMapIntensity).toBeCloseTo(1.15)
    expect(white.color.getHex()).toBe(0xd4d7dc)
    expect(black.color.getHex()).toBe(0xc06a38)
    expect(set.get('black', 'selected')).toBeInstanceOf(MeshStandardMaterial)
    expect((set.get('black', 'selected') as MeshStandardMaterial).metalness).toBeCloseTo(0.8)
    expect(set.gold().color.getHex()).toBe(0xc9a44c)
    expect(set.felt()).toBeInstanceOf(MeshLambertMaterial)
    const before = budget.textureCount
    expect(before).toBeGreaterThan(0)
    expect(before).toBeLessThanOrEqual(48)
    const saved = cream.map
    cream.map = null
    expect(set.gpuBudget().textureCount).toBe(before - 1)
    cream.map = saved
    expect(set.gpuBudget().textureCount).toBe(before)
    expect(budget.materialCount).toBeLessThanOrEqual(24)
    expect(budget.materialCount).toBeGreaterThan(6)
    expect(PerformanceBudget.QUEST_PRO_FLOOR_FPS).toBe(72)
    expect(PerformanceBudget.QUEST_PRO_TARGET_FPS).toBe(90)
    expect(white.map).toBeNull()
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
    expect((pawn.currentMaterial() as MeshStandardMaterial).emissiveIntensity).toBeGreaterThan(0)

    materials.apply(pawn, 'white', 'dragging')
    expect(pawn.currentMaterial().transparent).toBe(true)

    pawn.applyFinish('idle')
    expect(pawn.currentMaterial()).toBe(idle)

    const home = board.worldPosition(whitePawn().square)
    expect(pawn.object.position.x).toBeCloseTo(home.x)
    expect(pawn.object.position.z).toBeCloseTo(home.z)
    expect(pawn.getSquare()).toEqual(whitePawn().square)

    const queenside = new PieceModel(whitePawn({ id: 'wq', kind: 'knight', square: { file: 1, rank: 0 } }), materials, board)
    const kingside = new PieceModel(whitePawn({ id: 'wk', kind: 'knight', square: { file: 6, rank: 0 } }), materials, board)
    const black = new PieceModel(
      whitePawn({ id: 'bq', kind: 'knight', color: 'black', square: { file: 1, rank: 7 } }),
      materials,
      board,
    )
    expect(queenside.object.children[0].rotation.y).toBeCloseTo(Math.PI / 2 - 0.65)
    expect(kingside.object.children[0].rotation.y).toBeCloseTo(Math.PI / 2 + 0.65)
    expect(black.object.children[0].rotation.y).toBeCloseTo(-(Math.PI / 2 - 0.65))
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
    const geometry = pawn.meshes()[0].geometry
    const again = new PieceModel(whitePawn({ id: 'second' }), materials, board)
    expect(again.meshes()[0].geometry).toBe(geometry)
    const parent = new Group()
    parent.add(pawn.object)
    pawn.dispose()
    expect(pawn.object.parent).toBeNull()
    expect(again.meshes()[0].geometry).toBe(geometry)
    expect(geometry.getAttribute('position')).toBeTruthy()
    materials.dispose()
  })
})
