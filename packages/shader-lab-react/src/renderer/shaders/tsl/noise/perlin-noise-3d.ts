// @ts-nocheck
import {
  Fn,
  abs,
  dot,
  floor,
  fract,
  mix,
  mod,
  mul,
  step,
  sub,
  vec2,
  vec3,
  vec4,
} from "three/tsl"
import { fade, permute, taylorInvSqrt } from "./common"

/**
 * Classic Perlin noise (3D) — Ashima Arts / Stefan Gustavson port.
 * Uses permute + taylorInvSqrt (same as simplex noise) for gradient generation.
 */
export const perlinNoise3d = Fn(([pImmutable]) => {
  const P = vec3(pImmutable).toVar()

  const Pi0 = vec3(mod(floor(P), 289.0)).toVar()
  const Pi1 = vec3(mod(Pi0.add(1.0), 289.0)).toVar()
  const Pf0 = vec3(fract(P)).toVar()
  const Pf1 = vec3(Pf0.sub(1.0)).toVar()

  const ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x)
  const iy = vec4(Pi0.y, Pi0.y, Pi1.y, Pi1.y)
  const iz0 = vec4(Pi0.z, Pi0.z, Pi0.z, Pi0.z)
  const iz1 = vec4(Pi1.z, Pi1.z, Pi1.z, Pi1.z)

  const ixy = vec4(permute(permute(ix).add(iy))).toVar()
  const ixy0 = vec4(permute(ixy.add(iz0))).toVar()
  const ixy1 = vec4(permute(ixy.add(iz1))).toVar()

  const gx0 = vec4(ixy0.div(7.0)).toVar()
  const gy0 = vec4(fract(floor(gx0).div(7.0)).sub(0.5)).toVar()
  gx0.assign(fract(gx0))
  const gz0 = vec4(sub(0.5, abs(gx0)).sub(abs(gy0))).toVar()
  const sz0 = vec4(step(gz0, vec4(0.0))).toVar()
  gx0.assign(gx0.sub(sz0.mul(step(0.0, gx0).sub(0.5))))
  gy0.assign(gy0.sub(sz0.mul(step(0.0, gy0).sub(0.5))))

  const gx1 = vec4(ixy1.div(7.0)).toVar()
  const gy1 = vec4(fract(floor(gx1).div(7.0)).sub(0.5)).toVar()
  gx1.assign(fract(gx1))
  const gz1 = vec4(sub(0.5, abs(gx1)).sub(abs(gy1))).toVar()
  const sz1 = vec4(step(gz1, vec4(0.0))).toVar()
  gx1.assign(gx1.sub(sz1.mul(step(0.0, gx1).sub(0.5))))
  gy1.assign(gy1.sub(sz1.mul(step(0.0, gy1).sub(0.5))))

  const g000 = vec3(gx0.x, gy0.x, gz0.x).toVar()
  const g100 = vec3(gx0.y, gy0.y, gz0.y).toVar()
  const g010 = vec3(gx0.z, gy0.z, gz0.z).toVar()
  const g110 = vec3(gx0.w, gy0.w, gz0.w).toVar()
  const g001 = vec3(gx1.x, gy1.x, gz1.x).toVar()
  const g101 = vec3(gx1.y, gy1.y, gz1.y).toVar()
  const g011 = vec3(gx1.z, gy1.z, gz1.z).toVar()
  const g111 = vec3(gx1.w, gy1.w, gz1.w).toVar()

  const norm0 = vec4(
    taylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110))),
  ).toVar()
  g000.mulAssign(norm0.x)
  g010.mulAssign(norm0.y)
  g100.mulAssign(norm0.z)
  g110.mulAssign(norm0.w)

  const norm1 = vec4(
    taylorInvSqrt(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111))),
  ).toVar()
  g001.mulAssign(norm1.x)
  g011.mulAssign(norm1.y)
  g101.mulAssign(norm1.z)
  g111.mulAssign(norm1.w)

  const n000 = dot(g000, Pf0)
  const n100 = dot(g100, vec3(Pf1.x, Pf0.y, Pf0.z))
  const n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z))
  const n110 = dot(g110, vec3(Pf1.x, Pf1.y, Pf0.z))
  const n001 = dot(g001, vec3(Pf0.x, Pf0.y, Pf1.z))
  const n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z))
  const n011 = dot(g011, vec3(Pf0.x, Pf1.y, Pf1.z))
  const n111 = dot(g111, Pf1)

  const fadeXyz = vec3(fade(Pf0)).toVar()
  const nZ = vec4(mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fadeXyz.z))
  const nYz = vec2(mix(nZ.xy, nZ.zw, fadeXyz.y))
  const nXyz = mix(nYz.x, nYz.y, fadeXyz.x)

  return mul(2.2, nXyz)
})
