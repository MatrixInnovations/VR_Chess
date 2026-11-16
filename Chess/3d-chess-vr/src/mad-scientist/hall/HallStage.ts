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
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js'

import { bakeMarbleGpu } from './MarbleVeins'
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
  /**
   * Desktop mirror and bloom. Default true.
   * Automated browsers pass false so CI still runs tone mapping, lights, fog, orbit, and the HDR.
   */
  effects?: boolean
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
  gl.toneMappingExposure = quest ? 0.9 : 0.88
  gl.physicallyCorrectLights = true
  hall.setTier(quest ? 'quest' : 'desktop')
  const xr = gl.xr as { addEventListener?: (type: string, listener: () => void) => void } | undefined
  if (!quest) {
    hall.frameDesktop()
    scene.fog = new FogExp2(0x0b0908, 0.045)
    const controls = new OrbitControls(camera, gl.domElement)
    controls.target.set(0, BOARD_SURFACE_Y, -0.09)
    controls.minDistance = 0.55
    controls.maxDistance = 1.25
    controls.minPolarAngle = 0.45
    controls.maxPolarAngle = 1.25
    controls.enablePan = false
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.rotateSpeed = 0.55
    controls.update()
    hall.orbit = controls
    if (hooks?.effects !== false) {
      const composer = new EffectComposer(gl)
      composer.addPass(new RenderPass(scene, camera))
      composer.addPass(new UnrealBloomPass(new Vector2(1024, 1024), 0.15, 0.35, 0.97))
      const fxaa = new ShaderPass(FXAAShader)
      composer.addPass(fxaa)
      const css = new Vector2()
      if (typeof gl.getSize === 'function') gl.getSize(css)
      if (css.x > 0 && css.y > 0) {
        composer.setSize(css.x, css.y)
        const bloomPass = composer.passes[1] as { setSize?: (width: number, height: number) => void }
        bloomPass.setSize?.(Math.max(1, Math.floor(css.x / 2)), Math.max(1, Math.floor(css.y / 2)))
        fxaa.material.uniforms.resolution.value.set(1 / css.x, 1 / css.y)
      }
      hall.grade = composer
    }
  }
  bakeMarbleGpu(gl, hall.materials, quest)
  const canvas = gl.domElement as { addEventListener?: (type: string, listener: () => void) => void } | undefined
  canvas?.addEventListener?.('webglcontextrestored', () => {
    bakeMarbleGpu(gl, hall.materials, quest)
  })
  const starter = buildEnvironment(gl, darkHallEnvScene(), hooks?.bake)
  hall.materials.bindReflections(starter)
  if (typeof gl.compile === 'function') gl.compile(scene, camera)
  if (!quest && hooks?.loader) loadStudioEnvironment(scene, gl, hall, hooks)
  const desktopGrade = hall.grade
  const desktopFog = scene.fog
  xr?.addEventListener?.('sessionstart', () => {
    hall.setTier('quest')
    hall.grade = null
    scene.fog = null
    if (hall.orbit) hall.orbit.enabled = false
    if (hall.reflector) hall.reflector.visible = false
  })
  xr?.addEventListener?.('sessionend', () => {
    if (quest) return
    hall.setTier('desktop')
    if (hall.reflector) hall.materials.setMirrorBlend(true)
    hall.grade = desktopGrade
    scene.fog = desktopFog
    if (hall.orbit) hall.orbit.enabled = true
    if (hall.reflector) hall.reflector.visible = true
  })
}

/** Load the self-hosted studio HDR. A failed read falls back to the softbox scene. */
export function loadStudioEnvironment(_scene: Scene, gl: WebGLRenderer, hall: ChessHall, hooks?: StudioHooks): void {
  const loader = hooks?.loader ?? { load: loadStudioHdr }
  const bake = hooks?.bake
  loader.load(
    STUDIO_HDR_URL,
    (hdr) => {
      hdr.mapping = UVMapping
      const room = new Scene()
      const sphere = new Mesh(new SphereGeometry(8, 32, 16), new MeshBasicMaterial({ map: hdr, color: 0xffffff, side: BackSide }))
      sphere.rotation.y = 0.35
      room.add(sphere)
      hall.materials.bindReflections(buildEnvironment(gl, room, bake))
      hdr.dispose()
    },
    undefined,
    () => {
      hall.materials.bindReflections(buildEnvironment(gl, darkHallEnvScene(), bake))
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
