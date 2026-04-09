import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js"
import {
  clamp,
  dot,
  float,
  floor,
  fract,
  max,
  mix,
  mod,
  pow,
  select,
  sin,
  smoothstep,
  sqrt,
  type TSLNode,
  texture as tslTexture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl"
import * as THREE from "three/webgpu"
import {
  ASCII_CHARSETS,
  type AsciiFontWeight,
  buildAsciiAtlas,
  DEFAULT_ASCII_CHARS,
} from "@/renderer/ascii-atlas"
import { PassNode } from "@/renderer/pass-node"
import {
  acesTonemap,
  cinematicTonemap,
  reinhardTonemap,
  totosTonemap,
} from "@/renderer/shaders/tsl/color/tonemapping"
import type { LayerParameterValues } from "@/types/editor"

type Node = TSLNode
type AsciiColorMode = "green-terminal" | "monochrome" | "source"
type AsciiCharset = keyof typeof ASCII_CHARSETS | "custom"
type AsciiToneMapping = "none" | "aces" | "cinematic" | "reinhard" | "totos"
type AsciiSignalMode = "blue" | "green" | "lightness" | "luminance" | "red"

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function parseCssColorRgb(value: string): [number, number, number] {
  const rgba = value.match(
    /rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+)?\s*\)/i
  )

  if (rgba) {
    const color = new THREE.Color().setRGB(
      clamp01(Number.parseFloat(rgba[1] ?? "0") / 255),
      clamp01(Number.parseFloat(rgba[2] ?? "0") / 255),
      clamp01(Number.parseFloat(rgba[3] ?? "0") / 255),
      THREE.SRGBColorSpace
    )

    return [color.r, color.g, color.b]
  }

  const hex = value.trim().replace("#", "")

  if (hex.length === 6) {
    const color = new THREE.Color(`#${hex}`)

    return [color.r, color.g, color.b]
  }

  if (hex.length === 3) {
    const color = new THREE.Color(`#${hex}`)

    return [color.r, color.g, color.b]
  }

  return [1, 1, 1]
}

export class AsciiPass extends PassNode {
  private atlasTexture: THREE.CanvasTexture | null = null
  private atlasTextureNodes: Node[] = []
  private bloomEnabled = false
  private bloomNode: ReturnType<typeof bloom> | null = null
  private shimmerEnabled = false
  private readonly bgOpacityUniform: Node
  private readonly bloomIntensityUniform: Node
  private readonly bloomRadiusUniform: Node
  private readonly bloomSoftnessUniform: Node
  private readonly bloomThresholdUniform: Node
  private readonly cellSizeUniform: Node
  private readonly colorModeUniform: Node
  private readonly colorSignalModeUniform: Node
  private readonly directionBiasUniform: Node
  private readonly glyphSignalModeUniform: Node
  private readonly invertUniform: Node
  private readonly logicalHeightUniform: Node
  private readonly logicalWidthUniform: Node
  private readonly monoBlueUniform: Node
  private readonly monoGreenUniform: Node
  private readonly monoRedUniform: Node
  private readonly numCharsUniform: Node
  private readonly placeholder: THREE.Texture
  private readonly presenceSoftnessUniform: Node
  private readonly presenceThresholdUniform: Node
  private readonly shimmerAmountUniform: Node
  private readonly shimmerSpeedUniform: Node
  private readonly signalBlackPointUniform: Node
  private readonly signalGammaUniform: Node
  private readonly signalWhitePointUniform: Node
  private readonly timeUniform: Node
  private readonly toneMappingModeUniform: Node
  private sourceTextureNodes: Node[] = []

  private currentCellSize = 12
  private currentCharset: AsciiCharset = "light"
  private currentCustomChars = DEFAULT_ASCII_CHARS
  private currentFontWeight: AsciiFontWeight = "regular"

