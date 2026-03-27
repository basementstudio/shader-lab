// @ts-nocheck
import { EPSILON, Fn, cross, vec3, vec4 } from "three/tsl"
import { simplexNoise4d } from "./simplex-noise-4d"

export const curlNoise4d = Fn(([inputA]) => {
  const aXPos = simplexNoise4d(inputA.add(vec4(EPSILON, 0, 0, 0)))
  const aXNeg = simplexNoise4d(inputA.sub(vec4(EPSILON, 0, 0, 0)))
  const aXAverage = aXPos.sub(aXNeg).div(EPSILON.mul(2))

  const aYPos = simplexNoise4d(inputA.add(vec4(0, EPSILON, 0, 0)))
  const aYNeg = simplexNoise4d(inputA.sub(vec4(0, EPSILON, 0, 0)))
  const aYAverage = aYPos.sub(aYNeg).div(EPSILON.mul(2))

  const aZPos = simplexNoise4d(inputA.add(vec4(0, 0, EPSILON, 0)))
  const aZNeg = simplexNoise4d(inputA.sub(vec4(0, 0, EPSILON, 0)))
  const aZAverage = aZPos.sub(aZNeg).div(EPSILON.mul(2))

  const aGrabNoise = vec3(aXAverage, aYAverage, aZAverage).normalize()
  const inputB = inputA.add(3.5)

  const bXPos = simplexNoise4d(inputB.add(vec4(EPSILON, 0, 0, 0)))
  const bXNeg = simplexNoise4d(inputB.sub(vec4(EPSILON, 0, 0, 0)))
  const bXAverage = bXPos.sub(bXNeg).div(EPSILON.mul(2))

  const bYPos = simplexNoise4d(inputB.add(vec4(0, EPSILON, 0, 0)))
  const bYNeg = simplexNoise4d(inputB.sub(vec4(0, EPSILON, 0, 0)))
  const bYAverage = bYPos.sub(bYNeg).div(EPSILON.mul(2))

  const bZPos = simplexNoise4d(inputB.add(vec4(0, 0, EPSILON, 0)))
  const bZNeg = simplexNoise4d(inputB.sub(vec4(0, 0, EPSILON, 0)))
  const bZAverage = bZPos.sub(bZNeg).div(EPSILON.mul(2))

  const bGrabNoise = vec3(bXAverage, bYAverage, bZAverage).normalize()

  return cross(aGrabNoise, bGrabNoise).normalize()
})
