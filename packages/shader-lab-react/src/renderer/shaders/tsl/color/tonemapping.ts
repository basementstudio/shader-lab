// @ts-nocheck
import { dot, exp, Fn, mix, pow, smoothstep, vec3 } from "three/tsl"

export const reinhardTonemap = Fn(([color]) => {
  return color.div(color.add(1.0))
})

export const totosTonemap = Fn(([color]) => {
  const compressed = color
    .mul(vec3(1.18, 1.04, 0.94))
    .div(color.mul(vec3(0.82, 0.9, 0.98)).add(vec3(0.78, 0.68, 0.6)))
  const lum = dot(compressed, vec3(0.2126, 0.7152, 0.0722))
  const shadowLift = smoothstep(0.0, 0.38, lum)
  const highlightRoll = smoothstep(0.42, 1.0, lum)
  const toneMix = smoothstep(0.16, 0.82, lum)
  const cool = vec3(
    compressed.x.mul(0.82),
    compressed.y.mul(0.98).add(shadowLift.mul(0.04)),
    compressed.z.mul(1.24).add(shadowLift.mul(0.08))
  )
  const warm = vec3(
    compressed.x.mul(1.14).add(highlightRoll.mul(0.08)),
    compressed.y.mul(1.03).add(highlightRoll.mul(0.03)),
    compressed.z.mul(0.84)
  )
  const splitToned = mix(cool, warm, toneMix)
  const curved = vec3(
    pow(splitToned.x, 0.86),
    pow(splitToned.y, 0.95),
    pow(splitToned.z, 1.12)
  )
  const bleach = mix(curved, vec3(lum), highlightRoll.mul(0.06))

  return bleach.clamp(0.0, 1.0)
})

export const acesTonemap = Fn(([color]) => {
  const a = 2.51
  const b = 0.03
  const c = 2.43
  const d = 0.59
  const e = 0.14

  return color
    .mul(color.mul(a).add(b))
    .div(color.mul(color.mul(c).add(d)).add(e))
    .clamp(0.0, 1.0)
})

export const crossProcessTonemap = Fn(([color]) => {
  const r = pow(color.x, 0.8)
  const g = pow(color.y, 1.2)
  const b = pow(color.z, 1.5)

  return vec3(r, g, b).clamp(0.0, 1.0)
})

export const bleachBypassTonemap = Fn(([color]) => {
  const lum = dot(color, vec3(0.2126, 0.7152, 0.0722))
  const mixAmount = 0.7

  return mix(vec3(lum), color, mixAmount).mul(1.2).clamp(0.0, 1.0)
})

export const technicolorTonemap = Fn(([color]) => {
  const r = color.x.mul(1.5)
  const g = color.y.mul(1.2)
  const b = color.z.mul(0.8).add(color.x.mul(0.2))

  return vec3(r, g, b).clamp(0.0, 1.0)
})

export const cinematicTonemap = Fn(([color]) => {
  const r = smoothstep(0.05, 0.95, color.x.mul(0.95).add(0.02))
  const g = smoothstep(0.05, 0.95, color.y.mul(1.05))
  const b = smoothstep(0.05, 0.95, color.z.mul(1.1))

  return vec3(r, g, b).clamp(0.0, 1.0)
})

export const tanh = Fn(([x]) => {
  const tmp = exp(x).toVar()

  return tmp.sub(float(1).div(tmp)).div(tmp.add(float(1).div(tmp)))
})

export const uncharted2Tonemap = totosTonemap
