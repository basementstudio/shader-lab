import {
  abs,
  clamp,
  cos,
  dot,
  float,
  floor,
  fract,
  max,
  mix,
  pow,
  select,
  sin,
  smoothstep,
  texture as tslTexture,
  type TSLNode,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl"
import * as THREE from "three/webgpu"
import { PassNode } from "@/renderer/pass-node"
import type { LayerParameterValues } from "@/types/editor"

type Node = TSLNode

const COLOR_MODE_SOURCE = 0
const COLOR_MODE_MONOCHROME = 1
const WARP_MODE_PULL = 0
const WARP_MODE_PUSH = 1
const NOISE_SINE = 0
const NOISE_PERLIN = 1
const NOISE_TURBULENCE = 2

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function toColorModeValue(value: unknown): number {
  return value === "monochrome" ? COLOR_MODE_MONOCHROME : COLOR_MODE_SOURCE
}

function toWarpModeValue(value: unknown): number {
  return value === "push" ? WARP_MODE_PUSH : WARP_MODE_PULL
}

function toNoiseModeValue(value: unknown): number {
  if (value === "perlin") return NOISE_PERLIN
  if (value === "turbulence") return NOISE_TURBULENCE
  return NOISE_SINE
}

function parseCssColorRgb(
  value: unknown,
  fallback: [number, number, number]
): [number, number, number] {
  if (typeof value !== "string") {
    return fallback
  }

  const hex = value.trim().replace("#", "")

  if (hex.length === 6) {
    const r = Number.parseInt(hex.slice(0, 2), 16) / 255
    const g = Number.parseInt(hex.slice(2, 4), 16) / 255
    const b = Number.parseInt(hex.slice(4, 6), 16) / 255

    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return [r, g, b]
    }
  }

  if (hex.length === 3) {
    const r = Number.parseInt(hex[0]!.repeat(2), 16) / 255
    const g = Number.parseInt(hex[1]!.repeat(2), 16) / 255
    const b = Number.parseInt(hex[2]!.repeat(2), 16) / 255

    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return [r, g, b]
    }
  }

  return fallback
}

// --- TSL noise helpers ---

function hash21(ix: Node, iy: Node): Node {
  return fract(
    sin(ix.mul(float(127.1)).add(iy.mul(float(311.7)))).mul(float(43758.5453))
  )
}

function valueNoise2d(x: Node, y: Node): Node {
  const ix = floor(x)
  const iy = floor(y)
  const fx = fract(x)
  const fy = fract(y)

  const ux = fx.mul(fx).mul(float(3).sub(fx.mul(float(2))))
  const uy = fy.mul(fy).mul(float(3).sub(fy.mul(float(2))))

  const a = hash21(ix, iy)
  const b = hash21(ix.add(float(1)), iy)
  const c = hash21(ix, iy.add(float(1)))
  const d = hash21(ix.add(float(1)), iy.add(float(1)))

  return mix(mix(a, b, ux), mix(c, d, ux), uy)
}

export class CircuitBentPass extends PassNode {
  private readonly attractorXUniform: Node
  private readonly attractorYUniform: Node
  private readonly colorModeUniform: Node
  private readonly driftAmountUniform: Node
  private readonly driftSpeedUniform: Node
  private readonly invertUniform: Node
  private readonly lineAngleUniform: Node
  private readonly linePitchUniform: Node
  private readonly lineThicknessUniform: Node
  private readonly monoBlueUniform: Node
  private readonly monoGreenUniform: Node
  private readonly monoRedUniform: Node
  private readonly noiseAmountUniform: Node
  private readonly noiseModeUniform: Node
  private readonly presenceSoftnessUniform: Node
  private readonly presenceThresholdUniform: Node
  private readonly signalBlackPointUniform: Node
  private readonly signalGammaUniform: Node
  private readonly signalWhitePointUniform: Node
  private readonly timeUniform: Node
  private readonly warpModeUniform: Node
  private readonly warpStrengthUniform: Node
  private readonly widthUniform: Node
  private readonly heightUniform: Node
  private readonly placeholder: THREE.Texture

  private driftAmountValue = 0
  private sourceTextureNodes: Node[] = []

