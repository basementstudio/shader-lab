import { cos, Fn, sin, type TSLNode, vec2 } from "three/tsl"
import { cosh, sinh } from "./hyperbolic"

/**
 * Complex sine: sin(a + bi) = sin(a)cosh(b) + i cos(a)sinh(b)
 */
export const complexSin = Fn(([z]: [TSLNode]) => {
  return vec2(sin(z.x).mul(cosh(z.y)), cos(z.x).mul(sinh(z.y)))
})
