import * as THREE from 'three'
import type { ViewMode } from './ViewModeManager'
import type { HallMaterials } from './HallMaterials'

export class RoomScenery extends THREE.Group {
  private readonly room: THREE.Group
  private readonly guest: THREE.Group

  constructor(materials: HallMaterials) {
    super()
    this.room = new THREE.Group()
    this.guest = RoomScenery.guest(materials)
    this.room.add(RoomScenery.shell(materials))
    this.room.add(RoomScenery.table(materials))
    this.room.add(RoomScenery.chair(materials, 0.98, Math.PI))
    this.room.add(RoomScenery.chair(materials, -0.78, 0))
    this.room.add(this.guest)
    this.room.add(RoomScenery.books(materials))
    this.room.add(RoomScenery.window(materials))
    this.room.add(RoomScenery.painting(materials))
    this.add(this.room)
    this.add(RoomScenery.lights())
  }

  setPresentation(mode: ViewMode): void {
    const passthrough = mode === 'immersive-ar'
    this.room.visible = !passthrough
  }

  private static shell(materials: HallMaterials): THREE.Group {
    const group = new THREE.Group()
    const floor = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.08, 5.8), materials.floor)
    floor.position.y = -0.04
    floor.receiveShadow = true
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.08, 5.8), materials.plaster)
    ceiling.position.y = 3.04
    const wallGeo = new THREE.BoxGeometry(1, 3, 1)
    const north = new THREE.Mesh(wallGeo, materials.plaster)
    north.scale.set(6.6, 1, 0.12)
    north.position.set(0, 1.5, -2.9)
    const south = north.clone()
    south.position.z = 2.9
    const east = new THREE.Mesh(wallGeo, materials.plaster)
    east.scale.set(0.12, 1, 5.8)
    east.position.set(3.3, 1.5, 0)
    const west = east.clone()
    west.position.x = -3.3
    const wainscotMat = materials.wainscot
    const panel = (width: number, depth: number, x: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 1.05, depth), wainscotMat)
      mesh.position.set(x, 0.525, z)
      return mesh
    }
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.7), materials.rug)
    rug.rotation.x = -Math.PI / 2
    rug.position.y = 0.004
    rug.receiveShadow = true
    group.add(floor, ceiling, north, south, east, west, rug)
    group.add(panel(6.36, 0.04, 0, -2.8))
    group.add(panel(6.36, 0.04, 0, 2.8))
    group.add(panel(0.04, 5.56, -3.2, 0))
    group.add(panel(0.04, 5.56, 3.2, 0))
    return group
  }

  private static table(materials: HallMaterials): THREE.Group {
    const group = new THREE.Group()
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.05, 1.08), materials.walnut)
    top.position.y = 0.715
    top.castShadow = true
    top.receiveShadow = true
    group.add(top)
    const legGeo = new THREE.BoxGeometry(0.06, 0.69, 0.06)
    for (const [x, z] of [
      [-0.62, -0.44],
      [0.62, -0.44],
      [-0.62, 0.44],
      [0.62, 0.44],
    ] as Array<[number, number]>) {
      const leg = new THREE.Mesh(legGeo, materials.walnut)
      leg.position.set(x, 0.345, z)
      leg.castShadow = true
      group.add(leg)
    }
    return group
  }

  private static chair(materials: HallMaterials, z: number, yaw: number): THREE.Group {
    const group = new THREE.Group()
    group.position.set(0, 0, z)
    group.rotation.y = yaw
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.04, 0.46), materials.walnut)
    seat.position.y = 0.46
    seat.castShadow = true
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.48, 0.04), materials.walnut)
    back.position.set(0, 0.74, -0.21)
    back.castShadow = true
    group.add(seat, back)
    for (const [x, zz] of [
      [-0.18, -0.18],
      [0.18, -0.18],
      [-0.18, 0.18],
      [0.18, 0.18],
    ] as Array<[number, number]>) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.46, 0.04), materials.walnut)
      leg.position.set(x, 0.23, zz)
      group.add(leg)
    }
    return group
  }

  private static guest(materials: HallMaterials): THREE.Group {
    const group = new THREE.Group()
    group.position.set(0, 0, -0.7)
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.4, 0.18), materials.cloth)
    torso.position.set(0, 0.8, 0.02)
    torso.castShadow = true
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.08, 8), materials.skin)
    neck.position.y = 1.02
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.085, 18, 14), materials.skin)
    head.position.y = 1.14
    head.castShadow = true
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.088, 16, 12), materials.ebony)
    hair.position.set(0, 1.17, -0.02)
    hair.scale.set(1, 0.72, 1)
    const armGeo = new THREE.BoxGeometry(0.07, 0.26, 0.07)
    const left = new THREE.Mesh(armGeo, materials.cloth)
    left.position.set(-0.2, 0.74, 0.1)
    left.rotation.x = 1.05
    left.castShadow = true
    const right = left.clone()
    right.position.x = 0.2
    group.add(torso, neck, head, hair, left, right)
    return group
  }

  private static books(materials: HallMaterials): THREE.Group {
    const group = new THREE.Group()
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.04, 0.28), materials.walnut)
    shelf.position.set(-1.5, 1.35, -2.72)
    const books = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.05, 0.28, 0.2),
      new THREE.MeshStandardMaterial({ roughness: 0.8, color: '#ffffff' }),
      18,
    )
    const palette = ['#6e2e2e', '#243c34', '#1d2d44', '#7a6232', '#3d2b24', '#4a3a28']
    const dummy = new THREE.Object3D()
    for (let i = 0; i < 18; i += 1) {
      dummy.position.set(-2.15 + i * 0.075, 1.51, -2.72)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(1, 0.85 + (i % 3) * 0.08, 1)
      dummy.updateMatrix()
      books.setMatrixAt(i, dummy.matrix)
      books.setColorAt(i, new THREE.Color(palette[i % palette.length]))
    }
    books.castShadow = true
    group.add(shelf, books)
    return group
  }

  private static window(materials: HallMaterials): THREE.Group {
    const group = new THREE.Group()
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.7, 1.15), materials.walnut)
    frame.position.set(-3.18, 1.7, 0.35)
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.5), materials.window)
    pane.position.set(-3.12, 1.7, 0.35)
    pane.rotation.y = Math.PI / 2
    group.add(frame, pane)
    return group
  }

  private static painting(materials: HallMaterials): THREE.Mesh {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 320
    const context = canvas.getContext('2d')
    if (context) {
      context.fillStyle = '#1d2a28'
      context.fillRect(0, 0, 256, 320)
      context.fillStyle = '#c6a15b'
      context.fillRect(40, 48, 176, 12)
      context.fillStyle = '#8d5a3c'
      context.fillRect(40, 90, 70, 160)
      context.fillStyle = '#d7c4a4'
      context.fillRect(130, 120, 80, 130)
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.88),
      new THREE.MeshStandardMaterial({ map: texture, roughness: 0.6 }),
    )
    mesh.position.set(1.7, 1.7, -2.82)
    const frame = materials
    void frame
    return mesh
  }

  private static lights(): THREE.Group {
    const group = new THREE.Group()
    const hemi = new THREE.HemisphereLight('#f4e7d2', '#3a2a22', 0.55)
    const sun = new THREE.DirectionalLight('#fff1dd', 3.1)
    sun.position.set(-2.2, 3.3, 1.3)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    sun.shadow.camera.near = 0.4
    sun.shadow.camera.far = 8
    sun.shadow.camera.left = -1.3
    sun.shadow.camera.right = 1.3
    sun.shadow.camera.top = 1.3
    sun.shadow.camera.bottom = -1.3
    sun.shadow.bias = -0.00035
    sun.shadow.normalBias = 0.025
    sun.target.position.set(0, 0.8, 0)
    const lamp = new THREE.PointLight('#ffd2a8', 14, 4.5, 2)
    lamp.position.set(0, 1.75, 0)
    const shade = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.12, 0.08, 12),
      new THREE.MeshStandardMaterial({
        color: '#5a4632',
        emissive: '#aa7a3a',
        emissiveIntensity: 0.4,
        roughness: 0.5,
      }),
    )
    shade.position.copy(lamp.position)
    const fill = new THREE.DirectionalLight('#d9e4ff', 0.35)
    fill.position.set(1.2, 1.4, 2)
    group.add(hemi, sun, sun.target, lamp, shade, fill)
    return group
  }
}
