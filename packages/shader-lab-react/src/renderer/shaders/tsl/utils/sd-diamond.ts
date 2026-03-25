// @ts-nocheck
import { abs, Fn, float } from "three/tsl"

export const sdDiamond = Fn(([uvNode, radius = float(0)]) => {
  return abs(uvNode.x).add(abs(uvNode.y)).sub(radius)
})
