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
  buildPatternAtlas,
  type PatternPreset,
} from "./pattern-atlas"
import { createPipelinePlaceholder, PassNode } from "./pass-node"
import type { LayerParameterValues } from "../types/editor"

type Node = TSLNode
type PatternColorMode = "custom" | "monochrome" | "quantized" | "source"

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

export class PatternPass extends PassNode {
  private atlasTexture: THREE.CanvasTexture | null = null
  private atlasTextureNodes: Node[] = []
  private bloomEnabled = false
  private bloomNode: ReturnType<typeof bloom> | null = null
  private readonly bloomIntensityUniform: Node
  private readonly bloomRadiusUniform: Node
  private readonly bloomSoftnessUniform: Node
  private readonly bloomThresholdUniform: Node
  private sourceTextureNodes: Node[] = []

  private readonly bgOpacityUniform: Node
  private readonly cellSizeUniform: Node
  private readonly colorModeUniform: Node
  private readonly customBgColorUniform: Node
  private readonly customColor1Uniform: Node
  private readonly customColor2Uniform: Node
  private readonly customColor3Uniform: Node
  private readonly customColor4Uniform: Node
  private readonly customColorCountUniform: Node
  private readonly customLuminanceBiasUniform: Node
  private readonly invertUniform: Node
  private readonly logicalHeightUniform: Node
  private readonly logicalWidthUniform: Node
  private readonly monoBlueUniform: Node
  private readonly monoGreenUniform: Node
  private readonly monoRedUniform: Node
  private readonly numPatternsUniform: Node
  private readonly placeholder: THREE.Texture

  private atlasBuildRequestId = 0
  private atlasPending = false
  private currentCellSize = 12
  private currentPreset: PatternPreset = "bars"
  private needsRefresh = false

  constructor(layerId: string) {
    super(layerId)
    this.placeholder = createPipelinePlaceholder()
    this.bloomIntensityUniform = uniform(1.25)
    this.bloomRadiusUniform = uniform(6)
    this.bloomSoftnessUniform = uniform(0.35)
    this.bloomThresholdUniform = uniform(0.6)
    this.bgOpacityUniform = uniform(0)
    this.cellSizeUniform = uniform(12)
    this.colorModeUniform = uniform(0)
    this.customColorCountUniform = uniform(4)
    this.customLuminanceBiasUniform = uniform(0)
    this.customBgColorUniform = uniform(new THREE.Vector3(0.96, 0.96, 0.94))
    this.customColor1Uniform = uniform(new THREE.Vector3(0.05, 0.063, 0.078))
    this.customColor2Uniform = uniform(new THREE.Vector3(0.302, 0.314, 0.341))
    this.customColor3Uniform = uniform(new THREE.Vector3(0.588, 0.604, 0.635))
    this.customColor4Uniform = uniform(new THREE.Vector3(0.882, 0.886, 0.871))
    this.invertUniform = uniform(0)
    this.logicalWidthUniform = uniform(1)
    this.logicalHeightUniform = uniform(1)
    this.monoRedUniform = uniform(0.96)
    this.monoGreenUniform = uniform(0.96)
    this.monoBlueUniform = uniform(0.94)
    this.numPatternsUniform = uniform(1)
    this.rebuildAtlas()
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
    this.needsRefresh = false
  }

