import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { XR } from '@react-three/xr'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { InputController } from '@/input/InputController'
import { ChessHall } from '@/view/ChessHall'
import { HallMaterials } from '@/view/HallMaterials'
import { HallMetrics } from '@/view/HallMetrics'
import { PerformanceProfile } from '@/view/PerformanceProfile'
import { PieceLibrary } from '@/view/PieceLibrary'
import { ScreenCameraController } from '@/view/ScreenCameraController'
import type { AppShell } from './AppShell'

export function HallCanvas({ shell }: { shell: AppShell }) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      camera={{
        fov: HallMetrics.fov,
        near: 0.02,
        far: 40,
        position: [HallMetrics.eye.x, HallMetrics.eye.y, HallMetrics.eye.z],
      }}
      gl={{
        antialias: true,
        alpha: false,
        stencil: false,
        powerPreference: 'high-performance',
      }}
      onCreated={({ gl, camera }) => {
        new PerformanceProfile().apply(gl)
        camera.lookAt(HallMetrics.look.x, HallMetrics.look.y, HallMetrics.look.z)
      }}
    >
      <XR store={shell.platform.store}>
        <SceneBridge shell={shell} />
      </XR>
    </Canvas>
  )
}

function SceneBridge({ shell }: { shell: AppShell }) {
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const hallRef = useRef<ChessHall | null>(null)
  const inputRef = useRef<InputController | null>(null)
  const cameraRef = useRef<ScreenCameraController | null>(null)

  useEffect(() => {
    const materials = new HallMaterials()
    const hall = new ChessHall(shell.session, materials)
    const library = new PieceLibrary()
    const rig = new ScreenCameraController(camera, gl.domElement)
    const input = new InputController(shell.session, shell.viewMode, hall, () => camera)
    hallRef.current = hall
    inputRef.current = input
    cameraRef.current = rig
    scene.add(hall)
    input.attach(gl.domElement, scene)
    scene.background = new THREE.Color('#cbbba6')
    let cancel = false
    void hall
      .load(library, (label) => {
        if (!cancel) shell.markLoading(label)
      })
      .then(() => {
        if (!cancel) shell.markReady()
      })
      .catch(() => {
        if (!cancel) shell.markLoading('The pieces could not be loaded.')
      })
    return () => {
      cancel = true
      input.detach()
      rig.dispose()
      scene.remove(hall)
      library.dispose()
      materials.dispose()
    }
  }, [camera, gl, scene, shell])

  useFrame((state, dt, frame) => {
    const presenting = gl.xr.isPresenting
    inputRef.current?.update(gl, frame as XRFrame | undefined)
    hallRef.current?.update(dt, presenting, shell.viewMode.mode, state.camera)
    cameraRef.current?.update(dt, presenting, shell.session.freeLook)
    shell.session.tick(performance.now())
  })

  return null
}
