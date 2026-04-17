import { Fn, length, type TSLNode, vec2 } from "three/tsl"
import { atan2 } from "./atan2"

/**
 * Convert complex number to polar form: (r, θ)
 */
export const complexToPolar = Fn(([z]: [TSLNode]) => {
  return vec2(length(z), atan2(z.y, z.x))
})
