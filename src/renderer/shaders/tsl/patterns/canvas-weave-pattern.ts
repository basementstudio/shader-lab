import { Fn, PI, mix, sin, smoothstep, vec3 } from "three/tsl"
import { fbm } from "../noise/fbm"

/**
 * Returns a canvas weave pattern value for a given UV coordinate.
 */
export const canvasWeavePattern = Fn(([uv]) => {
  const grid = uv.mul(200.0).fract()
  const noiseOffset = fbm(vec3(uv.mul(30.0), 0.0), { octaves: 3 }).mul(0.1)
  const warpedGrid = grid.add(noiseOffset)

  const weaveX = sin(
    warpedGrid.x.mul(PI).add(fbm(vec3(uv.mul(100.0), 0.0), { octaves: 2 }).mul(0.5)),
  )
  const weaveY = sin(
    warpedGrid.y.mul(PI).add(fbm(vec3(uv.mul(100.0).add(0.5), 0.0), { octaves: 2 }).mul(0.5)),
  )

  const weave = weaveX.mul(weaveY)
  const smoothedWeave = smoothstep(-0.3, 0.3, weave)

  return mix(0.9, 1.0, smoothedWeave)
})
