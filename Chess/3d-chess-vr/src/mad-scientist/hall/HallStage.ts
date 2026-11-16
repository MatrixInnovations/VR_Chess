import {
  ACESFilmicToneMapping,
  BackSide,
  FogExp2,
  Mesh,
  MeshBasicMaterial,
  Scene,
  SphereGeometry,
  UVMapping,
  sRGBEncoding,
  Vector2,
  type Camera,
  type Texture,
  type WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'

import { createBoardReflector } from './BoardReflector'
import { buildEnvironment, darkHallEnvScene } from './HallEnvironment'
import type { ChessHall } from './ChessHall'
import { BOARD_SURFACE_Y } from './metrics'

/** Same-origin CC0 studio HDR. See public/brown_photostudio_02_LICENSE.txt. */
export const STUDIO_HDR_URL = '/brown_photostudio_02_1k.hdr'

interface EnvBake {
  texture: Texture
}

interface StudioLoader {
  load: (
    url: string,
    onLoad: (texture: Texture) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: () => void,
  ) => void
}

interface StudioHooks {
  loader?: StudioLoader
  bake?: (renderer: WebGLRenderer, scene: Scene) => EnvBake
}

/**
 * ACES, the seated-or-hero camera, the desktop mirror, and a same-origin HDR.
 * Quest skips the reflector, bloom, fog, and the rect softbox.
 */
export function configureHallStage(
  gl: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  hall: ChessHall,
  quest: boolean,
  hooks?: StudioHooks,
): void {
  gl.outputEncoding = sRGBEncoding
  gl.toneMapping = ACESFilmicToneMapping
  gl.toneMappingExposure = quest ? 1 : 1.05
  gl.physicallyCorrectLights = true
  hall.setTier(quest ? 'quest' : 'desktop')
  if (!quest) {
    hall.frameDesktop()
    RectAreaLightUniformsLib.init()
    scene.fog = new FogExp2(0x0b0908, 0.045)
    const controls = new OrbitControls(camera, gl.domElement)
    controls.target.set(0, BOARD_SURFACE_Y, 0)
    controls.minDistance = 0.55
    controls.maxDistance = 1.85
    controls.minPolarAngle = 0.45
    controls.maxPolarAngle = 1.25
    controls.enablePan = false
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.rotateSpeed = 0.55
    controls.update()
    hall.orbit = controls
    const reflector = createBoardReflector()
    hall.board.object.add(reflector)
    hall.reflector = reflector
    const composer = new EffectComposer(gl)
    composer.addPass(new RenderPass(scene, camera))
    composer.addPass(new UnrealBloomPass(new Vector2(256, 256), 0.22, 0.35, 0.88))
    hall.grade = composer
  }
  loadStudioEnvironment(scene, gl, hooks)
  const xr = gl.xr as { addEventListener?: (type: string, listener: () => void) => void } | undefined
  xr?.addEventListener?.('sessionstart', () => {
    hall.setTier('quest')
    hall.grade = null
    scene.fog = null
    if (hall.orbit) hall.orbit.enabled = false
    if (hall.reflector) hall.reflector.visible = false
  })
}

/** Load the self-hosted studio HDR. A failed read falls back to the softbox scene. */
export function loadStudioEnvironment(scene: Scene, gl: WebGLRenderer, hooks?: StudioHooks): void {
  const loader = hooks?.loader ?? { load: loadStudioHdr }
  const bake = hooks?.bake
  loader.load(
    STUDIO_HDR_URL,
    (hdr) => {
      hdr.mapping = UVMapping
      const room = new Scene()
      const sphere = new Mesh(new SphereGeometry(8, 32, 16), new MeshBasicMaterial({ map: hdr, side: BackSide }))
      sphere.rotation.y = 0.35
      room.add(sphere)
      scene.environment = buildEnvironment(gl, room, bake)
      hdr.dispose()
    },
    undefined,
    () => {
      scene.environment = buildEnvironment(gl, darkHallEnvScene(), bake)
    },
  )
}

function loadStudioHdr(
  url: string,
  onLoad: (texture: Texture) => void,
  onProgress?: (event: ProgressEvent) => void,
  onError?: () => void,
): void {
  new RGBELoader().load(url, (texture) => onLoad(texture), onProgress, () => onError?.())
}
