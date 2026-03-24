import { Fn, pow } from "three/tsl"

/**
 * Returns a bloomed edge based on a given edge and pattern.
 */
export const bloom = Fn(([pattern, edge, exponent]) => {
  pattern.assign(pow(edge.div(pattern), exponent))

  return pattern
})
