import {
  BackSide,
  BoxGeometry,
  Color,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  Texture,
  type WebGLRenderer,
} from 'three'

/**
 * Dark hall with warm softboxes. Built in JS so the page never fetches an HDR.
 * MeshBasicMaterial colours above 1 become radiance in the PMREM pass.
 */
export function darkHallEnvScene(): Scene {
  const scene = new Scene()
  const room = new Mesh(
    new BoxGeometry(12, 6, 12),
    new MeshStandardMaterial({ color: 0x0b0a09, roughness: 1, side: BackSide }),
  )
  room.position.y = 2.5
  scene.add(room)
  const box = (
    width: number,
    height: number,
    kelvin: [number, number, number],
    power: number,
    x: number,
    y: number,
    z: number,
  ) => {
    const light = new Mesh(
      new PlaneGeometry(width, height),
      new MeshBasicMaterial({ color: new Color(kelvin[0], kelvin[1], kelvin[2]).multiplyScalar(power) }),
    )
    light.position.set(x, y, z)
    light.lookAt(0, 0.8, 0)
    scene.add(light)
  }
  box(2.0, 1.2, [1, 0.82, 0.62], 9, 1.6, 3.0, 1.2)
  box(1.2, 0.8, [1, 0.86, 0.7], 4, -2.2, 2.2, -1.0)
  box(3.0, 0.25, [1, 0.78, 0.5], 6, 0, 3.6, -2.5)
  box(0.6, 0.6, [0.9, 0.92, 1], 2, -1.0, 1.4, 2.6)
  return scene
}

/** PMREM of a JS-built scene. No network and no remote HDR. */
export function buildEnvironment(
  renderer: WebGLRenderer,
  envScene: Scene = darkHallEnvScene(),
  bake: (renderer: WebGLRenderer, scene: Scene) => { texture: Texture } = bakePmrem,
): Texture {
  const target = bake(renderer, envScene)
  envScene.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    mesh.geometry.dispose()
    const material = mesh.material
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose())
    else material.dispose()
  })
  return target.texture
}

function bakePmrem(renderer: WebGLRenderer, envScene: Scene): { texture: Texture } {
  const pmrem = new PMREMGenerator(renderer)
  const target = pmrem.fromScene(envScene, 0.04)
  pmrem.dispose()
  return target
}
