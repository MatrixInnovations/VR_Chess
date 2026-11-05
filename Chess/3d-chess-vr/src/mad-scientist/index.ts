export { ChessHall } from './hall/ChessHall'
export { BoardModel, squareCenter } from './hall/BoardModel'
export { PieceModel } from './hall/PieceModel'
export { PieceMaterialSet } from './hall/PieceMaterialSet'
export { HallLighting } from './hall/HallLighting'
export { ClockTapTarget } from './hall/ClockTapTarget'
export { MoveAnimator } from './hall/MoveAnimator'
export { NoOpMoveVisuals } from './hall/MoveVisuals'
export { PerformanceBudget } from './hall/PerformanceBudget'
export { PointerDragInput } from './input/PointerDragInput'
export { XRControllerInput } from './input/XRControllerInput'
export { HandTrackingInput } from './input/HandTrackingInput'
export { PieceGrab } from './input/PieceGrab'
export { RaycastPicker } from './input/RaycastPicker'
export { IntentIdSequence } from './input/IntentIdSequence'
export { GameSession } from './session/GameSession'
export { HallRuntime } from './runtime/HallRuntime'
export { ChessHallView } from './react/ChessHallView'
export { HallDemo, demoLineup, hallDemoMount } from './react/HallDemo'
export { HallDemoPage } from './react/HallDemoPage'

export type { IGameSession } from './contracts/IGameSession'
export type { IInputController } from './contracts/IInputController'
export type { CaptureVisual, CastlingVisual, IMoveVisuals, PromotionVisual } from './hall/MoveVisuals'
export type {
  CancelReason,
  MoveIntent,
  MoveSource,
  PieceSnapshot,
  Square,
} from './contracts/types'
