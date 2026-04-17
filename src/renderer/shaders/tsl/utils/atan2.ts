import { atan, Fn, PI, select, sign, type TSLNode } from "three/tsl"

export const atan2 = Fn(([y, x]: [TSLNode, TSLNode]) => {
  const base = atan(y.div(x))
  const offset = sign(y).mul(PI)

  return select(x.greaterThanEqual(0), base, base.add(offset))
})
