// @ts-nocheck
import { Fn, dot, float, floor, fract, length, min, sin, vec3 } from "three/tsl"

const random3 = Fn(([p]) => {
  return fract(
    sin(
      vec3(
        dot(p, vec3(127.1, 311.7, 74.7)),
        dot(p, vec3(269.5, 183.3, 246.1)),
        dot(p, vec3(113.5, 271.9, 124.6)),
      ),
    ).mul(43758.5453),
  )
})

const checkNeighbor = Fn(([i, f, neighbor, currentMin]) => {
  const point = random3(i.add(neighbor))
  const diff = neighbor.add(point).sub(f)

  return min(currentMin, length(diff))
})

export const voronoiNoise3d = Fn(([pImmutable]) => {
  const p = vec3(pImmutable).toVar()
  const i = vec3(floor(p)).toVar()
  const f = vec3(fract(p)).toVar()

  const d = float(1).toVar()

  // Unrolled 3x3x3 neighbor search
  d.assign(checkNeighbor(i, f, vec3(-1, -1, -1), d))
  d.assign(checkNeighbor(i, f, vec3(-1, -1, 0), d))
  d.assign(checkNeighbor(i, f, vec3(-1, -1, 1), d))
  d.assign(checkNeighbor(i, f, vec3(-1, 0, -1), d))
  d.assign(checkNeighbor(i, f, vec3(-1, 0, 0), d))
  d.assign(checkNeighbor(i, f, vec3(-1, 0, 1), d))
  d.assign(checkNeighbor(i, f, vec3(-1, 1, -1), d))
  d.assign(checkNeighbor(i, f, vec3(-1, 1, 0), d))
  d.assign(checkNeighbor(i, f, vec3(-1, 1, 1), d))
  d.assign(checkNeighbor(i, f, vec3(0, -1, -1), d))
  d.assign(checkNeighbor(i, f, vec3(0, -1, 0), d))
  d.assign(checkNeighbor(i, f, vec3(0, -1, 1), d))
  d.assign(checkNeighbor(i, f, vec3(0, 0, -1), d))
  d.assign(checkNeighbor(i, f, vec3(0, 0, 0), d))
  d.assign(checkNeighbor(i, f, vec3(0, 0, 1), d))
  d.assign(checkNeighbor(i, f, vec3(0, 1, -1), d))
  d.assign(checkNeighbor(i, f, vec3(0, 1, 0), d))
  d.assign(checkNeighbor(i, f, vec3(0, 1, 1), d))
  d.assign(checkNeighbor(i, f, vec3(1, -1, -1), d))
  d.assign(checkNeighbor(i, f, vec3(1, -1, 0), d))
  d.assign(checkNeighbor(i, f, vec3(1, -1, 1), d))
  d.assign(checkNeighbor(i, f, vec3(1, 0, -1), d))
  d.assign(checkNeighbor(i, f, vec3(1, 0, 0), d))
  d.assign(checkNeighbor(i, f, vec3(1, 0, 1), d))
  d.assign(checkNeighbor(i, f, vec3(1, 1, -1), d))
  d.assign(checkNeighbor(i, f, vec3(1, 1, 0), d))
  d.assign(checkNeighbor(i, f, vec3(1, 1, 1), d))

  return d
})
