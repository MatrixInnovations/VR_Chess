import { PlaneGeometry } from 'three'
import { Reflector } from 'three/examples/jsm/objects/Reflector.js'

import { BOARD_SURFACE_Y } from './metrics'

/**
 * Desktop mirror of the pieces in the 8×8.
 * XR must hide this mesh. It is an extra render pass.
 */
/** 256 matches a 512 mirror from the seated camera and stays inside the frame budget. */
export const REFLECTOR_RESOLUTION = 256

export function createBoardReflector(): Reflector {
  const reflector = new Reflector(new PlaneGeometry(0.4, 0.4), {
    textureWidth: REFLECTOR_RESOLUTION,
    textureHeight: REFLECTOR_RESOLUTION,
    clipBias: 0.003,
    color: 0xffffff,
  })
  reflector.name = 'board-reflector'
  reflector.rotation.x = -Math.PI / 2
  reflector.position.y = BOARD_SURFACE_Y - 0.0004
  reflector.receiveShadow = false
  reflector.castShadow = false
  return reflector
}
