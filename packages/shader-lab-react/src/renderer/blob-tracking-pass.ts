import {
  abs,
  clamp,
  dot,
  float,
  Fn,
  fract,
  length,
  Loop,
  max,
  min,
  mix,
  smoothstep,
  sqrt,
  step,
  type TSLNode,
  texture as tslTexture,
  uniform,
  uniformArray,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl"
import * as THREE from "three/webgpu"
import type { LayerParameterValues } from "../types/editor"
import { AsciiPass } from "./ascii-pass"
import { BloomPass } from "./bloom-pass"
import {
  INNER_EFFECT_NONE,
  isInnerEffectType,
  parseInnerEffectParams,
  type ShaderLabBlobInnerEffect,
} from "./blob-tracking-inner-effects"
import {
  type Blob,
  BlobTracker,
  type TrackerConfig,
} from "./blob-tracking-tracker"
import { ChromaticAberrationPass } from "./chromatic-aberration-pass"
import { CircuitBentPass } from "./circuit-bent-pass"
import { CrtPass } from "./crt-pass"
import { DirectionalBlurPass } from "./directional-blur-pass"
import { DisplacementMapPass } from "./displacement-map-pass"
import { DitheringPass } from "./dithering-pass"
import { EdgeDetectPass } from "./edge-detect-pass"
import { FlutedGlassPass } from "./fluted-glass-pass"
import { HalftonePass } from "./halftone-pass"
import { InkPass } from "./ink-pass"
import { ParticleGridPass } from "./particle-grid-pass"
import {
  BLANK_GLYPH,
  buildLabelAtlas,
  glyphIndex,
  LABEL_CELL_ASPECT,
  LABEL_CHARS,
} from "./blob-label-atlas"
import { createPipelinePlaceholder, PassNode } from "./pass-node"
import { PatternPass } from "./pattern-pass"
import { PixelSortingPass } from "./pixel-sorting-pass"
import { PixelationPass } from "./pixelation-pass"
import { PlotterPass } from "./plotter-pass"
import { PosterizePass } from "./posterize-pass"
import { SlicePass } from "./slice-pass"
import { SmearPass } from "./smear-pass"
import { ThresholdPass } from "./threshold-pass"
import { VoxelPass } from "./voxel-pass"

type Node = TSLNode

const ANALYSIS_WIDTH = 64
const ANALYSIS_HEIGHT = 36
const ANALYSIS_SUPERSAMPLE = 4
const MAX_BLOBS = 32
const OVERLAY_MAX_WIDTH = 960
const OVERLAY_REDRAW_INTERVAL_MS = 33
const NO_SIGNATURE = -1
const CURVE_SUBDIVISIONS = 6
const MAX_CONNECTOR_SEGMENTS = (MAX_BLOBS - 1) * CURVE_SUBDIVISIONS
const MAX_ARROW_SEGMENTS = (MAX_BLOBS - 1) * 2
const ARROW_BARB_LENGTH = 0.018
const ARROW_BARB_SPREAD = 2.5
const CONNECTOR_ALPHA = 0.8
const DASH_PERIOD = 0.024
const DASH_DUTY = 0.55
const MAX_LABEL_CHARS = 16
const LABEL_HEIGHT_FRACTION = 1 / 54

const ANALYSIS_RT_OPTIONS = {
  depthBuffer: false,
  format: THREE.RGBAFormat,
  generateMipmaps: false,
  magFilter: THREE.NearestFilter,
  minFilter: THREE.NearestFilter,
  stencilBuffer: false,
  type: THREE.UnsignedByteType,
} as const

const INNER_RT_OPTIONS = {
  depthBuffer: false,
  format: THREE.RGBAFormat,
  generateMipmaps: false,
  magFilter: THREE.NearestFilter,
  minFilter: THREE.NearestFilter,
  stencilBuffer: false,
  type: THREE.HalfFloatType,
} as const

const DEFAULT_TRACKER_CONFIG: TrackerConfig = {
  blobAmount: 6,
  detectionMode: "auto",
  minBlobSize: 3,
  motionThreshold: 0.12,
  persistentTracking: true,
  sensitivity: 0.5,
  smoothing: 0.6,
}

type BlobShape = "circle" | "diamond" | "square"
type CenterMarker = "cross" | "dot" | "none"

type DecorationConfig = {
  centerShape: CenterMarker
  connectLines: boolean
  connectorArrows: boolean
  connectorDashed: boolean
  curvedLines: boolean
  showLabels: boolean
  showOutline: boolean
  strokeColor: string
  strokeWidth: number
  trailDecay: number
}

const DEFAULT_DECORATIONS: DecorationConfig = {
  centerShape: "dot",
  connectLines: true,
  connectorArrows: false,
  connectorDashed: false,
  curvedLines: false,
  showLabels: true,
  showOutline: true,
  strokeColor: "#ffffff",
  strokeWidth: 2,
  trailDecay: 0.35,
}

function decorationStructureKey(config: DecorationConfig): string {
  return [
    config.centerShape,
    config.connectLines ? "c" : "-",
    config.connectorArrows ? "a" : "-",
    config.connectorDashed ? "d" : "-",
    config.showOutline ? "o" : "-",
    config.showLabels ? "l" : "-",
  ].join("")
}

function decorationsEqual(
  left: DecorationConfig,
  right: DecorationConfig
): boolean {
  return (
    left.centerShape === right.centerShape &&
    left.connectLines === right.connectLines &&
    left.connectorArrows === right.connectorArrows &&
    left.connectorDashed === right.connectorDashed &&
    left.curvedLines === right.curvedLines &&
    left.showLabels === right.showLabels &&
    left.showOutline === right.showOutline &&
    left.strokeColor === right.strokeColor &&
    left.strokeWidth === right.strokeWidth &&
    left.trailDecay === right.trailDecay
  )
}

function createLabelIndexTexture(buffer: Float32Array): THREE.DataTexture {
  const texture = new THREE.DataTexture(
    buffer,
    MAX_LABEL_CHARS,
    MAX_BLOBS,
    THREE.RGBAFormat,
    THREE.FloatType
  )
  texture.colorSpace = THREE.NoColorSpace
  texture.flipY = false
  texture.generateMipmaps = false
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.needsUpdate = true
  return texture
}

function resolveCenterMarker(value: unknown): CenterMarker {
  if (value === "cross") return "cross"
  if (value === "none") return "none"
  return "dot"
}

function clampNumber(value: number, min: number, maxValue: number): number {
  if (value < min) return min
  if (value > maxValue) return maxValue
  return value
}

function resolveShape(value: unknown): BlobShape {
  if (value === "circle") return "circle"
  if (value === "diamond") return "diamond"
  return "square"
}

function createInnerEffectPass(
  type: ShaderLabBlobInnerEffect,
  layerId: string
): PassNode | null {
  switch (type) {
    case "ascii":
      return new AsciiPass(layerId)
    case "bloom":
      return new BloomPass(layerId)
    case "chromatic-aberration":
      return new ChromaticAberrationPass(layerId)
    case "circuit-bent":
      return new CircuitBentPass(layerId)
    case "crt":
      return new CrtPass(layerId)
    case "directional-blur":
      return new DirectionalBlurPass(layerId)
    case "displacement-map":
      return new DisplacementMapPass(layerId)
    case "dithering":
      return new DitheringPass(layerId)
    case "edge-detect":
      return new EdgeDetectPass(layerId)
    case "fluted-glass":
      return new FlutedGlassPass(layerId)
    case "halftone":
      return new HalftonePass(layerId)
    case "ink":
      return new InkPass(layerId)
    case "particle-grid":
      return new ParticleGridPass(layerId)
    case "pattern":
      return new PatternPass(layerId)
    case "pixel-sorting":
      return new PixelSortingPass(layerId)
    case "pixelation":
      return new PixelationPass(layerId)
    case "plotter":
      return new PlotterPass(layerId)
    case "posterize":
      return new PosterizePass(layerId)
    case "slice":
      return new SlicePass(layerId)
    case "smear":
      return new SmearPass(layerId)
    case "threshold":
      return new ThresholdPass(layerId)
    case "voxel":
      return new VoxelPass(layerId)
    default:
      return null
  }
}

export class BlobTrackingPass extends PassNode {
  private analysisScene: THREE.Scene | null = null
  private analysisCamera: THREE.OrthographicCamera | null = null
  private analysisMaterial: THREE.MeshBasicNodeMaterial | null = null
  private analysisGeometry: THREE.PlaneGeometry | null = null
  private analysisRtA: THREE.WebGLRenderTarget | null = null
  private analysisRtB: THREE.WebGLRenderTarget | null = null
  private analysisWriteToA = true
  private analysisInputNode: Node | null = null
  private analysisPrevNode: Node | null = null

  private pendingReadback: Promise<void> | null = null
  private latestAnalysis: Uint8Array | null = null

  private readonly tracker = new BlobTracker()
  private trackerConfig: TrackerConfig = { ...DEFAULT_TRACKER_CONFIG }
  private lastTime: number | null = null

  private readonly blobEntries: THREE.Vector4[] = Array.from(
    { length: MAX_BLOBS },
    () => new THREE.Vector4(0, 0, 0, 0)
  )
  private readonly blobTableNode: Node = uniformArray(this.blobEntries, "vec4")
  private readonly blobCountUniform: Node = uniform(0, "int")

  private readonly segmentEntries: THREE.Vector4[] = Array.from(
    { length: MAX_CONNECTOR_SEGMENTS },
    () => new THREE.Vector4(0, 0, 0, 0)
  )
  private readonly segmentArrayNode: Node = uniformArray(
    this.segmentEntries,
    "vec4"
  )
  private readonly segmentCountUniform: Node = uniform(0, "int")

  private readonly arrowEntries: THREE.Vector4[] = Array.from(
    { length: MAX_ARROW_SEGMENTS },
    () => new THREE.Vector4(0, 0, 0, 0)
  )
  private readonly arrowArrayNode: Node = uniformArray(
    this.arrowEntries,
    "vec4"
  )
  private readonly arrowCountUniform: Node = uniform(0, "int")

  private readonly labelBuffer = new Float32Array(
    MAX_LABEL_CHARS * MAX_BLOBS * 4
  )
  private readonly labelIndexTexture: THREE.DataTexture = createLabelIndexTexture(
    this.labelBuffer
  )
  private readonly labelAtlas: THREE.Texture | null = buildLabelAtlas()
  private readonly labelCellUniform: Node = uniform(new THREE.Vector2(0.01, 0.018))

  private readonly strokeColorUniform: Node = uniform(new THREE.Color(0xffffff))
  private readonly strokeHalfUniform: Node = uniform(0.002)
  private readonly markerRadiusUniform: Node = uniform(0.006)

  private readonly shapeScaleUniform: Node = uniform(1)
  private readonly invertUniform: Node = uniform(0)
  private readonly aspectUniform: Node = uniform(16 / 9)
  private readonly edgeSoftUniform: Node = uniform(0.0015)
  private readonly innerActiveUniform: Node = uniform(0)
  private shapeKind: BlobShape = "square"
  private maskOutput = false

  private decorations: DecorationConfig = { ...DEFAULT_DECORATIONS }
  private overlayCanvas: HTMLCanvasElement | null = null
  private overlayContext: CanvasRenderingContext2D | null = null
  private overlayTexture: THREE.CanvasTexture | null = null
  private readonly overlayPlaceholder = new THREE.Texture()
  private overlaySignature = NO_SIGNATURE
  private overlayDirty = false
  private lastOverlayRedrawAt = 0

  private innerEffectType: ShaderLabBlobInnerEffect = INNER_EFFECT_NONE
  private innerEffectParamsRaw = ""
  private childPass: PassNode | null = null
  private innerRt: THREE.WebGLRenderTarget | null = null
  private readonly innerPlaceholder = createPipelinePlaceholder()
  private innerNode: Node | null = null

  private deviceWidth = 1
  private deviceHeight = 1
  private logicalWidth = 1
  private logicalHeight = 1

  constructor(layerId: string) {
    super(layerId)

    this.applyDecorationUniforms()
    this.createAnalysisResources()
    this.createOverlayResources()
    this.rebuildEffectNode()
  }

  override render(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number
  ): void {
    if (
      this.lastTime !== null &&
      time < this.lastTime
    ) {
      this.resetTemporalState()
    }
    this.lastTime = time

    if (this.childPass && this.innerRt) {
      this.childPass.render(renderer, inputTexture, this.innerRt, time, delta)
      if (this.innerNode) {
        this.innerNode.value = this.innerRt.texture
      }
    }

    const writeTarget = this.renderAnalysis(renderer, inputTexture)

    if (writeTarget && !this.pendingReadback) {
      this.pendingReadback = this.queueReadback(renderer, writeTarget)
    }

    if (this.latestAnalysis) {
      this.tracker.step(
        this.latestAnalysis,
        ANALYSIS_WIDTH,
        ANALYSIS_HEIGHT,
        time,
        this.trackerConfig
      )
      this.syncTrackerOutputs()
    }

    super.render(renderer, inputTexture, outputTarget, time, delta)
  }

  override updateParams(params: LayerParameterValues): void {
    this.trackerConfig = {
      blobAmount:
        typeof params.blobAmount === "number"
          ? clampNumber(Math.round(params.blobAmount), 1, MAX_BLOBS)
          : DEFAULT_TRACKER_CONFIG.blobAmount,
      detectionMode:
        params.detectionMode === "motion" ||
        params.detectionMode === "luminance"
          ? params.detectionMode
          : "auto",
      minBlobSize:
        typeof params.minBlobSize === "number"
          ? clampNumber(Math.round(params.minBlobSize), 1, 64)
          : DEFAULT_TRACKER_CONFIG.minBlobSize,
      motionThreshold:
        typeof params.motionThreshold === "number"
          ? clampNumber(params.motionThreshold, 0, 1)
          : DEFAULT_TRACKER_CONFIG.motionThreshold,
      persistentTracking: params.persistentTracking !== false,
      sensitivity:
        typeof params.sensitivity === "number"
          ? clampNumber(params.sensitivity, 0, 1)
          : DEFAULT_TRACKER_CONFIG.sensitivity,
      smoothing:
        typeof params.smoothing === "number"
          ? clampNumber(params.smoothing, 0, 1)
          : DEFAULT_TRACKER_CONFIG.smoothing,
    }

    const nextShape = resolveShape(params.shapeType)
    const shapeChanged = nextShape !== this.shapeKind
    this.shapeKind = nextShape

    const nextScale =
      typeof params.shapeScale === "number"
        ? clampNumber(params.shapeScale, 0.25, 3)
        : 1
    if (nextScale !== (this.shapeScaleUniform.value as number)) {
      this.shapeScaleUniform.value = nextScale
      this.overlayDirty = true
    }
    this.invertUniform.value = params.invert === true ? 1 : 0

    const nextMaskOutput = params.outputMode === "mask"
    const maskChanged = nextMaskOutput !== this.maskOutput
    this.maskOutput = nextMaskOutput

    const nextDecorations: DecorationConfig = {
      centerShape: resolveCenterMarker(params.centerShape),
      connectLines: params.connectLines !== false,
      connectorArrows: params.connectorArrows === true,
      connectorDashed: params.connectorDashed === true,
      curvedLines: params.curvedLines === true,
      showLabels: params.showLabels !== false,
      showOutline: params.showOutline !== false,
      strokeColor:
        typeof params.strokeColor === "string"
          ? params.strokeColor
          : DEFAULT_DECORATIONS.strokeColor,
      strokeWidth:
        typeof params.strokeWidth === "number"
          ? clampNumber(params.strokeWidth, 1, 8)
          : DEFAULT_DECORATIONS.strokeWidth,
      trailDecay:
        typeof params.trailDecay === "number"
          ? clampNumber(params.trailDecay, 0, 1)
          : DEFAULT_DECORATIONS.trailDecay,
    }

    let structureChanged = false
    if (!decorationsEqual(nextDecorations, this.decorations)) {
      structureChanged =
        decorationStructureKey(nextDecorations) !==
        decorationStructureKey(this.decorations)
      this.decorations = nextDecorations
      this.overlayDirty = true
      this.applyDecorationUniforms()
    }

    if (shapeChanged || maskChanged || structureChanged) {
      this.overlayDirty = true
      this.rebuildEffectNode()
    }

    this.updateInnerEffect(params)
  }

  override resize(width: number, height: number): void {
    this.deviceWidth = Math.max(1, width)
    this.deviceHeight = Math.max(1, height)
    this.innerRt?.setSize(this.deviceWidth, this.deviceHeight)
    this.childPass?.resize(this.deviceWidth, this.deviceHeight)
  }

  override updateLogicalSize(width: number, height: number): void {
    this.logicalWidth = Math.max(1, width)
    this.logicalHeight = Math.max(1, height)
    this.aspectUniform.value = this.logicalWidth / this.logicalHeight
    this.edgeSoftUniform.value = 1.5 / this.logicalHeight
    this.applyDecorationUniforms()
    this.resizeOverlayCanvas()
    this.childPass?.updateLogicalSize(this.logicalWidth, this.logicalHeight)
  }

  override needsContinuousRender(): boolean {
    return true
  }

  override dispose(): void {
    this.analysisRtA?.dispose()
    this.analysisRtB?.dispose()
    this.analysisMaterial?.dispose()
    this.analysisGeometry?.dispose()
    this.analysisScene?.clear()
    this.overlayTexture?.dispose()
    this.overlayPlaceholder.dispose()
    this.innerPlaceholder.dispose()
    this.innerRt?.dispose()
    this.childPass?.dispose()
    this.childPass = null
    super.dispose()
  }

  protected override buildEffectNode(): Node {
    if (!(this.blobTableNode && this.shapeScaleUniform)) {
      return this.inputNode
    }

    const screenUv = vec2(uv().x, float(1).sub(uv().y))

    const shapeMask = this.buildShapeMaskNode(screenUv)
    const mask = mix(shapeMask, float(1).sub(shapeMask), this.invertUniform)

    if (this.maskOutput) {
      return vec4(vec3(mask, mask, mask), float(1))
    }

    const innerSample = tslTexture(this.innerPlaceholder, screenUv)
    this.innerNode = innerSample

    const inputColor = vec3(
      this.inputNode.r,
      this.inputNode.g,
      this.inputNode.b
    )
    const innerColor = vec3(innerSample.r, innerSample.g, innerSample.b)
    const interior = mix(
      inputColor,
      innerColor,
      mask.mul(this.innerActiveUniform)
    )

    const decorated = mix(
      interior,
      vec3(
        this.strokeColorUniform.r,
        this.strokeColorUniform.g,
        this.strokeColorUniform.b
      ),
      this.buildDecorationNode(screenUv)
    )

    const overlaySample = tslTexture(
      this.overlayTexture ?? this.overlayPlaceholder,
      screenUv
    )
    const composed = mix(
      decorated,
      vec3(overlaySample.r, overlaySample.g, overlaySample.b),
      float(overlaySample.a)
    )

    return vec4(composed, float(1))
  }

  private buildShapeMaskNode(screenUv: Node): Node {
    const blobTable = this.blobTableNode
    const blobCount = this.blobCountUniform
    const shapeScale = this.shapeScaleUniform
    const aspect = this.aspectUniform
    const edgeSoft = this.edgeSoftUniform
    const shapeKind = this.shapeKind

    const maskFn = Fn(() => {
      const coverage = float(0).toVar()

      Loop(blobCount, ({ i }) => {
        const entry = blobTable.element(i)
        const halfSize = float(entry.z).mul(shapeScale)
        const px = abs(float(screenUv.x).sub(float(entry.x))).mul(aspect)
        const py = abs(float(screenUv.y).sub(float(entry.y)))

        let sdf: Node
        if (shapeKind === "circle") {
          sdf = length(vec2(px, py)).sub(halfSize)
        } else if (shapeKind === "diamond") {
          sdf = px.add(py).sub(halfSize)
        } else {
          sdf = max(px, py).sub(halfSize)
        }

        const contribution = float(1)
          .sub(smoothstep(float(0).sub(edgeSoft), edgeSoft, sdf))
          .mul(float(entry.w))

        coverage.assign(max(coverage, contribution))
      })

      return coverage
    })

    return maskFn() as Node
  }

  private buildDecorationNode(screenUv: Node): Node {
    const aspect = this.aspectUniform
    const halfStroke = this.strokeHalfUniform
    const edge = this.edgeSoftUniform
    const markerRadius = this.markerRadiusUniform
    const shapeScale = this.shapeScaleUniform
    const shapeKind = this.shapeKind
    const decorations = this.decorations

    const point = vec2(float(screenUv.x).mul(aspect), float(screenUv.y))

    const strokeBand = (distance: Node): Node =>
      float(1).sub(
        smoothstep(
          float(0).sub(edge),
          edge,
          abs(distance).sub(halfStroke)
        )
      )

    const segmentDistance = (entry: Node): { along: Node; distance: Node } => {
      const from = vec2(float(entry.x).mul(aspect), float(entry.y))
      const to = vec2(float(entry.z).mul(aspect), float(entry.w))
      const span = to.sub(from)
      const lengthSq = max(dot(span, span), float(1e-8))
      const travel = clamp(dot(point.sub(from), span).div(lengthSq), 0, 1)
      const closest = from.add(span.mul(travel))
      return {
        along: travel.mul(sqrt(lengthSq)),
        distance: length(point.sub(closest)),
      }
    }

    const decorationFn = Fn(() => {
      const coverage = float(0).toVar()

      if (decorations.showOutline) {
        Loop(this.blobCountUniform, ({ i }) => {
          const entry = this.blobTableNode.element(i)
          const offsetX = abs(float(point.x).sub(float(entry.x).mul(aspect)))
          const offsetY = abs(float(point.y).sub(float(entry.y)))
          const halfSize = float(entry.z).mul(shapeScale)

          let sdf: Node
          if (shapeKind === "circle") {
            sdf = length(vec2(offsetX, offsetY)).sub(halfSize)
          } else if (shapeKind === "diamond") {
            sdf = offsetX.add(offsetY).sub(halfSize)
          } else {
            sdf = max(offsetX, offsetY).sub(halfSize)
          }

          coverage.assign(max(coverage, strokeBand(sdf).mul(float(entry.w))))
        })
      }

      if (decorations.centerShape !== "none") {
        Loop(this.blobCountUniform, ({ i }) => {
          const entry = this.blobTableNode.element(i)
          const offsetX = abs(float(point.x).sub(float(entry.x).mul(aspect)))
          const offsetY = abs(float(point.y).sub(float(entry.y)))

          let markerSdf: Node
          if (decorations.centerShape === "cross") {
            const arm = markerRadius.mul(float(1.6))
            const horizontal = max(offsetX.sub(arm), offsetY.sub(halfStroke))
            const vertical = max(offsetX.sub(halfStroke), offsetY.sub(arm))
            markerSdf = min(horizontal, vertical)
          } else {
            markerSdf = length(vec2(offsetX, offsetY)).sub(markerRadius)
          }

          const marker = float(1).sub(
            smoothstep(float(0).sub(edge), edge, markerSdf)
          )

          coverage.assign(max(coverage, marker.mul(float(entry.w))))
        })
      }

      if (decorations.connectLines) {
        Loop(this.segmentCountUniform, ({ i }) => {
          const { along, distance } = segmentDistance(
            this.segmentArrayNode.element(i)
          )
          let mask = strokeBand(distance)
          if (decorations.connectorDashed) {
            mask = mask.mul(
              step(fract(along.div(float(DASH_PERIOD))), float(DASH_DUTY))
            )
          }
          coverage.assign(max(coverage, mask.mul(float(CONNECTOR_ALPHA))))
        })

        if (decorations.connectorArrows) {
          Loop(this.arrowCountUniform, ({ i }) => {
            const { distance } = segmentDistance(this.arrowArrayNode.element(i))
            coverage.assign(
              max(coverage, strokeBand(distance).mul(float(CONNECTOR_ALPHA)))
            )
          })
        }
      }

      if (decorations.showLabels && this.labelAtlas) {
        const cell = this.labelCellUniform
        const atlas = this.labelAtlas
        const indexTexture = this.labelIndexTexture

        Loop(this.blobCountUniform, ({ i }) => {
          const entry = this.blobTableNode.element(i)
          const halfSize = float(entry.z).mul(shapeScale)
          const originX = float(entry.x).mul(aspect).sub(halfSize)
          const originY = float(entry.y)
            .add(halfSize)
            .add(halfStroke)
            .add(float(cell.y).mul(float(0.35)))

          const localX = float(point.x).sub(originX)
          const localY = float(point.y).sub(originY)
          const column = localX.div(float(cell.x)).floor()

          const inside = localY
            .greaterThanEqual(float(0))
            .and(localY.lessThan(float(cell.y)))
            .and(column.greaterThanEqual(float(0)))
            .and(column.lessThan(float(MAX_LABEL_CHARS)))

          const glyph = float(
            tslTexture(indexTexture)
              .load(vec2(column, float(i)))
              .r
          )

          const cellUvX = fract(localX.div(float(cell.x)))
          const cellUvY = localY.div(float(cell.y))
          const atlasUv = vec2(
            glyph.add(cellUvX).div(float(LABEL_CHARS.length)),
            cellUvY
          )
          const ink = float(
            tslTexture(atlas, atlasUv).level(float(0)).r
          )

          const visible = float(inside).mul(
            step(float(0), glyph)
          )
          coverage.assign(
            max(coverage, ink.mul(visible).mul(float(entry.w)))
          )
        })
      }

      return coverage
    })

    return decorationFn() as Node
  }

  private createAnalysisResources(): void {
    this.analysisScene = new THREE.Scene()
    this.analysisCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this.analysisMaterial = new THREE.MeshBasicNodeMaterial()

    const analysisUv = vec2(uv().x, float(1).sub(uv().y))
    const inputSample = tslTexture(new THREE.Texture(), analysisUv)
    const prevSample = tslTexture(new THREE.Texture(), analysisUv)
    this.analysisInputNode = inputSample
    this.analysisPrevNode = prevSample

    const lumaWeights = vec3(0.2126, 0.7152, 0.0722)
    const stepX = 1 / (ANALYSIS_WIDTH * ANALYSIS_SUPERSAMPLE)
    const stepY = 1 / (ANALYSIS_HEIGHT * ANALYSIS_SUPERSAMPLE)
    const center = (ANALYSIS_SUPERSAMPLE - 1) / 2

    let lumaSum: Node = float(0)
    for (let tapY = 0; tapY < ANALYSIS_SUPERSAMPLE; tapY += 1) {
      for (let tapX = 0; tapX < ANALYSIS_SUPERSAMPLE; tapX += 1) {
        const tap = inputSample.sample(
          vec2(
            float(analysisUv.x).add(float((tapX - center) * stepX)),
            float(analysisUv.y).add(float((tapY - center) * stepY))
          )
        )
        lumaSum = lumaSum.add(dot(vec3(tap.r, tap.g, tap.b), lumaWeights))
      }
    }
    const luma = lumaSum.div(
      float(ANALYSIS_SUPERSAMPLE * ANALYSIS_SUPERSAMPLE)
    )

    const motion = abs(float(luma).sub(float(prevSample.g)))
    this.analysisMaterial.colorNode = vec4(
      motion,
      luma,
      float(0),
      float(1)
    ) as Node

    this.analysisGeometry = new THREE.PlaneGeometry(2, 2)
    const mesh = new THREE.Mesh(this.analysisGeometry, this.analysisMaterial)
    mesh.frustumCulled = false
    this.analysisScene.add(mesh)

    this.analysisRtA = new THREE.WebGLRenderTarget(
      ANALYSIS_WIDTH,
      ANALYSIS_HEIGHT,
      ANALYSIS_RT_OPTIONS
    )
    this.analysisRtB = new THREE.WebGLRenderTarget(
      ANALYSIS_WIDTH,
      ANALYSIS_HEIGHT,
      ANALYSIS_RT_OPTIONS
    )
  }

  private renderAnalysis(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture
  ): THREE.WebGLRenderTarget | null {
    if (
      !(
        this.analysisScene &&
        this.analysisCamera &&
        this.analysisRtA &&
        this.analysisRtB &&
        this.analysisInputNode &&
        this.analysisPrevNode
      )
    ) {
      return null
    }

    const writeTarget = this.analysisWriteToA
      ? this.analysisRtA
      : this.analysisRtB
    const readTarget = this.analysisWriteToA
      ? this.analysisRtB
      : this.analysisRtA

    this.analysisInputNode.value = inputTexture
    this.analysisPrevNode.value = readTarget.texture
    renderer.setRenderTarget(writeTarget)
    renderer.render(this.analysisScene, this.analysisCamera)
    this.analysisWriteToA = !this.analysisWriteToA

    return writeTarget
  }

  private queueReadback(
    renderer: THREE.WebGPURenderer,
    target: THREE.WebGLRenderTarget
  ): Promise<void> {
    const readPixels = (
      renderer as unknown as {
        readRenderTargetPixelsAsync: (
          renderTarget: THREE.WebGLRenderTarget,
          x: number,
          y: number,
          width: number,
          height: number
        ) => Promise<ArrayBufferView>
      }
    ).readRenderTargetPixelsAsync


    return readPixels
      .call(renderer, target, 0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT)
      .then((data) => {
        this.latestAnalysis =
          data instanceof Uint8Array
            ? data
            : new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        this.pendingReadback = null
      })
      .catch(() => {
        this.pendingReadback = null
      })
  }

  private syncTrackerOutputs(forceRedraw = false): void {
    const blobs = this.tracker.getBlobs()
    this.updateBlobTable(blobs)
    this.updateConnectorGeometry(blobs)
    this.updateLabelGlyphs(blobs)

    const signature = this.computeOverlaySignature(blobs)
    if (!this.overlayDirty && signature === this.overlaySignature) {
      return
    }

    const now =
      typeof performance !== "undefined" ? performance.now() : Number.NaN
    if (
      !forceRedraw &&
      Number.isFinite(now) &&
      now - this.lastOverlayRedrawAt < OVERLAY_REDRAW_INTERVAL_MS
    ) {
      return
    }

    this.lastOverlayRedrawAt = Number.isFinite(now) ? now : 0
    this.overlaySignature = signature
    this.overlayDirty = false
    this.redrawOverlay(blobs)
  }

  private computeOverlaySignature(blobs: Blob[]): number {
    const width = this.overlayCanvas?.width ?? 1
    const height = this.overlayCanvas?.height ?? 1
    let hash = 0x811c9dc5

    const absorb = (value: number): void => {
      hash = Math.imul(hash ^ (value | 0), 0x01000193)
    }

    absorb(Math.round((this.shapeScaleUniform.value as number) * 256))
    for (const blob of blobs) {
      absorb(blob.id)
      absorb(blob.active ? 1 : 0)
      absorb(Math.round(blob.cx * width))
      absorb(Math.round(blob.cy * height))
      absorb(Math.round(blob.halfWidth * width))
      absorb(Math.round(blob.halfHeight * height))
    }

    return hash >>> 0
  }

  private updateBlobTable(blobs: Blob[]): void {
    const aspect = this.logicalWidth / this.logicalHeight
    const count = Math.min(blobs.length, MAX_BLOBS)

    for (let index = 0; index < count; index += 1) {
      const blob = blobs[index]
      const entry = this.blobEntries[index]
      if (!(blob && entry)) continue
      entry.set(
        blob.cx,
        blob.cy,
        Math.max(blob.halfWidth * aspect, blob.halfHeight),
        blob.presence
      )
    }

    this.blobCountUniform.value = count
  }

  private updateLabelGlyphs(blobs: Blob[]): void {
    if (!(this.decorations.showLabels && this.labelAtlas)) {
      return
    }

    const buffer = this.labelBuffer
    buffer.fill(BLANK_GLYPH)

    const count = Math.min(blobs.length, MAX_BLOBS)
    for (let index = 0; index < count; index += 1) {
      const blob = blobs[index]
      if (!blob?.active) continue
      const label = `x:${Math.round(blob.cx * this.logicalWidth)} y:${Math.round(blob.cy * this.logicalHeight)}`
      const row = index * MAX_LABEL_CHARS * 4
      for (
        let charIndex = 0;
        charIndex < Math.min(label.length, MAX_LABEL_CHARS);
        charIndex += 1
      ) {
        buffer[row + charIndex * 4] = glyphIndex(label[charIndex] as string)
      }
    }

    this.labelIndexTexture.needsUpdate = true
  }

  private applyDecorationUniforms(): void {
    ;(this.strokeColorUniform.value as THREE.Color).setStyle(
      this.decorations.strokeColor,
      THREE.SRGBColorSpace
    )
    this.strokeHalfUniform.value =
      this.decorations.strokeWidth / 2 / Math.max(1, this.logicalHeight)
    const labelHeight = LABEL_HEIGHT_FRACTION
    ;(this.labelCellUniform.value as THREE.Vector2).set(
      labelHeight * LABEL_CELL_ASPECT,
      labelHeight
    )
    this.markerRadiusUniform.value = Math.max(
      0.0035,
      (this.decorations.strokeWidth * 1.6) / Math.max(1, this.logicalHeight)
    )
  }

  private buildConnectorChain(blobs: Blob[]): Blob[] {
    const active = blobs.filter((blob) => blob.active)
    if (active.length < 2) {
      return []
    }

    const remaining = active.slice(1)
    const chain = [active[0] as Blob]
    while (remaining.length > 0) {
      const last = chain[chain.length - 1] as Blob
      let bestIndex = 0
      let bestDistance = Number.POSITIVE_INFINITY
      for (let index = 0; index < remaining.length; index += 1) {
        const candidate = remaining[index]
        if (!candidate) continue
        const dx = candidate.cx - last.cx
        const dy = candidate.cy - last.cy
        const distance = dx * dx + dy * dy
        if (distance < bestDistance) {
          bestDistance = distance
          bestIndex = index
        }
      }
      const next = remaining.splice(bestIndex, 1)[0]
      if (next) {
        chain.push(next)
      }
    }

    return chain
  }

  private updateConnectorGeometry(blobs: Blob[]): void {
    let segmentCount = 0
    let arrowCount = 0

    if (!this.decorations.connectLines) {
      this.segmentCountUniform.value = 0
      this.arrowCountUniform.value = 0
      return
    }

    const chain = this.buildConnectorChain(blobs)
    const curved = this.decorations.curvedLines
    const steps = curved ? CURVE_SUBDIVISIONS : 1

    const pushSegment = (
      x0: number,
      y0: number,
      x1: number,
      y1: number
    ): void => {
      const entry = this.segmentEntries[segmentCount]
      if (!entry || segmentCount >= MAX_CONNECTOR_SEGMENTS) return
      entry.set(x0, y0, x1, y1)
      segmentCount += 1
    }

    const pushArrow = (
      x0: number,
      y0: number,
      x1: number,
      y1: number
    ): void => {
      const entry = this.arrowEntries[arrowCount]
      if (!entry || arrowCount >= MAX_ARROW_SEGMENTS) return
      entry.set(x0, y0, x1, y1)
      arrowCount += 1
    }

    for (let index = 0; index < chain.length - 1; index += 1) {
      const from = chain[index]
      const to = chain[index + 1]
      if (!(from && to)) continue

      const deltaX = to.cx - from.cx
      const deltaY = to.cy - from.cy
      const span = Math.hypot(deltaX, deltaY) || 1
      const controlX = (from.cx + to.cx) / 2 - deltaY * 0.15
      const controlY = (from.cy + to.cy) / 2 + deltaX * 0.15

      const at = (t: number): { x: number; y: number } => {
        if (!curved) {
          return { x: from.cx + deltaX * t, y: from.cy + deltaY * t }
        }
        const inv = 1 - t
        return {
          x: inv * inv * from.cx + 2 * inv * t * controlX + t * t * to.cx,
          y: inv * inv * from.cy + 2 * inv * t * controlY + t * t * to.cy,
        }
      }

      for (let sub = 0; sub < steps; sub += 1) {
        const start = at(sub / steps)
        const end = at((sub + 1) / steps)
        pushSegment(start.x, start.y, end.x, end.y)
      }

      if (this.decorations.connectorArrows) {
        const tip = at(0.55)
        const tail = at(0.45)
        const dirX = (tip.x - tail.x) / (Math.hypot(tip.x - tail.x, tip.y - tail.y) || 1)
        const dirY = (tip.y - tail.y) / (Math.hypot(tip.x - tail.x, tip.y - tail.y) || 1)
        const barb = ARROW_BARB_LENGTH * Math.min(1, span * 4)
        const angle = Math.atan2(dirY, dirX)
        for (const sign of [1, -1]) {
          const barbAngle = angle + sign * ARROW_BARB_SPREAD
          pushArrow(
            tip.x,
            tip.y,
            tip.x + Math.cos(barbAngle) * barb,
            tip.y + Math.sin(barbAngle) * barb
          )
        }
      }
    }

    this.segmentCountUniform.value = segmentCount
    this.arrowCountUniform.value = arrowCount
  }

  private getOverlaySize(): { height: number; width: number } {
    const width = Math.max(1, Math.min(this.logicalWidth, OVERLAY_MAX_WIDTH))
    const height = Math.max(
      1,
      Math.round((width * this.logicalHeight) / Math.max(1, this.logicalWidth))
    )
    return { height, width }
  }

  private createOverlayResources(): void {
    if (typeof document === "undefined") {
      return
    }

    const { height, width } = this.getOverlaySize()
    this.overlayCanvas = document.createElement("canvas")
    this.overlayCanvas.width = width
    this.overlayCanvas.height = height
    this.overlayContext = this.overlayCanvas.getContext("2d")

    this.overlayTexture = new THREE.CanvasTexture(this.overlayCanvas)
    this.overlayTexture.colorSpace = THREE.SRGBColorSpace
    this.overlayTexture.flipY = false
    this.overlayTexture.generateMipmaps = false
    this.overlayTexture.magFilter = THREE.LinearFilter
    this.overlayTexture.minFilter = THREE.LinearFilter
    this.overlayTexture.wrapS = THREE.ClampToEdgeWrapping
    this.overlayTexture.wrapT = THREE.ClampToEdgeWrapping
  }

  private resizeOverlayCanvas(): void {
    if (!this.overlayCanvas) {
      return
    }
    const { height, width } = this.getOverlaySize()
    if (
      this.overlayCanvas.width === width &&
      this.overlayCanvas.height === height
    ) {
      return
    }
    this.overlayCanvas.width = width
    this.overlayCanvas.height = height
    this.overlaySignature = NO_SIGNATURE
    this.overlayDirty = false
    this.redrawOverlay(this.tracker.getBlobs())
  }

  private redrawOverlay(blobs: Blob[]): void {
    const context = this.overlayContext
    if (!(context && this.overlayCanvas && this.overlayTexture)) {
      return
    }

    const width = this.overlayCanvas.width
    const height = this.overlayCanvas.height
    context.clearRect(0, 0, width, height)

    const { strokeColor, strokeWidth, trailDecay } = this.decorations
    const scale = this.shapeScaleUniform.value as number
    const strokeScale = width / Math.max(1, this.logicalWidth)
    const scaledStrokeWidth = Math.max(0.75, strokeWidth * strokeScale)

    context.strokeStyle = strokeColor
    context.fillStyle = strokeColor
    context.lineWidth = scaledStrokeWidth

    const activeBlobs = blobs.filter((blob) => blob.active)

    if (trailDecay > 0) {
      for (const blob of activeBlobs) {
        const history = blob.history
        for (let index = 0; index < history.length - 1; index += 2) {
          const point = history[index]
          if (!point) continue
          const age = (index + 1) / history.length
          context.globalAlpha = age * trailDecay * 0.6 * blob.presence
          const radius =
            Math.max(blob.halfWidth * width, blob.halfHeight * height) *
            scale *
            (0.4 + age * 0.6)
          this.strokeShape(context, point.x * width, point.y * height, radius)
        }
      }
      context.globalAlpha = 1
    }

    this.overlayTexture.needsUpdate = true
  }

  private strokeShape(
    context: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    radius: number
  ): void {
    context.beginPath()
    if (this.shapeKind === "circle") {
      context.arc(centerX, centerY, radius, 0, Math.PI * 2)
    } else if (this.shapeKind === "diamond") {
      context.moveTo(centerX, centerY - radius)
      context.lineTo(centerX + radius, centerY)
      context.lineTo(centerX, centerY + radius)
      context.lineTo(centerX - radius, centerY)
      context.closePath()
    } else {
      context.rect(centerX - radius, centerY - radius, radius * 2, radius * 2)
    }
    context.stroke()
  }

  private updateInnerEffect(params: LayerParameterValues): void {
    const nextType: ShaderLabBlobInnerEffect = isInnerEffectType(params.innerEffectType)
      ? params.innerEffectType
      : INNER_EFFECT_NONE
    const nextRaw =
      typeof params.innerEffectParams === "string"
        ? params.innerEffectParams
        : ""

    if (nextType !== this.innerEffectType) {
      this.innerEffectType = nextType
      this.childPass?.dispose()
      this.childPass = null

      if (nextType !== INNER_EFFECT_NONE) {
        this.childPass = createInnerEffectPass(
          nextType,
          `${this.layerId}:inner`
        )
        if (this.childPass) {
          if (this.innerRt) {
            this.innerRt.setSize(this.deviceWidth, this.deviceHeight)
          } else {
            this.innerRt = new THREE.WebGLRenderTarget(
              this.deviceWidth,
              this.deviceHeight,
              INNER_RT_OPTIONS
            )
          }
          this.childPass.resize(this.deviceWidth, this.deviceHeight)
          this.childPass.updateLogicalSize(
            this.logicalWidth,
            this.logicalHeight
          )
        }
      }

      this.innerActiveUniform.value = this.childPass ? 1 : 0
      this.innerEffectParamsRaw = ""
      this.rebuildEffectNode()
    }

    if (this.childPass && nextRaw !== this.innerEffectParamsRaw) {
      this.innerEffectParamsRaw = nextRaw
      this.childPass.updateParams(parseInnerEffectParams(nextRaw))
      this.childPass.flushColorNode()
    }
  }

  private resetTemporalState(): void {
    this.tracker.reset()
    this.latestAnalysis = null
    for (const entry of this.blobEntries) {
      entry.set(0, 0, 0, 0)
    }
    this.blobCountUniform.value = 0
    this.segmentCountUniform.value = 0
    this.arrowCountUniform.value = 0
    this.overlaySignature = NO_SIGNATURE
    this.overlayDirty = false
    this.redrawOverlay([])
  }
}
