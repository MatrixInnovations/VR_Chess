import { DirectionalLight, Group, HemisphereLight, Light } from 'three'

import { BOARD_SURFACE_Y } from './metrics'

/**
 * Three lights for the hall.
 *
 * Quest Pro needs to hold 72fps, so exactly one light casts a shadow and its
 * map is 512². A small table does not need a cascaded shadow map.
 */
export class HallLighting {
  /** Group containing the lights and the key light's target. */
  readonly object = new Group()

  /** Sky/ground bounce. No shadow. */
  readonly hemisphere: HemisphereLight

  /** Main light from the player's front-right. The only shadow caster. */
  readonly key: DirectionalLight

  /** Dim cool fill from the far side so black pieces are not a silhouette. */
  readonly rim: DirectionalLight

  constructor() {
    this.object.name = 'lighting'
    this.hemisphere = new HemisphereLight(0xf4efe4, 0x6b5344, 0.55)
    this.hemisphere.name = 'hemisphere'

    this.key = new DirectionalLight(0xfff4e0, 1.15)
    this.key.name = 'key'
    this.key.position.set(0.35, 2.2, 0.85)
    this.key.castShadow = true
    // 512 keeps the shadow pass inside the Quest frame. The hall is one table.
    this.key.shadow.mapSize.set(512, 512)
    this.key.shadow.bias = -0.0004
    this.key.target.position.set(0, BOARD_SURFACE_Y, 0)

    this.rim = new DirectionalLight(0xd7e2ff, 0.28)
    this.rim.name = 'rim'
    this.rim.position.set(-0.8, 1.6, -0.9)

    this.object.add(this.hemisphere, this.key, this.key.target, this.rim)
  }

  /** Hemisphere, key, and rim. The key target is not a light. */
  lights(): readonly Light[] {
    return [this.hemisphere, this.key, this.rim]
  }

  /** Remove the lights from their parent. */
  dispose(): void {
    this.object.removeFromParent()
    this.object.clear()
  }
}
