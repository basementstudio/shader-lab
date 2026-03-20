import * as THREE from "three/webgpu"
import {
  clamp,
  float,
  floor,
  max,
  mix,
  texture as tslTexture,
  type TSLNode,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl"
import { buildDitherTextures, type DitherTextures } from "@/features/editor/renderer/dither-textures"
import { PassNode } from "@/features/editor/renderer/pass-node"
import type { LayerParameterValues } from "@/features/editor/types"

type Node = TSLNode
type DitherColorMode = "duo-tone" | "monochrome" | "posterized-source" | "source"

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
  private readonly biasUniform: Node
  private colorMode: DitherColorMode = "source"
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

  private currentTexture: THREE.DataTexture
  private ditherNode: Node | null = null
  private readonly placeholder: THREE.Texture
  private sourceTextureNode: Node | null = null

  constructor(layerId: string) {
    super(layerId)
    this.textures = buildDitherTextures()
    this.placeholder = new THREE.Texture()
    this.currentTexture = this.textures.bayer4
    this.biasUniform = uniform(0.25)
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

    super.render(renderer, inputTexture, outputTarget, time, delta)
  }

  override updateParams(params: LayerParameterValues): void {
    const nextColorMode: DitherColorMode =
      params.colorMode === "monochrome" ||
      params.colorMode === "duo-tone" ||
      params.colorMode === "posterized-source"
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
    this.biasUniform.value =
      typeof params.bias === "number"
        ? Math.max(0, Math.min(1, params.bias))
        : 0.25
    this.pixelSizeUniform.value =
      typeof params.pixelSize === "number" ? Math.max(1, Math.round(params.pixelSize)) : 1
    this.spreadUniform.value =
      typeof params.spread === "number"
        ? Math.max(0, Math.min(1, params.spread))
        : 0.5

    switch (params.algorithm) {
      case "bayer-8x8":
        this.currentTexture = this.textures.bayer8
        this.matrixSizeUniform.value = 8
        break
      case "blue-noise":
        this.currentTexture = this.textures.blueNoise
        this.matrixSizeUniform.value = 64
        break
      default:
        this.currentTexture = this.textures.bayer4
        this.matrixSizeUniform.value = 4
        break
    }

    if (nextColorMode !== this.colorMode) {
      this.colorMode = nextColorMode
      this.rebuildEffectNode()
    }
  }

  override dispose(): void {
    this.placeholder.dispose()
    this.textures.bayer4.dispose()
    this.textures.bayer8.dispose()
    this.textures.blueNoise.dispose()
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
    const snappedUv = vec2(
      floor(renderTargetUv.x.mul(logicalWidth)).add(0.5).div(logicalWidth),
      floor(renderTargetUv.y.mul(logicalHeight)).add(0.5).div(logicalHeight),
    )
    const cellCoordinates = vec2(
      floor(uv().x.mul(logicalWidth)),
      floor(uv().y.mul(logicalHeight)),
    )
    const ditherUv = cellCoordinates.div(this.matrixSizeUniform)
    this.sourceTextureNode = tslTexture(this.placeholder, snappedUv)
    this.ditherNode = tslTexture(this.currentTexture, ditherUv)

    const src = this.sourceTextureNode
    const threshold = float(this.ditherNode.r)
    const levelsMinusOne = max(this.levelsUniform.sub(float(1)), float(1))
    const thresholdOffset = threshold.sub(this.biasUniform).mul(this.spreadUniform)
    const luma = float(src.r)
      .mul(float(0.2126))
      .add(float(src.g).mul(float(0.7152)))
      .add(float(src.b).mul(float(0.0722)))
    const quantized = clamp(
      floor(luma.mul(levelsMinusOne).add(threshold.mul(this.spreadUniform))).div(
        levelsMinusOne,
      ),
      float(0),
      float(1),
    )
    const posterizedSource = clamp(
      vec3(
        floor(float(src.r).add(thresholdOffset).mul(levelsMinusOne).add(0.5)).div(levelsMinusOne),
        floor(float(src.g).add(thresholdOffset).mul(levelsMinusOne).add(0.5)).div(levelsMinusOne),
        floor(float(src.b).add(thresholdOffset).mul(levelsMinusOne).add(0.5)).div(levelsMinusOne),
      ),
      vec3(float(0), float(0), float(0)),
      vec3(float(1), float(1), float(1)),
    )
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
    const monochrome = vec3(quantized, quantized, quantized).mul(monoTint)
    const duoTone = mix(shadowTint, highlightTint, quantized)
    const sourceScale = quantized.div(max(luma, float(0.0001)))
    const sourceColor = clamp(
      vec3(float(src.r), float(src.g), float(src.b)).mul(sourceScale),
      vec3(float(0), float(0), float(0)),
      vec3(float(1), float(1), float(1)),
    )

    switch (this.colorMode) {
      case "monochrome":
        return vec4(monochrome, float(1))
      case "duo-tone":
        return vec4(duoTone, float(1))
      case "posterized-source":
        return vec4(posterizedSource, float(1))
      default:
        return vec4(sourceColor, float(1))
    }
  }
}
