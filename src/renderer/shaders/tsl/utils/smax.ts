import { abs, Fn, float, max, type TSLNode } from "three/tsl"

export const smax = Fn(([left, right, factor = float(0)]: [TSLNode, TSLNode, TSLNode?]) => {
  const h = max(factor.sub(abs(left.sub(right))), 0).div(factor)
  return max(left, right).add(h.mul(h).mul(factor).mul(0.25))
})
