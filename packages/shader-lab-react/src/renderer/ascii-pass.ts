import * as THREE from "three/webgpu"
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js"
import {
  clamp,
  float,
  floor,
  mix,
  mod,
  select,
  texture as tslTexture,
  type TSLNode,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl"
import {
  ASCII_CHARSETS,
  buildAsciiAtlas,
  type AsciiFontWeight,
  DEFAULT_ASCII_CHARS,
} from "./ascii-atlas"
import { createPipelinePlaceholder, PassNode } from "./pass-node"
import type { LayerParameterValues } from "../types/editor"

type Node = TSLNode
type AsciiColorMode = "green-terminal" | "monochrome" | "source"
type AsciiCharset = keyof typeof ASCII_CHARSETS | "custom"

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function parseCssColorRgb(value: string): [number, number, number] {
  const rgba = value.match(
    /rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+)?\s*\)/i,
  )

  if (rgba) {
    return [
      clamp01(Number.parseFloat(rgba[1] ?? "0") / 255),
      clamp01(Number.parseFloat(rgba[2] ?? "0") / 255),
      clamp01(Number.parseFloat(rgba[3] ?? "0") / 255),
    ]
  }

  const hex = value.trim().replace("#", "")

  if (hex.length === 6) {
    return [
      Number.parseInt(hex.slice(0, 2), 16) / 255,
      Number.parseInt(hex.slice(2, 4), 16) / 255,
      Number.parseInt(hex.slice(4, 6), 16) / 255,
    ]
  }

  if (hex.length === 3) {
    return [
      Number.parseInt(`${hex[0] ?? "0"}${hex[0] ?? "0"}`, 16) / 255,
      Number.parseInt(`${hex[1] ?? "0"}${hex[1] ?? "0"}`, 16) / 255,
      Number.parseInt(`${hex[2] ?? "0"}${hex[2] ?? "0"}`, 16) / 255,
    ]
  }

  return [1, 1, 1]
}

export class AsciiPass extends PassNode {
  private atlasTexture: THREE.CanvasTexture | null = null
  private atlasTextureNodes: Node[] = []
  private bloomEnabled = false
  private bloomNode: ReturnType<typeof bloom> | null = null
  private readonly bloomIntensityUniform: Node
  private readonly bloomRadiusUniform: Node
  private readonly bloomSoftnessUniform: Node
  private readonly bloomThresholdUniform: Node
  private readonly cellSizeUniform: Node
  private readonly bgOpacityUniform: Node
  private readonly colorModeUniform: Node
  private readonly invertUniform: Node
  private readonly monoBlueUniform: Node
  private readonly monoGreenUniform: Node
  private readonly logicalHeightUniform: Node
  private readonly logicalWidthUniform: Node
  private readonly monoRedUniform: Node
  private readonly numCharsUniform: Node
  private readonly placeholder: THREE.Texture
  private sourceTextureNodes: Node[] = []

  private currentCellSize = 12
  private currentCharset: AsciiCharset = "light"
  private currentCustomChars = DEFAULT_ASCII_CHARS
  private currentFontWeight: AsciiFontWeight = "regular"

  constructor(layerId: string) {
    super(layerId)
    this.placeholder = createPipelinePlaceholder()
    this.bloomIntensityUniform = uniform(1.25)
    this.bloomRadiusUniform = uniform(6)
    this.bloomSoftnessUniform = uniform(0.35)
    this.bloomThresholdUniform = uniform(0.6)
    this.cellSizeUniform = uniform(12)
    this.logicalWidthUniform = uniform(1)
    this.logicalHeightUniform = uniform(1)
    this.numCharsUniform = uniform(DEFAULT_ASCII_CHARS.length)
    this.colorModeUniform = uniform(1)
    this.monoRedUniform = uniform(0.96)
    this.monoGreenUniform = uniform(0.96)
    this.monoBlueUniform = uniform(0.94)
    this.bgOpacityUniform = uniform(0)
    this.invertUniform = uniform(0)
    this.atlasTexture = buildAsciiAtlas(DEFAULT_ASCII_CHARS, "regular", this.currentCellSize)
    this.rebuildEffectNode()
  }

  override render(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number,
  ): void {
    for (const sourceTextureNode of this.sourceTextureNodes) {
      sourceTextureNode.value = inputTexture
    }

    if (this.atlasTexture) {
      for (const atlasTextureNode of this.atlasTextureNodes) {
        atlasTextureNode.value = this.atlasTexture
      }
    }

    super.render(renderer, inputTexture, outputTarget, time, delta)
  }

