import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js"
import {
  abs,
  atan,
  clamp,
  cos,
  dot,
  float,
  floor,
  fract,
  Loop,
  max,
  min,
  mix,
  mod,
  PI,
  pow,
  select,
  sin,
  smoothstep,
  sqrt,
  step,
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
  type AsciiAtlas,
  type AsciiAtlasOptions,
  ASCII_CHARSETS,
  buildAsciiAtlas,
  DEFAULT_ASCII_CHARS,
  DEFAULT_EDGE_CHARS,
  isAsciiFontReady,
  loadAsciiFont,
} from "./ascii-atlas"
import { GridRenderPass } from "./grid-render-pass"
import { createPipelinePlaceholder, PassNode } from "./pass-node"
import {
  acesTonemap,
  cinematicTonemap,
  reinhardTonemap,
  totosTonemap,
} from "./shaders/tsl/color/tonemapping"
import { normalizeTextFontWeight } from "./text-fonts"
import type { LayerParameterValues } from "../types/editor"

type Node = TSLNode
type AsciiColorMode = "green-terminal" | "monochrome" | "source"
type AsciiCharset = keyof typeof ASCII_CHARSETS | "custom"
type AsciiToneMapping = "none" | "aces" | "cinematic" | "reinhard" | "totos"
type AsciiSignalMode = "blue" | "green" | "lightness" | "luminance" | "red"
type AsciiRenderMode = "pixel" | "smooth"
type AsciiGlyphSource = "contour" | "contour-structure" | "ramp" | "structure"

const ATLAS_INNER_HEIGHT = 64
const DEFAULT_FONT_FAMILY = "mono"
const SUPERSAMPLE = 3
const FEATURE_SIZE = 4
const FEATURE_TEXELS = 4
const MAX_GRID_DIMENSION = 4096
const WARP_MAX_CELLS = 12

const LEGACY_FONT_WEIGHTS: Record<string, number> = {
  bold: 700,
  regular: 400,
  thin: 100,
}

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

  if (hex.length === 6 || hex.length === 3) {
    const color = new THREE.Color(`#${hex}`)

    return [color.r, color.g, color.b]
  }

  return [1, 1, 1]
}

export class AsciiPass extends PassNode {
  private atlas: AsciiAtlas | null = null
  private atlasTextureNodes: Node[] = []
  private featureTextureNodes: Node[] = []
  private analysisSourceNodes: Node[] = []
  private bloomEnabled = false
  private bloomNode: ReturnType<typeof bloom> | null = null
  private shimmerEnabled = false
  private fontLoadToken = 0
  private logicalWidth = 1
  private logicalHeight = 1
  private outputWidth = 1
  private gridWidth = 1
  private gridHeight = 1

  private readonly lumaPass: GridRenderPass
  private readonly layoutPass: GridRenderPass
  private readonly edgePass: GridRenderPass
  private readonly cellPass: GridRenderPass
  private readonly statePass: GridRenderPass

  private readonly atlasColumnsUniform: Node
  private readonly atlasInnerHeightUniform: Node
  private readonly atlasInnerXUniform: Node
  private readonly atlasInnerYUniform: Node
  private readonly atlasPadXUniform: Node
  private readonly atlasPadYUniform: Node
  private readonly atlasRowsUniform: Node
  private readonly bgOpacityUniform: Node
  private readonly bloomIntensityUniform: Node
  private readonly bloomRadiusUniform: Node
  private readonly bloomSoftnessUniform: Node
  private readonly bloomThresholdUniform: Node
  private readonly boldnessUniform: Node
  private readonly advectionUniform: Node
  private readonly scrambleAmountUniform: Node
  private readonly scrambleDecayUniform: Node
  private readonly temporalResetUniform: Node
  private readonly breakBiasUniform: Node
  private readonly flowWarpUniform: Node
  private readonly warpQuantumUniform: Node
  private readonly rowWarpUniform: Node
  private readonly breakThresholdUniform: Node
  private readonly cellUvWidthUniform: Node
  private readonly cellUvHeightUniform: Node
  private readonly gridOriginXUniform: Node
  private readonly gridOriginYUniform: Node
  private readonly cellAspectUniform: Node
  private readonly cellSizeUniform: Node
  private readonly charCountUniform: Node
  private readonly colorModeUniform: Node
  private readonly colorSignalModeUniform: Node
  private readonly contourStrengthUniform: Node
  private readonly contourThresholdUniform: Node
  private readonly edgeStartUniform: Node
  private readonly glyphRotationUniform: Node
  private readonly glyphScaleAmountUniform: Node
  private readonly glyphScaleMinUniform: Node
  private readonly glyphScaleSourceUniform: Node
  private readonly glyphSignalModeUniform: Node
  private readonly gridHeightUniform: Node
  private readonly gridWidthUniform: Node
  private readonly invertUniform: Node
  private readonly logicalHeightUniform: Node
  private readonly logicalWidthUniform: Node
  private readonly monoBlueUniform: Node
  private readonly monoGreenUniform: Node
  private readonly monoRedUniform: Node
  private readonly placeholder: THREE.Texture
  private readonly presenceSoftnessUniform: Node
  private readonly presenceThresholdUniform: Node
  private readonly rampCountUniform: Node
  private readonly renderScaleUniform: Node
  private readonly sdfRadiusUniform: Node
  private readonly shimmerAmountUniform: Node
  private readonly shimmerSpeedUniform: Node
  private readonly signalBlackPointUniform: Node
  private readonly signalGammaUniform: Node
  private readonly signalWhitePointUniform: Node
  private readonly structureContrastUniform: Node
  private readonly timeUniform: Node
  private readonly toneMappingModeUniform: Node

  private currentCellUnit: "columns" | "px" = "px"
  private currentColumns = 80
  private currentAutoSort = true
  private currentBreakLevels = 0
  private currentWarpEnabled = false
  private currentWarpRigid = false
  private currentTemporalEnabled = false
  private lastRenderTime = 0
  private temporalResetPending = true
  private stateReadNodes: Node[] = []
  private stateOutputNodes: Node[] = []
  private currentCellAspect = 0
  private currentCharset: AsciiCharset = "light"
  private currentCustomChars = DEFAULT_ASCII_CHARS
  private currentFontFamily = DEFAULT_FONT_FAMILY
  private currentFontWeight = 400
  private currentGlyphSource: AsciiGlyphSource = "ramp"
  private currentRenderMode: AsciiRenderMode = "smooth"

