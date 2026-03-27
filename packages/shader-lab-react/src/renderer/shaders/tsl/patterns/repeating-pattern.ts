// @ts-nocheck
import { Fn, float, sin } from "three/tsl"

/**
 * Returns a repeating pattern of a sine function.
 */
export const repeatingPattern = Fn(([pattern, repeat, time = float(0)]) => {
  pattern.assign(sin(pattern.mul(repeat).add(time)).div(repeat))

  return pattern
})
