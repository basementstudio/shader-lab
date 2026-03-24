import { cos, sin, vec2 } from "three/tsl"

export function rotate(
  uvNode: ReturnType<typeof vec2>,
  angle: unknown
): ReturnType<typeof vec2> {
  const cosAngle = cos(angle)
  const sinAngle = sin(angle)

  return vec2(
    uvNode.x.mul(cosAngle).sub(uvNode.y.mul(sinAngle)),
    uvNode.x.mul(sinAngle).add(uvNode.y.mul(cosAngle))
  )
}
