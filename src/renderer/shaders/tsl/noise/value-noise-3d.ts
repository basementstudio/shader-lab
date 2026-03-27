import { dot, Fn, floor, fract, mix, sin, vec3 } from "three/tsl"
import { fade } from "./common"

const hash31 = Fn(([p]) => {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))).mul(43758.5453123))
})

export const valueNoise3d = Fn(([pImmutable]) => {
  const p = vec3(pImmutable).toVar()
  const cell = vec3(floor(p)).toVar()
  const local = vec3(fract(p)).toVar()
  const eased = vec3(fade(local)).toVar()

  const n000 = hash31(cell)
  const n100 = hash31(cell.add(vec3(1, 0, 0)))
  const n010 = hash31(cell.add(vec3(0, 1, 0)))
  const n110 = hash31(cell.add(vec3(1, 1, 0)))
  const n001 = hash31(cell.add(vec3(0, 0, 1)))
  const n101 = hash31(cell.add(vec3(1, 0, 1)))
  const n011 = hash31(cell.add(vec3(0, 1, 1)))
  const n111 = hash31(cell.add(vec3(1, 1, 1)))

  const nx00 = mix(n000, n100, eased.x)
  const nx10 = mix(n010, n110, eased.x)
  const nx01 = mix(n001, n101, eased.x)
  const nx11 = mix(n011, n111, eased.x)
  const nxy0 = mix(nx00, nx10, eased.y)
  const nxy1 = mix(nx01, nx11, eased.y)

  return mix(nxy0, nxy1, eased.z).mul(2).sub(1)
})
