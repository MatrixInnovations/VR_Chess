import * as THREE from 'three'
import type { Position } from '../domain/Position'
import { PickHit } from './PickHit'

export class PointerRay {
  private readonly raycaster = new THREE.Raycaster()

  fromCamera(camera: THREE.Camera, ndc: THREE.Vector2, objects: THREE.Object3D[]): PickHit | null {
    this.raycaster.setFromCamera(ndc, camera)
    this.raycaster.far = 20
    return this.first(this.raycaster.intersectObjects(objects, false))
  }

  fromWorld(origin: THREE.Vector3, direction: THREE.Vector3, objects: THREE.Object3D[]): PickHit | null {
    this.raycaster.set(origin, direction.normalize())
    this.raycaster.far = 3
    return this.first(this.raycaster.intersectObjects(objects, false))
  }

  private first(hits: THREE.Intersection[]): PickHit | null {
    for (const hit of hits) {
      const resolved = PointerRay.resolve(hit)
      if (resolved) return resolved
    }
    return null
  }

  private static resolve(hit: THREE.Intersection): PickHit | null {
    let object: THREE.Object3D | null = hit.object
    while (object) {
      const data = object.userData as {
        kind?: string
        id?: string
        slots?: Position[]
        uids?: number[]
      }
      if (data.kind === 'button' && data.id) return new PickHit('button', null, null, data.id)
      if (data.kind === 'square' && data.slots && hit.instanceId != null) {
        const square = data.slots[hit.instanceId]
        if (square) return new PickHit('square', null, square, null)
      }
      if (data.kind === 'piece' && data.uids && hit.instanceId != null) {
        const uid = data.uids[hit.instanceId]
        if (typeof uid === 'number') return new PickHit('piece', uid, null, null)
      }
      object = object.parent
    }
    return null
  }
}
