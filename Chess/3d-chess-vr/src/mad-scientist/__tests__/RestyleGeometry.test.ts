import { describe, expect, it } from 'vitest'
import { BoxGeometry, LatheGeometry, MeshPhysicalMaterial, Scene, Texture } from 'three'
import type { WebGLRenderer } from 'three'

import { ChessHall } from '../hall/ChessHall'
import { configureHallStage } from '../hall/HallStage'

import type { PieceKind } from '../contracts/types'
import { createBoardReflector } from '../hall/BoardReflector'
import { buildEnvironment, darkHallEnvScene } from '../hall/HallEnvironment'
import { KING_HEIGHT_M } from '../hall/metrics'
import { applyMarbleVeins, stampTileSeed } from '../hall/MarbleVeins'
import { carveMitreSlit, disposePieceGeometries, pieceGeometry } from '../hall/PieceGeometryCache'
import { LATHE_SEGMENTS, PROFILE } from '../hall/PieceProfiles'

describe('marble veins', () => {
  it('stamps a seed and compiles a light and a dark program', () => {
    const geometry = new BoxGeometry(1, 1, 1)
    stampTileSeed(geometry, 3, 4)
    const seed = geometry.getAttribute('tileSeed')
    expect(seed.getX(0)).toBe(3)
    expect(seed.getY(0)).toBe(4)
    const material = new MeshPhysicalMaterial()
    applyMarbleVeins(material, true)
    const shader = {
      uniforms: {} as Record<string, { value: number }>,
      vertexShader: '#include <common>\n#include <uv_vertex>\n',
      fragmentShader: '#include <common>\n#include <map_fragment>\n#include <roughnessmap_fragment>\n',
    }
    material.onBeforeCompile(shader, material)
    expect(shader.vertexShader).toContain('tileSeed')
    expect(shader.fragmentShader).toContain('marbleAlbedo')
    expect(shader.uniforms.uMarbleDark.value).toBe(1)
    expect(material.customProgramCacheKey()).toBe('marble-dark')
    applyMarbleVeins(material, false)
    expect(material.customProgramCacheKey()).toBe('marble-light')
    geometry.dispose()
    material.dispose()
  })
})

describe('piece geometry', () => {
  it('shares a non-indexed knight and keeps a visible bishop slit', () => {
    const knight = pieceGeometry('knight')
    expect(knight.index).toBeNull()
    const bishop = pieceGeometry('bishop')
    expect(bishop.index).toBeNull()
    const raw = new LatheGeometry([...PROFILE.bishop], LATHE_SEGMENTS)
    const position = raw.getAttribute('position')
    const before = new Float32Array(position.array)
    carveMitreSlit(raw)
    let moved = 0
    for (let index = 0; index < position.count; index += 1) {
      if (position.getX(index) !== before[index * 3]) moved += 1
    }
    expect(moved).toBeGreaterThan(4)
    raw.dispose()

    bishop.computeBoundingBox()
    const king = pieceGeometry('king')
    king.computeBoundingBox()
    expect(king.boundingBox?.max.y).toBeCloseTo(KING_HEIGHT_M, 2)
    expect(bishop.boundingBox!.max.y).toBeLessThan(king.boundingBox!.max.y)
    expect(() => pieceGeometry('dragon' as PieceKind)).toThrow(/dragon/)
    const again = pieceGeometry('knight')
    expect(again).toBe(knight)
    disposePieceGeometries()
    expect(pieceGeometry('pawn')).not.toBe(knight)
    disposePieceGeometries()
  })
})

describe('hall environment', () => {
  it('builds a softbox scene without fetching an HDR', () => {
    const scene = darkHallEnvScene()
    expect(scene.children.length).toBeGreaterThan(3)
    const texture = new Texture()
    const baked = buildEnvironment({} as WebGLRenderer, scene, () => ({ texture }))
    expect(baked).toBe(texture)
  })
})

describe('hall stage', () => {
  it('frames the desktop hero and drops the mirror when XR starts', () => {
    const hall = new ChessHall()
    const scene = new Scene()
    const listeners: Record<string, () => void> = {}
    const gl = {
      domElement: {
        style: {},
        addEventListener() {
          return undefined
        },
        removeEventListener() {
          return undefined
        },
      },
      getSize(target: { set: (x: number, y: number) => void }) {
        target.set(256, 256)
        return target
      },
      getPixelRatio() {
        return 1
      },
      xr: {
        addEventListener(type: string, listener: () => void) {
          listeners[type] = listener
        },
      },
    } as unknown as WebGLRenderer
    const environment = new Texture()
    configureHallStage(gl, scene, hall.camera, hall, false, {
      loader: {
        load(_url, _onLoad, _progress, onError) {
          onError?.(new Error('offline'))
        },
      },
      bake: () => ({ texture: environment }),
    })
    expect(hall.camera.fov).toBe(42)
    expect(hall.camera.position.z).toBeCloseTo(0.92)
    expect(hall.reflector).toBeTruthy()
    expect(scene.fog).toBeTruthy()
    expect(scene.environment).toBe(environment)
    listeners.sessionstart()
    expect(hall.reflector?.visible).toBe(false)
    expect(hall.orbit?.enabled).toBe(false)
    expect(scene.fog).toBeNull()
    hall.dispose()
  })

  it('bakes a same-origin studio hdr and skips the reflector on Quest', () => {
    const hall = new ChessHall()
    const scene = new Scene()
    const hdr = new Texture()
    let disposed = false
    hdr.dispose = () => {
      disposed = true
    }
    const environment = new Texture()
    configureHallStage({} as WebGLRenderer, scene, hall.camera, hall, true, {
      loader: {
        load(_url, onLoad) {
          onLoad(hdr)
        },
      },
      bake: () => ({ texture: environment }),
    })
    expect(disposed).toBe(true)
    expect(scene.environment).toBe(environment)
    expect(hall.reflector).toBeNull()
    expect(hall.camera.fov).toBe(50)
    hall.dispose()
  })
})

describe('board reflector', () => {
  it('covers the playing surface and sits just under the squares', () => {
    const reflector = createBoardReflector()
    expect(reflector.name).toBe('board-reflector')
    expect(reflector.position.y).toBeLessThan(0.752)
    reflector.geometry.dispose()
    const material = reflector.material as { dispose: () => void }
    material.dispose()
  })
})
