// Use manual session management if you're not relying on @react-three/xr or need fine-grained control over WebXR sessions.

import { useThree } from '@react-three/fiber';

function VRButton() {
  const { gl } = useThree();

  const enterVR = async () => {
    if (navigator.xr) {
      try {
        // Request a WebXR session with desired features
        const session = await navigator.xr.requestSession("immersive-vr", {
          requiredFeatures: ["local-floor"], // Enable positional tracking
        });
        // Set the session to the WebGL renderer
        gl.xr.setSession(session);
      } catch (err) {
        console.error("Failed to start VR session", err);
      }
    } else {
      console.error("WebXR is not supported by your browser or device.");
    }
  };

  return <button onClick={enterVR}>Enter VR</button>;
}

export default VRButton;
