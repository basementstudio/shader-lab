import {
  clamp,
  cos,
  dot,
  Fn,
  float,
  max,
  mix,
  pow,
  select,
  sin,
  smoothstep,
  type TSLNode,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl"
import * as THREE from "three/webgpu"
import type { LayerParameterValues } from "../types/editor"
import { PassNode } from "./pass-node"
import {
  acesTonemap,
  cinematicTonemap,
  reinhardTonemap,
  totosTonemap,
} from "./shaders/tsl/color/tonemapping"
import { perlinNoise3d } from "./shaders/tsl/noise/perlin-noise-3d"
import { ridgeNoise } from "./shaders/tsl/noise/ridge-noise"
import { simplexNoise3d } from "./shaders/tsl/noise/simplex-noise-3d"
import { turbulence } from "./shaders/tsl/noise/turbulence"
import { valueNoise3d } from "./shaders/tsl/noise/value-noise-3d"
import { voronoiNoise3d } from "./shaders/tsl/noise/voronoi-noise-3d"
import { grainTexturePattern } from "./shaders/tsl/patterns/grain-texture-pattern"

type Node = TSLNode
type NoiseMode =
  | "perlin"
  | "ridge"
  | "simplex"
  | "turbulence"
  | "value"
  | "voronoi"
type TonemapMode = "aces" | "cinematic" | "none" | "reinhard" | "totos"

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.trim().replace("#", "")
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((entry) => `${entry}${entry}`)
          .join("")
      : normalized.padEnd(6, "0").slice(0, 6)

  const color = new THREE.Color(`#${value}`)

  return [color.r, color.g, color.b]
}

export class GradientPass extends PassNode {
  private readonly activePointsUniform: Node
  private readonly animateUniform: Node
  private readonly aspectUniform: Node
  private readonly falloffUniform: Node
  private readonly glowStrengthUniform: Node
  private readonly glowThresholdUniform: Node
  private readonly grainAmountUniform: Node
  private readonly motionAmountUniform: Node
  private readonly motionSpeedUniform: Node
  private readonly pointColorUniforms: {
    blue: Node
    green: Node
    red: Node
  }[]
  private readonly pointPositionUniforms: {
    x: Node
    y: Node
  }[]
  private readonly pointWeightUniforms: Node[]
  private readonly timeUniform: Node
  private readonly vignetteRadiusUniform: Node
  private readonly vignetteSoftnessUniform: Node
  private readonly vignetteStrengthUniform: Node
  private noiseSeed = 0
  private readonly vortexAmountUniform: Node
  private readonly warpAmountUniform: Node
  private readonly warpBiasUniform: Node
  private readonly warpDecayUniform: Node
  private readonly warpScaleUniform: Node

  private isAnimated = true
  private noiseMode: NoiseMode = "simplex"
  private tonemapMode: TonemapMode = "aces"
  private warpIterations = 1

  constructor(layerId: string) {
    super(layerId)
    this.timeUniform = uniform(0)
    this.animateUniform = uniform(1)
    this.aspectUniform = uniform(1)
    this.activePointsUniform = uniform(5)
    this.warpAmountUniform = uniform(0.18)
    this.warpBiasUniform = uniform(0.5)
    this.warpDecayUniform = uniform(1)
    this.warpScaleUniform = uniform(1.4)
    this.vortexAmountUniform = uniform(0.12)
    this.motionAmountUniform = uniform(0.18)
    this.motionSpeedUniform = uniform(0.2)
    this.falloffUniform = uniform(1.85)
    this.glowStrengthUniform = uniform(0.18)
    this.glowThresholdUniform = uniform(0.62)
    this.grainAmountUniform = uniform(0.03)
    this.vignetteStrengthUniform = uniform(0.18)
    this.vignetteRadiusUniform = uniform(0.9)
    this.vignetteSoftnessUniform = uniform(0.32)
    this.pointColorUniforms = Array.from({ length: 5 }, () => ({
      blue: uniform(1),
      green: uniform(1),
      red: uniform(1),
    }))
    this.pointPositionUniforms = Array.from({ length: 5 }, () => ({
      x: uniform(0),
      y: uniform(0),
    }))
    this.pointWeightUniforms = Array.from({ length: 5 }, () => uniform(1))
    this.rebuildEffectNode()
  }

