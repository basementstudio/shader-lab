// @ts-nocheck
import { atan, Fn, PI, select, sign } from "three/tsl"

export const atan2 = Fn(([y, x]) => {
  const base = atan(y.div(x))
  const offset = sign(y).mul(PI)

  return select(x.greaterThanEqual(0), base, base.add(offset))
})
