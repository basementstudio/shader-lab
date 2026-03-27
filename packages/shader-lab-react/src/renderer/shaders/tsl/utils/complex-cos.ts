// @ts-nocheck
import { cos, Fn, sin, vec2 } from "three/tsl"
import { cosh, sinh } from "./hyperbolic"

/**
 * Complex cosine: cos(a + bi) = cos(a)cosh(b) - i sin(a)sinh(b)
 */
export const complexCos = Fn(([z]) => {
  return vec2(cos(z.x).mul(cosh(z.y)), sin(z.x).mul(sinh(z.y)).negate())
})
