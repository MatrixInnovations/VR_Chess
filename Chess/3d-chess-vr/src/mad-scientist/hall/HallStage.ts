import {
  ACESFilmicToneMapping,
  FogExp2,
  Scene,
  sRGBEncoding,
  Vector2,
  type Camera,
  type Texture,
  type WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js'

import { createBoardReflector } from './BoardReflector'
import { bakeMarbleGpu } from './MarbleVeins'
import { buildEnvironment, darkHallEnvScene } from './HallEnvironment'
import type { ChessHall } from './ChessHall'

interface EnvBake {
  texture: Texture
}

interface StudioHooks {
  bake?: (renderer: WebGLRenderer, scene: Scene) => EnvBake
  /**
   * Desktop mirror and bloom. Default true.
   * Automated browsers pass false so CI still runs tone mapping, lights, fog, and orbit.
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
  gl.toneMappingExposure = quest ? 1 : 1.05
  gl.physicallyCorrectLights = true
  hall.setTier(quest ? 'quest' : 'desktop')
  const xr = gl.xr as { addEventListener?: (type: string, listener: () => void) => void } | undefined
  if (!quest) {
    hall.frameDesktop()
    scene.fog = new FogExp2(0x0b0908, 0.045)
    const controls = new OrbitControls(camera, gl.domElement)
    controls.target.set(0, 0.78, -0.04)
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
    const reflector = createBoardReflector()
    hall.root.add(reflector)
    hall.reflector = reflector
    hall.materials.setMirrorBlend(true)
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
  const bindStudio = () => {
    hall.materials.bindReflections(buildEnvironment(gl, darkHallEnvScene(), hooks?.bake))
  }
  bakeMarbleGpu(gl, hall.materials, quest)
  bindStudio()
  const canvas = gl.domElement as { addEventListener?: (type: string, listener: () => void) => void } | undefined
  canvas?.addEventListener?.('webglcontextrestored', () => {
    bakeMarbleGpu(gl, hall.materials, quest)
    bindStudio()
  })
  if (typeof gl.compile === 'function') gl.compile(scene, camera)
  const desktopGrade = hall.grade
  const desktopFog = scene.fog
  xr?.addEventListener?.('sessionstart', () => {
    hall.setTier('quest')
    hall.grade = null
    scene.fog = null
    if (hall.orbit) hall.orbit.enabled = false
    if (hall.reflector) hall.reflector.visible = false
    const clock = hall.root.getObjectByName('physical-chess-clock')
    if (clock) clock.visible = true
  })
  xr?.addEventListener?.('sessionend', () => {
    if (quest) return
    hall.setTier('desktop')
    if (hall.reflector) hall.materials.setMirrorBlend(true)
    hall.grade = desktopGrade
    scene.fog = desktopFog
    if (hall.orbit) hall.orbit.enabled = true
    if (hall.reflector) hall.reflector.visible = true
    const clock = hall.root.getObjectByName('physical-chess-clock')
    if (clock) clock.visible = false
  })
}
