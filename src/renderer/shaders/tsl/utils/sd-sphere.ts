import { Fn, float, length, type TSLNode } from "three/tsl"

export const sdSphere = Fn(([_uv, radius = float(0)]: [TSLNode, TSLNode?]) => {
  return length(_uv).sub(float(radius))
})
