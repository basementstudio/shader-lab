import { Fn, pow, type TSLNode } from "three/tsl"

/**
 * Returns a bloomed edge based on a given edge and pattern.
 */
export const bloom = Fn(([pattern, edge, exponent]: [TSLNode, TSLNode, TSLNode]) => {
  pattern.assign(pow(edge.div(pattern), exponent))

  return pattern
})
