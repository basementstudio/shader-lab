import { Fn, abs, add, dot, floor, fract, mod, mul, step, sub, vec3, vec4 } from "three/tsl"

export const permute = Fn(([x]) => {
  return mod(mul(add(mul(x, 34.0), 10.0), x), 289.0)
})

export const taylorInvSqrt = Fn(([r]) => {
  return sub(1.79284291400159, mul(0.85373472095314, r))
})

export const mod289 = Fn(([x]) => {
  return mod(mul(add(mul(x, 34.0), 10.0), x), 289.0)
})

export const fade = Fn(([t]) => {
  return mul(t, t).mul(t.mul(t.mul(t.mul(t.mul(6.0).sub(15.0).add(10.0)))))
})

export const grad4 = Fn(([j, ip]) => {
  const ones = vec4(1.0, 1.0, 1.0, -1.0)
  const p = vec4().toVar()
  const s = vec4().toVar()

  p.xyz.assign(floor(fract(vec3(j).mul(ip.xyz)).mul(7.0)).mul(ip.z).sub(1.0))
  p.w.assign(sub(1.5, dot(abs(p.xyz), ones.xyz)))
  s.assign(step(p, vec4(0.0)))
  p.xyz.assign(p.xyz.add(s.xyz.mul(2.0).sub(1.0).mul(s.www)))

  return p
})
