// @ts-nocheck
import { Fn, float, length } from "three/tsl"

export const sdSphere = Fn(([_uv, radius = float(0)]) => {
  return length(_uv).sub(float(radius))
})