  override updateParams(params: LayerParameterValues): void {
    const nextCellSize =
      typeof params.cellSize === "number" ? Math.max(4, Math.round(params.cellSize)) : 12
    const nextPreset = this.resolvePreset(params.preset)
    const nextColorMode = this.resolveColorMode(params.colorMode)
    const nextBgOpacity =
      typeof params.bgOpacity === "number" ? clamp01(params.bgOpacity) : 0
    const nextCustomColorCount =
      typeof params.customColorCount === "number"
        ? Math.min(4, Math.max(2, Math.round(params.customColorCount)))
        : 4
    const nextCustomLuminanceBias =
      typeof params.customLuminanceBias === "number"
        ? Math.min(1, Math.max(-1, params.customLuminanceBias))
        : 0
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

    this.bgOpacityUniform.value = nextBgOpacity
    this.bloomIntensityUniform.value = nextBloomIntensity
    this.bloomRadiusUniform.value = nextBloomRadius
    this.bloomSoftnessUniform.value = nextBloomSoftness
    this.bloomThresholdUniform.value = nextBloomThreshold
    this.cellSizeUniform.value = nextCellSize
    this.colorModeUniform.value = this.getColorModeValue(nextColorMode)
    this.customColorCountUniform.value = nextCustomColorCount
    this.customLuminanceBiasUniform.value = nextCustomLuminanceBias
    this.invertUniform.value = params.invert === true ? 1 : 0
    this.monoRedUniform.value = red
    this.monoGreenUniform.value = green
    this.monoBlueUniform.value = blue
    this.setCustomColorUniform(
      this.customBgColorUniform,
      typeof params.customBgColor === "string" ? params.customBgColor : "#F5F5F0",
    )
    this.setCustomColorUniform(
      this.customColor1Uniform,
      typeof params.customColor1 === "string" ? params.customColor1 : "#0d1014",
    )
    this.setCustomColorUniform(
      this.customColor2Uniform,
      typeof params.customColor2 === "string" ? params.customColor2 : "#4d5057",
    )
    this.setCustomColorUniform(
      this.customColor3Uniform,
      typeof params.customColor3 === "string" ? params.customColor3 : "#969aa2",
    )
    this.setCustomColorUniform(
      this.customColor4Uniform,
      typeof params.customColor4 === "string" ? params.customColor4 : "#e1e2de",
    )

    const needsAtlasRebuild =
      nextCellSize !== this.currentCellSize || nextPreset !== this.currentPreset

    this.currentCellSize = nextCellSize
    this.currentPreset = nextPreset

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

  override updateLogicalSize(width: number, height: number): void {
    this.logicalWidthUniform.value = Math.max(1, width)
    this.logicalHeightUniform.value = Math.max(1, height)
  }

  override needsContinuousRender(): boolean {
    return this.atlasPending || this.needsRefresh
  }

  override dispose(): void {
    this.disposeBloomNode()
    this.placeholder.dispose()
    this.atlasTexture?.dispose()
    super.dispose()
  }

  protected override buildEffectNode(): Node {
    if (!(this.cellSizeUniform && this.numPatternsUniform && this.placeholder)) {
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
    const quantizeLevels = vec3(float(7), float(7), float(3))
    const inverseQuantizeLevels = vec3(float(1 / 7), float(1 / 7), float(1 / 3))
    const customBgVec = vec3(
      float(this.customBgColorUniform.x),
      float(this.customBgColorUniform.y),
      float(this.customBgColorUniform.z),
    )
    const customColor1Vec = vec3(
      float(this.customColor1Uniform.x),
      float(this.customColor1Uniform.y),
      float(this.customColor1Uniform.z),
    )
    const customColor2Vec = vec3(
      float(this.customColor2Uniform.x),
      float(this.customColor2Uniform.y),
      float(this.customColor2Uniform.z),
    )
    const customColor3Vec = vec3(
      float(this.customColor3Uniform.x),
      float(this.customColor3Uniform.y),
      float(this.customColor3Uniform.z),
    )
    const customColor4Vec = vec3(
      float(this.customColor4Uniform.x),
      float(this.customColor4Uniform.y),
      float(this.customColor4Uniform.z),
    )
    const customColorCount = clamp(
      float(this.customColorCountUniform),
      float(2),
      float(4),
    )

    const samplePattern = (sampleUv: Node) => {
      const safeUv = clamp(sampleUv, vec2(float(0), float(0)), vec2(float(1), float(1)))
      const screenPixel = floor(safeUv.mul(logicalScreenSize))
      const tileCenterUv = floor(safeUv.div(normalizedCellSize))
        .add(vec2(0.5, 0.5))
        .mul(normalizedCellSize)
      const localCellPixel = vec2(
        mod(screenPixel.x, this.cellSizeUniform),
        mod(screenPixel.y, this.cellSizeUniform),
      )
      const sampledColor = this.trackSourceTextureNode(tileCenterUv)
      const sourceColor = vec3(
        float(sampledColor.r),
        float(sampledColor.g),
        float(sampledColor.b),
      )
      const luma = float(sampledColor.r)
        .mul(float(0.299))
        .add(float(sampledColor.g).mul(float(0.45)))
        .add(float(sampledColor.b).mul(float(0.114)))
      const adjustedLuma = select(
        this.invertUniform.greaterThan(float(0.5)),
        float(1).sub(luma),
        luma,
      )
      const patternIndex = floor(
        clamp(
          adjustedLuma.mul(this.numPatternsUniform.sub(float(1))),
          float(0),
          this.numPatternsUniform.sub(float(1)),
        ),
      )
      const atlasUv = vec2(
        patternIndex
          .mul(this.cellSizeUniform)
          .add(localCellPixel.x)
          .add(float(0.5))
          .div(this.numPatternsUniform.mul(this.cellSizeUniform)),
        localCellPixel.y.add(float(0.5)).div(this.cellSizeUniform),
      )
      const patternMask = float(this.trackAtlasTextureNode(atlasUv).r)
      const quantized = floor(sourceColor.mul(quantizeLevels).add(vec3(0.5, 0.5, 0.5))).mul(
        inverseQuantizeLevels,
      )
      const quantizedLuma = float(quantized.x)
        .mul(float(0.299))
        .add(float(quantized.y).mul(float(0.45)))
        .add(float(quantized.z).mul(float(0.114)))
      const quantizedColor = clamp(
        mix(vec3(quantizedLuma, quantizedLuma, quantizedLuma), quantized, float(1.2)),
        vec3(float(0), float(0), float(0)),
        vec3(float(1), float(1), float(1)),
      )
      const monochromeColor = vec3(
        this.monoRedUniform,
        this.monoGreenUniform,
        this.monoBlueUniform,
      ).mul(adjustedLuma)
      const customLuminance = clamp(
        adjustedLuma.add(float(this.customLuminanceBiasUniform).mul(float(0.35))),
        float(0),
        float(1),
      )
      const customColor = select(
        customColorCount.lessThan(float(2.5)),
        select(
          customLuminance.lessThan(float(0.5)),
          customColor1Vec,
          customColor2Vec,
        ),
        select(
          customColorCount.lessThan(float(3.5)),
          select(
            customLuminance.lessThan(float(1 / 3)),
            customColor1Vec,
            select(
              customLuminance.lessThan(float(2 / 3)),
              customColor2Vec,
              customColor3Vec,
            ),
          ),
          select(
            customLuminance.lessThan(float(0.25)),
            customColor1Vec,
            select(
              customLuminance.lessThan(float(0.5)),
              customColor2Vec,
              select(
                customLuminance.lessThan(float(0.75)),
                customColor3Vec,
                customColor4Vec,
              ),
            ),
          ),
        ),
      )
      const patternColor = select(
        this.colorModeUniform.lessThan(float(0.5)),
        sourceColor,
        select(
          this.colorModeUniform.lessThan(float(1.5)),
          quantizedColor,
          select(
            this.colorModeUniform.lessThan(float(2.5)),
            monochromeColor,
            customColor,
          ),
        ),
      )
      const sourceBackground = sourceColor.mul(this.bgOpacityUniform)
      const backgroundColor = select(
        this.colorModeUniform.lessThan(float(0.5)),
        sourceBackground,
        select(
          this.colorModeUniform.lessThan(float(2.5)),
          vec3(float(0), float(0), float(0)),
          customBgVec,
        ),
      )

      return vec4(mix(backgroundColor, patternColor, patternMask), float(1))
    }

    const baseSample = samplePattern(renderTargetUv)

    if (!this.bloomEnabled) {
      return baseSample
    }

    this.bloomNode = bloom(
      vec4(baseSample.rgb, float(1)),
      this.bloomIntensityUniform.value as number,
      this.normalizeBloomRadius(this.bloomRadiusUniform.value as number),
      this.bloomThresholdUniform.value as number,
    )
    this.bloomNode.smoothWidth.value = this.normalizeBloomSoftness(
      this.bloomSoftnessUniform.value as number,
    )

    return vec4(
      clamp(
        baseSample.rgb.add(this.getBloomTextureNode().rgb),
        vec3(float(0), float(0), float(0)),
        vec3(float(1), float(1), float(1)),
      ),
      float(1),
    )
  }

  private getColorModeValue(colorMode: PatternColorMode): number {
    switch (colorMode) {
      case "quantized":
        return 1
      case "monochrome":
        return 2
      case "custom":
        return 3
      default:
        return 0
    }
  }

  private rebuildAtlas(): void {
    const requestId = ++this.atlasBuildRequestId
    this.atlasPending = true

    void buildPatternAtlas(this.currentPreset, this.currentCellSize)
      .then((atlasTexture) => {
        if (requestId !== this.atlasBuildRequestId) {
          atlasTexture.dispose()
          return
        }

        this.atlasTexture?.dispose()
        this.atlasTexture = atlasTexture
        this.numPatternsUniform.value = atlasTexture.image.width / this.currentCellSize
        this.atlasPending = false
        this.needsRefresh = true
        this.rebuildEffectNode()
      })
      .catch(() => {
        if (requestId !== this.atlasBuildRequestId) {
          return
        }

        this.atlasPending = false
        this.needsRefresh = true
      })
  }

  private resolveColorMode(value: unknown): PatternColorMode {
    return value === "quantized" || value === "monochrome" || value === "custom"
      ? value
      : "source"
  }

  private resolvePreset(value: unknown): PatternPreset {
    return value === "candles" || value === "shapes" ? value : "bars"
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

  private setCustomColorUniform(target: Node, value: string): void {
    const [r, g, b] = parseCssColorRgb(value)
    ;(target.value as THREE.Vector3).set(r, g, b)
  }
}