  constructor(layerId: string) {
    super(layerId)
    this.placeholder = createPipelinePlaceholder()
    this.lumaPass = new GridRenderPass({ linear: true })
    this.layoutPass = new GridRenderPass()
    this.edgePass = new GridRenderPass()
    this.cellPass = new GridRenderPass()
    this.statePass = new GridRenderPass({ pingPong: true })
    this.atlasColumnsUniform = uniform(1)
    this.atlasInnerHeightUniform = uniform(ATLAS_INNER_HEIGHT)
    this.atlasInnerXUniform = uniform(1)
    this.atlasInnerYUniform = uniform(1)
    this.atlasPadXUniform = uniform(0)
    this.atlasPadYUniform = uniform(0)
    this.atlasRowsUniform = uniform(1)
    this.bgOpacityUniform = uniform(0)
    this.bloomIntensityUniform = uniform(1.25)
    this.bloomRadiusUniform = uniform(6)
    this.bloomSoftnessUniform = uniform(0.35)
    this.bloomThresholdUniform = uniform(0.6)
    this.boldnessUniform = uniform(0)
    this.advectionUniform = uniform(0)
    this.scrambleAmountUniform = uniform(0)
    this.scrambleDecayUniform = uniform(0.85)
    this.temporalResetUniform = uniform(1)
    this.breakBiasUniform = uniform(0)
    this.flowWarpUniform = uniform(0)
    this.warpQuantumUniform = uniform(1)
    this.rowWarpUniform = uniform(0)
    this.breakThresholdUniform = uniform(0.06)
    this.cellUvWidthUniform = uniform(0.01)
    this.cellUvHeightUniform = uniform(0.01)
    this.gridOriginXUniform = uniform(0)
    this.gridOriginYUniform = uniform(0)
    this.cellAspectUniform = uniform(0.6)
    this.cellSizeUniform = uniform(12)
    this.charCountUniform = uniform(DEFAULT_ASCII_CHARS.length)
    this.colorModeUniform = uniform(1)
    this.colorSignalModeUniform = uniform(0)
    this.contourStrengthUniform = uniform(1)
    this.contourThresholdUniform = uniform(0.08)
    this.edgeStartUniform = uniform(DEFAULT_ASCII_CHARS.length)
    this.glyphRotationUniform = uniform(0)
    this.glyphScaleAmountUniform = uniform(0)
    this.glyphScaleMinUniform = uniform(0.2)
    this.glyphScaleSourceUniform = uniform(0)
    this.glyphSignalModeUniform = uniform(0)
    this.gridHeightUniform = uniform(1)
    this.gridWidthUniform = uniform(1)
    this.invertUniform = uniform(0)
    this.logicalHeightUniform = uniform(1)
    this.logicalWidthUniform = uniform(1)
    this.monoBlueUniform = uniform(0.94)
    this.monoGreenUniform = uniform(0.96)
    this.monoRedUniform = uniform(0.96)
    this.presenceSoftnessUniform = uniform(0)
    this.presenceThresholdUniform = uniform(0)
    this.rampCountUniform = uniform(DEFAULT_ASCII_CHARS.length)
    this.renderScaleUniform = uniform(1)
    this.sdfRadiusUniform = uniform(8)
    this.shimmerAmountUniform = uniform(0)
    this.shimmerSpeedUniform = uniform(1)
    this.signalBlackPointUniform = uniform(0)
    this.signalGammaUniform = uniform(1)
    this.signalWhitePointUniform = uniform(1)
    this.structureContrastUniform = uniform(0.06)
    this.timeUniform = uniform(0)
    this.toneMappingModeUniform = uniform(0)
    this.rebuildAtlas()
    this.rebuildGridPasses()
    this.rebuildEffectNode()
  }

  override render(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number
  ): void {
    this.syncGridSize()

    for (const node of this.analysisSourceNodes) {
      node.value = inputTexture
    }

    const atlasTexture = this.atlas?.texture

    if (atlasTexture) {
      for (const node of this.atlasTextureNodes) {
        node.value = atlasTexture
      }
    }

    const featureTexture = this.atlas?.featureTexture

    if (featureTexture) {
      for (const node of this.featureTextureNodes) {
        node.value = featureTexture
      }
    }

    this.lumaPass.render(renderer)
    this.layoutPass.render(renderer)
    this.edgePass.render(renderer)
    this.cellPass.render(renderer)

    if (this.currentTemporalEnabled) {
      const scrubbedBackwards = time < this.lastRenderTime
      this.temporalResetUniform.value =
        this.temporalResetPending || scrubbedBackwards ? 0 : 1
      this.temporalResetPending = false

      // Before rendering, `texture` is still last frame's result — that is what
      // the state graph must read. `previousTexture` is the buffer about to be
      // written, and sampling it while writing it is undefined.
      for (const node of this.stateReadNodes) {
        node.value = this.statePass.texture
      }

      this.statePass.render(renderer)

      for (const node of this.stateOutputNodes) {
        node.value = this.statePass.texture
      }
    }

    this.lastRenderTime = time

    super.render(renderer, inputTexture, outputTarget, time, delta)
  }

