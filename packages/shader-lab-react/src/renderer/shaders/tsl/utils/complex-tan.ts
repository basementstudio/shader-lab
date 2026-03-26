// @ts-nocheck
import { Fn } from "three/tsl"
import { complexCos } from "./complex-cos"
import { complexDiv } from "./complex-div"
import { complexSin } from "./complex-sin"

/**
 * Complex tangent: tan(z) = sin(z) / cos(z)
 */
export const complexTan = Fn(([z]) => {
  return complexDiv(complexSin(z), complexCos(z))
})
