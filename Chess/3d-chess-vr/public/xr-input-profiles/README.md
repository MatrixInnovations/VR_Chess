# WebXR input profiles (vendored)

Subset of `@webxr-input-profiles/assets` 1.0.20 (MIT, see LICENSE.md), copied from
`https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0/dist/profiles/`.

`@react-three/xr` builds a controller's input state only after it loads the controller layout from
`profilesList.json`, and it loads the hand model from `generic-hand/*.glb`. The site CSP is
`connect-src 'self' https://lichess.org`, so the CDN default is blocked, no controller state exists,
and the hand model failure unmounts the canvas. `WebXrHallSession` points `baseAssetPath` here.

Kept: the Quest Touch Pro, Touch Plus (v1, v2), Touch v3 and v2 profiles, `generic-trigger` (the loader's
fallback for an unknown controller), and `generic-hand`. Add a profile folder and its
`profilesList.json` entry to support another controller.
