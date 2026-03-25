// @ts-nocheck
import { float, select, uv, vec2 } from "three/tsl"

export const screenAspectUV = (
  renderSize: ReturnType<typeof vec2>,
  range = float(0.5)
) => {
  const baseUv = uv().sub(range)

  return select(
    renderSize.x.greaterThan(renderSize.y),
    vec2(baseUv.x.mul(renderSize.x.div(renderSize.y)), baseUv.y),
    vec2(baseUv.x, baseUv.y.mul(renderSize.y.div(renderSize.x)))
  )
}