  override updateParams(params: LayerParameterValues): void {
    const nextCellSize =
      typeof params.cellSize === "number" ? Math.max(4, params.cellSize) : 12
    const nextCharset = this.resolveCharset(params.charset)
    const nextCustomChars =
      typeof params.customChars === "string"
        ? params.customChars
        : DEFAULT_ASCII_CHARS
    const nextFontFamily =
      typeof params.fontFamily === "string" && params.fontFamily.length > 0
        ? params.fontFamily
        : DEFAULT_FONT_FAMILY
    const nextFontWeight = this.resolveFontWeight(
      nextFontFamily,
      params.fontWeight
    )
    const nextCellAspect =
      typeof params.cellAspect === "number"
        ? Math.max(0, Math.min(2, params.cellAspect))
        : 0
    const nextAutoSort = params.autoSortCharset !== false
    const nextBreakLevels = this.resolveBreakLevels(params.breakGrid)
    this.currentCellUnit = params.cellUnit === "columns" ? "columns" : "px"
    this.currentColumns =
      typeof params.columns === "number"
        ? Math.max(4, Math.min(600, Math.round(params.columns)))
        : 80
    const nextRowWarp =
      typeof params.rowWarp === "number" ? clamp01(params.rowWarp) : 0
    const nextFlowWarp =
      typeof params.flowWarp === "number" ? clamp01(params.flowWarp) : 0
    const nextWarpEnabled = nextRowWarp > 0 || nextFlowWarp > 0
    const nextWarpRigid = params.warpMode === "rigid"
    const nextAdvection =
      typeof params.advection === "number" ? clamp01(params.advection) : 0
    const nextScramble =
      typeof params.motionScramble === "number"
        ? clamp01(params.motionScramble)
        : 0
    const nextTemporalEnabled = nextAdvection > 0 || nextScramble > 0
    const nextRenderMode = this.resolveRenderMode(params.renderMode)
    const nextGlyphSource = this.resolveGlyphSource(params.glyphSource)
    const nextBoldness =
      typeof params.boldness === "number"
        ? Math.max(-1, Math.min(1, params.boldness))
        : 0
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

    this.bgOpacityUniform.value = nextBgOpacity
    this.bloomIntensityUniform.value = nextBloomIntensity
    this.bloomRadiusUniform.value = nextBloomRadius
    this.bloomSoftnessUniform.value = nextBloomSoftness
    this.bloomThresholdUniform.value = nextBloomThreshold
    this.boldnessUniform.value = nextBoldness
    this.advectionUniform.value = nextAdvection
    this.scrambleAmountUniform.value = nextScramble
    this.scrambleDecayUniform.value =
      typeof params.scrambleDecay === "number"
        ? Math.max(0, Math.min(0.99, params.scrambleDecay))
        : 0.85
    this.flowWarpUniform.value = nextFlowWarp
    this.warpQuantumUniform.value = 2 ** nextBreakLevels
    this.rowWarpUniform.value = nextRowWarp
    this.breakBiasUniform.value =
      typeof params.breakBias === "number"
        ? Math.max(0, Math.min(3, params.breakBias))
        : 0
    this.breakThresholdUniform.value =
      typeof params.breakThreshold === "number"
        ? Math.max(0.001, Math.min(1, params.breakThreshold))
        : 0.06
    this.cellSizeUniform.value = nextCellSize
    this.colorModeUniform.value = this.getColorModeValue(nextColorMode)
    this.colorSignalModeUniform.value = this.getSignalModeValue(
      this.resolveSignalMode(params.colorSignalMode)
    )
    this.contourStrengthUniform.value =
      typeof params.contourStrength === "number"
        ? clamp01(params.contourStrength)
        : 1
    this.contourThresholdUniform.value =
      typeof params.contourThreshold === "number"
        ? Math.max(0.001, Math.min(1, params.contourThreshold))
        : 0.08
    this.glyphRotationUniform.value =
      typeof params.glyphRotation === "number"
        ? clamp01(params.glyphRotation)
        : 0
    this.glyphScaleAmountUniform.value =
      typeof params.glyphScale === "number" ? clamp01(params.glyphScale) : 0
    this.glyphScaleMinUniform.value =
      typeof params.glyphScaleMin === "number"
        ? clamp01(params.glyphScaleMin)
        : 0.2
    this.glyphScaleSourceUniform.value = this.getScaleSourceValue(
      params.glyphScaleSource
    )
    this.glyphSignalModeUniform.value = this.getSignalModeValue(
      this.resolveSignalMode(params.glyphSignalMode)
    )
    this.invertUniform.value = params.invert === true ? 1 : 0
    this.monoBlueUniform.value = blue
    this.monoGreenUniform.value = green
    this.monoRedUniform.value = red
    this.presenceSoftnessUniform.value =
      typeof params.presenceSoftness === "number"
        ? clamp01(params.presenceSoftness)
        : 0
    this.presenceThresholdUniform.value =
      typeof params.presenceThreshold === "number"
        ? clamp01(params.presenceThreshold)
        : 0
    this.signalBlackPointUniform.value =
      typeof params.signalBlackPoint === "number"
        ? clamp01(params.signalBlackPoint)
        : 0
    this.signalGammaUniform.value =
      typeof params.signalGamma === "number"
        ? Math.max(0.1, Math.min(5, params.signalGamma))
        : 1
    this.signalWhitePointUniform.value =
      typeof params.signalWhitePoint === "number"
        ? clamp01(params.signalWhitePoint)
        : 1
    this.structureContrastUniform.value =
      typeof params.structureContrast === "number"
        ? Math.max(0.001, Math.min(0.5, params.structureContrast))
        : 0.06
    this.toneMappingModeUniform.value = this.getToneMappingValue(
      this.resolveToneMapping(params.toneMapping)
    )

    const nextShimmerAmount =
      typeof params.shimmerAmount === "number"
        ? clamp01(params.shimmerAmount)
        : 0
    this.shimmerAmountUniform.value = nextShimmerAmount
    this.shimmerSpeedUniform.value =
      typeof params.shimmerSpeed === "number"
        ? Math.max(0, Math.min(10, params.shimmerSpeed))
        : 1
    this.shimmerEnabled = nextShimmerAmount > 0

    const needsAtlasRebuild =
      nextCharset !== this.currentCharset ||
      nextFontFamily !== this.currentFontFamily ||
      nextFontWeight !== this.currentFontWeight ||
      nextCellAspect !== this.currentCellAspect ||
      nextAutoSort !== this.currentAutoSort ||
      (nextCharset === "custom" && nextCustomChars !== this.currentCustomChars)

    this.currentAutoSort = nextAutoSort
    this.currentCellAspect = nextCellAspect
    this.currentCharset = nextCharset
    this.currentCustomChars = nextCustomChars
    this.currentFontFamily = nextFontFamily
    this.currentFontWeight = nextFontWeight

    if (needsAtlasRebuild) {
      this.rebuildAtlas()
    }

    const breakLevelsChanged = nextBreakLevels !== this.currentBreakLevels
    this.currentBreakLevels = nextBreakLevels
    const glyphSourceChanged = nextGlyphSource !== this.currentGlyphSource
    const temporalChanged = nextTemporalEnabled !== this.currentTemporalEnabled
    this.currentTemporalEnabled = nextTemporalEnabled
    const warpEnabledChanged =
      nextWarpEnabled !== this.currentWarpEnabled ||
      nextWarpRigid !== this.currentWarpRigid
    this.currentWarpEnabled = nextWarpEnabled
    this.currentWarpRigid = nextWarpRigid
    const renderModeChanged = nextRenderMode !== this.currentRenderMode
    const bloomChanged = nextBloomEnabled !== this.bloomEnabled

    this.currentGlyphSource = nextGlyphSource
    this.currentRenderMode = nextRenderMode
    this.bloomEnabled = nextBloomEnabled

    if (glyphSourceChanged || breakLevelsChanged || temporalChanged) {
      this.rebuildGridPasses()
    }

    if (
      renderModeChanged ||
      bloomChanged ||
      warpEnabledChanged ||
      temporalChanged
    ) {
      this.rebuildEffectNode()
    }

    if (this.bloomNode) {
      this.bloomNode.strength.value = nextBloomIntensity
      this.bloomNode.radius.value = this.normalizeBloomRadius(nextBloomRadius)
      this.bloomNode.threshold.value = nextBloomThreshold
      this.bloomNode.smoothWidth.value =
        this.normalizeBloomSoftness(nextBloomSoftness)
    }
  }

  override dispose(): void {
    this.disposeBloomNode()
    this.placeholder.dispose()
    this.atlas?.texture.dispose()
    this.atlas?.featureTexture.dispose()
    this.lumaPass.dispose()
    this.layoutPass.dispose()
    this.edgePass.dispose()
    this.cellPass.dispose()
    this.statePass.dispose()
    super.dispose()
  }

  override resize(width: number, _height: number): void {
    this.outputWidth = Math.max(1, width)
    this.recomputeRenderScale()
  }

