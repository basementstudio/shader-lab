import { Fn, type TSLNode, vec2 } from "three/tsl"

/**
 * Complex multiplication: (a + bi)(c + di) = (ac - bd) + (ad + bc)i
 */
export const complexMul = Fn(([a, b]: [TSLNode, TSLNode]) => {
  return vec2(a.x.mul(b.x).sub(a.y.mul(b.y)), a.x.mul(b.y).add(a.y.mul(b.x)))
})
