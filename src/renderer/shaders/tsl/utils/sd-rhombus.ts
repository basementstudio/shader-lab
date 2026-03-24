import { abs, clamp, dot, Fn, float, length, sign, vec2 } from "three/tsl"

const ndot = Fn(([left, right]) => {
  return left.x.mul(right.x).sub(left.y.mul(right.y))
})

export const sdRhombus = Fn(([pointNode, bounds = vec2(0.4)]) => {
  const point = abs(pointNode).toVar()
  const h = clamp(
    ndot(bounds.sub(point.mul(2)), bounds).div(dot(bounds, bounds)),
    -1,
    1
  )
  const distance = length(
    point.sub(bounds.mul(0.5).mul(vec2(float(1).sub(h), float(1).add(h))))
  )

  return distance.mul(
    sign(
      point.x
        .mul(bounds.y)
        .add(point.y.mul(bounds.x))
        .sub(bounds.x.mul(bounds.y))
    )
  )
})