  constructor(layerId: string) {
    super(layerId)
    this.placeholder = new THREE.Texture()
    this.attractorXUniform = uniform(0)
    this.attractorYUniform = uniform(0)
    this.colorModeUniform = uniform(COLOR_MODE_SOURCE)
    this.driftAmountUniform = uniform(0)
    this.driftSpeedUniform = uniform(0.75)
    this.invertUniform = uniform(0)
    this.lineAngleUniform = uniform(0)
    this.linePitchUniform = uniform(12)
    this.lineThicknessUniform = uniform(2.0)
    this.monoBlueUniform = uniform(1)
    this.monoGreenUniform = uniform(0.96)
    this.monoRedUniform = uniform(0.92)
    this.noiseAmountUniform = uniform(0.5)
    this.noiseModeUniform = uniform(NOISE_PERLIN)
    this.presenceSoftnessUniform = uniform(0.16)
    this.presenceThresholdUniform = uniform(0.18)
    this.signalBlackPointUniform = uniform(0.06)
    this.signalGammaUniform = uniform(1.05)
    this.signalWhitePointUniform = uniform(0.96)
    this.timeUniform = uniform(0)
    this.warpModeUniform = uniform(WARP_MODE_PULL)
    this.warpStrengthUniform = uniform(0)
    this.widthUniform = uniform(1)
    this.heightUniform = uniform(1)
    this.rebuildEffectNode()
  }

  override render(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number
  ): void {
    for (const node of this.sourceTextureNodes) {
      node.value = inputTexture
    }

    super.render(renderer, inputTexture, outputTarget, time, delta)
  }

  override resize(width: number, height: number): void {
    this.widthUniform.value = Math.max(1, width)
    this.heightUniform.value = Math.max(1, height)
  }

  override updateParams(params: LayerParameterValues): void {
    const attractor: [number, number] =
      Array.isArray(params.attractor) &&
      params.attractor.length === 2 &&
      typeof params.attractor[0] === "number" &&
      typeof params.attractor[1] === "number"
        ? [params.attractor[0], params.attractor[1]]
        : [0, 0]

    this.attractorXUniform.value = Math.max(-1, Math.min(1, attractor[0]))
    this.attractorYUniform.value = Math.max(-1, Math.min(1, attractor[1]))
    this.colorModeUniform.value = toColorModeValue(params.colorMode)
    this.invertUniform.value = params.invert === true ? 1 : 0
    this.lineAngleUniform.value =
      typeof params.lineAngle === "number"
        ? Math.max(0, Math.min(180, params.lineAngle))
        : 0
    this.linePitchUniform.value =
      typeof params.linePitch === "number"
        ? Math.max(2, Math.min(48, params.linePitch))
        : 12
    this.lineThicknessUniform.value =
      typeof params.lineThickness === "number"
        ? Math.max(0.5, Math.min(8, params.lineThickness))
        : 2.0
    this.noiseModeUniform.value = toNoiseModeValue(params.noiseMode)
    this.noiseAmountUniform.value =
      typeof params.noiseAmount === "number"
        ? clamp01(params.noiseAmount)
        : 0.5
    this.presenceSoftnessUniform.value =
      typeof params.presenceSoftness === "number"
        ? clamp01(params.presenceSoftness)
        : 0.16
    this.presenceThresholdUniform.value =
      typeof params.presenceThreshold === "number"
        ? clamp01(params.presenceThreshold)
        : 0.18
    this.signalBlackPointUniform.value =
      typeof params.signalBlackPoint === "number"
        ? clamp01(params.signalBlackPoint)
        : 0.06
    this.signalGammaUniform.value =
      typeof params.signalGamma === "number"
        ? Math.max(0.1, Math.min(5, params.signalGamma))
        : 1.05
    this.signalWhitePointUniform.value =
      typeof params.signalWhitePoint === "number"
        ? clamp01(params.signalWhitePoint)
        : 0.96
    this.warpModeUniform.value = toWarpModeValue(params.warpMode)
    this.warpStrengthUniform.value =
      typeof params.warpStrength === "number"
        ? Math.max(0, Math.min(480, params.warpStrength))
        : 0

    this.driftAmountValue =
      typeof params.driftAmount === "number"
        ? clamp01(params.driftAmount)
        : 0
    this.driftAmountUniform.value = this.driftAmountValue
    this.driftSpeedUniform.value =
      typeof params.driftSpeed === "number"
        ? Math.max(0, Math.min(8, params.driftSpeed))
        : 0.75

    const [red, green, blue] = parseCssColorRgb(params.monoColor, [
      0.92,
      0.96,
      1,
    ])
    this.monoRedUniform.value = red
    this.monoGreenUniform.value = green
    this.monoBlueUniform.value = blue
  }

