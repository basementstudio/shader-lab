import {
  abs,
  clamp,
  dot,
  float,
  floor,
  length,
  max,
  mix,
  mod,
  pow,
  select,
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
import { PassNode } from "./pass-node"
import type { LayerParameterValues } from "../types/editor"

type Node = TSLNode

const UNDERLAY_TAPS = 12
const GOLDEN_ANGLE = 2.399963229728653
const UNDERLAY_OFFSETS = Array.from({ length: UNDERLAY_TAPS }, (_, index) => {
  const radius = Math.sqrt((index + 0.5) / UNDERLAY_TAPS)
  const angle = index * GOLDEN_ANGLE
  return [Math.cos(angle) * radius, Math.sin(angle) * radius] as const
})
const TONE_OFFSETS = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const

function perceptualLuma(color: Node): Node {
  const luma = clamp(
    dot(vec3(color.r, color.g, color.b), vec3(0.2126, 0.7152, 0.0722)),
    0,
    1
  )
  return select(
    luma.lessThanEqual(float(0.0031308)),
    luma.mul(12.92),
    pow(luma, float(1 / 2.4)).mul(1.055).sub(0.055)
  )
}

function readNumber(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, value))
    : fallback
}

export class DotGridPass extends PassNode {
  private readonly spacingUniform: Node
  private readonly minDotUniform: Node
  private readonly maxDotUniform: Node
  private readonly contrastUniform: Node
  private readonly levelUniform: Node
  private readonly softnessUniform: Node
  private readonly squareUniform: Node
  private readonly sourceInkUniform: Node
  private readonly invertUniform: Node
  private readonly inkColorUniform: Node
  private readonly backgroundColorUniform: Node
  private readonly underlayUniform: Node
  private readonly underlayBlurUniform: Node
  private readonly logicalWidthUniform: Node
  private readonly logicalHeightUniform: Node
  private readonly placeholder = new THREE.Texture()
  private sourceTextureNodes: Node[] = []

  constructor(layerId: string) {
    super(layerId)
    this.spacingUniform = uniform(14)
    this.minDotUniform = uniform(0.14)
    this.maxDotUniform = uniform(1.05)
    this.contrastUniform = uniform(1.4)
    this.levelUniform = uniform(0.5)
    this.softnessUniform = uniform(0.8)
    this.squareUniform = uniform(0)
    this.sourceInkUniform = uniform(0)
    this.invertUniform = uniform(0)
    this.inkColorUniform = uniform(new THREE.Color("#111111"))
    this.backgroundColorUniform = uniform(new THREE.Color("#ffffff"))
    this.underlayUniform = uniform(0)
    this.underlayBlurUniform = uniform(24)
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
    this.spacingUniform.value = readNumber(params.spacing, 14, 3, 120)
    this.minDotUniform.value = readNumber(params.minDot, 0.14, 0, 1)
    this.maxDotUniform.value = readNumber(params.maxDot, 1.05, 0, 1.5)
    this.contrastUniform.value = readNumber(params.contrast, 1.4, 0.2, 4)
    this.levelUniform.value = readNumber(params.level, 0.5, 0, 1)
    this.softnessUniform.value = readNumber(params.softness, 0.8, 0, 4)
    this.squareUniform.value = params.shape === "square" ? 1 : 0
    this.sourceInkUniform.value = params.inkMode === "source" ? 1 : 0
    this.invertUniform.value = params.invert === true ? 1 : 0
    ;(this.inkColorUniform.value as THREE.Color).set(
      typeof params.inkColor === "string" ? params.inkColor : "#111111"
    )
    ;(this.backgroundColorUniform.value as THREE.Color).set(
      typeof params.backgroundColor === "string"
        ? params.backgroundColor
        : "#ffffff"
    )
    this.underlayUniform.value = readNumber(params.underlay, 0, 0, 1)
    this.underlayBlurUniform.value = readNumber(params.underlayBlur, 24, 0, 120)
  }

  private sample(uvNode: Node): Node {
    const node = tslTexture(this.placeholder, uvNode)
    this.sourceTextureNodes.push(node)
    return node
  }

  protected override buildEffectNode(): Node {
    if (!this.logicalHeightUniform) {
      return this.inputNode
    }

    this.sourceTextureNodes = []

    const targetUv = vec2(uv().x, float(1).sub(uv().y))
    const size = vec2(this.logicalWidthUniform, this.logicalHeightUniform)
    const texel = vec2(float(1).div(size.x), float(1).div(size.y))
    const pixel = targetUv.mul(size)
    const spacing = this.spacingUniform
    const origin = vec2(mod(size.x, spacing), mod(size.y, spacing)).mul(0.5)
    const local = pixel.sub(origin)
    const cell = floor(local.div(spacing))
    const center = cell.add(0.5).mul(spacing).add(origin)
    const centerUv = center.mul(texel)

    const toneReach = texel.mul(spacing).mul(this.softnessUniform)
    let tone: Node = float(0)
    let centerSample: Node | null = null
    for (const [x, y] of TONE_OFFSETS) {
      const tap = this.sample(centerUv.add(vec2(x, y).mul(toneReach)))
      centerSample ??= tap
      tone = tone.add(perceptualLuma(tap))
    }
    tone = tone.div(TONE_OFFSETS.length)
    const cellSource = centerSample as Node
    const darkness = select(
      this.invertUniform.greaterThan(float(0.5)),
      tone,
      float(1).sub(tone)
    )
    const shaped = clamp(
      darkness.sub(this.levelUniform).mul(this.contrastUniform).add(0.5),
      0,
      1
    )
    const radius = mix(this.minDotUniform, this.maxDotUniform, shaped)
      .mul(spacing)
      .mul(0.5)

    const offset = pixel.sub(center)
    const distance = select(
      this.squareUniform.greaterThan(float(0.5)),
      max(abs(offset.x), abs(offset.y)),
      length(offset)
    )
    const coverage = float(1).sub(
      smoothstep(radius.sub(0.6), radius.add(0.6), distance)
    )
    const visible = coverage.mul(smoothstep(0.05, 0.35, radius))

    let underlay: Node = vec3(0)
    const blurReach = texel.mul(this.underlayBlurUniform)
    for (const [x, y] of UNDERLAY_OFFSETS) {
      const tap = this.sample(targetUv.add(vec2(x, y).mul(blurReach)))
      underlay = underlay.add(vec3(tap.r, tap.g, tap.b))
    }
    underlay = underlay.div(UNDERLAY_TAPS)
    const background = mix(
      this.backgroundColorUniform,
      underlay,
      this.underlayUniform
    )

    const ink = select(
      this.sourceInkUniform.greaterThan(float(0.5)),
      vec3(cellSource.r, cellSource.g, cellSource.b),
      this.inkColorUniform
    )
    return vec4(mix(background, ink, visible), float(1))
  }

  override dispose(): void {
    this.placeholder.dispose()
    super.dispose()
  }
}
