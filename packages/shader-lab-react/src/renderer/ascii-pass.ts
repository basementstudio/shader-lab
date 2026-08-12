import {
  clamp,
  dot,
  float,
  floor,
  max,
  min,
  mix,
  pow,
  smoothstep,
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
import type { LayerParameterValues } from "../types/editor"

type Node = TSLNode
type AsciiColorMode = "monochrome" | "source"
type AsciiCharset = keyof typeof ASCII_CHARSETS | "custom"

const ATLAS_INNER_HEIGHT = 64
const DEFAULT_FONT_FAMILY = "mono"
const SUPERSAMPLE = 3
const MAX_GRID_DIMENSION = 4096

const BREAK_LEVELS: Record<string, number> = {
  "2x": 1,
  "4x": 2,
  "8x": 3,
  "16x": 4,
  off: 0,
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
  private analysisSourceNodes: Node[] = []
  private retiredAtlasTextures: THREE.Texture[] = []
  private framesSinceAtlasSwap = 0
  private fontLoadToken = 0
  private logicalWidth = 1
  private logicalHeight = 1
  private outputWidth = 1
  private gridWidth = 1
  private gridHeight = 1
  private rebuildGeneration = 0

  private readonly analysisPass: GridRenderPass
  private readonly layoutPass: GridRenderPass

  private readonly atlasColumnsUniform: Node
  private readonly atlasInnerHeightUniform: Node
  private readonly atlasInnerXUniform: Node
  private readonly atlasInnerYUniform: Node
  private readonly atlasPadXUniform: Node
  private readonly atlasPadYUniform: Node
  private readonly atlasRowsUniform: Node
  private readonly bgOpacityUniform: Node
  private readonly boldnessUniform: Node
  private readonly breakThresholdUniform: Node
  private readonly cellAspectUniform: Node
  private readonly cellPixelHeightUniform: Node
  private readonly cellUvWidthUniform: Node
  private readonly cellUvHeightUniform: Node
  private readonly gridOriginXUniform: Node
  private readonly gridOriginYUniform: Node
  private readonly gridHeightUniform: Node
  private readonly gridWidthUniform: Node
  private readonly invertUniform: Node
  private readonly monoBlueUniform: Node
  private readonly monoGreenUniform: Node
  private readonly monoRedUniform: Node
  private readonly placeholder: THREE.Texture
  private readonly rampCountUniform: Node
  private readonly renderScaleUniform: Node
  private readonly rowWarpUniform: Node
  private readonly sdfRadiusUniform: Node
  private readonly signalBlackPointUniform: Node
  private readonly signalWhitePointUniform: Node
  private readonly sourceMixUniform: Node

  private currentColumns = 80
  private currentBreakLevels = 0
  private currentRowWarpEnabled = false
  private currentCharset: AsciiCharset = "light"
  private currentCustomChars = DEFAULT_ASCII_CHARS
  private currentFontFamily = DEFAULT_FONT_FAMILY
  private currentFontWeight = 400
  private currentColorMode: AsciiColorMode = "monochrome"

  constructor(layerId: string) {
    super(layerId)
    this.placeholder = createPipelinePlaceholder()
    this.analysisPass = new GridRenderPass({ linear: true })
    this.layoutPass = new GridRenderPass()
    this.atlasColumnsUniform = uniform(1)
    this.atlasInnerHeightUniform = uniform(ATLAS_INNER_HEIGHT)
    this.atlasInnerXUniform = uniform(1)
    this.atlasInnerYUniform = uniform(1)
    this.atlasPadXUniform = uniform(0)
    this.atlasPadYUniform = uniform(0)
    this.atlasRowsUniform = uniform(1)
    this.bgOpacityUniform = uniform(0)
    this.boldnessUniform = uniform(0)
    this.breakThresholdUniform = uniform(0.06)
    this.cellAspectUniform = uniform(0.6)
    this.cellPixelHeightUniform = uniform(12)
    this.cellUvWidthUniform = uniform(0.01)
    this.cellUvHeightUniform = uniform(0.01)
    this.gridOriginXUniform = uniform(0)
    this.gridOriginYUniform = uniform(0)
    this.gridHeightUniform = uniform(1)
    this.gridWidthUniform = uniform(1)
    this.invertUniform = uniform(0)
    this.monoBlueUniform = uniform(0.94)
    this.monoGreenUniform = uniform(0.96)
    this.monoRedUniform = uniform(0.96)
    this.rampCountUniform = uniform(DEFAULT_ASCII_CHARS.length)
    this.renderScaleUniform = uniform(1)
    this.rowWarpUniform = uniform(0)
    this.sdfRadiusUniform = uniform(8)
    this.signalBlackPointUniform = uniform(0)
    this.signalWhitePointUniform = uniform(1)
    this.sourceMixUniform = uniform(0)
    this.rebuildAtlas()
    this.analysisPass.setColorNode(this.buildAnalysisColorNode())
    this.layoutPass.setColorNode(this.buildLayoutColorNode())
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

    this.analysisPass.render(renderer)

    if (this.currentBreakLevels > 0) {
      this.layoutPass.render(renderer)
    }

    super.render(renderer, inputTexture, outputTarget, time, delta)

    if (this.retiredAtlasTextures.length > 0) {
      this.framesSinceAtlasSwap += 1

      if (this.framesSinceAtlasSwap >= 3) {
        for (const texture of this.retiredAtlasTextures) {
          texture.dispose()
        }
        this.retiredAtlasTextures = []
      }
    }
  }

  override updateParams(params: LayerParameterValues): void {
    this.currentColumns =
      typeof params.columns === "number"
        ? Math.max(4, Math.min(400, Math.round(params.columns)))
        : 80

    const nextCharset = this.resolveCharset(params.charset)
    const nextCustomChars =
      typeof params.customChars === "string"
        ? params.customChars
        : DEFAULT_ASCII_CHARS
    const nextFontFamily =
      typeof params.fontFamily === "string" && params.fontFamily.length > 0
        ? params.fontFamily
        : DEFAULT_FONT_FAMILY
    const nextFontWeight =
      typeof params.fontWeight === "number"
        ? Math.max(100, Math.min(900, Math.round(params.fontWeight)))
        : 400

    const needsAtlasRebuild =
      nextCharset !== this.currentCharset ||
      nextFontFamily !== this.currentFontFamily ||
      nextFontWeight !== this.currentFontWeight ||
      (nextCharset === "custom" && nextCustomChars !== this.currentCustomChars)

    this.currentCharset = nextCharset
    this.currentCustomChars = nextCustomChars
    this.currentFontFamily = nextFontFamily
    this.currentFontWeight = nextFontWeight

    if (needsAtlasRebuild) {
      this.rebuildAtlas()
    }

    this.boldnessUniform.value =
      typeof params.boldness === "number"
        ? Math.max(-1, Math.min(1, params.boldness))
        : 0
    this.bgOpacityUniform.value =
      typeof params.bgOpacity === "number" ? clamp01(params.bgOpacity) : 0
    this.breakThresholdUniform.value =
      typeof params.breakThreshold === "number"
        ? Math.max(0.001, Math.min(0.5, params.breakThreshold))
        : 0.06
    this.signalBlackPointUniform.value =
      typeof params.signalBlackPoint === "number"
        ? clamp01(params.signalBlackPoint)
        : 0
    this.signalWhitePointUniform.value =
      typeof params.signalWhitePoint === "number"
        ? clamp01(params.signalWhitePoint)
        : 1
    this.invertUniform.value = params.invert === true ? 1 : 0

    this.currentColorMode = params.colorMode === "source" ? "source" : "monochrome"
    this.sourceMixUniform.value = this.currentColorMode === "source" ? 1 : 0

    const [red, green, blue] = parseCssColorRgb(
      typeof params.monoColor === "string" ? params.monoColor : "#f5f5f0"
    )
    this.monoRedUniform.value = red
    this.monoGreenUniform.value = green
    this.monoBlueUniform.value = blue

    const nextRowWarp =
      typeof params.rowWarp === "number" ? clamp01(params.rowWarp) : 0
    this.rowWarpUniform.value = nextRowWarp
    const nextRowWarpEnabled = nextRowWarp > 0

    const nextBreakLevels =
      BREAK_LEVELS[typeof params.breakGrid === "string" ? params.breakGrid : "off"] ?? 0

    const structuralChange =
      nextBreakLevels !== this.currentBreakLevels ||
      nextRowWarpEnabled !== this.currentRowWarpEnabled

    this.currentBreakLevels = nextBreakLevels
    this.currentRowWarpEnabled = nextRowWarpEnabled

    if (structuralChange) {
      this.scheduleStructuralRebuild()
    }
  }

  override resize(width: number, _height: number): void {
    this.outputWidth = Math.max(1, width)
    this.recomputeRenderScale()
  }

  override updateLogicalSize(width: number, height: number): void {
    this.logicalWidth = Math.max(1, width)
    this.logicalHeight = Math.max(1, height)
    this.recomputeRenderScale()
  }

  override dispose(): void {
    this.placeholder.dispose()
    this.atlas?.texture.dispose()
    this.atlas?.featureTexture.dispose()
    for (const texture of this.retiredAtlasTextures) {
      texture.dispose()
    }
    this.retiredAtlasTextures = []
    this.analysisPass.dispose()
    this.layoutPass.dispose()
    super.dispose()
  }

  private recomputeRenderScale(): void {
    this.renderScaleUniform.value = Math.max(
      0.1,
      this.outputWidth / Math.max(1, this.logicalWidth)
    )
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

    const cellWidth = Math.max(
      0.5,
      frame.width / Math.max(1, this.currentColumns)
    )
    const cellHeight = Math.max(1, cellWidth / aspect)

    const cellUvWidth = cellWidth / this.logicalWidth
    const cellUvHeight = cellHeight / this.logicalHeight

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

    this.cellPixelHeightUniform.value = cellHeight
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
    this.analysisPass.setSize(gridWidth, gridHeight)
    this.layoutPass.setSize(gridWidth, gridHeight)
  }

  private getCellUvSize(): Node {
    return vec2(this.cellUvWidthUniform, this.cellUvHeightUniform)
  }

  private getGridOrigin(): Node {
    return vec2(this.gridOriginXUniform, this.gridOriginYUniform)
  }

  private trackAnalysisSourceNode(uvNode: Node): Node {
    const node = tslTexture(this.placeholder, uvNode)
    this.analysisSourceNodes.push(node)
    return node
  }

  private trackAtlasTextureNode(uvNode: Node): Node {
    const node = tslTexture(this.atlas?.texture ?? this.placeholder, uvNode)
    this.atlasTextureNodes.push(node)
    return node
  }

  private trackAnalysisTextureNode(uvNode: Node): Node {
    return tslTexture(this.analysisPass.texture, uvNode)
  }

  private trackLayoutTextureNode(uvNode: Node): Node {
    return tslTexture(this.layoutPass.texture, uvNode)
  }

  private buildLuma(color: Node): Node {
    return dot(vec3(color), vec3(0.2126, 0.7152, 0.0722))
  }

  private buildAnalysisColorNode(): Node {
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
        accumulated = accumulated.add(sampled.rgb)
      }
    }

    const averaged = accumulated.div(float(SUPERSAMPLE * SUPERSAMPLE))

    return vec4(averaged, float(1))
  }

  private sampleCellColor(cellIndex: Node, gridSize: Node): Node {
    return this.trackAnalysisTextureNode(
      clamp(
        cellIndex.add(vec2(0.5, 0.5)).div(gridSize),
        vec2(float(0), float(0)),
        vec2(float(1), float(1))
      )
    )
  }

  private buildLayoutColorNode(): Node {
    const gridSize = vec2(this.gridWidthUniform, this.gridHeightUniform)
    const gridUv = vec2(uv().x, float(1).sub(uv().y))
    const cellId = floor(gridUv.mul(gridSize))

    let chosen = float(0)
    let found = float(0)

    for (let level = this.currentBreakLevels; level >= 1; level -= 1) {
      const span = float(2 ** level)
      const half = span.mul(float(0.5))
      const blockOrigin = floor(cellId.div(span)).mul(span)

      let lowest = float(1e9)
      let highest = float(-1e9)

      for (const [qx, qy] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ]) {
        const quadrant = blockOrigin.add(
          vec2(float((qx ?? 0) + 0.5), float((qy ?? 0) + 0.5)).mul(half)
        )
        const luma = this.buildLuma(
          this.sampleCellColor(quadrant, gridSize).rgb
        )
        lowest = min(lowest, luma)
        highest = max(highest, luma)
      }

      const flat = step(highest.sub(lowest), this.breakThresholdUniform)
      const take = flat.mul(float(1).sub(found))
      chosen = mix(chosen, float(level), take)
      found = max(found, flat)
    }

    return vec4(chosen, float(0), float(0), float(1))
  }

  private buildShapedSignal(color: Node): Node {
    const luma = this.buildLuma(color)
    const range = max(
      this.signalWhitePointUniform.sub(this.signalBlackPointUniform),
      float(0.001)
    )
    const shaped = clamp(
      luma.sub(this.signalBlackPointUniform).div(range),
      float(0),
      float(1)
    )

    return mix(shaped, float(1).sub(shaped), this.invertUniform)
  }

  private buildGlyphAtlasUv(localCellUv: Node, charIndex: Node): Node {
    const column = charIndex.sub(
      floor(charIndex.div(this.atlasColumnsUniform)).mul(
        this.atlasColumnsUniform
      )
    )
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
    const insideCell = step(float(0), localCellUv.x)
      .mul(step(localCellUv.x, float(1)))
      .mul(step(float(0), localCellUv.y))
      .mul(step(localCellUv.y, float(1)))
    const safeUv = clamp(localCellUv, vec2(float(0), float(0)), vec2(float(1), float(1)))
    const signedDistance = float(
      this.trackAtlasTextureNode(this.buildGlyphAtlasUv(safeUv, charIndex)).r
    )
    const atlasPixelsInside = signedDistance
      .sub(float(0.5))
      .mul(this.sdfRadiusUniform)
      .add(this.boldnessUniform.mul(float(2)))
    const atlasToDevice = this.cellPixelHeightUniform
      .mul(blockSpan)
      .mul(this.renderScaleUniform)
      .div(this.atlasInnerHeightUniform)

    return clamp(
      smoothstep(float(-0.5), float(0.5), atlasPixelsInside.mul(atlasToDevice)),
      float(0),
      float(1)
    ).mul(insideCell)
  }

  private buildCellSample(candidateCell: Node, gridUv: Node): {
    color: Node
    mask: Node
  } {
    const gridSize = vec2(this.gridWidthUniform, this.gridHeightUniform)
    const cellUvSize = this.getCellUvSize()
    const gridOrigin = this.getGridOrigin()

    let unitOriginCell = candidateCell
    let unitSpan: Node = float(1)

    if (this.currentBreakLevels > 0) {
      const cellTexelUv = clamp(
        candidateCell.add(vec2(0.5, 0.5)).div(gridSize),
        vec2(float(0), float(0)),
        vec2(float(1), float(1))
      )
      const level = float(this.trackLayoutTextureNode(cellTexelUv).r)
      unitSpan = pow(float(2), level)
      unitOriginCell = floor(candidateCell.div(unitSpan)).mul(unitSpan)
    }

    const unitCenterCell = unitOriginCell.add(unitSpan.mul(0.5).sub(0.5))
    const color = this.sampleCellColor(unitCenterCell, gridSize).rgb
    const signal = this.buildShapedSignal(color)
    const charIndex = floor(
      signal.mul(this.rampCountUniform.sub(float(1))).add(float(0.5))
    )

    let unitOriginUv = gridOrigin.add(unitOriginCell.mul(cellUvSize))

    if (this.currentRowWarpEnabled) {
      const rowOffset = signal
        .sub(float(0.5))
        .mul(this.rowWarpUniform)
        .mul(cellUvSize.x)
        .mul(unitSpan)
      unitOriginUv = vec2(unitOriginUv.x.add(rowOffset), unitOriginUv.y)
    }

    const localCellUv = gridUv
      .sub(unitOriginUv)
      .div(cellUvSize.mul(unitSpan))
    const mask = this.buildCharacterMask(localCellUv, charIndex, unitSpan)

    return { color, mask }
  }

  protected override buildEffectNode(): Node {
    if (!this.rampCountUniform) {
      return this.inputNode
    }

    this.atlasTextureNodes = []

    const gridUv = vec2(uv().x, float(1).sub(uv().y))
    const cellUvSize = this.getCellUvSize()
    const gridOrigin = this.getGridOrigin()
    const baseCell = floor(gridUv.sub(gridOrigin).div(cellUvSize))

    const candidateSteps = this.currentRowWarpEnabled ? [-1, 0, 1] : [0]

    let bestMask: Node = float(0)
    let bestColor: Node = vec3(float(0), float(0), float(0))

    for (const stepX of candidateSteps) {
      const candidate =
        stepX === 0 ? baseCell : baseCell.add(vec2(float(stepX), float(0)))
      const sample = this.buildCellSample(candidate, gridUv)
      const stronger = step(bestMask, sample.mask)
      bestColor = mix(bestColor, sample.color, stronger)
      bestMask = max(bestMask, sample.mask)
    }

    const monoTint = vec3(
      this.monoRedUniform,
      this.monoGreenUniform,
      this.monoBlueUniform
    )
    const monoSignal = this.buildShapedSignal(bestColor)
    const monoColor = monoTint.mul(monoSignal)
    const glyphColor = mix(monoColor, bestColor, this.sourceMixUniform)
    const backgroundColor = bestColor
      .mul(this.bgOpacityUniform)
      .mul(this.sourceMixUniform)

    return vec4(mix(backgroundColor, glyphColor, bestMask), float(1))
  }

  private scheduleStructuralRebuild(): void {
    const renderer = this.lastRenderer

    if (!renderer) {
      this.analysisPass.setColorNode(this.buildAnalysisColorNode())
      this.layoutPass.setColorNode(this.buildLayoutColorNode())
      this.rebuildEffectNode()
      return
    }

    const generation = ++this.rebuildGeneration
    const previousAnalysis = this.analysisSourceNodes
    const previousAtlas = this.atlasTextureNodes

    const jobs = [
      this.analysisPass.setColorNodeAsync(
        this.buildAnalysisColorNode(),
        renderer
      ),
      this.layoutPass.setColorNodeAsync(this.buildLayoutColorNode(), renderer),
      this.swapEffectNodeAsync(this.buildEffectNode()),
    ]

    const nextAnalysis = this.analysisSourceNodes
    const nextAtlas = this.atlasTextureNodes

    this.analysisSourceNodes = [...previousAnalysis, ...nextAnalysis]
    this.atlasTextureNodes = [...previousAtlas, ...nextAtlas]

    void Promise.all(jobs)
      .then(() => {
        if (generation !== this.rebuildGeneration) {
          return
        }

        this.analysisSourceNodes = nextAnalysis
        this.atlasTextureNodes = nextAtlas
      })
      .catch(() => {
        if (generation === this.rebuildGeneration) {
          this.analysisPass.setColorNode(this.buildAnalysisColorNode())
          this.layoutPass.setColorNode(this.buildLayoutColorNode())
          this.rebuildEffectNode()
        }
      })
  }

  private resolveCharset(value: unknown): AsciiCharset {
    return typeof value === "string" &&
      (value === "custom" || value in ASCII_CHARSETS)
      ? (value as AsciiCharset)
      : "light"
  }

  private getActiveChars(): string {
    return this.currentCharset === "custom"
      ? this.currentCustomChars || " "
      : (ASCII_CHARSETS[this.currentCharset] ?? DEFAULT_ASCII_CHARS)
  }

  private getAtlasOptions(): AsciiAtlasOptions {
    return {
      autoSort: true,
      cellAspect: 0,
      chars: this.getActiveChars(),
      edgeChars: DEFAULT_EDGE_CHARS,
      fontFamily: this.currentFontFamily,
      fontWeight: this.currentFontWeight,
    }
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

    for (const node of this.atlasTextureNodes) {
      node.value = atlas.texture
    }

    if (previousTexture) {
      this.retiredAtlasTextures.push(previousTexture)
    }
    if (previousFeatures) {
      this.retiredAtlasTextures.push(previousFeatures)
    }
    this.framesSinceAtlasSwap = 0

    this.atlasColumnsUniform.value = atlas.columns
    this.atlasInnerXUniform.value = atlas.innerFractionX
    this.atlasInnerYUniform.value = atlas.innerFractionY
    this.atlasPadXUniform.value = atlas.padFractionX
    this.atlasPadYUniform.value = atlas.padFractionY
    this.atlasRowsUniform.value = atlas.rows
    this.cellAspectUniform.value = atlas.cellAspect
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
}
