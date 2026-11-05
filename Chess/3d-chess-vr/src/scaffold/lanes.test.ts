import { describe, expect, it } from 'vitest'
import { LaneCatalog } from './lanes'

describe('LaneCatalog', () => {
  const catalog = LaneCatalog.standard()

  it('lists the four feature lanes in order', () => {
    expect(catalog.list().map((lane) => lane.pr)).toEqual([1, 2, 3, 5])
    expect(catalog.list().map((lane) => lane.id)).toEqual([
      'vision',
      'mad-scientist',
      'fridae',
      'ultron',
    ])
  })

  it('finds a lane by pull request', () => {
    expect(catalog.byPr(3)?.folder).toBe('fridae-clock')
    expect(catalog.byPr(4)).toBeUndefined()
  })

  it('finds a lane by folder and rejects an unknown path', () => {
    expect(catalog.byFolder('Chess/3d-chess-vr/src/ultron')?.title).toBe('Ultron core')
    expect(catalog.byFolder('Chess/3d-chess-vr/src/domain')).toBeUndefined()
  })
})
