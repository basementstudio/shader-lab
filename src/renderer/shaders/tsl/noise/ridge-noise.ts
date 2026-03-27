import { abs, clamp, Fn, float, Loop } from "three/tsl"
import { simplexNoise3d } from "./simplex-noise-3d"

export const ridgeNoise = Fn(([pImmutable]) => {
  const p = pImmutable.toVar()
  const value = float(0).toVar()
  const amplitude = float(0.5).toVar()
  const frequency = float(1).toVar()
  const weight = float(1).toVar()

  Loop({ end: 6, start: 0, type: "int" }, () => {
    const n = float(1).sub(abs(simplexNoise3d(p.mul(frequency)).mul(2)))
    const signal = n.mul(n).mul(weight)

    value.addAssign(signal.mul(amplitude))
    weight.assign(clamp(signal, 0, 1))

    frequency.mulAssign(2.0)
    amplitude.mulAssign(0.5)
  })

  return value
})
