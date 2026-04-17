import { Fn, type TSLNode } from "three/tsl"
import { complexCos } from "./complex-cos"
import { complexDiv } from "./complex-div"
import { complexSin } from "./complex-sin"

/**
 * Complex tangent: tan(z) = sin(z) / cos(z)
 */
export const complexTan = Fn(([z]: [TSLNode]) => {
  return complexDiv(complexSin(z), complexCos(z))
})