  override updateParams(params: LayerParameterValues): void {
    const nextCellSize =
      typeof params.cellSize === "number" ? Math.max(4, Math.round(params.cellSize)) : 12
    const nextCharset = this.resolveCharset(params.charset)
    const nextCustomChars =
      typeof params.customChars === "string" ? params.customChars : DEFAULT_ASCII_CHARS
    const nextFontWeight = this.resolveFontWeight(params.fontWeight)
    const nextColorMode = this.resolveColorMode(params.colorMode)
    const nextBgOpacity =
      typeof params.bgOpacity === "number" ? clamp01(params.bgOpacity) : 0
    const nextBloomEnabled = params.bloomEnabled === true
    const nextBloomIntensity =
      typeof params.bloomIntensity === "number" ? Math.max(0, params.bloomIntensity) : 1.25
    const nextBloomThreshold =
      typeof params.bloomThreshold === "number" ? clamp01(params.bloomThreshold) : 0.6
    const nextBloomRadius =
      typeof params.bloomRadius === "number" ? Math.max(0, params.bloomRadius) : 6
    const nextBloomSoftness =
      typeof params.bloomSoftness === "number" ? clamp01(params.bloomSoftness) : 0.35
    const [red, green, blue] = parseCssColorRgb(
      typeof params.monoColor === "string" ? params.monoColor : "#f5f5f0",
    )

    this.cellSizeUniform.value = nextCellSize
    this.bgOpacityUniform.value = nextBgOpacity
    this.bloomIntensityUniform.value = nextBloomIntensity
    this.bloomRadiusUniform.value = nextBloomRadius
    this.bloomSoftnessUniform.value = nextBloomSoftness
    this.bloomThresholdUniform.value = nextBloomThreshold
    this.invertUniform.value = params.invert === true ? 1 : 0
    this.monoRedUniform.value = red
    this.monoGreenUniform.value = green
    this.monoBlueUniform.value = blue

    this.colorModeUniform.value = this.getColorModeValue(nextColorMode)

    const needsAtlasRebuild =
      nextCellSize !== this.currentCellSize ||
      nextCharset !== this.currentCharset ||
      nextFontWeight !== this.currentFontWeight ||
      (nextCharset === "custom" && nextCustomChars !== this.currentCustomChars)

    this.currentCellSize = nextCellSize
    this.currentCharset = nextCharset
    this.currentCustomChars = nextCustomChars
    this.currentFontWeight = nextFontWeight

    if (nextBloomEnabled !== this.bloomEnabled) {
      this.bloomEnabled = nextBloomEnabled
      this.rebuildEffectNode()
      return
    }

    if (this.bloomNode) {
      this.bloomNode.strength.value = nextBloomIntensity
      this.bloomNode.radius.value = this.normalizeBloomRadius(nextBloomRadius)
      this.bloomNode.threshold.value = nextBloomThreshold
      this.bloomNode.smoothWidth.value = this.normalizeBloomSoftness(nextBloomSoftness)
    }

    if (needsAtlasRebuild) {
      this.rebuildAtlas()
    }
  }

  override dispose(): void {
    this.disposeBloomNode()
    this.placeholder.dispose()
    this.atlasTexture?.dispose()
    super.dispose()
  }

  override updateLogicalSize(width: number, height: number): void {
    this.logicalWidthUniform.value = Math.max(1, width)
    this.logicalHeightUniform.value = Math.max(1, height)
  }

