import { Fn, float } from "three/tsl"
import { smin } from "@/renderer/shaders/tsl/utils/smin"

export const smax = Fn(([left, right, factor = float(0)]) => {
  return smin(left, right, factor.negate())
})
