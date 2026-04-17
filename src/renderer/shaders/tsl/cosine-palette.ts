import { cos, Fn, float, type TSLNode } from "three/tsl"

/**
 * Generates a palette of colors using a cosine-based function.
 */
export const cosinePalette = Fn(
  ([t, a, b, c, d, e = float(6.28318)]: [
    TSLNode,
    TSLNode,
    TSLNode,
    TSLNode,
    TSLNode,
    TSLNode?,
  ]) => {
    return a.add(b.mul(cos(e.mul(c.mul(t).add(d)))))
  }
)
