import { abs, Fn, float, type TSLNode } from "three/tsl"

export const sdDiamond = Fn(([uvNode, radius = float(0)]: [TSLNode, TSLNode?]) => {
  return abs(uvNode.x).add(abs(uvNode.y)).sub(radius)
})
