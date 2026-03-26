import { atan, Fn, length, log, PI, select, sign, vec2 } from "three/tsl"

/**
 * atan2(y, x) — full-range arctangent
 * tsl's atan only takes one argument
 */
const atan2 = Fn(([y, x]) => {
  const base = atan(y.div(x))
  const offset = sign(y).mul(PI)

  return select(x.greaterThanEqual(0), base, base.add(offset))
})

export const complexLog = Fn(([z]) => {
  return vec2(log(length(z)), atan2(z.y, z.x))
})
