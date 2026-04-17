import { Fn, length, log, type TSLNode, vec2 } from "three/tsl"
import { atan2 } from "./atan2"

export const complexLog = Fn(([z]: [TSLNode]) => {
  return vec2(log(length(z)), atan2(z.y, z.x))
})
