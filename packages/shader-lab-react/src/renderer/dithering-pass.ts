import * as THREE from "three/webgpu"
import {
  abs,
  clamp,
  float,
  floor,
  fract,
  max,
  mix,
  smoothstep,
  texture as tslTexture,
  type TSLNode,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl"
import { buildDitherTextures, type DitherTextures } from "./dither-textures"
import { createPipelinePlaceholder, PassNode } from "./pass-node"
import type { LayerParameterValues } from "../types/editor"

type Node = TSLNode
type DitherColorMode = "duo-tone" | "monochrome" | "source"

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.trim().replace("#", "")
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((entry) => `${entry}${entry}`)
          .join("")
      : normalized.padEnd(6, "0").slice(0, 6)

  return [
    Number.parseInt(value.slice(0, 2), 16) / 255,
    Number.parseInt(value.slice(2, 4), 16) / 255,
    Number.parseInt(value.slice(4, 6), 16) / 255,
  ]
}

export class DitheringPass extends PassNode {
  private colorMode: DitherColorMode = "source"
  private isAnimated = false

  private readonly colorBlueUniform: Node
  private readonly colorGreenUniform: Node
  private readonly colorRedUniform: Node
  private readonly highlightBlueUniform: Node
  private readonly highlightGreenUniform: Node
  private readonly highlightRedUniform: Node
  private readonly levelsUniform: Node
  private readonly logicalHeightUniform: Node
  private readonly logicalWidthUniform: Node
  private readonly matrixSizeUniform: Node
  private readonly pixelSizeUniform: Node
  private readonly shadowBlueUniform: Node
  private readonly shadowGreenUniform: Node
  private readonly shadowRedUniform: Node
  private readonly spreadUniform: Node
  private readonly textures: DitherTextures

  // Effects uniforms
  private readonly dotScaleUniform: Node
  private readonly animateDitherUniform: Node
  private readonly ditherSpeedUniform: Node
  private readonly timeUniform: Node
  private readonly chromaticSplitUniform: Node

  private currentTexture: THREE.DataTexture
  private ditherNode: Node | null = null
  private ditherNodeG: Node | null = null
  private ditherNodeB: Node | null = null
  private readonly placeholder: THREE.Texture
  private sourceTextureNode: Node | null = null

  constructor(layerId: string) {
    super(layerId)
    this.textures = buildDitherTextures()
    this.placeholder = createPipelinePlaceholder()
    this.currentTexture = this.textures.bayer4
    this.levelsUniform = uniform(4)
    this.logicalWidthUniform = uniform(1)
    this.logicalHeightUniform = uniform(1)
    this.matrixSizeUniform = uniform(4)
    this.pixelSizeUniform = uniform(1)
    this.spreadUniform = uniform(0.5)
    this.colorRedUniform = uniform(0.96)
    this.colorGreenUniform = uniform(0.96)
    this.colorBlueUniform = uniform(0.94)
    this.shadowRedUniform = uniform(0.06)
    this.shadowGreenUniform = uniform(0.06)
    this.shadowBlueUniform = uniform(0.06)
    this.highlightRedUniform = uniform(0.96)
    this.highlightGreenUniform = uniform(0.95)
    this.highlightBlueUniform = uniform(0.91)

    // Effects uniforms
    this.dotScaleUniform = uniform(1.0)
    this.animateDitherUniform = uniform(0.0)
    this.ditherSpeedUniform = uniform(1.0)
    this.timeUniform = uniform(0.0)
    this.chromaticSplitUniform = uniform(0.0)

    this.rebuildEffectNode()
  }

  override render(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number,
  ): void {
    if (this.sourceTextureNode) {
      this.sourceTextureNode.value = inputTexture
    }

    if (this.ditherNode) {
      this.ditherNode.value = this.currentTexture
    }
    if (this.ditherNodeG) {
      this.ditherNodeG.value = this.currentTexture
    }
    if (this.ditherNodeB) {
      this.ditherNodeB.value = this.currentTexture
    }

    super.render(renderer, inputTexture, outputTarget, time, delta)
  }

