import { Fn, length, select, sqrt, vec2 } from "three/tsl"

/**
 * Complex square root.
 * sqrt(a + bi) = (sqrt((r+a)/2), sign(b) * sqrt((r-a)/2))
 */
export const complexSqrt = Fn(([z]) => {
  const r = length(z)
  const rpart = sqrt(r.add(z.x).mul(0.5))
  const ipart = sqrt(r.sub(z.x).mul(0.5))

  return select(
    z.y.greaterThanEqual(0),
    vec2(rpart, ipart),
    vec2(rpart, ipart.negate())
  )
})
