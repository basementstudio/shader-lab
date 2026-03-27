// @ts-nocheck
import { Fn, abs, float } from "three/tsl"
import { bloom } from "./bloom"
import { repeatingPattern } from "./repeating-pattern"

/**
 * Returns a repeating pattern of lines with a bloom effect.
 */
export const bloomEdgePattern = Fn(([pattern, repeat, edge, exponent, time = float(0)]) => {
  pattern.assign(repeatingPattern(pattern, repeat, time))
  pattern.assign(abs(pattern))
  pattern.assign(bloom(pattern, edge, exponent))

  return pattern
})
