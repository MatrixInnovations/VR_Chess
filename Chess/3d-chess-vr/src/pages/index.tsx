import type { FC } from 'react'
import { Suspense, useEffect, useRef, useState } from 'react'
import { css } from '@emotion/react'
import type { Board } from '@logic/board'
import { createBoard } from '@logic/board'
import type { Color, GameOverType, Move, Piece } from '@logic/pieces'
import { Environment, useProgress } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'

import { BoardComponent } from '@/components/Board'
import { Chat } from '@/components/Chat'
import { GameCreation } from '@/components/GameCreation'
import { GameOverScreen } from '@/components/GameOverScreen'
import { Loader } from '@/components/Loader'
import { Opponent } from '@/components/Opponent'
import { Sidebar } from '@/components/Sidebar'
import { StatusBar } from '@/components/StatusBar'
import { Toast } from '@/components/Toast'
import { Border } from '@/models/Border'
import { useGameSettingsState } from '@/state/game'
import { useHistoryState } from '@/state/history'
import { usePlayerState } from '@/state/player'
import { useSockets } from '@/utils/socket'

// Import AR/VR components from @react-three/xr
import { PointerCursorModel, XR, XRHandModel, createXRStore, useTouchPointer, useXRInputSourceStateContext, XRSpace, defaultTouchPointerOpacity } from '@react-three/xr'
import EnterARButton from '@/vr/enter-vr'
import { Object3D } from 'three'

export type GameOver = {
  type: GameOverType
  winner: Color
}

function CustomHand() {
  const state = useXRInputSourceStateContext('hand')
  const middleFingerRef = useRef<Object3D>(null)
  const pointer = useTouchPointer(middleFingerRef, state)
  return (
    <>
      <XRSpace ref={middleFingerRef} space={state.inputSource.hand.get('middle-finger-tip')!} />
      <Suspense>
        <XRHandModel />
      </Suspense>
      <PointerCursorModel pointer={pointer} opacity={defaultTouchPointerOpacity} />
    </>
  )
}

const store = createXRStore({ hand: CustomHand })



export const Home: FC = () => {
  const [board, setBoard] = useState<Board>(createBoard())
  const [selected, setSelected] = useState<Piece | null>(null)
  const [moves, setMoves] = useState<Move[]>([])
  const [gameOver, setGameOver] = useState<GameOver | null>(null)
  const resetHistory = useHistoryState((state) => state.reset)
  const { resetTurn } = useGameSettingsState((state) => ({
    resetTurn: state.resetTurn,
    gameStarted: state.gameStarted,
  }))
  const { joined } = usePlayerState((state) => ({
    joined: state.joinedRoom,
  }))

  const reset = () => {
    setBoard(createBoard())
    setSelected(null)
    setMoves([])
    resetHistory()
    resetTurn()
    setGameOver(null)
  }

  useSockets({ reset })

  const [total, setTotal] = useState(0)
  const { progress } = useProgress()
  useEffect(() => {
    setTotal(progress)
  }, [progress])

  const [showVRButton, setShowVRButton] = useState(true);  // State to control visibility


  return (
    <div
      css={css`
        height: 100vh;
        width: 100vw;
        background-color: #000;
        background: linear-gradient(180deg, #000000, #242424);
        display: flex;
        justify-content: center;
        align-items: center;
        flex-direction: column;
      `}
    >
      {total === 100 ? <GameCreation /> : <Loader />}
      <Sidebar board={board} moves={moves} selected={selected} />
      {joined && <Chat />}
      <StatusBar />
      <GameOverScreen gameOver={gameOver} />
      <Toast />
      <div>
        {showVRButton && joined ? (
          <EnterARButton
            onClick={() => { store.enterAR(); setShowVRButton(false) }}
          />
        ) : null}
      </div>

      {/* Canvas for 3D rendering */}
      <Canvas
        shadows
        camera={{ position: [-12, 5, 6], fov: 50 }}
        onCreated={(state) => {
          // Enable WebXR for AR/VR
          state.gl.xr.enabled = true
          state.gl.setClearColor(0x000000)
        }}
      >
        <XR store={store}>
          {/* 3D objects (geometry + material) go inside <mesh> */}
          {/* <mesh position={[0, 1, 0]}>
            <boxBufferGeometry args={[1, 2, 3]} />
            <meshStandardMaterial color="lightblue" />
          </mesh> */}

          {/* Lights and Environment should be outside <mesh> */}
          {/* <ambientLight />
          <spotLight position={[10, 10, 10]} angle={0.15} /> */}
          <Environment files={`dawn.hdr`} />

          {/* Other components */}
          <Opponent />
          <Border />
          <BoardComponent
            selected={selected}
            setSelected={setSelected}
            board={board}
            setBoard={setBoard}
            moves={moves}
            setMoves={setMoves}
            setGameOver={setGameOver}
          />
        </XR>
      </Canvas>
    </div>
  )
}

export default Home
