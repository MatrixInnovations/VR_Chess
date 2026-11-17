import {
  BackSide,
  BoxGeometry,
  Color,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  CubeCamera,
  PMREMGenerator,
  Scene,
  Texture,
  WebGLCubeRenderTarget,
  sRGBEncoding,
  type WebGLRenderer,
} from 'three'

/**
 * Studio cube for the metals. Built in JS so the page never fetches an HDR.
 * A bright ceiling softbox over a dark room gives highlights and dark sides.
 * MeshBasicMaterial colours above 1 become radiance in the PMREM pass.
 */
export function darkHallEnvScene(): Scene {
  const scene = new Scene()
  const room = new Mesh(
    new BoxGeometry(10, 8, 10),
    new MeshBasicMaterial({ color: 0x9aa0a8, side: BackSide }),
  )
  room.position.y = 2.2
  scene.add(room)
  const panel = (
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
    light.lookAt(0, 1.1, 0)
    scene.add(light)
  }
  panel(7.5, 5.2, [1, 0.98, 0.94], 28, 0, 4.6, 0.2)
  panel(3.2, 2.2, [1, 0.92, 0.82], 14, 1.4, 2.6, 2.4)
  panel(3.0, 1.2, [0.16, 0.15, 0.14], 1, 0, 0.2, -2.2)
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
  const cube = new WebGLCubeRenderTarget(32, { encoding: sRGBEncoding })
  const camera = new CubeCamera(0.1, 20, cube)
  camera.position.set(0, 1.2, 0)
  camera.update(renderer, envScene)
  const pmrem = new PMREMGenerator(renderer)
  const target = pmrem.fromCubemap(cube.texture)
  pmrem.dispose()
  cube.dispose()
  return target
}
