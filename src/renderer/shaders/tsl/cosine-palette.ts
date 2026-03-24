import { Fn, cos, float } from "three/tsl"

/**
 * Generates a palette of colors using a cosine-based function.
 */
export const cosinePalette = Fn(([t, a, b, c, d, e = float(6.28318)]) => {
  return a.add(b.mul(cos(e.mul(c.mul(t).add(d)))))
})