  override updateParams(params: LayerParameterValues): void {
    const activePoints =
      typeof params.activePoints === "number"
        ? Math.max(2, Math.min(5, Math.round(params.activePoints)))
        : 5
    const noiseSeed =
      typeof params.noiseSeed === "number" ? params.noiseSeed : 0
    const warpAmount =
      typeof params.warpAmount === "number"
        ? Math.max(0, params.warpAmount)
        : 0.18
    const warpScale =
      typeof params.warpScale === "number"
        ? Math.max(0.05, params.warpScale)
        : 1.4
    const warpIterations =
      typeof params.warpIterations === "number"
        ? Math.max(1, Math.min(5, Math.round(params.warpIterations)))
        : 1
    const warpDecay =
      typeof params.warpDecay === "number" ? Math.max(0.1, params.warpDecay) : 1
    const warpBias =
      typeof params.warpBias === "number"
        ? Math.max(0, Math.min(1, params.warpBias))
        : 0.5
    const vortexAmount =
      typeof params.vortexAmount === "number" ? params.vortexAmount : 0.12
    const motionAmount =
      typeof params.motionAmount === "number"
        ? Math.max(0, params.motionAmount)
        : 0.18
    const motionSpeed =
      typeof params.motionSpeed === "number"
        ? Math.max(0, params.motionSpeed)
        : 0.2
    const animateEnabled = params.animate !== false
    const falloff =
      typeof params.falloff === "number" ? Math.max(0.25, params.falloff) : 1.85
    const glowStrength =
      typeof params.glowStrength === "number"
        ? Math.max(0, params.glowStrength)
        : 0.18
    const glowThreshold =
      typeof params.glowThreshold === "number"
        ? Math.max(0, Math.min(1, params.glowThreshold))
        : 0.62
    const grainAmount =
      typeof params.grainAmount === "number"
        ? Math.max(0, params.grainAmount)
        : 0.03
    const vignetteStrength =
      typeof params.vignetteStrength === "number"
        ? Math.max(0, Math.min(1, params.vignetteStrength))
        : 0.18
    const vignetteRadius =
      typeof params.vignetteRadius === "number"
        ? Math.max(0.01, params.vignetteRadius)
        : 0.9
    const vignetteSoftness =
      typeof params.vignetteSoftness === "number"
        ? Math.max(0.01, params.vignetteSoftness)
        : 0.32

    this.activePointsUniform.value = activePoints
    this.animateUniform.value = animateEnabled ? 1 : 0
    this.warpAmountUniform.value = warpAmount
    this.warpBiasUniform.value = warpBias
    this.warpDecayUniform.value = warpDecay
    this.warpScaleUniform.value = warpScale
    this.vortexAmountUniform.value = vortexAmount
    this.motionAmountUniform.value = motionAmount
    this.motionSpeedUniform.value = motionSpeed
    this.falloffUniform.value = falloff
    this.glowStrengthUniform.value = glowStrength
    this.glowThresholdUniform.value = glowThreshold
    this.grainAmountUniform.value = grainAmount
    this.vignetteStrengthUniform.value = vignetteStrength
    this.vignetteRadiusUniform.value = vignetteRadius
    this.vignetteSoftnessUniform.value = vignetteSoftness

    for (let index = 0; index < 5; index += 1) {
      const point = index + 1
      const colorKey = `point${point}Color`
      const positionKey = `point${point}Position`
      const weightKey = `point${point}Weight`
      const rgb = hexToRgb(
        typeof params[colorKey] === "string" ? params[colorKey] : "#ffffff"
      )
      const position = Array.isArray(params[positionKey])
        ? params[positionKey]
        : [0, 0]

      this.pointColorUniforms[index]!.red.value = rgb[0]
      this.pointColorUniforms[index]!.green.value = rgb[1]
      this.pointColorUniforms[index]!.blue.value = rgb[2]
      this.pointPositionUniforms[index]!.x.value = position[0] ?? 0
      this.pointPositionUniforms[index]!.y.value = position[1] ?? 0
      this.pointWeightUniforms[index]!.value =
        typeof params[weightKey] === "number"
          ? Math.max(0, params[weightKey])
          : 1
    }

    let nextTonemapMode: TonemapMode = "aces"
    let nextNoiseMode: NoiseMode = "simplex"

    switch (params.noiseType) {
      case "perlin":
      case "ridge":
      case "turbulence":
      case "value":
      case "voronoi":
        nextNoiseMode = params.noiseType
        break
      default:
        nextNoiseMode = "simplex"
        break
    }

    switch (params.tonemapMode) {
      case "none":
      case "reinhard":
      case "totos":
      case "cinematic":
        nextTonemapMode = params.tonemapMode
        break
      case "uncharted2":
        nextTonemapMode = "totos"
        break
      default:
        nextTonemapMode = "aces"
        break
    }

    this.isAnimated =
      animateEnabled && motionSpeed > 0 && (motionAmount > 0 || warpAmount > 0)

    let needsRebuild = false

    if (nextNoiseMode !== this.noiseMode) {
      this.noiseMode = nextNoiseMode
      needsRebuild = true
    }

    if (nextTonemapMode !== this.tonemapMode) {
      this.tonemapMode = nextTonemapMode
      needsRebuild = true
    }

    if (warpIterations !== this.warpIterations) {
      this.warpIterations = warpIterations
      needsRebuild = true
    }

    if (noiseSeed !== this.noiseSeed) {
      this.noiseSeed = noiseSeed
      needsRebuild = true
    }

    if (needsRebuild) {
      this.rebuildEffectNode()
    }
  }