  constructor(layerId: string) {
    super(layerId)
    this.placeholder = new THREE.Texture()
    this.bgOpacityUniform = uniform(0)
    this.bloomIntensityUniform = uniform(1.25)
    this.bloomRadiusUniform = uniform(6)
    this.bloomSoftnessUniform = uniform(0.35)
    this.bloomThresholdUniform = uniform(0.6)
    this.cellSizeUniform = uniform(12)
    this.colorModeUniform = uniform(1)
    this.colorSignalModeUniform = uniform(0)
    this.directionBiasUniform = uniform(0)
    this.glyphSignalModeUniform = uniform(0)
    this.invertUniform = uniform(0)
    this.logicalHeightUniform = uniform(1)
    this.logicalWidthUniform = uniform(1)
    this.monoBlueUniform = uniform(0.94)
    this.monoGreenUniform = uniform(0.96)
    this.monoRedUniform = uniform(0.96)
    this.numCharsUniform = uniform(DEFAULT_ASCII_CHARS.length)
    this.presenceSoftnessUniform = uniform(0)
    this.presenceThresholdUniform = uniform(0)
    this.shimmerAmountUniform = uniform(0)
    this.shimmerSpeedUniform = uniform(1)
    this.signalBlackPointUniform = uniform(0)
    this.signalGammaUniform = uniform(1)
    this.signalWhitePointUniform = uniform(1)
    this.timeUniform = uniform(0)
    this.toneMappingModeUniform = uniform(0)
    this.atlasTexture = buildAsciiAtlas(
      DEFAULT_ASCII_CHARS,
      "regular",
      this.currentCellSize
    )
    this.rebuildEffectNode()
  }