  protected override beforeRender(time: number, _delta: number): void {
    this.timeUniform.value = time
  }

  override needsContinuousRender(): boolean {
    return this.isAnimated
  }

  override updateParams(params: LayerParameterValues): void {
    const nextColorMode: DitherColorMode =
      params.colorMode === "monochrome" ||
      params.colorMode === "duo-tone"
        ? params.colorMode
        : "source"

    const [red, green, blue] = hexToRgb(typeof params.monoColor === "string" ? params.monoColor : "#f5f5f0")
    const [shadowRed, shadowGreen, shadowBlue] = hexToRgb(
      typeof params.shadowColor === "string" ? params.shadowColor : "#101010",
    )
    const [highlightRed, highlightGreen, highlightBlue] = hexToRgb(
      typeof params.highlightColor === "string" ? params.highlightColor : "#f5f2e8",
    )

    this.colorRedUniform.value = red
    this.colorGreenUniform.value = green
    this.colorBlueUniform.value = blue
    this.shadowRedUniform.value = shadowRed
    this.shadowGreenUniform.value = shadowGreen
    this.shadowBlueUniform.value = shadowBlue
    this.highlightRedUniform.value = highlightRed
    this.highlightGreenUniform.value = highlightGreen
    this.highlightBlueUniform.value = highlightBlue
    this.levelsUniform.value =
      typeof params.levels === "number" ? Math.max(2, params.levels) : 4
    this.pixelSizeUniform.value =
      typeof params.pixelSize === "number" ? Math.max(1, Math.round(params.pixelSize)) : 1
    this.spreadUniform.value =
      typeof params.spread === "number"
        ? Math.max(0, Math.min(1, params.spread))
        : 0.5

    switch (params.algorithm) {
      case "bayer-2x2":
        this.currentTexture = this.textures.bayer2
        this.matrixSizeUniform.value = 2
        break
      case "bayer-8x8":
        this.currentTexture = this.textures.bayer8
        this.matrixSizeUniform.value = 8
        break
      case "noise":
        this.currentTexture = this.textures.noise
        this.matrixSizeUniform.value = 64
        break
      default:
        this.currentTexture = this.textures.bayer4
        this.matrixSizeUniform.value = 4
        break
    }

    // Effects params
    this.dotScaleUniform.value =
      typeof params.dotScale === "number" ? params.dotScale : 1.0
    this.isAnimated = params.animateDither === true
    this.animateDitherUniform.value = this.isAnimated ? 1.0 : 0.0
    this.ditherSpeedUniform.value =
      typeof params.ditherSpeed === "number" ? params.ditherSpeed : 1.0
    this.chromaticSplitUniform.value = params.chromaticSplit === true ? 1.0 : 0.0

    if (nextColorMode !== this.colorMode) {
      this.colorMode = nextColorMode
      this.rebuildEffectNode()
    }
  }

  override dispose(): void {
    this.placeholder.dispose()
    this.textures.bayer2.dispose()
    this.textures.bayer4.dispose()
    this.textures.bayer8.dispose()
    this.textures.noise.dispose()
    super.dispose()
  }

  override updateLogicalSize(width: number, height: number): void {
    this.logicalWidthUniform.value = Math.max(1, width)
    this.logicalHeightUniform.value = Math.max(1, height)
  }

