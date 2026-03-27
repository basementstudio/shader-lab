import { Fn, float, Loop, sin, vec2 } from "three/tsl"

interface TurbulenceOptions {
  _amp?: number
  _exp?: number
  _freq?: number
  _num?: number
  _speed?: number
}

const HALF_PI = 1.5707963267948966
const THETA = 0.9272952180016122

/**
 * Turbulence based on XorDev's "Turbulent Dark" technique.
 * Displaces coordinates by layering rotated sine waves at increasing frequencies
 *
 * @see https://mini.gmshaders.com/p/turbulence
 */
export const turbulence = Fn(([pInput, time, rawOptions]) => {
  const options = (rawOptions as TurbulenceOptions | undefined) ?? {}
  const {
    _num = 10,
    _amp = 0.7,
    _speed = 0.3,
    _freq = 2.0,
    _exp = 1.4,
  } = options

  const p = vec2(pInput.xy).toVar()
  const t = time.mul(float(_speed))
  const freq = float(_freq).toVar()
  const angle = float(0.0).toVar()
  const iter = float(0.0).toVar()

  Loop({ end: _num, start: 0, type: "int" }, () => {
    const c = sin(angle.add(HALF_PI))
    const s = sin(angle)

    const phase = freq
      .mul(p.x.mul(s).add(p.y.mul(c)))
      .add(t)
      .add(iter)

    const scale = float(_amp).mul(sin(phase)).div(freq)
    p.x.addAssign(scale.mul(c))
    p.y.addAssign(scale.mul(s.negate()))

    angle.addAssign(THETA)
    freq.mulAssign(float(_exp))
    iter.addAssign(1.0)
  })

  return p.sub(pInput.xy)
})
