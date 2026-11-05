import * as THREE from 'three'
import { TextureFactory } from './TextureFactory'

export class HallMaterials {
  readonly textures = new TextureFactory()
  readonly plaster: THREE.MeshStandardMaterial
  readonly walnut: THREE.MeshStandardMaterial
  readonly maple: THREE.MeshStandardMaterial
  readonly floor: THREE.MeshStandardMaterial
  readonly wainscot: THREE.MeshStandardMaterial
  readonly rug: THREE.MeshStandardMaterial
  readonly ivory: THREE.MeshStandardMaterial
  readonly ebony: THREE.MeshStandardMaterial
  readonly brass: THREE.MeshStandardMaterial
  readonly lightSquare: THREE.MeshStandardMaterial
  readonly darkSquare: THREE.MeshStandardMaterial
  readonly cloth: THREE.MeshStandardMaterial
  readonly skin: THREE.MeshStandardMaterial
  readonly window: THREE.MeshStandardMaterial
  readonly marker: THREE.MeshBasicMaterial
  readonly capture: THREE.MeshBasicMaterial

  constructor() {
    const walnutMap = this.textures.wood('walnut', '#6b4228', '#3a2416', 2, 2)
    const mapleMap = this.textures.wood('maple', '#e7d3ae', '#c4a574', 2, 2)
    const floorMap = this.textures.wood('floor', '#7a5233', '#3f2918', 4, 4)
    this.plaster = new THREE.MeshStandardMaterial({
      map: this.textures.plaster(),
      roughness: 0.92,
      metalness: 0,
    })
    this.walnut = new THREE.MeshStandardMaterial({ map: walnutMap, roughness: 0.62, metalness: 0.02 })
    this.maple = new THREE.MeshStandardMaterial({ map: mapleMap, roughness: 0.55, metalness: 0.02 })
    this.floor = new THREE.MeshStandardMaterial({ map: floorMap, roughness: 0.78, metalness: 0 })
    this.wainscot = new THREE.MeshStandardMaterial({ map: walnutMap, roughness: 0.7, metalness: 0.02 })
    this.rug = new THREE.MeshStandardMaterial({ color: '#1b3a32', roughness: 0.95, metalness: 0 })
    this.ivory = new THREE.MeshStandardMaterial({
      color: '#f3ecdf',
      roughness: 0.38,
      metalness: 0.02,
    })
    this.ebony = new THREE.MeshStandardMaterial({
      color: '#16110e',
      roughness: 0.46,
      metalness: 0.08,
    })
    this.brass = new THREE.MeshStandardMaterial({
      color: '#b8893e',
      roughness: 0.35,
      metalness: 0.72,
    })
    this.lightSquare = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.58,
      metalness: 0.02,
    })
    this.darkSquare = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.62,
      metalness: 0.03,
    })
    this.cloth = new THREE.MeshStandardMaterial({ color: '#243044', roughness: 0.86, metalness: 0 })
    this.skin = new THREE.MeshStandardMaterial({ color: '#e0c2a4', roughness: 0.62, metalness: 0 })
    this.window = new THREE.MeshStandardMaterial({
      color: '#fff6e8',
      emissive: '#ffe2b0',
      emissiveIntensity: 1.4,
      roughness: 0.25,
    })
    this.marker = new THREE.MeshBasicMaterial({
      color: '#e7c56a',
      transparent: true,
      opacity: 0.9,
    })
    this.capture = new THREE.MeshBasicMaterial({
      color: '#e7c56a',
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
    })
  }

  dispose(): void {
    for (const material of [
      this.plaster,
      this.walnut,
      this.maple,
      this.floor,
      this.wainscot,
      this.rug,
      this.ivory,
      this.ebony,
      this.brass,
      this.lightSquare,
      this.darkSquare,
      this.cloth,
      this.skin,
      this.window,
      this.marker,
      this.capture,
    ]) {
      material.dispose()
    }
    this.textures.dispose()
  }
}