  override resize(width: number, height: number): void {
    this.aspectUniform.value = width / Math.max(height, 1)
  }

  override needsContinuousRender(): boolean {
    return this.isAnimated
  }

  protected override beforeRender(time: number): void {
    this.timeUniform.value = time
  }

  protected override buildEffectNode(): Node {
    const hasRequiredUniforms =
      this.timeUniform &&
      this.aspectUniform &&
      this.activePointsUniform &&
      this.warpAmountUniform &&
      this.warpBiasUniform &&
      this.warpDecayUniform &&
      this.warpScaleUniform &&
      this.vortexAmountUniform &&
      this.motionAmountUniform &&
      this.motionSpeedUniform &&
      this.falloffUniform &&
      this.glowStrengthUniform &&
      this.glowThresholdUniform &&
      this.grainAmountUniform &&
      this.vignetteStrengthUniform &&
      this.vignetteRadiusUniform &&
      this.vignetteSoftnessUniform

    if (
      !hasRequiredUniforms ||
      this.pointColorUniforms.length === 0 ||
      this.pointPositionUniforms.length === 0 ||
      this.pointWeightUniforms.length === 0
    ) {
      return this.inputNode
    }

    return Fn(() => {
      const baseUv = vec2(
        uv().x.mul(2).sub(1).mul(this.aspectUniform),
        float(1).sub(uv().y).mul(2).sub(1)
      )
      const vignetteUv = vec2(
        uv().x.mul(2).sub(1),
        float(1).sub(uv().y).mul(2).sub(1)
      )
      const time = this.timeUniform
        .mul(this.motionSpeedUniform)
        .mul(this.animateUniform)
      const warpedUv = baseUv.toVar()
      const biasX = this.warpBiasUniform.mul(2)
      const biasY = float(1).sub(this.warpBiasUniform).mul(2)

      for (let i = 1; i <= this.warpIterations; i += 1) {
        const strength = this.warpAmountUniform.div(
          pow(float(i), this.warpDecayUniform)
        )
        const warpInput = warpedUv
          .mul(this.warpScaleUniform)
          .add(float(this.noiseSeed).mul(73.7))
        const timeOffsetX = time.mul(0.1).add(float(i * 100))
        const timeOffsetY = time.mul(0.1).add(float(i * 200))
        let noiseX: Node
        let noiseY: Node

        switch (this.noiseMode) {
          case "perlin":
            noiseX = perlinNoise3d(vec3(warpInput, timeOffsetX))
            noiseY = perlinNoise3d(
              vec3(warpInput.add(vec2(13.7, 7.1)), timeOffsetY)
            )
            break
          case "value":
            noiseX = valueNoise3d(vec3(warpInput, timeOffsetX))
            noiseY = valueNoise3d(
              vec3(warpInput.add(vec2(13.7, 7.1)), timeOffsetY)
            )
            break
          case "voronoi":
            noiseX = voronoiNoise3d(vec3(warpInput, timeOffsetX)).mul(2).sub(1)
            noiseY = voronoiNoise3d(
              vec3(warpInput.add(vec2(13.7, 7.1)), timeOffsetY)
            )
              .mul(2)
              .sub(1)
            break
          case "ridge":
            noiseX = ridgeNoise(vec3(warpInput, timeOffsetX)).mul(2).sub(1)
            noiseY = ridgeNoise(
              vec3(warpInput.add(vec2(13.7, 7.1)), timeOffsetY)
            )
              .mul(2)
              .sub(1)
            break
          case "turbulence":
            {
              const disp = turbulence(warpInput, timeOffsetX.mul(20), {
                _amp: 0.7,
                _exp: 1.4,
                _freq: 2,
                _num: 10,
                _speed: 0.3,
              })
              noiseX = disp.x
              noiseY = disp.y
            }
            break
          default:
            noiseX = simplexNoise3d(vec3(warpInput, timeOffsetX))
            noiseY = simplexNoise3d(
              vec3(warpInput.add(vec2(13.7, 7.1)), timeOffsetY)
            )
            break
        }

        warpedUv.x.addAssign(strength.mul(noiseX).mul(biasX))
        warpedUv.y.addAssign(strength.mul(noiseY).mul(biasY))
      }

      const distanceFromCenter = max(
        dot(warpedUv, warpedUv),
        float(1e-4)
      ).sqrt()
      const vortexAngle = distanceFromCenter.mul(this.vortexAmountUniform)
      const rotatedUv = vec2(
        warpedUv.x.mul(cos(vortexAngle)).sub(warpedUv.y.mul(sin(vortexAngle))),
        warpedUv.x.mul(sin(vortexAngle)).add(warpedUv.y.mul(cos(vortexAngle)))
      )

      const finalColor = vec3(0).toVar()
      const totalWeight = float(0).toVar()

      for (let index = 0; index < 5; index += 1) {
        const pointIndex = float(index + 1)
        const active = select(
          this.activePointsUniform.greaterThanEqual(pointIndex),
          float(1),
          float(0)
        )
        const pointPosition = vec2(
          this.pointPositionUniforms[index]!.x.add(
            sin(time.mul(pointIndex.mul(0.73)).add(pointIndex)).mul(
              this.motionAmountUniform
            )
          ),
          this.pointPositionUniforms[index]!.y.add(
            cos(time.mul(pointIndex.mul(0.41)).add(pointIndex.mul(1.7))).mul(
              this.motionAmountUniform
            )
          )
        )
        const delta = rotatedUv.sub(pointPosition)
        const distance = max(dot(delta, delta), float(1e-4)).sqrt()
        const baseWeight = float(1).div(
          max(pow(distance, this.falloffUniform), float(1e-4))
        )
        const weighted = baseWeight
          .mul(this.pointWeightUniforms[index]!)
          .mul(active)
        const color = vec3(
          this.pointColorUniforms[index]!.red,
          this.pointColorUniforms[index]!.green,
          this.pointColorUniforms[index]!.blue
        )

        finalColor.addAssign(color.mul(weighted))
        totalWeight.addAssign(weighted)
      }

      finalColor.assign(finalColor.div(max(totalWeight, float(1e-4))))

      switch (this.tonemapMode) {
        case "reinhard":
          finalColor.assign(reinhardTonemap(finalColor))
          break
        case "totos":
          finalColor.assign(totosTonemap(finalColor))
          break
        case "cinematic":
          finalColor.assign(cinematicTonemap(finalColor))
          break
        case "none":
          break
        default:
          finalColor.assign(acesTonemap(finalColor))
          break
      }

      const luma = dot(finalColor, vec3(0.2126, 0.7152, 0.0722))
      const glow = smoothstep(this.glowThresholdUniform, float(1), luma).mul(
        this.glowStrengthUniform
      )
      finalColor.addAssign(vec3(glow, glow, glow))

      const grain = grainTexturePattern(uv())
        .sub(0.5)
        .mul(this.grainAmountUniform)
      finalColor.addAssign(vec3(grain, grain, grain))

      const vignetteDistance = max(
        dot(vignetteUv, vignetteUv),
        float(1e-4)
      ).sqrt()
      const vignette = smoothstep(
        this.vignetteRadiusUniform,
        this.vignetteRadiusUniform.sub(this.vignetteSoftnessUniform),
        vignetteDistance
      )
      const vignetteMix = mix(float(1), vignette, this.vignetteStrengthUniform)
      finalColor.mulAssign(vignetteMix)

      return vec4(
        clamp(
          finalColor,
          vec3(float(0), float(0), float(0)),
          vec3(float(1), float(1), float(1))
        ),
        float(1)
      )
    })()
  }
}
