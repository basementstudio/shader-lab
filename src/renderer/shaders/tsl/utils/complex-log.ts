import { Fn, length, log, vec2 } from "three/tsl"
import { atan2 } from "./atan2"

export const complexLog = Fn(([z]) => {
  return vec2(log(length(z)), atan2(z.y, z.x))
})