  override updateLogicalSize(width: number, height: number): void {
    this.logicalWidth = Math.max(1, width)
    this.logicalHeight = Math.max(1, height)
    this.logicalWidthUniform.value = this.logicalWidth
    this.logicalHeightUniform.value = this.logicalHeight
    this.recomputeRenderScale()
  }

  protected override beforeRender(time: number): void {
    this.timeUniform.value = time
  }

  override needsContinuousRender(): boolean {
    return this.shimmerEnabled || this.currentTemporalEnabled
  }

  private getCompositionFrameSize(): {
    height: number
    width: number
    x: number
    y: number
  } {
    return {
      height: this.logicalHeight,
      width: this.logicalWidth,
      x: 0,
      y: 0,
    }
  }

  private syncGridSize(): void {
    const aspect = this.atlas?.cellAspect ?? 0.6
    const frame = this.getCompositionFrameSize()

    // Cell height in logical px. In Columns mode it is derived from the
    // composition frame, so the same setting yields the same number of cells
    // across the composition in the viewport and in an export of any size.
    const cellHeight =
      this.currentCellUnit === "columns"
        ? Math.max(1, frame.width / Math.max(1, this.currentColumns) / aspect)
        : Math.max(1, (this.cellSizeUniform.value as number) || 12)
    const cellWidth = Math.max(0.5, cellHeight * aspect)

    const cellUvWidth = cellWidth / this.logicalWidth
    const cellUvHeight = cellHeight / this.logicalHeight

    // Align a cell boundary to the composition's top-left so the phase of the
    // grid matches too, not just its density. Shifted back by whole cells to
    // keep every visible cell index non-negative.
    const frameXUv = frame.x / this.logicalWidth
    const frameYUv = frame.y / this.logicalHeight
    const originX = frameXUv - Math.ceil(frameXUv / cellUvWidth) * cellUvWidth
    const originY = frameYUv - Math.ceil(frameYUv / cellUvHeight) * cellUvHeight

    const gridWidth = Math.min(
      MAX_GRID_DIMENSION,
      Math.max(1, Math.ceil((1 - originX) / cellUvWidth))
    )
    const gridHeight = Math.min(
      MAX_GRID_DIMENSION,
      Math.max(1, Math.ceil((1 - originY) / cellUvHeight))
    )

    this.cellUvWidthUniform.value = cellUvWidth
    this.cellUvHeightUniform.value = cellUvHeight
    this.gridOriginXUniform.value = originX
    this.gridOriginYUniform.value = originY

    if (gridWidth === this.gridWidth && gridHeight === this.gridHeight) {
      return
    }

    this.gridWidth = gridWidth
    this.gridHeight = gridHeight
    this.gridWidthUniform.value = gridWidth
    this.gridHeightUniform.value = gridHeight
    this.lumaPass.setSize(gridWidth, gridHeight)
    this.layoutPass.setSize(gridWidth, gridHeight)
    this.edgePass.setSize(gridWidth, gridHeight)
    this.cellPass.setSize(gridWidth, gridHeight)
    this.statePass.setSize(gridWidth, gridHeight)
  }


  private getCellUvSize(): Node {
    return vec2(this.cellUvWidthUniform, this.cellUvHeightUniform)
  }

  private getGridOrigin(): Node {
    return vec2(this.gridOriginXUniform, this.gridOriginYUniform)
  }

  private buildLumaColorNode(): Node {
    this.analysisSourceNodes = []

    const gridSize = vec2(this.gridWidthUniform, this.gridHeightUniform)
    const cellUvSize = this.getCellUvSize()
    const gridUv = vec2(uv().x, float(1).sub(uv().y))
    const cellId = floor(gridUv.mul(gridSize))
    const cellOrigin = this.getGridOrigin().add(cellId.mul(cellUvSize))

    let accumulated = vec3(float(0), float(0), float(0))

    for (let row = 0; row < SUPERSAMPLE; row += 1) {
      for (let column = 0; column < SUPERSAMPLE; column += 1) {
        const offset = vec2(
          float((column + 0.5) / SUPERSAMPLE),
          float((row + 0.5) / SUPERSAMPLE)
        ).mul(cellUvSize)
        const sampleUv = clamp(
          cellOrigin.add(offset),
          vec2(float(0), float(0)),
          vec2(float(1), float(1))
        )
        const sampled = this.trackAnalysisSourceNode(sampleUv)
        accumulated = accumulated.add(
          vec3(float(sampled.r), float(sampled.g), float(sampled.b))
        )
      }
    }

    const averaged = accumulated.div(float(SUPERSAMPLE * SUPERSAMPLE))

    return vec4(averaged, float(1))
  }

  private trackStateReadNode(uvNode: Node): Node {
    const node = tslTexture(this.statePass.previousTexture, uvNode)
    this.stateReadNodes.push(node)
    return node
  }

  private trackStateOutputNode(uvNode: Node): Node {
    const node = tslTexture(this.statePass.texture, uvNode)
    this.stateOutputNodes.push(node)
    return node
  }