  override needsContinuousRender(): boolean {
    return this.driftAmountValue > 0.0001
  }

  protected override beforeRender(time: number): void {
    this.timeUniform.value = time
  }

  private trackSourceTextureNode(uvNode: Node): Node {
    const node = tslTexture(this.placeholder, uvNode)
    this.sourceTextureNodes.push(node)
    return node
  }

  protected override buildEffectNode(): Node {
    if (!this.linePitchUniform) {
      return this.inputNode
    }

    this.sourceTextureNodes = []

    // --- Coordinates ---
    const rtUv = vec2(uv().x, float(1).sub(uv().y))
    const px = vec2(
      rtUv.x.mul(this.widthUniform),
      rtUv.y.mul(this.heightUniform)
    )

    const angleRad = this.lineAngleUniform.mul(Math.PI / 180)
    const tDir = vec2(cos(angleRad), sin(angleRad))
    const nDir = vec2(sin(angleRad).negate(), cos(angleRad))
    const nCoord = dot(px, nDir)
    const tCoord = dot(px, tDir)

    // --- Signal processing constants ---
    const sigRange = max(
      this.signalWhitePointUniform.sub(this.signalBlackPointUniform),
      float(0.001)
    )
    const gExp = float(1).div(this.signalGammaUniform)
    const invCond = this.invertUniform.greaterThan(float(0.5))
    const hSoft = max(
      this.presenceSoftnessUniform.mul(float(0.5)),
      float(0.001)
    )
    const tLow = this.presenceThresholdUniform.sub(hSoft)
    const tHigh = this.presenceThresholdUniform.add(hSoft)

    // --- Attractor (physical line displacement) ---
    const aUv = vec2(
      this.attractorXUniform.add(float(1)).mul(float(0.5)),
      float(1).sub(this.attractorYUniform.add(float(1)).mul(float(0.5)))
    )
    const aPx = vec2(
      aUv.x.mul(this.widthUniform),
      aUv.y.mul(this.heightUniform)
    )
    const aNorm = dot(aPx, nDir)
    const wStr = this.warpStrengthUniform
    const decay2 = wStr.mul(wStr).mul(float(9))
    const strengthFrac = wStr.div(float(100))
    const wDir = select(
      this.warpModeUniform.greaterThan(float(0.5)),
      float(1),
      float(-1)
    )

    // --- Noise mode ---
    const isPerlin = this.noiseModeUniform.greaterThan(float(0.5))
    const isTurb = this.noiseModeUniform.greaterThan(float(1.5))

    // --- Line constants ---
    const pitch = max(this.linePitchUniform, float(1))
    const baseBand = floor(nCoord.div(pitch))
    const hWidth = this.lineThicknessUniform.mul(float(0.5))
    const lw = vec3(0.2126, 0.7152, 0.0722)
    const isMono = this.colorModeUniform.greaterThan(float(0.5))
    const mCol = vec3(
      this.monoRedUniform,
      this.monoGreenUniform,
      this.monoBlueUniform
    )

    // --- Accumulate band contributions ---
    let tR: Node = float(0)
    let tG: Node = float(0)
    let tB: Node = float(0)

    for (let i = -5; i <= 5; i++) {
      const band = baseBand.add(float(i))
      const ctrN = band.mul(pitch).add(pitch.mul(float(0.5)))

      // Reconstruct line center pixel position at our tangent coord
      const cpx = tDir.x.mul(tCoord).add(nDir.x.mul(ctrN))
      const cpy = tDir.y.mul(tCoord).add(nDir.y.mul(ctrN))
      const cUv = vec2(
        cpx.div(this.widthUniform),
        cpy.div(this.heightUniform)
      )

      // Sample source at line center
      const s = this.trackSourceTextureNode(cUv)
      const sc = vec3(s.r, s.g, s.b)
      const luma = dot(sc, lw)

      // Signal processing
      const raw = select(invCond, float(1).sub(luma), luma)
      const sig = pow(
        clamp(
          raw.sub(this.signalBlackPointUniform).div(sigRange),
          float(0),
          float(1)
        ),
        gExp
      )

      // Presence
      const pres = smoothstep(tLow, tHigh, sig)

      // --- Noise displacement ---
      // Sine noise (cheap)
      const sn1 = sin(tCoord.mul(float(0.004)).add(band.mul(float(1.31))))
      const sn2 = sin(tCoord.mul(float(0.011)).add(band.mul(float(2.47))))
      const sn3 = sin(tCoord.mul(float(0.0023)).add(band.mul(float(0.71))))
      const sineN = sn1
        .mul(float(0.5))
        .add(sn2.mul(float(0.25)))
        .add(sn3.mul(float(0.25)))

      // Value noise octaves (shared between perlin and turbulence)
      const nx = tCoord.mul(float(0.012))
      const ny = band.mul(float(0.37)).add(float(17.3))
      const vn1 = valueNoise2d(nx, ny)
      const vn2 = valueNoise2d(nx.mul(float(2.1)), ny.mul(float(2.1)))
      const vn3 = valueNoise2d(nx.mul(float(4.3)), ny.mul(float(4.3)))

      // Perlin FBM: centered [-1, 1]
      const perlinN = vn1
        .mul(float(4))
        .add(vn2.mul(float(2)))
        .add(vn3)
        .div(float(7))
        .mul(float(2))
        .sub(float(1))

      // Turbulence: |noise| octaves, centered [-1, 1]
      const turbN = abs(vn1.mul(float(2)).sub(float(1)))
        .mul(float(4))
        .add(abs(vn2.mul(float(2)).sub(float(1))).mul(float(2)))
        .add(abs(vn3.mul(float(2)).sub(float(1))))
        .div(float(7))
        .mul(float(2))
        .sub(float(1))

      // Select noise type
      const noiseVal = select(isTurb, turbN, select(isPerlin, perlinN, sineN))
      const nDisp = noiseVal
        .mul(pitch)
        .mul(this.noiseAmountUniform)
        .mul(float(2.0))

      // --- Attractor displacement (per band) ---
      const deltaN = aNorm.sub(ctrN)
      const adx = cpx.sub(aPx.x)
      const ady = cpy.sub(aPx.y)
      const dist2Sq = adx.mul(adx).add(ady.mul(ady))
      const aFalloff = decay2.div(dist2Sq.add(decay2).add(float(0.001)))
      const aDisp = deltaN.mul(aFalloff).mul(strengthFrac).mul(wDir)

      // --- Drift animation ---
      const driftDisp = sin(
        band
          .mul(float(0.73))
          .add(this.timeUniform.mul(this.driftSpeedUniform).mul(float(1.8)))
      )
        .mul(this.driftAmountUniform)
        .mul(pitch)
        .mul(float(1.5))

      // --- Total displacement ---
      const disp = sig
        .mul(pitch)
        .mul(float(5.0))
        .add(nDisp)
        .add(aDisp)
        .add(driftDisp)
      const displaced = ctrN.add(disp)

      // Distance from pixel to displaced line (in pixels)
      const dist = abs(nCoord.sub(displaced))

      // Adaptive half-width (thicker in bright areas)
      const hw = hWidth.add(sig.mul(float(0.5)))

      // Core line (anti-aliased)
      const coreLow = max(float(0), hw.sub(float(1.0)))
      const coreMask = float(1).sub(
        smoothstep(coreLow, hw.add(float(1.0)), dist)
      )

      // Glow halo
      const gHW = hw.add(sig.mul(pitch).mul(float(0.08)))
      const gLow = max(float(0), gHW.sub(float(2.0)))
      const glowMask = float(1).sub(
        smoothstep(gLow, gHW.add(float(2.0)), dist)
      )

      // Intensity
      const coreI = coreMask.mul(pres).mul(sig)
      const glowI = glowMask.mul(pres).mul(sig.mul(sig)).mul(float(0.35))
      const intensity = coreI.add(glowI)

      // Color contribution
      tR = tR.add(select(isMono, mCol.x, sc.x).mul(intensity))
      tG = tG.add(select(isMono, mCol.y, sc.y).mul(intensity))
      tB = tB.add(select(isMono, mCol.z, sc.z).mul(intensity))
    }

    return vec4(
      clamp(tR, float(0), float(1)),
      clamp(tG, float(0), float(1)),
      clamp(tB, float(0), float(1)),
      float(1)
    )
  }
}
