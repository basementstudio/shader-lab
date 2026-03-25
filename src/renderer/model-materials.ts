import {
  dot,
  float,
  mix,
  mod,
  normalView,
  positionLocal,
  positionViewDirection,
  smoothstep,
  type TSLNode,
  vec3,
} from "three/tsl"
import * as THREE from "three/webgpu"
import { simplexNoise3d } from "@/renderer/shaders/tsl/noise/simplex-noise-3d"

type Node = TSLNode
type MaterialPreset = "liquid" | "metal" | "plastic"

export interface ModelMaterialState {
  brilliance: number
  color: string
  envBlur: number
  metalness: number
  roughness: number
}

export interface LiquidMaterialState {
  patternScale: number
  refraction: number
  liquid: number
  speed: number
  patternBlur: number
  timeNode: TSLNode
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function colorNode(value: string): Node {
  const color = new THREE.Color(value)
  return vec3(color.r, color.g, color.b)
}

// ---------------------------------------------------------------------------
// liquid chrome — animated pattern with chromatic aberration
// adapted from paper-design/liquid-logo GLSL → TSL
// uses normalView so pattern reacts to camera
// ---------------------------------------------------------------------------

function getColorChannel(
  c1: Node,
  c2: Node,
  stripeP: Node,
  w0: Node,
  w1: Node,
  w2: Node,
  blur: Node,
  bulge: Node
): Node {
  const b = smoothstep(float(0.2), float(0.8), bulge)

  let ch = mix(c2, c1, smoothstep(float(0), blur, stripeP))
  ch = mix(ch, c2, smoothstep(w0.sub(blur), w0.add(blur), stripeP))

  const border2 = w0.add(w1.mul(float(0.4)).mul(float(1).sub(b)))
  ch = mix(ch, c1, smoothstep(border2.sub(blur), border2.add(blur), stripeP))

  const border3 = w0.add(w1.mul(float(0.5)).mul(float(1).sub(b)))
  ch = mix(ch, c2, smoothstep(border3.sub(blur), border3.add(blur), stripeP))

  const border4 = w0.add(w1)
  ch = mix(ch, c1, smoothstep(border4.sub(blur), border4.add(blur), stripeP))

  const gradientT = stripeP.sub(w0).sub(w1).div(w2)
  const gradient = mix(c1, c2, smoothstep(float(0), float(1), gradientT))
  ch = mix(
    ch,
    gradient,
    smoothstep(border4.sub(blur), border4.add(blur), stripeP)
  )

  return ch
}

function buildLiquidMaterial(
  state: ModelMaterialState,
  liquidState: LiquidMaterialState
): THREE.Material {
  const material = new THREE.MeshPhysicalNodeMaterial()

  const timeU = liquidState.timeNode
  const patternScale = float(clamp(liquidState.patternScale, 0.5, 10))
  const refractionAmount = float(clamp(liquidState.refraction, 0, 0.06))
  const patternBlur = float(clamp(liquidState.patternBlur, 0, 0.05))

  const nv = vec3(normalView).normalize()
  const viewDir = vec3(positionViewDirection).normalize()
  const pos = vec3(positionLocal).toVar()
  const diagonal = nv.x.sub(nv.y)

  const NdotV = dot(nv, viewDir).abs().clamp(0, 1)
  const bulge = NdotV.mul(0.8)

  const liquidAmount = clamp(liquidState.liquid, 0, 1)
  const t = timeU.mul(0.001)
  const noiseInput = vec3(pos.x.mul(2), pos.y.mul(2), t.mul(liquidState.speed))
  const noise = simplexNoise3d(noiseInput).mul(liquidAmount)

  const cycleWidth = patternScale
  const thinStrip1Ratio = float(0.12)
    .div(cycleWidth)
    .mul(float(1).sub(bulge.mul(0.4)))
  const thinStrip2Ratio = float(0.07)
    .div(cycleWidth)
    .mul(float(1).add(bulge.mul(0.4)))
  const wideStripRatio = float(1).sub(thinStrip1Ratio).sub(thinStrip2Ratio)

  const w0 = cycleWidth.mul(thinStrip1Ratio)
  const w1 = cycleWidth.mul(thinStrip2Ratio)
  const w2 = wideStripRatio

  let dir = nv.x.add(diagonal)
  dir = dir.sub(
    noise
      .mul(2)
      .mul(diagonal)
      .mul(NdotV.mul(float(1).sub(NdotV)))
  )
  dir = dir.mul(float(0.1).add(float(1.1).mul(bulge)))
  dir = dir.mul(cycleWidth)
  dir = dir.sub(t)

  const refr = float(1).sub(bulge)
  const refrR = refr.add(noise.mul(0.03).mul(bulge)).mul(refractionAmount)
  const refrB = refr
    .mul(1.3)
    .sub(float(0.2).mul(float(1).sub(NdotV)))
    .mul(refractionAmount)

  const tint = colorNode(state.color)
  const color1 = mix(vec3(0.98, 0.98, 1.0), tint, float(0.15))
  const color2 = vec3(0.1, 0.1, 0.12)

  const blur = patternBlur

  const stripeR = mod(dir.add(refrR), float(1)).abs()
  const r = getColorChannel(
    color1.x,
    color2.x,
    stripeR,
    w0,
    w1,
    w2,
    blur.add(0.02),
    bulge
  )

  const stripeG = mod(dir, float(1)).abs()
  const g = getColorChannel(
    color1.y,
    color2.y,
    stripeG,
    w0,
    w1,
    w2,
    blur.add(0.01),
    bulge
  )

  const stripeB = mod(dir.sub(refrB), float(1)).abs()
  const b = getColorChannel(
    color1.z,
    color2.z,
    stripeB,
    w0,
    w1,
    w2,
    blur.add(0.01),
    bulge
  )

  const liquidColor = vec3(r, g, b)

  material.colorNode = vec3(0, 0, 0)
  material.emissiveNode = liquidColor
  material.metalness = 1
  material.roughness = 0.3
  material.envMapIntensity = 0

  return material
}

function buildMetalMaterial(state: ModelMaterialState): THREE.Material {
  const material = new THREE.MeshPhysicalNodeMaterial()

  const blur = clamp(state.envBlur, 0, 1)
  const effectiveRoughness = clamp(state.roughness + blur * 0.6, 0.02, 0.7)

  material.color.set(state.color)
  material.metalness = 1
  material.metalnessNode = float(clamp(state.metalness, 0.85, 1))
  material.roughness = effectiveRoughness
  material.clearcoatNode = float(clamp(0.5 + state.brilliance * 0.3, 0.5, 1))
  material.clearcoatRoughness = 0.02 + blur * 0.1
  material.specularIntensity = 1.2
  material.envMapIntensity = 1.5

  return material
}

function buildPlasticMaterial(state: ModelMaterialState): THREE.Material {
  const material = new THREE.MeshPhysicalNodeMaterial()

  const blur = clamp(state.envBlur, 0, 1)
  const effectiveRoughness = clamp(state.roughness + blur * 0.5, 0.05, 0.65)

  material.color.set(state.color)
  material.colorNode = colorNode(state.color)
  material.metalness = 0
  material.metalnessNode = float(0)
  material.roughness = effectiveRoughness
  material.clearcoatNode = float(clamp(0.6 + state.brilliance * 0.35, 0.6, 1))
  material.clearcoatRoughness = clamp(
    state.roughness * 0.15 + blur * 0.08,
    0.01,
    0.1
  )
  material.specularIntensity = 1
  material.envMapIntensity = 1.0

  return material
}

export function buildCustomModelMaterial(
  preset: MaterialPreset,
  state: ModelMaterialState,
  liquidState?: LiquidMaterialState
): THREE.Material {
  switch (preset) {
    case "liquid":
      if (!liquidState) return buildMetalMaterial(state)
      return buildLiquidMaterial(state, liquidState)
    case "plastic":
      return buildPlasticMaterial(state)
    default:
      return buildMetalMaterial(state)
  }
}
