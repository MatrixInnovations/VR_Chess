import * as THREE from 'three'

/** Quest-friendly defaults: one shadow map, capped pixel ratio, no postprocessing. */
export class PerformanceProfile {
  readonly shadowMapSize = 1024
  readonly textureSize = 256
  readonly dprCap = 1.5
  readonly foveation = 0.4

  apply(renderer: THREE.WebGLRenderer): void {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.dprCap))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
  }
}
