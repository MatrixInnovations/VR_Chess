import { Canvas, type RootState } from '@react-three/fiber'
import { createElement, useEffect, useRef, type FC } from 'react'

import type { PointerSurface } from './HallDemo'
import { ChessHallView } from './ChessHallView'
import { HallDemo, hallDemoMount } from './HallDemo'

/**
 * Thin smoke page for the seated hall.
 *
 * It mounts {@link ChessHallView} and nothing from the live board page.
 * Ultron can open `/mad-scientist-hall` after the rebase.
 */
export const HallDemoPage: FC = () => {
  const held = useRef<HallDemo | null>(null)
  if (held.current === null) held.current = new HallDemo()
  useEffect(() => {
    const demo = held.current
    return () => {
      demo?.dispose()
    }
  }, [])
  const mount = hallDemoMount(held.current)
  return createElement(
    'div',
    { style: { width: '100vw', height: '100vh', background: '#111' } },
    createElement(Canvas, {
      shadows: true,
      camera: mount.camera,
      onCreated: (state: RootState) => {
        mount.onCreated({ gl: { domElement: state.gl.domElement as unknown as PointerSurface } })
      },
      children: createElement(ChessHallView, { hall: mount.hall }),
    }),
  )
}