  protected override buildEffectNode(): Node {
    if (!(this.cellSizeUniform && this.numCharsUniform && this.placeholder)) {
      return this.inputNode
    }

    this.disposeBloomNode()
    this.bloomNode = null
    this.sourceTextureNodes = []
    this.atlasTextureNodes = []

    const renderTargetUv = vec2(uv().x, float(1).sub(uv().y))
    const logicalScreenSize = vec2(this.logicalWidthUniform, this.logicalHeightUniform)
    const normalizedCellSize = vec2(this.cellSizeUniform, this.cellSizeUniform).div(
      logicalScreenSize,
    )
    const sampleAscii = (sampleUv: Node) => {
      const safeUv = clamp(sampleUv, vec2(float(0), float(0)), vec2(float(1), float(1)))
      const screenPixel = floor(safeUv.mul(logicalScreenSize))
      const cellCenterUv = floor(safeUv.div(normalizedCellSize))
        .add(vec2(0.5, 0.5))
        .mul(normalizedCellSize)
      const localCellPixel = vec2(
        mod(screenPixel.x, this.cellSizeUniform),
        mod(screenPixel.y, this.cellSizeUniform),
      )
      const sampledColor = this.trackSourceTextureNode(cellCenterUv)
      const luma = float(sampledColor.r)
        .mul(float(0.2126))
        .add(float(sampledColor.g).mul(float(0.7152)))
        .add(float(sampledColor.b).mul(float(0.0722)))
      const adjustedLuma = select(
        this.invertUniform.greaterThan(float(0.5)),
        float(1).sub(luma),
        luma,
      )
      const charIndex = floor(
        clamp(
          adjustedLuma.mul(this.numCharsUniform.sub(float(1))),
          float(0),
          this.numCharsUniform.sub(float(1)),
        ),
      )
      const atlasUv = vec2(
        charIndex
          .mul(this.cellSizeUniform)
          .add(localCellPixel.x)
          .add(float(0.5))
          .div(this.numCharsUniform.mul(this.cellSizeUniform)),
        localCellPixel.y.add(float(0.5)).div(this.cellSizeUniform),
      )
      const characterMask = float(this.trackAtlasTextureNode(atlasUv).r)
      const sourceColor = vec3(
        float(sampledColor.r),
        float(sampledColor.g),
        float(sampledColor.b),
      )
      const monoTint = vec3(
        this.monoRedUniform,
        this.monoGreenUniform,
        this.monoBlueUniform,
      )
      const monochromeColor = monoTint.mul(adjustedLuma)
      const greenTerminalColor = vec3(float(0), adjustedLuma, float(0))
      const glyphColor = select(
        this.colorModeUniform.lessThan(float(0.5)),
        sourceColor,
        select(
          this.colorModeUniform.lessThan(float(1.5)),
          monochromeColor,
          greenTerminalColor,
        ),
      )
      const sourceBackground = sourceColor.mul(this.bgOpacityUniform)
      const backgroundColor = select(
        this.colorModeUniform.lessThan(float(0.5)),
        sourceBackground,
        vec3(float(0), float(0), float(0)),
      )

      return {
        baseColor: mix(backgroundColor, glyphColor, characterMask),
        emissiveColor: glyphColor.mul(characterMask),
      }
    }

    const baseSample = sampleAscii(renderTargetUv)

    if (!this.bloomEnabled) {
      return vec4(baseSample.baseColor, float(1))
    }

    const bloomInput = vec4(baseSample.emissiveColor, float(1))
    this.bloomNode = bloom(
      bloomInput,
      this.bloomIntensityUniform.value as number,
      this.normalizeBloomRadius(this.bloomRadiusUniform.value as number),
      this.bloomThresholdUniform.value as number,
    )
    this.bloomNode.smoothWidth.value = this.normalizeBloomSoftness(
      this.bloomSoftnessUniform.value as number,
    )

    return vec4(
      clamp(
        baseSample.baseColor.add(this.getBloomTextureNode().rgb),
        vec3(float(0), float(0), float(0)),
        vec3(float(1), float(1), float(1)),
      ),
      float(1),
    )
  }

  private getActiveChars(): string {
    return this.currentCharset === "custom"
      ? this.currentCustomChars || " "
      : ASCII_CHARSETS[this.currentCharset] ?? DEFAULT_ASCII_CHARS
  }

  private getColorModeValue(colorMode: AsciiColorMode): number {
    switch (colorMode) {
      case "source":
        return 0
      case "green-terminal":
        return 2
      default:
        return 1
    }
  }

  private rebuildAtlas(): void {
    const chars = this.getActiveChars()
    this.atlasTexture?.dispose()
    this.atlasTexture = buildAsciiAtlas(chars, this.currentFontWeight, this.currentCellSize)
    this.numCharsUniform.value = chars.length
    this.rebuildEffectNode()
  }

  private resolveCharset(value: unknown): AsciiCharset {
    return value === "binary" ||
      value === "blocks" ||
      value === "custom" ||
      value === "dense" ||
      value === "hatching" ||
      value === "light"
      ? value
      : "light"
  }

  private resolveColorMode(value: unknown): AsciiColorMode {
    return value === "green-terminal" || value === "source" ? value : "monochrome"
  }

  private resolveFontWeight(value: unknown): AsciiFontWeight {
    return value === "bold" || value === "thin" ? value : "regular"
  }

  private normalizeBloomRadius(value: number): number {
    return clamp01(value / 24)
  }

  private normalizeBloomSoftness(value: number): number {
    return Math.max(0.001, value * 0.25)
  }

  private disposeBloomNode(): void {
    ;(this.bloomNode as { dispose?: () => void } | null)?.dispose?.()
  }

  private getBloomTextureNode(): Node {
    const bloomNode = this.bloomNode as
      | ({
          getTexture?: () => Node
          getTextureNode?: () => Node
        } & object)
      | null

    if (!bloomNode) {
      throw new Error("Bloom node is not initialized")
    }

    if ("getTextureNode" in bloomNode && typeof bloomNode.getTextureNode === "function") {
      return bloomNode.getTextureNode()
    }

    if ("getTexture" in bloomNode && typeof bloomNode.getTexture === "function") {
      return bloomNode.getTexture()
    }

    throw new Error("Bloom node does not expose a texture getter")
  }

  private trackAtlasTextureNode(uvNode: Node): Node {
    const atlasTextureNode = tslTexture(this.atlasTexture ?? new THREE.Texture(), uvNode)
    this.atlasTextureNodes.push(atlasTextureNode)
    return atlasTextureNode
  }

  private trackSourceTextureNode(uvNode: Node): Node {
    const sourceTextureNode = tslTexture(this.placeholder, uvNode)
    this.sourceTextureNodes.push(sourceTextureNode)
    return sourceTextureNode
  }
}