  // Per-cell temporal state, ping-ponged so it can read its own last frame.
  // R = the glyph this cell is currently showing, carried across frames.
  // G = scramble energy, decaying.
  // B = last frame's luminance, which is what makes motion detectable at all.
  private buildStateColorNode(): Node {
    this.stateReadNodes = []

    const gridSize = vec2(this.gridWidthUniform, this.gridHeightUniform)
    const texelSize = vec2(float(1), float(1)).div(gridSize)
    const gridUv = vec2(uv().x, float(1).sub(uv().y))
    const cellId = floor(gridUv.mul(gridSize))
    const centerUv = cellId.add(vec2(0.5, 0.5)).mul(texelSize)

    const sampleLuma = (offset: Node) => {
      const sampled = this.trackLumaTextureNode(
        clamp(
          centerUv.add(offset),
          vec2(float(0), float(0)),
          vec2(float(1), float(1))
        )
      )

      return this.buildLuma(
        vec3(float(sampled.r), float(sampled.g), float(sampled.b))
      )
    }

    const currentLuma = sampleLuma(vec2(float(0), float(0)))
    const previousSelf = this.trackStateReadNode(centerUv)
    const previousLuma = float(previousSelf.b)
    const lumaDelta = currentLuma.sub(previousLuma)

    // Optical flow, one Lucas-Kanade step: v = -dI/dt * grad / |grad|^2.
    // Tells us where this cell's content sat last frame, so the character can
    // travel with the image instead of being re-picked from scratch.
    const gradientX = sampleLuma(vec2(texelSize.x, float(0)))
      .sub(sampleLuma(vec2(texelSize.x.negate(), float(0))))
      .mul(float(0.5))
    const gradientY = sampleLuma(vec2(float(0), texelSize.y))
      .sub(sampleLuma(vec2(float(0), texelSize.y.negate())))
      .mul(float(0.5))
    const gradientSquared = gradientX
      .mul(gradientX)
      .add(gradientY.mul(gradientY))
      .add(float(1e-4))
    const flowScale = lumaDelta.negate().div(gradientSquared)
    const flow = vec2(
      clamp(gradientX.mul(flowScale), float(-2), float(2)),
      clamp(gradientY.mul(flowScale), float(-2), float(2))
    ).mul(texelSize)

    const advectedUv = clamp(
      centerUv.sub(flow.mul(this.advectionUniform)),
      vec2(float(0), float(0)),
      vec2(float(1), float(1))
    )
    const previousAdvected = this.trackStateReadNode(advectedUv)
    const carriedIndex = float(previousAdvected.r)
    const carriedEnergy = float(previousAdvected.g)

    const targetIndex = float(this.trackCellTextureNode(centerUv).r)

    // Keep the carried character while it still represents this cell within
    // tolerance. Advection widens the tolerance; at zero it never carries.
    const tolerance = this.advectionUniform.mul(this.rampCountUniform).mul(
      float(0.35)
    )
    const keepCarried = step(abs(carriedIndex.sub(targetIndex)), tolerance)
    const settledIndex = mix(targetIndex, carriedIndex, keepCarried)

    const motion = abs(lumaDelta)
    const energy = max(
      carriedEnergy.mul(this.scrambleDecayUniform),
      motion.mul(this.scrambleAmountUniform).mul(float(6))
    )

    const noise = fract(
      sin(
        dot(
          cellId.add(floor(this.timeUniform.mul(float(24)))),
          vec2(12.9898, 78.233)
        )
      ).mul(float(43758.5453))
    )
    const randomIndex = floor(noise.mul(this.rampCountUniform))
    const scrambleGate = step(float(0.35), energy)
    const scrambled = mix(settledIndex, randomIndex, scrambleGate)

    // On a backward scrub the history is meaningless, so fall back to the
    // freshly chosen character and let the state rebuild from there.
    const resolvedIndex = mix(targetIndex, scrambled, this.temporalResetUniform)

    return vec4(
      resolvedIndex,
      energy.mul(this.temporalResetUniform),
      currentLuma,
      float(1)
    )
  }

  private buildEdgeColorNode(): Node {
    const gridSize = vec2(this.gridWidthUniform, this.gridHeightUniform)
    const texelSize = vec2(float(1), float(1)).div(gridSize)
    const gridUv = vec2(uv().x, float(1).sub(uv().y))
    const cellId = floor(gridUv.mul(gridSize))
    const centerUv = cellId.add(vec2(0.5, 0.5)).mul(texelSize)

    const sampleLuma = (offset: Node) => {
      const sampled = this.trackLumaTextureNode(
        clamp(
          centerUv.add(offset),
          vec2(float(0), float(0)),
          vec2(float(1), float(1))
        )
      )

      return this.buildLuma(
        vec3(float(sampled.r), float(sampled.g), float(sampled.b))
      )
    }

    const centerLuma = sampleLuma(vec2(float(0), float(0)))
    const leftLuma = sampleLuma(vec2(texelSize.x.negate(), float(0)))
    const rightLuma = sampleLuma(vec2(texelSize.x, float(0)))
    const topLuma = sampleLuma(vec2(float(0), texelSize.y.negate()))
    const bottomLuma = sampleLuma(vec2(float(0), texelSize.y))

    const gradientX = rightLuma.sub(leftLuma)
    const gradientY = bottomLuma.sub(topLuma)
    const gradientMagnitude = clamp(
      sqrt(gradientX.mul(gradientX).add(gradientY.mul(gradientY))),
      float(0),
      float(1)
    )
    const blurred = leftLuma
      .add(rightLuma)
      .add(topLuma)
      .add(bottomLuma)
      .div(float(4))
    const differenceOfGaussians = abs(centerLuma.sub(blurred))

    const isFlat = gradientMagnitude.lessThan(float(1e-5))
    const safeGradientX = select(isFlat, float(1), gradientX)
    const safeGradientY = select(isFlat, float(0), gradientY)
    const edgeAngle = atan(safeGradientY, safeGradientX).add(PI.mul(float(0.5)))
    const normalizedAngle = fract(edgeAngle.div(PI))
    const flowConfidence = smoothstep(
      float(0),
      this.contourThresholdUniform,
      gradientMagnitude
    )
    const packedAngle = mix(float(0.5), normalizedAngle, flowConfidence)

    return vec4(
      packedAngle,
      gradientMagnitude,
      differenceOfGaussians,
      float(1)
    )
  }

  private buildCellColorNode(): Node {
    this.featureTextureNodes = []

    const gridSize = vec2(this.gridWidthUniform, this.gridHeightUniform)
    const texelSize = vec2(float(1), float(1)).div(gridSize)
    const gridUv = vec2(uv().x, float(1).sub(uv().y))
    const cellId = floor(gridUv.mul(gridSize))
    const centerUv = cellId.add(vec2(0.5, 0.5)).mul(texelSize)

    const level = float(this.trackLayoutTextureNode(centerUv).r)
    const span = pow(float(2), level)
    const blockOrigin = floor(cellId.div(span)).mul(span)
    const quadrants = this.buildBlockQuadrantCells(blockOrigin, span)
    let blockColor = vec3(float(0), float(0), float(0))

    for (const quadrant of quadrants) {
      const sampled = this.sampleCellLuma(quadrant, gridSize)
      blockColor = blockColor.add(
        vec3(float(sampled.r), float(sampled.g), float(sampled.b))
      )
    }

    const centerColor = blockColor.div(float(4))
    const toneMapped = this.buildToneMappedColor(centerColor)

    const glyphSignal = this.buildShapedSignal(
      toneMapped,
      this.glyphSignalModeUniform
    )
    const colorSignal = this.buildShapedSignal(
      toneMapped,
      this.colorSignalModeUniform
    )

    const edgeData = this.trackEdgeTextureNode(centerUv)
    const packedAngle = float(edgeData.r)
    const gradientMagnitude = float(edgeData.g)
    const differenceOfGaussians = float(edgeData.b)

    const rampIndex = floor(
      clamp(
        glyphSignal.mul(this.rampCountUniform.sub(float(1))),
        float(0),
        this.rampCountUniform.sub(float(1))
      )
    )

    let glyphIndex = rampIndex

    if (
      this.currentGlyphSource === "structure" ||
      this.currentGlyphSource === "contour-structure"
    ) {
      glyphIndex = this.buildStructureIndex(
        blockOrigin,
        this.getCellUvSize().mul(span),
        rampIndex
      )
    }

    if (
      this.currentGlyphSource === "contour" ||
      this.currentGlyphSource === "contour-structure"
    ) {
      const edgeOffset = this.buildEdgeOffset(packedAngle)
      const edgeIndex = this.edgeStartUniform.add(edgeOffset)
      const edgeStrength = max(gradientMagnitude, differenceOfGaussians).mul(
        this.contourStrengthUniform
      )
      const edgeGate = step(this.contourThresholdUniform, edgeStrength)
      glyphIndex = mix(glyphIndex, edgeIndex, edgeGate)
    }

    return vec4(glyphIndex, colorSignal, glyphSignal, float(1))
  }