  protected override buildEffectNode(): Node {
    if (!(this.levelsUniform && this.matrixSizeUniform)) {
      return this.inputNode
    }

    const pixelSize = max(this.pixelSizeUniform, float(1))
    const renderTargetUv = vec2(uv().x, float(1).sub(uv().y))
    const logicalWidth = max(this.logicalWidthUniform.div(pixelSize), float(1))
    const logicalHeight = max(this.logicalHeightUniform.div(pixelSize), float(1))
    const logicalDims = vec2(logicalWidth, logicalHeight)

    // Cell grid
    const cellCoordinates = vec2(
      floor(renderTargetUv.x.mul(logicalWidth)),
      floor(renderTargetUv.y.mul(logicalHeight)),
    )
    const snappedUv = vec2(
      cellCoordinates.x.add(0.5).div(logicalWidth),
      cellCoordinates.y.add(0.5).div(logicalHeight),
    )

    // Animated Dither: shift ditherUv by time * speed when animate is on
    const timeOffset = this.timeUniform.mul(this.ditherSpeedUniform).mul(this.animateDitherUniform)
    const ditherUv = cellCoordinates.div(this.matrixSizeUniform).add(timeOffset)

    // Chromatic Split: sample dither at 3 offset UVs when enabled
    const splitOffset = this.chromaticSplitUniform.div(this.matrixSizeUniform)
    const ditherUvR = ditherUv
    const ditherUvG = ditherUv.add(vec2(splitOffset, float(0)))
    const ditherUvB = ditherUv.add(vec2(float(0), splitOffset))

    this.sourceTextureNode = tslTexture(this.placeholder, snappedUv)
    this.ditherNode = tslTexture(this.currentTexture, ditherUvR)
    this.ditherNodeG = tslTexture(this.currentTexture, ditherUvG)
    this.ditherNodeB = tslTexture(this.currentTexture, ditherUvB)

    const src = this.sourceTextureNode
    const thresholdR = float(this.ditherNode.r).sub(float(0.5))
    const thresholdG = float(this.ditherNodeG.r).sub(float(0.5))
    const thresholdB = float(this.ditherNodeB.r).sub(float(0.5))
    const levelsMinusOne = max(this.levelsUniform.sub(float(1)), float(1))

    // Per-channel quantization with independent thresholds
    const adjustedR = float(src.r).add(thresholdR.mul(this.spreadUniform))
    const adjustedG = float(src.g).add(thresholdG.mul(this.spreadUniform))
    const adjustedB = float(src.b).add(thresholdB.mul(this.spreadUniform))
    const quantizedColor = clamp(
      vec3(
        floor(adjustedR.mul(levelsMinusOne).add(0.5)).div(levelsMinusOne),
        floor(adjustedG.mul(levelsMinusOne).add(0.5)).div(levelsMinusOne),
        floor(adjustedB.mul(levelsMinusOne).add(0.5)).div(levelsMinusOne),
      ),
      vec3(float(0), float(0), float(0)),
      vec3(float(1), float(1), float(1)),
    )

    // Color mode
    const quantizedLuma = float(quantizedColor.x)
      .mul(float(0.2126))
      .add(float(quantizedColor.y).mul(float(0.7152)))
      .add(float(quantizedColor.z).mul(float(0.0722)))

    const monoTint = vec3(
      this.colorRedUniform,
      this.colorGreenUniform,
      this.colorBlueUniform,
    )
    const shadowTint = vec3(
      this.shadowRedUniform,
      this.shadowGreenUniform,
      this.shadowBlueUniform,
    )
    const highlightTint = vec3(
      this.highlightRedUniform,
      this.highlightGreenUniform,
      this.highlightBlueUniform,
    )

    let colorResult: Node
    switch (this.colorMode) {
      case "monochrome":
        colorResult = vec3(quantizedLuma, quantizedLuma, quantizedLuma).mul(monoTint)
        break
      case "duo-tone":
        colorResult = mix(shadowTint, highlightTint, quantizedLuma)
        break
      default:
        colorResult = quantizedColor
        break
    }

    // Dot Scale: mask within each cell (square shape only)
    const cellFrac = fract(renderTargetUv.mul(logicalDims))
    const centered = cellFrac.sub(vec2(0.5, 0.5))
    const dist = max(abs(centered.x), abs(centered.y))
    const halfSize = float(0.5).mul(this.dotScaleUniform)
    const mask = smoothstep(halfSize, halfSize.sub(float(0.01)), dist)

    return vec4(vec3(colorResult).mul(mask), float(1))
  }
}
