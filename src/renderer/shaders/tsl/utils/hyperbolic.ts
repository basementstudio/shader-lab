import { exp, Fn, float } from "three/tsl"

/**
 * Hyperbolic cosine: cosh(x) = (e^x + e^-x) / 2
 */
export const cosh = Fn(([x]) => {
  const ex = exp(x)

  return ex.add(float(1).div(ex)).mul(0.5)
})

/**
 * Hyperbolic sine: sinh(x) = (e^x - e^-x) / 2
 */
export const sinh = Fn(([x]) => {
  const ex = exp(x)

  return ex.sub(float(1).div(ex)).mul(0.5)
})