  private buildStructureIndex(
    cellId: Node,
    cellUvSize: Node,
    rampIndex: Node
  ): Node {
    const cellOrigin = this.getGridOrigin().add(cellId.mul(cellUvSize))
    const samples: Node[] = []
    let total = float(0)

    for (let row = 0; row < FEATURE_SIZE; row += 1) {
      for (let column = 0; column < FEATURE_SIZE; column += 1) {
        const offset = vec2(
          float((column + 0.5) / FEATURE_SIZE),
          float((row + 0.5) / FEATURE_SIZE)
        ).mul(cellUvSize)
        const sampled = this.trackAnalysisSourceNode(
          clamp(
            cellOrigin.add(offset),
            vec2(float(0), float(0)),
            vec2(float(1), float(1))
          )
        )
        const value = this.buildLuma(
          vec3(float(sampled.r), float(sampled.g), float(sampled.b))
        )
        samples.push(value)
        total = total.add(value)
      }
    }

    const mean = total.div(float(FEATURE_SIZE * FEATURE_SIZE))
    const centered = samples.map((value) => value.sub(mean))
    let energy = float(0)

    for (const value of centered) {
      energy = energy.add(value.mul(value))
    }

    const norm = max(sqrt(energy), float(1e-4))
    const normalized = centered.map((value) => value.div(norm))
    const packed: Node[] = []

    for (let texel = 0; texel < FEATURE_TEXELS; texel += 1) {
      packed.push(
        vec4(
          normalized[texel * 4] ?? float(0),
          normalized[texel * 4 + 1] ?? float(0),
          normalized[texel * 4 + 2] ?? float(0),
          normalized[texel * 4 + 3] ?? float(0)
        )
      )
    }

    const bestIndex = float(0).toVar()
    const bestScore = float(-2).toVar()

    Loop(this.rampCountUniform, ({ i }) => {
      let score = float(0)

      for (let texel = 0; texel < FEATURE_TEXELS; texel += 1) {
        const glyphTexel = this.trackFeatureTextureNode(
          vec2(
            float(texel).add(float(0.5)).div(float(FEATURE_TEXELS)),
            float(i).add(float(0.5)).div(this.charCountUniform)
          )
        )
        score = score.add(
          dot(
            packed[texel] ?? vec4(float(0), float(0), float(0), float(0)),
            vec4(
              float(glyphTexel.r),
              float(glyphTexel.g),
              float(glyphTexel.b),
              float(glyphTexel.a)
            )
          )
        )
      }

      const better = score.greaterThan(bestScore)
      bestScore.assign(select(better, score, bestScore))
      bestIndex.assign(select(better, float(i), bestIndex))
    })

    const flat = step(norm, this.structureContrastUniform)

    return mix(bestIndex, rampIndex, flat)
  }

  private buildEdgeOffset(packedAngle: Node): Node {
    const bucket = mod(
      floor(packedAngle.mul(float(4)).add(float(0.5))),
      float(4)
    )

    return select(
      bucket.lessThan(float(0.5)),
      float(1),
      select(
        bucket.lessThan(float(1.5)),
        float(2),
        select(bucket.lessThan(float(2.5)), float(0), float(3))
      )
    )
  }

