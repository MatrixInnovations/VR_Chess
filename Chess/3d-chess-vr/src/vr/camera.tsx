import * as THREE from 'three'

/**
 * Creates an orthographic camera for rendering a chessboard from the player's perspective.
 *
 * @param aspect - The aspect ratio of the camera's view.
 * @returns A configured THREE.OrthographicCamera instance.
 */
function createChessCamera(aspect: number): THREE.OrthographicCamera {
  // Define the orthographic camera's viewing box dimensions
  const left = -8 // The left boundary of the view
  const right = 8 // The right boundary of the view
  const top = 8 // The top boundary of the view
  const bottom = -8 // The bottom boundary of the view

  // Create the OrthographicCamera instance
  const camera = new THREE.OrthographicCamera(
    left * aspect, // Scale the left boundary by aspect ratio
    right * aspect, // Scale the right boundary by aspect ratio
    top, // Top boundary
    bottom, // Bottom boundary
    0.1, // Near clipping plane (how close objects can be seen)
    1000, // Far clipping plane (how far objects can be seen)
  )

  // Position the camera as if the user is sitting at one end of the chessboard
  camera.position.set(0, 10, 20) // Place the camera above and slightly behind the player's perspective
  // - `x`: 0 centers the camera horizontally over the board
  // - `y`: 10 gives the camera some height for a slight downward angle
  // - `z`: 20 positions the camera "behind" the player's end of the board

  // Rotate the camera to look slightly downward at the chessboard
  camera.lookAt(0, 0, 0) // Focus on the center of the chessboard

  return camera // Return the configured camera
}

export default createChessCamera
