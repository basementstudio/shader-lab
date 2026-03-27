// @ts-nocheck
import { cos, Fn, length, pow, sin, vec2 } from "three/tsl"
import { atan2 } from "./atan2"

/**
 * Complex power: z^n
 * Let z = r(cos θ + i sin θ), then z^n = r^n (cos nθ + i sin nθ)
 */
export const complexPow = Fn(([z, n]) => {
  const angle = atan2(z.y, z.x)
  const r = length(z)
  const rn = pow(r, n)
  const nAngle = n.mul(angle)

  return vec2(rn.mul(cos(nAngle)), rn.mul(sin(nAngle)))
})
