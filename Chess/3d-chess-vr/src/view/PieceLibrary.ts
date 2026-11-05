import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { PieceType } from '../domain/Piece'
import { MeshDecimator } from './MeshDecimator'

class PieceRecipe {
  type: PieceType
  url: string
  height: number
  vertices: number

  constructor(type: PieceType, url: string, height: number, vertices: number) {
    this.type = type
    this.url = url
    this.height = height
    this.vertices = vertices
  }
}

export class PieceLibrary {
  private readonly geometries = new Map<PieceType, THREE.BufferGeometry>()
  private readonly loader = new GLTFLoader()

  geometry(type: PieceType): THREE.BufferGeometry | null {
    return this.geometries.get(type) ?? null
  }

  async load(onProgress?: (label: string) => void): Promise<void> {
    const recipes = [
      new PieceRecipe('pawn', '/pawn.gltf', 0.05, 1500),
      new PieceRecipe('rook', '/rook.gltf', 0.057, 1400),
      new PieceRecipe('knight', '/knight.gltf', 0.06, 2200),
      new PieceRecipe('bishop', '/bishop.gltf', 0.068, 1800),
      new PieceRecipe('queen', '/queen.gltf', 0.082, 2000),
      new PieceRecipe('king', '/king.gltf', 0.095, 2400),
    ]
    for (const recipe of recipes) {
      onProgress?.(`Carving the ${recipe.type}…`)
      const gltf = await this.loader.loadAsync(recipe.url)
      gltf.scene.updateMatrixWorld(true)
      const merged = PieceLibrary.merge(gltf.scene)
      const budget = MeshDecimator.toBudget(merged, recipe.vertices)
      merged.dispose()
      PieceLibrary.fit(budget, recipe.height)
      this.geometries.set(recipe.type, budget)
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }

  dispose(): void {
    for (const geometry of this.geometries.values()) geometry.dispose()
    this.geometries.clear()
  }

  private static merge(root: THREE.Object3D): THREE.BufferGeometry {
    const geometries: THREE.BufferGeometry[] = []
    root.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh) return
      const geometry = mesh.geometry.clone()
      geometry.applyMatrix4(mesh.matrixWorld)
      geometries.push(geometry)
    })
    if (geometries.length === 0) return new THREE.BufferGeometry()
    const merged = geometries[0]
    geometries.slice(1).forEach((geometry) => geometry.dispose())
    return merged
  }

  private static fit(geometry: THREE.BufferGeometry, height: number): void {
    geometry.computeBoundingBox()
    const box = geometry.boundingBox
    if (!box) return
    const current = box.max.y - box.min.y || 1
    const scale = height / current
    geometry.scale(scale, scale, scale)
    geometry.computeBoundingBox()
    const fitted = geometry.boundingBox
    if (!fitted) return
    const width = Math.max(fitted.max.x - fitted.min.x, fitted.max.z - fitted.min.z)
    if (width > 0.046) {
      const shrink = 0.046 / width
      geometry.scale(shrink, shrink, shrink)
      geometry.computeBoundingBox()
    }
    const seated = geometry.boundingBox
    if (!seated) return
    geometry.translate(
      -((seated.max.x + seated.min.x) / 2),
      -seated.min.y,
      -((seated.max.z + seated.min.z) / 2),
    )
  }
}
