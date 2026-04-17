import { exp, Fn, float, type TSLNode } from "three/tsl"

/**
 * Hyperbolic cosine: cosh(x) = (e^x + e^-x) / 2
 */
export const cosh = Fn(([x]: [TSLNode]) => {
  const tmp = exp(x).toVar()

  return tmp.add(float(1).div(tmp)).div(2.0)
})

/**
 * Hyperbolic sine: sinh(x) = (e^x - e^-x) / 2
 */
export const sinh = Fn(([x]: [TSLNode]) => {
  const tmp = exp(x).toVar()

  return tmp.sub(float(1).div(tmp)).div(2.0)
})
