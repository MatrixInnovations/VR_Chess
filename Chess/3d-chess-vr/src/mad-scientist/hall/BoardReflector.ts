import { PlaneGeometry } from 'three'
import { Reflector } from 'three/examples/jsm/objects/Reflector.js'

import { BOARD_SURFACE_Y } from './metrics'

/**
 * Desktop mirror of the pieces in the 8×8.
 * XR must hide this mesh. It is an extra render pass.
 */
export function createBoardReflector(): Reflector {
  const reflector = new Reflector(new PlaneGeometry(0.4, 0.4), {
    textureWidth: 1024,
    textureHeight: 1024,
    clipBias: 0.003,
    color: 0x888888,
  })
  reflector.name = 'board-reflector'
  reflector.rotation.x = -Math.PI / 2
  reflector.position.y = BOARD_SURFACE_Y - 0.0004
  reflector.receiveShadow = false
  reflector.castShadow = false
  return reflector
}
