// @ts-nocheck
import { abs, Fn, max, min } from "three/tsl"

export const smin = Fn(([left, right, factor]) => {
  const h = max(factor.sub(abs(left.sub(right))), 0).div(factor)
  return min(left, right).sub(h.mul(h).mul(factor).mul(0.25))
})
