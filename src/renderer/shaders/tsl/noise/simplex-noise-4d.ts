import {
  Fn,
  clamp,
  dot,
  float,
  floor,
  max,
  mod,
  mul,
  step,
  sub,
  vec2,
  vec3,
  vec4,
} from "three/tsl"
import { grad4, permute, taylorInvSqrt } from "./common"

export const simplexNoise4d = Fn(([vImmutable]) => {
  const v = vec4(vImmutable).toVar()
  const c = vec2(0.1381966011250105, 0.30901699437494745)
  const i = vec4(floor(v.add(dot(v, c.yyyy)))).toVar()
  const x0 = vec4(v.sub(i).add(dot(i, c.xxxx))).toVar()
  const i0 = vec4().toVar()
  const isX = vec3(step(x0.yzw, x0.xxx)).toVar()
  const isYZ = vec3(step(x0.zww, x0.yyz)).toVar()

  i0.x.assign(isX.x.add(isX.y).add(isX.z))
  i0.yzw.assign(sub(1.0, isX))
  i0.y.addAssign(isYZ.x.add(isYZ.y))
  i0.zw.addAssign(sub(1.0, isYZ.xy))
  i0.z.addAssign(isYZ.z)
  i0.w.addAssign(sub(1.0, isYZ.z))

  const i3 = vec4(clamp(i0, 0.0, 1.0)).toVar()
  const i2 = vec4(clamp(i0.sub(1.0), 0.0, 1.0)).toVar()
  const i1 = vec4(clamp(i0.sub(2.0), 0.0, 1.0)).toVar()
  const x1 = vec4(x0.sub(i1).add(mul(1.0, c.xxxx))).toVar()
  const x2 = vec4(x0.sub(i2).add(mul(2.0, c.xxxx))).toVar()
  const x3 = vec4(x0.sub(i3).add(mul(3.0, c.xxxx))).toVar()
  const x4 = vec4(x0.sub(1.0).add(mul(4.0, c.xxxx))).toVar()

  i.assign(mod(i, 289.0))

  const j0 = float(permute(permute(permute(permute(i.w).add(i.z)).add(i.y)).add(i.x))).toVar()
  const j1 = vec4(
    permute(
      permute(
        permute(
          permute(i.w.add(vec4(i1.w, i2.w, i3.w, 1.0)))
            .add(i.z)
            .add(vec4(i1.z, i2.z, i3.z, 1.0)),
        )
          .add(i.y)
          .add(vec4(i1.y, i2.y, i3.y, 1.0)),
      )
        .add(i.x)
        .add(vec4(i1.x, i2.x, i3.x, 1.0)),
    ),
  ).toVar()

  const ip = vec4(1.0 / 294.0, 1.0 / 49.0, 1.0 / 7.0, 0.0).toVar()
  const p0 = vec4(grad4(j0, ip)).toVar()
  const p1 = vec4(grad4(j1.x, ip)).toVar()
  const p2 = vec4(grad4(j1.y, ip)).toVar()
  const p3 = vec4(grad4(j1.z, ip)).toVar()
  const p4 = vec4(grad4(j1.w, ip)).toVar()
  const norm = vec4(
    taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3))),
  ).toVar()

  p0.mulAssign(norm.x)
  p1.mulAssign(norm.y)
  p2.mulAssign(norm.z)
  p3.mulAssign(norm.w)
  p4.mulAssign(taylorInvSqrt(dot(p4, p4)))

  const m0 = vec3(max(sub(0.6, vec3(dot(x0, x0), dot(x1, x1), dot(x2, x2))), 0.0)).toVar()
  const m1 = vec2(max(sub(0.6, vec2(dot(x3, x3), dot(x4, x4))), 0.0)).toVar()
  m0.assign(m0.mul(m0))
  m1.assign(m1.mul(m1))

  return mul(
    49.0,
    dot(m0.mul(m0), vec3(dot(p0, x0), dot(p1, x1), dot(p2, x2))).add(
      dot(m1.mul(m1), vec2(dot(p3, x3), dot(p4, x4))),
    ),
  )
})
