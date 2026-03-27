// @ts-nocheck
import { abs, Fn, float, max } from "three/tsl"

export const smax = Fn(([left, right, factor = float(0)]) => {
  const h = max(factor.sub(abs(left.sub(right))), 0).div(factor)
  return max(left, right).add(h.mul(h).mul(factor).mul(0.25))
})
