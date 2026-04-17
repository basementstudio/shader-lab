import { abs, Fn, float, length, max, min, type TSLNode, vec3 } from "three/tsl"

export const sdBox3d = Fn(([_p, size = vec3(0)]: [TSLNode, TSLNode?]) => {
  const q = abs(_p).sub(size)

  return length(max(q, float(0))).add(
    min(max(q.x, max(q.y, q.z)), float(0))
  )
})
