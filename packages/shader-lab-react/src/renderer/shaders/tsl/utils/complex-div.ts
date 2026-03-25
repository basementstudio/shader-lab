// @ts-nocheck
import { div, dot, Fn, vec2 } from "three/tsl"

export const complexDiv = Fn(([a, b]) => {
  const denominator = dot(b, b)

  return vec2(
    div(a.x.mul(b.x).add(a.y.mul(b.y)), denominator),
    div(a.y.mul(b.x).sub(a.x.mul(b.y)), denominator)
  )
})
