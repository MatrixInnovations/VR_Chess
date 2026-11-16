import type { ITourStep } from '../vision/ITourGuide'

/**
 * First-run steps for the seated hall.
 *
 * The tour explains the controls. It does not block a legal move.
 */
export function tourSteps(): readonly ITourStep[] {
  return [
    {
      id: 'seat',
      title: 'You are seated at the board',
      body: 'This is a wooden hall, seen from a chair. Drag a piece with the mouse, or pinch it with a Quest hand.',
    },
    {
      id: 'moves',
      title: 'Legal moves light up',
      body: 'Pick up a piece. Gold squares are the moves you can play. Drop the piece on one of them.',
    },
    {
      id: 'clock',
      title: 'The clock is on the table',
      body: 'Both times sit on the clock beside the board. After you move, your clock stops and your opponent’s starts.',
    },
    {
      id: 'menu',
      title: 'The menu',
      body: 'Open Menu for pass-and-play, resign, draw, or a Lichess game. Lichess sign-in uses OAuth. The token stays in this browser.',
    },
    {
      id: 'voice',
      title: 'Say the move',
      body: 'On desktop Chrome or Edge, press Listen and say “move pawn to e4”. Spoken moves are not available in Quest Browser. If two pieces can move there, name the square you mean.',
    },
    {
      id: 'immersive',
      title: '3D and immersive',
      body: 'The 3D / Immersive switch keeps this game and this clock. On a Quest Pro it enters WebXR. The same button comes back.',
    },
  ]
}