  protected override buildEffectNode(): Node {
    if (!(this.cellSizeUniform && this.rampCountUniform && this.placeholder)) {
      return this.inputNode
    }

    this.disposeBloomNode()
    this.bloomNode = null
    this.atlasTextureNodes = []
    this.stateOutputNodes = []

    const renderTargetUv = vec2(uv().x, float(1).sub(uv().y))
    const gridSize = vec2(this.gridWidthUniform, this.gridHeightUniform)
    const cellUvSize = this.getCellUvSize()

    const sampleAscii = (sampleUv: Node) => {
      const safeUv = clamp(
        sampleUv,
        vec2(float(0), float(0)),
        vec2(float(1), float(1))
      )
      const gridUv = this.buildWarpedUv(safeUv, cellUvSize)
      const gridOrigin = this.getGridOrigin()
      const cellId = floor(gridUv.sub(gridOrigin).div(cellUvSize))
      const cellTexelUv = cellId.add(vec2(0.5, 0.5)).div(gridSize)
      const blockLevel = float(this.trackLayoutTextureNode(cellTexelUv).r)
      const blockSpan = pow(float(2), blockLevel)
      const blockOriginCell = floor(cellId.div(blockSpan)).mul(blockSpan)
      const blockOriginUv = gridOrigin.add(blockOriginCell.mul(cellUvSize))
      const blockUvSize = cellUvSize.mul(blockSpan)
      const localCellUv = gridUv.sub(blockOriginUv).div(blockUvSize)
      const blockTexelUv = blockOriginCell
        .add(blockSpan.mul(float(0.5)))
        .div(gridSize)

      const cellData = this.trackCellTextureNode(cellTexelUv)
      const stateData = this.currentTemporalEnabled
        ? this.trackStateOutputNode(cellTexelUv)
        : null
      const glyphIndex = floor(
        float(stateData ? stateData.r : cellData.r).add(float(0.5))
      )
      const scrambleEnergy = stateData
        ? clamp(float(stateData.g), float(0), float(1))
        : float(0)
      const colorSignalValue = float(cellData.g)
      const presenceSignal = float(cellData.b)
      const packedAngle = float(this.trackEdgeTextureNode(blockTexelUv).r)

      const transformedUv = this.buildGlyphTransform(
        localCellUv,
        packedAngle,
        presenceSignal,
        colorSignalValue
      )
      const insideCell = step(float(0), transformedUv.x)
        .mul(step(transformedUv.x, float(1)))
        .mul(step(float(0), transformedUv.y))
        .mul(step(transformedUv.y, float(1)))

      const cellColor = this.trackLumaTextureNode(cellTexelUv)
      const toneMapped = this.buildToneMappedColor(
        vec3(float(cellColor.r), float(cellColor.g), float(cellColor.b))
      )

      const characterMask = this.buildCharacterMask(
        transformedUv,
        glyphIndex,
        blockSpan
      ).mul(insideCell)

      const halfSoft = max(
        this.presenceSoftnessUniform.mul(float(0.5)),
        float(0.001)
      )
      const presenceMask = smoothstep(
        this.presenceThresholdUniform.sub(halfSoft),
        this.presenceThresholdUniform.add(halfSoft),
        presenceSignal
      )

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
      const flare = float(1).add(scrambleEnergy.mul(float(1.5)))

      const monoTint = vec3(
        this.monoRedUniform,
        this.monoGreenUniform,
        this.monoBlueUniform
      )
      const monochromeColor = monoTint.mul(colorSignalValue).mul(flare)
      const greenTerminalColor = vec3(float(0), colorSignalValue, float(0))
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

  private buildWarpedUv(safeUv: Node, cellUvSize: Node): Node {
    if (!this.currentWarpEnabled) {
      return safeUv
    }

    const warpQuantum = cellUvSize.mul(this.warpQuantumUniform)
    const fieldUv = this.currentWarpRigid
      ? floor(safeUv.div(warpQuantum)).add(vec2(0.5, 0.5)).mul(warpQuantum)
      : safeUv

    const sampleLuma = (offset: Node) => {
      const sampled = this.trackLumaTextureNode(
        clamp(
          fieldUv.add(offset),
          vec2(float(0), float(0)),
          vec2(float(1), float(1))
        )
      )

      return this.buildLuma(
        vec3(float(sampled.r), float(sampled.g), float(sampled.b))
      )
    }

    const centre = sampleLuma(vec2(float(0), float(0)))
    const left = sampleLuma(vec2(cellUvSize.x.negate(), float(0)))
    const right = sampleLuma(vec2(cellUvSize.x, float(0)))
    const top = sampleLuma(vec2(float(0), cellUvSize.y.negate()))
    const bottom = sampleLuma(vec2(float(0), cellUvSize.y))

    const rowOffset = centre
      .sub(float(0.5))
      .mul(this.rowWarpUniform)
      .mul(cellUvSize.y)
      .mul(float(WARP_MAX_CELLS))

    const gradientX = right.sub(left)
    const gradientY = bottom.sub(top)
    const flowX = gradientY.negate()
    const flowY = gradientX
    const flowScale = this.flowWarpUniform.mul(float(WARP_MAX_CELLS))

    return safeUv.add(
      vec2(
        flowX.mul(flowScale).mul(cellUvSize.x),
        rowOffset.add(flowY.mul(flowScale).mul(cellUvSize.y))
      )
    )
  }

  private buildGlyphTransform(
    localCellUv: Node,
    packedAngle: Node,
    glyphSignal: Node,
    colorSignal: Node
  ): Node {
    const scaleSignal = select(
      this.glyphScaleSourceUniform.lessThan(float(0.5)),
      glyphSignal,
      select(
        this.glyphScaleSourceUniform.lessThan(float(1.5)),
        float(1).sub(glyphSignal),
        colorSignal
      )
    )
    const scale = mix(
      float(1),
      mix(this.glyphScaleMinUniform, float(1), scaleSignal),
      this.glyphScaleAmountUniform
    )
    const rotation = packedAngle
      .sub(float(0.5))
      .mul(PI)
      .mul(this.glyphRotationUniform)
    const cosine = cos(rotation)
    const sine = sin(rotation)

    const aspect = this.cellAspectUniform
    const absCos = abs(cosine)
    const absSin = abs(sine)
    const fitX = aspect.div(
      max(aspect.mul(absCos).add(absSin), float(1e-4))
    )
    const fitY = float(1).div(
      max(aspect.mul(absSin).add(absCos), float(1e-4))
    )
    const safeScale = max(min(scale, min(fitX, fitY)), float(0.01))

    const centered = localCellUv.sub(vec2(0.5, 0.5))
    const squared = vec2(centered.x.mul(aspect), centered.y)
    const rotated = vec2(
      squared.x.mul(cosine).sub(squared.y.mul(sine)),
      squared.x.mul(sine).add(squared.y.mul(cosine))
    )
    const unsquared = vec2(rotated.x.div(aspect), rotated.y)

    return unsquared.div(safeScale).add(vec2(0.5, 0.5))
  }

  private buildGlyphAtlasUv(localCellUv: Node, charIndex: Node): Node {
    const column = mod(charIndex, this.atlasColumnsUniform)
    const row = floor(charIndex.div(this.atlasColumnsUniform))
    const uvInCell = vec2(
      this.atlasPadXUniform.add(localCellUv.x.mul(this.atlasInnerXUniform)),
      this.atlasPadYUniform.add(localCellUv.y.mul(this.atlasInnerYUniform))
    )

    return vec2(
      column.add(uvInCell.x).div(this.atlasColumnsUniform),
      row.add(uvInCell.y).div(this.atlasRowsUniform)
    )
  }

  private buildCharacterMask(
    localCellUv: Node,
    charIndex: Node,
    blockSpan: Node
  ): Node {
    const blockCellSize = this.cellSizeUniform.mul(blockSpan)

    if (this.currentRenderMode === "pixel") {
      const steps = vec2(
        max(blockCellSize.mul(this.cellAspectUniform), float(1)),
        max(blockCellSize, float(1))
      )
      const quantizedUv = floor(localCellUv.mul(steps))
        .add(vec2(0.5, 0.5))
        .div(steps)
      const coverage = float(
        this.trackAtlasTextureNode(
          this.buildGlyphAtlasUv(quantizedUv, charIndex)
        ).g
      )

      return step(float(0.5), coverage)
    }

    const signedDistance = float(
      this.trackAtlasTextureNode(
        this.buildGlyphAtlasUv(localCellUv, charIndex)
      ).r
    )
    const atlasPixelsInside = signedDistance
      .sub(float(0.5))
      .mul(this.sdfRadiusUniform)
      .add(this.boldnessUniform.mul(float(2)))
    const atlasToDevice = blockCellSize
      .mul(this.renderScaleUniform)
      .div(this.atlasInnerHeightUniform)

    return clamp(
      smoothstep(float(-0.5), float(0.5), atlasPixelsInside.mul(atlasToDevice)),
      float(0),
      float(1)
    )
  }

  private buildLuma(color: Node): Node {
    return float(color.r)
      .mul(float(0.2126))
      .add(float(color.g).mul(float(0.7152)))
      .add(float(color.b).mul(float(0.0722)))
  }

  private buildShapedSignal(color: Node, modeUniform: Node): Node {
    const raw = this.buildSignalExtractor(color, modeUniform)
    const inverted = select(
      this.invertUniform.greaterThan(float(0.5)),
      float(1).sub(raw),
      raw
    )
    const signalRange = max(
      this.signalWhitePointUniform.sub(this.signalBlackPointUniform),
      float(0.001)
    )

    return pow(
      clamp(
        inverted.sub(this.signalBlackPointUniform).div(signalRange),
        float(0),
        float(1)
      ),
      float(1).div(this.signalGammaUniform)
    )
  }

  private buildSignalExtractor(color: Node, modeUniform: Node): Node {
    const luma = this.buildLuma(color)
    const average = float(color.r).add(color.g).add(color.b).div(float(3))
    return select(
      modeUniform.lessThan(float(0.5)),
      luma,
      select(
        modeUniform.lessThan(float(1.5)),
        average,
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

  private getAtlasOptions(): AsciiAtlasOptions {
    return {
      autoSort: this.currentAutoSort,
      cellAspect: this.currentCellAspect,
      chars: this.getActiveChars(),
      edgeChars: DEFAULT_EDGE_CHARS,
      fontFamily: this.currentFontFamily,
      fontWeight: this.currentFontWeight,
    }
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

  private getScaleSourceValue(value: unknown): number {
    if (value === "inverse") {
      return 1
    }

    return value === "color" ? 2 : 0
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

  private recomputeRenderScale(): void {
    this.renderScaleUniform.value = Math.max(
      0.1,
      this.outputWidth / Math.max(1, this.logicalWidth)
    )
  }

  private rebuildGridPasses(): void {
    this.lumaPass.setColorNode(this.buildLumaColorNode())
    this.layoutPass.setColorNode(this.buildLayoutColorNode())
    this.edgePass.setColorNode(this.buildEdgeColorNode())
    this.cellPass.setColorNode(this.buildCellColorNode())

    if (this.currentTemporalEnabled) {
      this.statePass.setColorNode(this.buildStateColorNode())
      this.temporalResetPending = true
    }
  }

  private trackEdgeTextureNode(uvNode: Node): Node {
    return tslTexture(this.edgePass.texture, uvNode)
  }

  private trackLayoutTextureNode(uvNode: Node): Node {
    return tslTexture(this.layoutPass.texture, uvNode)
  }

  private sampleCellLuma(cellIndex: Node, gridSize: Node): Node {
    return this.trackLumaTextureNode(
      clamp(
        cellIndex.add(vec2(0.5, 0.5)).div(gridSize),
        vec2(float(0), float(0)),
        vec2(float(1), float(1))
      )
    )
  }

  private buildBlockQuadrantCells(blockOrigin: Node, span: Node): Node[] {
    const half = span.mul(float(0.5))
    const cells: Node[] = []

    for (const [qx, qy] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]) {
      cells.push(
        blockOrigin.add(
          vec2(
            float((qx ?? 0) + 0.5),
            float((qy ?? 0) + 0.5)
          ).mul(half)
        )
      )
    }

    return cells
  }

  private buildLayoutColorNode(): Node {
    const gridSize = vec2(this.gridWidthUniform, this.gridHeightUniform)
    const gridUv = vec2(uv().x, float(1).sub(uv().y))
    const cellId = floor(gridUv.mul(gridSize))

    let chosen = float(0)
    let found = float(0)

    for (let level = this.currentBreakLevels; level >= 1; level -= 1) {
      const span = float(2 ** level)
      const blockOrigin = floor(cellId.div(span)).mul(span)
      const quadrants = this.buildBlockQuadrantCells(blockOrigin, span)
      let lowest = float(1e9)
      let highest = float(-1e9)

      for (const quadrant of quadrants) {
        const sampled = this.sampleCellLuma(quadrant, gridSize)
        const luma = this.buildLuma(
          vec3(float(sampled.r), float(sampled.g), float(sampled.b))
        )
        lowest = min(lowest, luma)
        highest = max(highest, luma)
      }

      const levelThreshold = this.breakThresholdUniform.mul(
        pow(float(2), this.breakBiasUniform.mul(float(level)))
      )
      const flat = step(highest.sub(lowest), levelThreshold)
      const take = flat.mul(float(1).sub(found))
      chosen = mix(chosen, float(level), take)
      found = max(found, flat)
    }

    return vec4(chosen, float(0), float(0), float(1))
  }

  private rebuildAtlas(): void {
    if (typeof document === "undefined") {
      return
    }

    const options = this.getAtlasOptions()
    const previousTexture = this.atlas?.texture
    const previousFeatures = this.atlas?.featureTexture
    const atlas = buildAsciiAtlas(options)
    this.atlas = atlas
    previousTexture?.dispose()
    previousFeatures?.dispose()

    this.atlasColumnsUniform.value = atlas.columns
    this.atlasInnerXUniform.value = atlas.innerFractionX
    this.atlasInnerYUniform.value = atlas.innerFractionY
    this.atlasPadXUniform.value = atlas.padFractionX
    this.atlasPadYUniform.value = atlas.padFractionY
    this.atlasRowsUniform.value = atlas.rows
    this.cellAspectUniform.value = atlas.cellAspect
    this.charCountUniform.value = atlas.charCount
    this.edgeStartUniform.value = atlas.edgeStart
    this.rampCountUniform.value = atlas.rampCount
    this.sdfRadiusUniform.value = atlas.sdfRadius

    this.ensureFontLoaded(options)
  }

  private ensureFontLoaded(options: AsciiAtlasOptions): void {
    if (isAsciiFontReady(options)) {
      return
    }

    this.fontLoadToken += 1
    const token = this.fontLoadToken

    void loadAsciiFont(options).then(() => {
      if (token !== this.fontLoadToken) {
        return
      }

      this.rebuildAtlas()
    })
  }

  private resolveCharset(value: unknown): AsciiCharset {
    return typeof value === "string" &&
      (value === "custom" || value in ASCII_CHARSETS)
      ? (value as AsciiCharset)
      : "light"
  }

  private resolveColorMode(value: unknown): AsciiColorMode {
    return value === "green-terminal" || value === "source"
      ? value
      : "monochrome"
  }

  private resolveFontWeight(fontFamily: string, value: unknown): number {
    if (typeof value === "string") {
      return normalizeTextFontWeight(
        fontFamily,
        LEGACY_FONT_WEIGHTS[value] ?? 400
      )
    }

    return normalizeTextFontWeight(fontFamily, value)
  }

  private resolveBreakLevels(value: unknown): number {
    const levels: Record<string, number> = {
      "16x": 4,
      "2x": 1,
      "32x": 5,
      "4x": 2,
      "8x": 3,
    }

    return typeof value === "string" ? (levels[value] ?? 0) : 0
  }

  private resolveGlyphSource(value: unknown): AsciiGlyphSource {
    return value === "contour" ||
      value === "contour-structure" ||
      value === "structure"
      ? value
      : "ramp"
  }

  private resolveRenderMode(value: unknown): AsciiRenderMode {
    return value === "pixel" ? "pixel" : "smooth"
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
    const node = tslTexture(this.atlas?.texture ?? new THREE.Texture(), uvNode)
    this.atlasTextureNodes.push(node)
    return node
  }

  private trackFeatureTextureNode(uvNode: Node): Node {
    const node = tslTexture(
      this.atlas?.featureTexture ?? new THREE.Texture(),
      uvNode
    )
    this.featureTextureNodes.push(node)
    return node
  }

  private trackCellTextureNode(uvNode: Node): Node {
    return tslTexture(this.cellPass.texture, uvNode)
  }

  private trackLumaTextureNode(uvNode: Node): Node {
    return tslTexture(this.lumaPass.texture, uvNode)
  }

  private trackAnalysisSourceNode(uvNode: Node): Node {
    const node = tslTexture(this.placeholder, uvNode)
    this.analysisSourceNodes.push(node)
    return node
  }
}
