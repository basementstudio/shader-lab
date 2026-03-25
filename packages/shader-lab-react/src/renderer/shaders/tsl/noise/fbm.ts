// @ts-nocheck
import { Fn, vec3 } from "three/tsl"
import { simplexNoise3d } from "./simplex-noise-3d"

export const fbm = Fn(([pImmutable]) => {
  const p = vec3(pImmutable).toVar()
  const n1 = simplexNoise3d(p).mul(0.5).add(0.5)
  const n2 = simplexNoise3d(p.mul(2.02).add(vec3(19.1, 7.3, 13.7)))
    .mul(0.5)
    .add(0.5)

  return n1.mul(0.7).add(n2.mul(0.3))
})
