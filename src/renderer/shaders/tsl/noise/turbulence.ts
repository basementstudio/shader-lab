import { Fn, Loop, abs, float, mat2, sin, vec3 } from "three/tsl"

interface TurbulenceOptions {
  _amp?: number
  _exp?: number
  _freq?: number
  _num?: number
  _speed?: number
}

/**
 * Turbulence noise adapted for Three TSL and returned as a vec3 field.
 */
export const turbulence = Fn(
  ([p, time, rawOptions]) => {
    const options = (rawOptions as TurbulenceOptions | undefined) ?? {}
    const { _num = 10.0, _amp = 0.7, _speed = 0.3, _freq = 2.0, _exp = 1.4 } = options
    const ampMul = float(_amp)
    const speed = float(_speed)
    const baseFreq = float(_freq)
    const exp = float(_exp)
    const uv = p.xy.mul(baseFreq).toVar()
    const t = time.mul(speed)

    // Use sin(x + pi/2) in place of cos(x) to keep the helper self-contained.
    const angle = float(1.7)
    const s = sin(angle)
    const c = sin(angle.add(1.57079632679))
    const rot = mat2(c, s.negate(), s, c)

    const sum = vec3(0).toVar()
    const amp = float(1).toVar()
    const f = float(1).toVar()

    Loop({ end: _num, start: 0, type: "int" }, () => {
      uv.assign(rot.mul(uv))

      const q = uv.mul(f)
      const n = sin(
        q.x
          .add(q.y.mul(1.31))
          .add(sin(q.y.add(q.x.mul(1.73)).add(t)).mul(1.2))
          .add(t),
      )

      sum.addAssign(vec3(abs(n)).mul(amp))
      amp.mulAssign(ampMul)
      f.mulAssign(exp)
    })

    return sum
  },
)
