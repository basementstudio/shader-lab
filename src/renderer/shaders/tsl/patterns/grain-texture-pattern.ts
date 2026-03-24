import { Fn, dot, fract, sin, vec2 } from "three/tsl"

/**
 * Returns a grain texture pattern value for a given UV coordinate.
 */
export const grainTexturePattern = Fn(([uv]) => {
  return fract(sin(dot(uv, vec2(12.9898, 78.233))).mul(43758.5453123))
})
