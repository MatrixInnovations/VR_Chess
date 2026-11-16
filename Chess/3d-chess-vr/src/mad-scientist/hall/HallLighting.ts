import { DirectionalLight, Group, HemisphereLight, Light, PointLight, RectAreaLight } from 'three'

import { BOARD_SURFACE_Y } from './metrics'

/**
 * Warm hall rig.
 *
 * The key is the only shadow caster. Quest stays at 512². Desktop raises the
 * map and turns on the rect softbox. Fill, rim, and sconces never cast.
 */
export class HallLighting {
  /** Group containing the lights and the key light's target. */
  readonly object = new Group()

  /** Sky/ground bounce. No shadow. */
  readonly hemisphere: HemisphereLight

  /** Main light from the player's front-right. The only shadow caster. */
  readonly key: DirectionalLight

  /** Warm fill from the near-left. No shadow. */
  readonly fill: DirectionalLight

  /** Gold rim from behind the black pieces. No shadow. */
  readonly rim: DirectionalLight

  /** Desktop softbox. Intensity stays 0 on Quest. */
  readonly rect: RectAreaLight

  /** Left practical. */
  readonly sconceLeft: PointLight

  /** Right practical. */
  readonly sconceRight: PointLight

  /**
   * Creates the instance.
   */
  constructor() {
    this.object.name = 'lighting'
    this.hemisphere = new HemisphereLight(0xe8c9a0, 0x1a120c, 0.22)
    this.hemisphere.name = 'hemisphere'

    this.key = new DirectionalLight(0xffc89a, 1.15)
    this.key.name = 'key'
    this.key.position.set(0.42, 2.35, 0.95)
    this.key.castShadow = true
    this.key.shadow.mapSize.set(512, 512)
    this.key.shadow.bias = -0.0004
    this.key.shadow.normalBias = 0.01
    const shadowCamera = this.key.shadow.camera
    shadowCamera.left = -0.6
    shadowCamera.right = 0.6
    shadowCamera.top = 0.6
    shadowCamera.bottom = -0.6
    shadowCamera.near = 1
    shadowCamera.far = 3.5
    shadowCamera.updateProjectionMatrix()
    this.key.target.position.set(0, BOARD_SURFACE_Y, 0)

    this.fill = new DirectionalLight(0xffd8b8, 0.22)
    this.fill.name = 'fill'
    this.fill.position.set(-0.55, 1.55, 0.7)
    this.fill.target.position.set(0, BOARD_SURFACE_Y, 0)

    this.rim = new DirectionalLight(0xffd4a0, 0.45)
    this.rim.name = 'rim'
    this.rim.position.set(-0.85, 1.85, -1.05)
    this.rim.target.position.set(0, BOARD_SURFACE_Y, 0)

    this.rect = new RectAreaLight(0xfff5ea, 0, 0.8, 0.5)
    this.rect.name = 'softbox'
    this.rect.position.set(0.15, 2.6, 0.6)
    this.rect.lookAt(0, BOARD_SURFACE_Y, 0)

    this.sconceLeft = new PointLight(0xffb56a, 0.35, 3.2, 2)
    this.sconceLeft.name = 'sconce-left'
    this.sconceLeft.position.set(-1.6, 1.75, -2.6)
    this.sconceLeft.castShadow = false

    this.sconceRight = new PointLight(0xffb56a, 0.35, 3.2, 2)
    this.sconceRight.name = 'sconce-right'
    this.sconceRight.position.set(1.6, 1.75, -2.6)
    this.sconceRight.castShadow = false

    this.object.add(
      this.hemisphere,
      this.key,
      this.key.target,
      this.fill,
      this.fill.target,
      this.rim,
      this.rim.target,
      this.sconceLeft,
      this.sconceRight,
    )
  }

  /** Every analytical light. Targets are not included. */
  lights(): readonly Light[] {
    return [this.hemisphere, this.key, this.fill, this.rim, this.rect, this.sconceLeft, this.sconceRight]
  }

  /**
   * Desktop uses a 1024 shadow and a dimmer rect softbox.
   * Quest keeps the 512 map and leaves the softbox off.
   */
  setTier(tier: 'desktop' | 'quest'): void {
    const desktop = tier === 'desktop'
    this.key.intensity = desktop ? 1.35 : 0.95
    this.key.shadow.mapSize.set(desktop ? 1024 : 512, desktop ? 1024 : 512)
    this.key.shadow.normalBias = desktop ? 0.012 : 0.01
    const span = desktop ? 0.7 : 0.6
    const camera = this.key.shadow.camera
    camera.left = -span
    camera.right = span
    camera.top = span
    camera.bottom = -span
    camera.updateProjectionMatrix()
    this.rect.intensity = desktop ? 0.7 : 0
    if (desktop) this.object.add(this.rect)
    else this.rect.removeFromParent()
  }

  /** Remove the lights from their parent. */
  dispose(): void {
    this.object.removeFromParent()
    this.object.clear()
  }
}