  override render(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number
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
      typeof params.cellSize === "number"
        ? Math.max(4, Math.round(params.cellSize))
        : 12
    const nextCharset = this.resolveCharset(params.charset)
    const nextCustomChars =
      typeof params.customChars === "string"
        ? params.customChars
        : DEFAULT_ASCII_CHARS
    const nextFontWeight = this.resolveFontWeight(params.fontWeight)
    const nextColorMode = this.resolveColorMode(params.colorMode)
    const nextBgOpacity =
      typeof params.bgOpacity === "number" ? clamp01(params.bgOpacity) : 0
    const nextBloomEnabled = params.bloomEnabled === true
    const nextBloomIntensity =
      typeof params.bloomIntensity === "number"
        ? Math.max(0, params.bloomIntensity)
        : 1.25
    const nextBloomThreshold =
      typeof params.bloomThreshold === "number"
        ? clamp01(params.bloomThreshold)
        : 0.6
    const nextBloomRadius =
      typeof params.bloomRadius === "number"
        ? Math.max(0, params.bloomRadius)
        : 6
    const nextBloomSoftness =
      typeof params.bloomSoftness === "number"
        ? clamp01(params.bloomSoftness)
        : 0.35
    const [red, green, blue] = parseCssColorRgb(
      typeof params.monoColor === "string" ? params.monoColor : "#f5f5f0"
    )
    const nextToneMapping = this.resolveToneMapping(params.toneMapping)
    const nextGlyphSignalMode = this.resolveSignalMode(params.glyphSignalMode)
    const nextColorSignalMode = this.resolveSignalMode(params.colorSignalMode)
    const nextSignalBlackPoint =
      typeof params.signalBlackPoint === "number"
        ? clamp01(params.signalBlackPoint)
        : 0
    const nextSignalWhitePoint =
      typeof params.signalWhitePoint === "number"
        ? clamp01(params.signalWhitePoint)
        : 1
    const nextSignalGamma =
      typeof params.signalGamma === "number"
        ? Math.max(0.1, Math.min(5, params.signalGamma))
        : 1
    const nextPresenceThreshold =
      typeof params.presenceThreshold === "number"
        ? clamp01(params.presenceThreshold)
        : 0
    const nextPresenceSoftness =
      typeof params.presenceSoftness === "number"
        ? clamp01(params.presenceSoftness)
        : 0
    const nextShimmerAmount =
      typeof params.shimmerAmount === "number"
        ? clamp01(params.shimmerAmount)
        : 0
    const nextShimmerSpeed =
      typeof params.shimmerSpeed === "number"
        ? Math.max(0, Math.min(10, params.shimmerSpeed))
        : 1
    const nextDirectionBias =
      typeof params.directionBias === "number"
        ? clamp01(params.directionBias)
        : 0

    this.bgOpacityUniform.value = nextBgOpacity
    this.bloomIntensityUniform.value = nextBloomIntensity
    this.bloomRadiusUniform.value = nextBloomRadius
    this.bloomSoftnessUniform.value = nextBloomSoftness
    this.bloomThresholdUniform.value = nextBloomThreshold
    this.cellSizeUniform.value = nextCellSize
    this.colorModeUniform.value = this.getColorModeValue(nextColorMode)
    this.colorSignalModeUniform.value =
      this.getSignalModeValue(nextColorSignalMode)
    this.directionBiasUniform.value = nextDirectionBias
    this.glyphSignalModeUniform.value =
      this.getSignalModeValue(nextGlyphSignalMode)
    this.invertUniform.value = params.invert === true ? 1 : 0
    this.monoBlueUniform.value = blue
    this.monoGreenUniform.value = green
    this.monoRedUniform.value = red
    this.presenceSoftnessUniform.value = nextPresenceSoftness
    this.presenceThresholdUniform.value = nextPresenceThreshold
    this.shimmerAmountUniform.value = nextShimmerAmount
    this.shimmerSpeedUniform.value = nextShimmerSpeed
    this.signalBlackPointUniform.value = nextSignalBlackPoint
    this.signalGammaUniform.value = nextSignalGamma
    this.signalWhitePointUniform.value = nextSignalWhitePoint
    this.toneMappingModeUniform.value =
      this.getToneMappingValue(nextToneMapping)
    this.shimmerEnabled = nextShimmerAmount > 0

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
      this.bloomNode.smoothWidth.value =
        this.normalizeBloomSoftness(nextBloomSoftness)
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

  protected override beforeRender(time: number): void {
    this.timeUniform.value = time
  }

  override needsContinuousRender(): boolean {
    return this.shimmerEnabled
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
    const logicalScreenSize = vec2(
      this.logicalWidthUniform,
      this.logicalHeightUniform
    )
    const normalizedCellSize = vec2(
      this.cellSizeUniform,
      this.cellSizeUniform
    ).div(logicalScreenSize)

    const sampleAscii = (sampleUv: Node) => {
      const safeUv = clamp(
        sampleUv,
        vec2(float(0), float(0)),
        vec2(float(1), float(1))
      )
      const screenPixel = floor(safeUv.mul(logicalScreenSize))
      const cellCenterUv = floor(safeUv.div(normalizedCellSize))
        .add(vec2(0.5, 0.5))
        .mul(normalizedCellSize)
      const localCellPixel = vec2(
        mod(screenPixel.x, this.cellSizeUniform),
        mod(screenPixel.y, this.cellSizeUniform)
      )

      // Sample source color and apply tone mapping
      const sampledColor = this.trackSourceTextureNode(cellCenterUv)
      const sourceColor = vec3(
        float(sampledColor.r),
        float(sampledColor.g),
        float(sampledColor.b)
      )
      const toneMapped = this.buildToneMappedColor(sourceColor)

      // Extract independent glyph and color signals
      const rawGlyphSignal = this.buildSignalExtractor(
        toneMapped,
        this.glyphSignalModeUniform
      )
      const rawColorSignal = this.buildSignalExtractor(
        toneMapped,
        this.colorSignalModeUniform
      )

      // Invert
      const invertedGlyphSignal = select(
        this.invertUniform.greaterThan(float(0.5)),
        float(1).sub(rawGlyphSignal),
        rawGlyphSignal
      )
      const invertedColorSignal = select(
        this.invertUniform.greaterThan(float(0.5)),
        float(1).sub(rawColorSignal),
        rawColorSignal
      )

      // Contrast shaping: remap through black/white point and gamma
      const signalRange = max(
        this.signalWhitePointUniform.sub(this.signalBlackPointUniform),
        float(0.001),
      )
      const gammaExp = float(1).div(this.signalGammaUniform)
      const shapedGlyphSignal = pow(
        clamp(
          invertedGlyphSignal
            .sub(this.signalBlackPointUniform)
            .div(signalRange),
          float(0),
          float(1)
        ),
        gammaExp
      )
      const shapedColorSignal = pow(
        clamp(
          invertedColorSignal
            .sub(this.signalBlackPointUniform)
            .div(signalRange),
          float(0),
          float(1)
        ),
        gammaExp
      )

      // Direction bias: blend glyph signal with edge gradient magnitude
      const leftSample = this.trackSourceTextureNode(
        clamp(
          cellCenterUv.sub(vec2(normalizedCellSize.x, float(0))),
          vec2(float(0), float(0)),
          vec2(float(1), float(1))
        )
      )
      const rightSample = this.trackSourceTextureNode(
        clamp(
          cellCenterUv.add(vec2(normalizedCellSize.x, float(0))),
          vec2(float(0), float(0)),
          vec2(float(1), float(1))
        )
      )
      const topSample = this.trackSourceTextureNode(
        clamp(
          cellCenterUv.sub(vec2(float(0), normalizedCellSize.y)),
          vec2(float(0), float(0)),
          vec2(float(1), float(1))
        )
      )
      const bottomSample = this.trackSourceTextureNode(
        clamp(
          cellCenterUv.add(vec2(float(0), normalizedCellSize.y)),
          vec2(float(0), float(0)),
          vec2(float(1), float(1))
        )
      )
      const leftLuma = this.buildLuma(leftSample)
      const rightLuma = this.buildLuma(rightSample)
      const topLuma = this.buildLuma(topSample)
      const bottomLuma = this.buildLuma(bottomSample)
      const gradX = rightLuma.sub(leftLuma)
      const gradY = bottomLuma.sub(topLuma)
      const gradMag = clamp(
        sqrt(gradX.mul(gradX).add(gradY.mul(gradY))),
        float(0),
        float(1)
      )
      const biasedGlyphSignal = mix(
        shapedGlyphSignal,
        gradMag,
        this.directionBiasUniform
      )

      // Character selection from glyph signal
      const charIndex = floor(
        clamp(
          biasedGlyphSignal.mul(this.numCharsUniform.sub(float(1))),
          float(0),
          this.numCharsUniform.sub(float(1))
        )
      )

      // Atlas lookup
      const atlasUv = vec2(
        charIndex
          .mul(this.cellSizeUniform)
          .add(localCellPixel.x)
          .add(float(0.5))
          .div(this.numCharsUniform.mul(this.cellSizeUniform)),
        localCellPixel.y.add(float(0.5)).div(this.cellSizeUniform)
      )
      const characterMask = float(this.trackAtlasTextureNode(atlasUv).r)

      // Presence mask: fade out characters below the threshold
      const halfSoft = max(
        this.presenceSoftnessUniform.mul(float(0.5)),
        float(0.001),
      )
      const presenceMask = smoothstep(
        this.presenceThresholdUniform.sub(halfSoft),
        this.presenceThresholdUniform.add(halfSoft),
        biasedGlyphSignal
      )

      // Temporal shimmer: smooth per-cell opacity oscillation
      const cellId = floor(safeUv.div(normalizedCellSize))
      const cellPhase = fract(
        sin(dot(cellId, vec2(12.9898, 78.233))).mul(float(43758.5453))
      )
      const shimmerWave = sin(
        this.timeUniform
          .mul(this.shimmerSpeedUniform)
          .mul(float(0.3))
          .add(cellPhase.mul(float(6.2831)))
      )
      const shimmerOpacity = float(1).sub(
        shimmerWave.add(float(1)).mul(float(0.5)).mul(this.shimmerAmountUniform)
      )
      const finalMask = characterMask.mul(presenceMask).mul(shimmerOpacity)

      // Color output driven by color signal
      const monoTint = vec3(
        this.monoRedUniform,
        this.monoGreenUniform,
        this.monoBlueUniform
      )
      const monochromeColor = monoTint.mul(shapedColorSignal)
      const greenTerminalColor = vec3(float(0), shapedColorSignal, float(0))
      const glyphColor = select(
        this.colorModeUniform.lessThan(float(0.5)),
        toneMapped,
        select(
          this.colorModeUniform.lessThan(float(1.5)),
          monochromeColor,
          greenTerminalColor
        )
      )
      const sourceBackground = toneMapped.mul(this.bgOpacityUniform)
      const backgroundColor = select(
        this.colorModeUniform.lessThan(float(0.5)),
        sourceBackground,
        vec3(float(0), float(0), float(0))
      )

      return {
        baseColor: mix(backgroundColor, glyphColor, finalMask),
        emissiveColor: glyphColor.mul(finalMask),
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
      this.bloomThresholdUniform.value as number
    )
    this.bloomNode.smoothWidth.value = this.normalizeBloomSoftness(
      this.bloomSoftnessUniform.value as number
    )

    return vec4(
      clamp(
        baseSample.baseColor.add(this.getBloomTextureNode().rgb),
        vec3(float(0), float(0), float(0)),
        vec3(float(1), float(1), float(1))
      ),
      float(1)
    )
  }

  private buildLuma(color: Node): Node {
    return float(color.r)
      .mul(float(0.2126))
      .add(float(color.g).mul(float(0.7152)))
      .add(float(color.b).mul(float(0.0722)))
  }

  private buildSignalExtractor(color: Node, modeUniform: Node): Node {
    const luma = this.buildLuma(color)
    const avg = float(color.r).add(color.g).add(color.b).div(float(3))
    return select(
      modeUniform.lessThan(float(0.5)),
      luma,
      select(
        modeUniform.lessThan(float(1.5)),
        avg,
        select(
          modeUniform.lessThan(float(2.5)),
          float(color.r),
          select(
            modeUniform.lessThan(float(3.5)),
            float(color.g),
            float(color.b)
          )
        )
      )
    )
  }

  private buildToneMappedColor(color: Node): Node {
    return select(
      this.toneMappingModeUniform.lessThan(float(0.5)),
      color,
      select(
        this.toneMappingModeUniform.lessThan(float(1.5)),
        acesTonemap(color),
        select(
          this.toneMappingModeUniform.lessThan(float(2.5)),
          reinhardTonemap(color),
          select(
            this.toneMappingModeUniform.lessThan(float(3.5)),
            totosTonemap(color),
            cinematicTonemap(color)
          )
        )
      )
    )
  }

  private getActiveChars(): string {
    return this.currentCharset === "custom"
      ? this.currentCustomChars || " "
      : (ASCII_CHARSETS[this.currentCharset] ?? DEFAULT_ASCII_CHARS)
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

  private getSignalModeValue(mode: AsciiSignalMode): number {
    switch (mode) {
      case "lightness":
        return 1
      case "red":
        return 2
      case "green":
        return 3
      case "blue":
        return 4
      default:
        return 0
    }
  }

  private getToneMappingValue(mode: AsciiToneMapping): number {
    switch (mode) {
      case "aces":
        return 1
      case "reinhard":
        return 2
      case "totos":
        return 3
      case "cinematic":
        return 4
      default:
        return 0
    }
  }

  private rebuildAtlas(): void {
    const chars = this.getActiveChars()
    this.atlasTexture?.dispose()
    this.atlasTexture = buildAsciiAtlas(
      chars,
      this.currentFontWeight,
      this.currentCellSize
    )
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
    return value === "green-terminal" || value === "source"
      ? value
      : "monochrome"
  }

  private resolveFontWeight(value: unknown): AsciiFontWeight {
    return value === "bold" || value === "thin" ? value : "regular"
  }

  private resolveSignalMode(value: unknown): AsciiSignalMode {
    return value === "lightness" ||
      value === "red" ||
      value === "green" ||
      value === "blue"
      ? value
      : "luminance"
  }

  private resolveToneMapping(value: unknown): AsciiToneMapping {
    return value === "aces" ||
      value === "cinematic" ||
      value === "reinhard" ||
      value === "totos"
      ? value
      : "none"
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

    if (
      "getTextureNode" in bloomNode &&
      typeof bloomNode.getTextureNode === "function"
    ) {
      return bloomNode.getTextureNode()
    }

    if (
      "getTexture" in bloomNode &&
      typeof bloomNode.getTexture === "function"
    ) {
      return bloomNode.getTexture()
    }

    throw new Error("Bloom node does not expose a texture getter")
  }

  private trackAtlasTextureNode(uvNode: Node): Node {
    const atlasTextureNode = tslTexture(
      this.atlasTexture ?? new THREE.Texture(),
      uvNode
    )
    this.atlasTextureNodes.push(atlasTextureNode)
    return atlasTextureNode
  }

  private trackSourceTextureNode(uvNode: Node): Node {
    const sourceTextureNode = tslTexture(this.placeholder, uvNode)
    this.sourceTextureNodes.push(sourceTextureNode)
    return sourceTextureNode
  }
}
