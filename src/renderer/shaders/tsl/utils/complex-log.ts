import { atan, Fn, length, log, vec2 } from "three/tsl"

export const complexLog = Fn(([z]) => {
  return vec2(log(length(z)), atan(z.y.div(z.x)))
})
