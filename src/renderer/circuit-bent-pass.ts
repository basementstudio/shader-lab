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
  type TSLNode,
  texture as tslTexture,
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
const NOISE_SINE = 0
const NOISE_PERLIN = 1
const NOISE_TURBULENCE = 2

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function toColorModeValue(value: unknown): number {
  return value === "monochrome" ? COLOR_MODE_MONOCHROME : COLOR_MODE_SOURCE
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

    if (!(Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b))) {
      return [r, g, b]
    }
  }

  if (hex.length === 3) {
    const r = Number.parseInt(hex[0]!.repeat(2), 16) / 255
    const g = Number.parseInt(hex[1]!.repeat(2), 16) / 255
    const b = Number.parseInt(hex[2]!.repeat(2), 16) / 255

    if (!(Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b))) {
      return [r, g, b]
    }
  }

  return fallback
}

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
  private readonly colorModeUniform: Node
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
  private readonly scrollSpeedUniform: Node
  private readonly signalBlackPointUniform: Node
  private readonly signalGammaUniform: Node
  private readonly signalWhitePointUniform: Node
  private readonly timeUniform: Node
  private readonly logicalWidthUniform: Node
  private readonly logicalHeightUniform: Node
  private readonly placeholder: THREE.Texture

  private scrollSpeedValue = 0
  private sourceTextureNodes: Node[] = []

  constructor(layerId: string) {
    super(layerId)
    this.placeholder = new THREE.Texture()
    this.colorModeUniform = uniform(COLOR_MODE_SOURCE)
    this.invertUniform = uniform(0)
    this.lineAngleUniform = uniform(0)
    this.linePitchUniform = uniform(6.4)
    this.lineThicknessUniform = uniform(0.5)
    this.monoBlueUniform = uniform(1)
    this.monoGreenUniform = uniform(0.9608)
    this.monoRedUniform = uniform(0.9216)
    this.noiseAmountUniform = uniform(1)
    this.noiseModeUniform = uniform(NOISE_TURBULENCE)
    this.presenceSoftnessUniform = uniform(0.64)
    this.presenceThresholdUniform = uniform(0.37)
    this.scrollSpeedUniform = uniform(4)
    this.signalBlackPointUniform = uniform(0)
    this.signalGammaUniform = uniform(3.07)
    this.signalWhitePointUniform = uniform(0.22)
    this.timeUniform = uniform(0)
    this.logicalWidthUniform = uniform(1)
    this.logicalHeightUniform = uniform(1)
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

  override updateLogicalSize(width: number, height: number): void {
    this.logicalWidthUniform.value = Math.max(1, width)
    this.logicalHeightUniform.value = Math.max(1, height)
  }

  override updateParams(params: LayerParameterValues): void {
    this.colorModeUniform.value = toColorModeValue(params.colorMode)
    this.invertUniform.value = params.invert === true ? 1 : 0
    this.lineAngleUniform.value =
      typeof params.lineAngle === "number"
        ? Math.max(0, Math.min(180, params.lineAngle))
        : 0
    this.linePitchUniform.value =
      typeof params.linePitch === "number"
        ? Math.max(2, Math.min(48, params.linePitch))
        : 6.4
    this.lineThicknessUniform.value =
      typeof params.lineThickness === "number"
        ? Math.max(0.5, Math.min(8, params.lineThickness))
        : 0.5
    this.noiseModeUniform.value =
      params.noiseMode === undefined
        ? NOISE_TURBULENCE
        : toNoiseModeValue(params.noiseMode)
    this.noiseAmountUniform.value =
      typeof params.noiseAmount === "number" ? clamp01(params.noiseAmount) : 1
    this.presenceSoftnessUniform.value =
      typeof params.presenceSoftness === "number"
        ? clamp01(params.presenceSoftness)
        : 0.64
    this.presenceThresholdUniform.value =
      typeof params.presenceThreshold === "number"
        ? clamp01(params.presenceThreshold)
        : 0.37
    this.signalBlackPointUniform.value =
      typeof params.signalBlackPoint === "number"
        ? clamp01(params.signalBlackPoint)
        : 0
    this.signalGammaUniform.value =
      typeof params.signalGamma === "number"
        ? Math.max(0.1, Math.min(5, params.signalGamma))
        : 3.07
    this.signalWhitePointUniform.value =
      typeof params.signalWhitePoint === "number"
        ? clamp01(params.signalWhitePoint)
        : 0.22

    this.scrollSpeedValue =
      typeof params.scrollSpeed === "number"
        ? Math.max(0, Math.min(4, params.scrollSpeed))
        : 4
    this.scrollSpeedUniform.value = this.scrollSpeedValue

    const [red, green, blue] = parseCssColorRgb(
      params.monoColor,
      [0.9216, 0.9608, 1]
    )
    this.monoRedUniform.value = red
    this.monoGreenUniform.value = green
    this.monoBlueUniform.value = blue
  }

  override needsContinuousRender(): boolean {
    return this.scrollSpeedValue > 0.0001
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

    const rtUv = vec2(uv().x, float(1).sub(uv().y))
    const px = vec2(
      rtUv.x.mul(this.logicalWidthUniform),
      rtUv.y.mul(this.logicalHeightUniform)
    )

    const angleRad = this.lineAngleUniform.mul(Math.PI / 180)
    const tDir = vec2(cos(angleRad), sin(angleRad))
    const nDir = vec2(sin(angleRad).negate(), cos(angleRad))
    const nCoord = dot(px, nDir)
    const tCoord = dot(px, tDir)

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

    const invThresh = float(1).sub(this.presenceThresholdUniform)
    const tLow = invThresh.sub(hSoft)
    const tHigh = invThresh.add(hSoft)

    const isPerlin = this.noiseModeUniform.greaterThan(float(0.5))
    const isTurb = this.noiseModeUniform.greaterThan(float(1.5))

    const pitch = max(this.linePitchUniform, float(1))
    const hWidth = this.lineThicknessUniform.mul(float(0.5))
    const lw = vec3(0.2126, 0.7152, 0.0722)
    const isMono = this.colorModeUniform.greaterThan(float(0.5))
    const mCol = vec3(
      this.monoRedUniform,
      this.monoGreenUniform,
      this.monoBlueUniform
    )

    const scrollOffset = this.timeUniform
      .mul(this.scrollSpeedUniform)
      .mul(pitch)
      .mul(float(2.0))
    const scrolledN = nCoord.add(scrollOffset)
    const baseBand = floor(scrolledN.div(pitch))

    let tR: Node = float(0)
    let tG: Node = float(0)
    let tB: Node = float(0)

    for (let i = -5; i <= 5; i++) {
      const band = baseBand.add(float(i))
      const ctrN = band.mul(pitch).add(pitch.mul(float(0.5)))

      const sampleN = ctrN.sub(scrollOffset)
      const cpx = tDir.x.mul(tCoord).add(nDir.x.mul(sampleN))
      const cpy = tDir.y.mul(tCoord).add(nDir.y.mul(sampleN))
      const cUv = vec2(
        cpx.div(this.logicalWidthUniform),
        cpy.div(this.logicalHeightUniform)
      )

      const s = this.trackSourceTextureNode(cUv)
      const sc = vec3(s.r, s.g, s.b)
      const luma = dot(sc, lw)

      const raw = select(invCond, float(1).sub(luma), luma)
      const sig = pow(
        clamp(
          raw.sub(this.signalBlackPointUniform).div(sigRange),
          float(0),
          float(1)
        ),
        gExp
      )

      const pres = smoothstep(tLow, tHigh, sig)

      const sn1 = sin(tCoord.mul(float(0.004)).add(band.mul(float(1.31))))
      const sn2 = sin(tCoord.mul(float(0.011)).add(band.mul(float(2.47))))
      const sn3 = sin(tCoord.mul(float(0.0023)).add(band.mul(float(0.71))))
      const sineN = sn1
        .mul(float(0.5))
        .add(sn2.mul(float(0.25)))
        .add(sn3.mul(float(0.25)))

      const nx = tCoord.mul(float(0.012))
      const ny = band.mul(float(0.37)).add(float(17.3))
      const vn1 = valueNoise2d(nx, ny)
      const vn2 = valueNoise2d(nx.mul(float(2.1)), ny.mul(float(2.1)))
      const vn3 = valueNoise2d(nx.mul(float(4.3)), ny.mul(float(4.3)))

      const perlinN = vn1
        .mul(float(4))
        .add(vn2.mul(float(2)))
        .add(vn3)
        .div(float(7))
        .mul(float(2))
        .sub(float(1))

      const turbN = abs(vn1.mul(float(2)).sub(float(1)))
        .mul(float(4))
        .add(abs(vn2.mul(float(2)).sub(float(1))).mul(float(2)))
        .add(abs(vn3.mul(float(2)).sub(float(1))))
        .div(float(7))
        .mul(float(2))
        .sub(float(1))

      const noiseVal = select(isTurb, turbN, select(isPerlin, perlinN, sineN))
      const nDisp = noiseVal
        .mul(pitch)
        .mul(this.noiseAmountUniform)
        .mul(float(2.0))

      const disp = sig.mul(pitch).mul(float(5.0)).add(nDisp)
      const displaced = ctrN.add(disp)

      const dist = abs(scrolledN.sub(displaced))

      const hw = hWidth.add(sig.mul(float(0.5)))

      const coreLow = max(float(0), hw.sub(float(1.0)))
      const coreMask = float(1).sub(
        smoothstep(coreLow, hw.add(float(1.0)), dist)
      )

      const gHW = hw.add(sig.mul(pitch).mul(float(0.08)))
      const gLow = max(float(0), gHW.sub(float(2.0)))
      const glowMask = float(1).sub(smoothstep(gLow, gHW.add(float(2.0)), dist))

      const coreI = coreMask.mul(pres).mul(sig)
      const glowI = glowMask.mul(pres).mul(sig.mul(sig)).mul(float(0.35))
      const intensity = coreI.add(glowI)

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
