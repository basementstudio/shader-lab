import { Fn, vec2 } from "three/tsl"

/**
 * Complex conjugate: conj(a + bi) = a - bi
 */
export const complexConj = Fn(([z]) => {
  return vec2(z.x, z.y.negate())
})
