import { abs, Fn, float, max } from "three/tsl"

export const sdBox2d = Fn(([_uv, size = float(0)]) => {
  return max(abs(_uv.x), abs(_uv.y)).sub(float(size))
})
