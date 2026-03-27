import { Fn, vec2 } from "three/tsl"
import { complexDiv } from "./complex-div"

/**
 * Möbius transformation: (z - 1) / (z + 1)
 */
export const complexMobius = Fn(([z]) => {
  const one = vec2(1.0, 0.0)

  return complexDiv(z.sub(one), z.add(one))
})
