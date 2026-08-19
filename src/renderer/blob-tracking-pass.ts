import {
  abs,
  clamp,
  dot,
  attribute,
  float,
  floor,
  fract,
  length,
  max,
  min,
  mix,
  positionLocal,
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
  INNER_EFFECT_NONE,
  type InnerEffectType,
  isInnerEffectType,
  parseInnerEffectParams,
} from "@/lib/blob-tracking/inner-effects"
import {
  type Blob,
  BlobTracker,
  type TrackerConfig,
  VELOCITY_LOOKAHEAD,
} from "@/lib/blob-tracking/tracker"
import { AsciiPass } from "@/renderer/ascii-pass"
import { BloomPass } from "@/renderer/bloom-pass"
import { ChromaticAberrationPass } from "@/renderer/chromatic-aberration-pass"
import { CircuitBentPass } from "@/renderer/circuit-bent-pass"
import { CrtPass } from "@/renderer/crt-pass"
import { DirectionalBlurPass } from "@/renderer/directional-blur-pass"
import { DisplacementMapPass } from "@/renderer/displacement-map-pass"
import { DitheringPass } from "@/renderer/dithering-pass"
import { EdgeDetectPass } from "@/renderer/edge-detect-pass"
import { FlutedGlassPass } from "@/renderer/fluted-glass-pass"
import { HalftonePass } from "@/renderer/halftone-pass"
import { InkPass } from "@/renderer/ink-pass"
import { ParticleGridPass } from "@/renderer/particle-grid-pass"
import {
  BLANK_GLYPH,
  buildLabelAtlas,
  glyphIndex,
  LABEL_CELL_ASPECT,
  LABEL_CHARS,
} from "@/renderer/blob-label-atlas"
import { PassNode } from "@/renderer/pass-node"
import { PatternPass } from "@/renderer/pattern-pass"
import { PixelSortingPass } from "@/renderer/pixel-sorting-pass"
import { PixelationPass } from "@/renderer/pixelation-pass"
import { PlotterPass } from "@/renderer/plotter-pass"
import { PosterizePass } from "@/renderer/posterize-pass"
import { SlicePass } from "@/renderer/slice-pass"
import { SmearPass } from "@/renderer/smear-pass"
import { ThresholdPass } from "@/renderer/threshold-pass"
import { VoxelPass } from "@/renderer/voxel-pass"
import type { LayerParameterValues } from "@/types/editor"

type Node = TSLNode

const ANALYSIS_WIDTH = 64
const ANALYSIS_HEIGHT = 36
const LUMA_MAX_LEVELS = 8
const MOTION_ENERGY_FLOOR = 0.025
const DEFAULT_MOTION_PERSISTENCE = 0.82
const LUMA_WEIGHTS: readonly [number, number, number] = [
  0.2126, 0.7152, 0.0722,
]

const MAX_BLOBS = 32
const TRAIL_DIVISOR = 2
const TRAIL_FLOOR = 0.02
const TRAIL_DECAY_MIN = 0.75
const TRAIL_DECAY_RANGE = 0.24
const TRAIL_MAX_ALPHA = 0.6
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
const SHAPE_EXTENT_EPSILON = 1e-5

// Motion mask, following "Shading Motion". Its state texture is rgba8unorm at
// DETECTION_SCALE with R = current luminance and G = the decayed motion trail;
// our luma pyramid's level 0 is already device/2, i.e. DETECTION_SCALE 0.5.
const MOTION_TRAIL_FLOOR = 0.025
const MOTION_THRESHOLD_SPAN = 4
const DEFAULT_MOTION_MASK_THRESHOLD = 0.08


/** Render-target reads are Y-flipped relative to the fullscreen quad's uv(). */
function renderTargetUv(): Node {
  return vec2(uv().x, float(1).sub(uv().y))
}

const ANALYSIS_RT_OPTIONS = {
  depthBuffer: false,
  format: THREE.RGBAFormat,
  generateMipmaps: false,
  magFilter: THREE.NearestFilter,
  minFilter: THREE.NearestFilter,
  stencilBuffer: false,
  type: THREE.UnsignedByteType,
} as const

const LUMA_RT_OPTIONS = {
  depthBuffer: false,
  format: THREE.RGBAFormat,
  generateMipmaps: false,
  magFilter: THREE.LinearFilter,
  minFilter: THREE.LinearFilter,
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
  sensitivity: 0.8,
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
  type: InnerEffectType,
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
  private readonly fullscreenGeometry = new THREE.PlaneGeometry(2, 2)
  private analysisRtA: THREE.WebGLRenderTarget | null = null
  private analysisRtB: THREE.WebGLRenderTarget | null = null
  private analysisWriteToA = true
  private analysisInputNode: Node | null = null
  private analysisPrevNode: Node | null = null

  private readonly lumaTargets: THREE.WebGLRenderTarget[] = []
  private readonly lumaScenes: THREE.Scene[] = []
  private readonly lumaMaterials: THREE.MeshBasicNodeMaterial[] = []
  private readonly lumaInputs: Node[] = []
  private readonly lumaTexelUniforms: Node[] = []
  private lumaLevelCount = 1

  private readonly motionPersistenceUniform: Node = uniform(0.82)
  private readonly motionThresholdUniform: Node = uniform(
    DEFAULT_MOTION_MASK_THRESHOLD
  )
  private readonly hasHistoryUniform: Node = uniform(0)

  private pendingReadback: Promise<void> | null = null
  private latestAnalysis: Uint8Array | null = null
  private readbackFailureReported = false

  private readonly tracker = new BlobTracker()
  private trackerConfig: TrackerConfig = { ...DEFAULT_TRACKER_CONFIG }
  private lastTimelineTime: number | null = null

  private readonly blobEntries: THREE.Vector4[] = Array.from(
    { length: MAX_BLOBS },
    () => new THREE.Vector4(0, 0, 0, 0)
  )
  private readonly blobMetaEntries: THREE.Vector4[] = Array.from(
    { length: MAX_BLOBS },
    () => new THREE.Vector4(0, 0, 0, 0)
  )
  private readonly blobCountUniform: Node = uniform(0, "int")

  private readonly segmentEntries: THREE.Vector4[] = Array.from(
    { length: MAX_CONNECTOR_SEGMENTS },
    () => new THREE.Vector4(0, 0, 0, 0)
  )
  private readonly segmentCountUniform: Node = uniform(0, "int")

  private readonly arrowEntries: THREE.Vector4[] = Array.from(
    { length: MAX_ARROW_SEGMENTS },
    () => new THREE.Vector4(0, 0, 0, 0)
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
  private decorationScene: THREE.Scene | null = null
  private decorationRt: THREE.WebGLRenderTarget | null = null
  private readonly decorationMeshes: THREE.Mesh[] = []
  private readonly decorationAttributes: THREE.InstancedBufferAttribute[] = []
  private shapeMesh: THREE.Mesh | null = null
  private labelMesh: THREE.Mesh | null = null
  private connectorMesh: THREE.Mesh | null = null
  private arrowMesh: THREE.Mesh | null = null
  private decorationSampleNode: Node | null = null
  private trailDecorationNode: Node | null = null
  private readonly decorationPlaceholder = new THREE.Texture()
  private readonly blobRectData = new Float32Array(MAX_BLOBS * 4)
  private readonly blobMetaData = new Float32Array(MAX_BLOBS * 4)
  private readonly segmentData = new Float32Array(MAX_CONNECTOR_SEGMENTS * 4)
  private readonly arrowData = new Float32Array(MAX_ARROW_SEGMENTS * 4)

  private motionScene: THREE.Scene | null = null
  private motionMaterial: THREE.MeshBasicNodeMaterial | null = null
  private motionRtA: THREE.WebGLRenderTarget | null = null
  private motionRtB: THREE.WebGLRenderTarget | null = null
  private motionWriteToA = true
  private motionLumaNode: Node | null = null
  private motionPrevNode: Node | null = null
  private motionSampleNode: Node | null = null
  private readonly motionPlaceholder = new THREE.Texture()
  private motionOutput = false

  private trailRtA: THREE.WebGLRenderTarget | null = null
  private trailRtB: THREE.WebGLRenderTarget | null = null
  private trailWriteToA = true
  private trailScene: THREE.Scene | null = null
  private trailMaterial: THREE.MeshBasicNodeMaterial | null = null
  private trailPrevNode: Node | null = null
  private trailSampleNode: Node | null = null
  private trailNeedsClear = true
  private readonly trailPlaceholder = new THREE.Texture()
  private readonly trailDecayUniform: Node = uniform(0.83)
  private readonly trailStrengthUniform: Node = uniform(0)

  private innerEffectType: InnerEffectType = INNER_EFFECT_NONE
  private innerEffectParamsRaw = ""
  private childPass: PassNode | null = null
  private innerRt: THREE.WebGLRenderTarget | null = null
  private readonly innerPlaceholder = new THREE.Texture()
  private innerNode: Node | null = null

  private deviceWidth = 1
  private deviceHeight = 1
  private logicalWidth = 1
  private logicalHeight = 1

  constructor(layerId: string) {
    super(layerId)

    this.applyDecorationUniforms()
    this.createAnalysisResources()
    this.createLumaChainResources()
    this.createDecorationResources()
    this.createMotionMaskResources()
    this.createTrailResources()
    this.rebuildEffectNode()
  }

  override render(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number,
    timelineTime = time
  ): void {
    if (
      this.lastTimelineTime !== null &&
      timelineTime < this.lastTimelineTime
    ) {
      this.resetTemporalState()
    }
    this.lastTimelineTime = timelineTime

    if (this.childPass && this.innerRt) {
      this.childPass.render(renderer, inputTexture, this.innerRt, time, delta)
      if (this.innerNode) {
        this.innerNode.value = this.innerRt.texture
      }
    }

    const lumaTexture = this.renderLumaChain(renderer, inputTexture)
    this.renderMotionMask(renderer)
    const writeTarget = this.renderAnalysis(renderer, lumaTexture)
    this.hasHistoryUniform.value = 1

    if (writeTarget && !this.pendingReadback) {
      this.pendingReadback = this.queueReadback(renderer, writeTarget)
    }

    if (this.latestAnalysis) {
      this.tracker.step(
        this.latestAnalysis,
        ANALYSIS_WIDTH,
        ANALYSIS_HEIGHT,
        timelineTime,
        this.trackerConfig
      )
      this.syncTrackerOutputs()
    }

    this.renderDecorations(renderer)
    this.renderTrail(renderer)

    super.render(renderer, inputTexture, outputTarget, time, delta)
  }

  override async prepareForExportFrame(
    time: number,
    loop: boolean
  ): Promise<void> {
    if (this.pendingReadback) {
      await this.pendingReadback
    }
    if (this.lastTimelineTime !== null && time < this.lastTimelineTime) {
      this.resetTemporalState()
    }
    this.lastTimelineTime = time
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
    await this.childPass?.prepareForExportFrame(time, loop)
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

    this.motionThresholdUniform.value =
      typeof params.motionMaskThreshold === "number"
        ? clampNumber(params.motionMaskThreshold, 0, 0.5)
        : DEFAULT_MOTION_MASK_THRESHOLD
    this.motionPersistenceUniform.value =
      typeof params.motionPersistence === "number"
        ? clampNumber(params.motionPersistence, 0, 0.99)
        : DEFAULT_MOTION_PERSISTENCE

    const nextShape = resolveShape(params.shapeType)
    const shapeChanged = nextShape !== this.shapeKind
    this.shapeKind = nextShape

    const nextScale =
      typeof params.shapeScale === "number"
        ? clampNumber(params.shapeScale, 0.25, 3)
        : 1
    if (nextScale !== (this.shapeScaleUniform.value as number)) {
      this.shapeScaleUniform.value = nextScale
    }
    this.invertUniform.value = params.invert === true ? 1 : 0

    const nextMaskOutput = params.outputMode === "mask"
    const nextMotionOutput = params.outputMode === "motion"
    const maskChanged =
      nextMaskOutput !== this.maskOutput ||
      nextMotionOutput !== this.motionOutput
    this.maskOutput = nextMaskOutput
    this.motionOutput = nextMotionOutput

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
      this.applyDecorationUniforms()
    }

    if (shapeChanged || maskChanged || structureChanged) {
      this.rebuildEffectNode()
    }
    if (shapeChanged || structureChanged) {
      this.rebuildDecorationMeshes()
    }

    this.updateInnerEffect(params)
  }

  override resize(width: number, height: number): void {
    this.deviceWidth = Math.max(1, width)
    this.deviceHeight = Math.max(1, height)
    this.innerRt?.setSize(this.deviceWidth, this.deviceHeight)
    this.resizeLumaChain()
    this.resizeDecorationTarget()
    this.resizeMotionTargets()
    this.resizeTrailTargets()
    this.hasHistoryUniform.value = 0
    this.childPass?.resize(this.deviceWidth, this.deviceHeight)
  }

  override updateLogicalSize(width: number, height: number): void {
    this.logicalWidth = Math.max(1, width)
    this.logicalHeight = Math.max(1, height)
    this.aspectUniform.value = this.logicalWidth / this.logicalHeight
    this.edgeSoftUniform.value = 1.5 / this.logicalHeight
    this.applyDecorationUniforms()
    this.childPass?.updateLogicalSize(this.logicalWidth, this.logicalHeight)
  }

  override needsContinuousRender(): boolean {
    return true
  }

  override dispose(): void {
    this.analysisRtA?.dispose()
    this.analysisRtB?.dispose()
    this.analysisMaterial?.dispose()
    this.fullscreenGeometry.dispose()
    for (const target of this.lumaTargets) {
      target.dispose()
    }
    for (const material of this.lumaMaterials) {
      material.dispose()
    }
    this.analysisScene?.clear()
    this.disposeDecorationMeshes()
    this.decorationRt?.dispose()
    this.decorationScene?.clear()
    this.decorationPlaceholder.dispose()
    this.motionRtA?.dispose()
    this.motionRtB?.dispose()
    this.motionMaterial?.dispose()
    this.motionScene?.clear()
    this.motionPlaceholder.dispose()
    this.trailRtA?.dispose()
    this.trailRtB?.dispose()
    this.trailMaterial?.dispose()
    this.trailScene?.clear()
    this.trailPlaceholder.dispose()
    this.labelIndexTexture.dispose()
    this.labelAtlas?.dispose()
    this.innerPlaceholder.dispose()
    this.innerRt?.dispose()
    this.childPass?.dispose()
    this.childPass = null
    super.dispose()
  }

  protected override buildEffectNode(): Node {
    // PassNode's constructor builds the node graph before this subclass's field
    // initializers have run, so bail out until our own resources exist.
    if (!(this.decorationPlaceholder && this.motionPlaceholder)) {
      return this.inputNode
    }

    const screenUv = vec2(uv().x, float(1).sub(uv().y))

    const motionSample = tslTexture(this.motionPlaceholder, screenUv)
    this.motionSampleNode = motionSample
    const motionTrail = float(motionSample.g)

    const motionMask = mix(
      motionTrail,
      float(1).sub(motionTrail),
      this.invertUniform
    )

    if (this.motionOutput) {
      // With an inner effect set, emit the effect carried by the mask's alpha —
      // lit means effect, unlit means transparent. With no inner effect there is
      // nothing to carry, so emit the mask itself for viewing or for driving
      // another layer through `compositeMode: "mask"`.
      if (this.innerEffectType !== INNER_EFFECT_NONE) {
        const maskedSample = tslTexture(this.innerPlaceholder, screenUv)
        this.innerNode = maskedSample
        return vec4(
          vec3(maskedSample.r, maskedSample.g, maskedSample.b),
          clamp(motionMask.mul(this.innerActiveUniform), 0, 1)
        )
      }
      return vec4(vec3(motionMask, motionMask, motionMask), float(1))
    }

    const decorationSample = tslTexture(this.decorationPlaceholder, screenUv)
    this.decorationSampleNode = decorationSample
    const shapeMask = float(decorationSample.r)
    const mask = mix(shapeMask, float(1).sub(shapeMask), this.invertUniform)

    if (this.maskOutput) {
      return vec4(vec3(mask, mask, mask), float(1))
    }

    const innerSample = tslTexture(this.innerPlaceholder, screenUv)
    this.innerNode = innerSample


    const innerColor = vec3(innerSample.r, innerSample.g, innerSample.b)
    const innerAmount = mask.mul(this.innerActiveUniform)

    const trailSample = tslTexture(this.trailPlaceholder, screenUv)
    this.trailSampleNode = trailSample
    const trail = float(trailSample.r).mul(this.trailStrengthUniform)
    const decoration = max(float(decorationSample.g), trail)

    // Emit the effect plus a real alpha rather than pre-mixing with the input:
    // PassNode's blend already does `mix(base, effect, opacity * alpha)`, so an
    // unlit mask leaves the layer transparent and the stack below shows through.
    const composed = mix(
      innerColor,
      vec3(
        this.strokeColorUniform.r,
        this.strokeColorUniform.g,
        this.strokeColorUniform.b
      ),
      decoration
    )

    return vec4(composed, clamp(max(innerAmount, decoration), 0, 1))
  }

  private shapeDistance(px: Node, py: Node, halfW: Node, halfH: Node): Node {
    const hw = max(halfW, float(SHAPE_EXTENT_EPSILON))
    const hh = max(halfH, float(SHAPE_EXTENT_EPSILON))

    if (this.shapeKind === "circle") {
      const radial = length(vec2(px.div(hw), py.div(hh)))
      return radial.sub(float(1)).mul(min(hw, hh))
    }

    if (this.shapeKind === "diamond") {
      const radial = px.div(hw).add(py.div(hh)).sub(float(1))
      const gradient = length(
        vec2(float(1).div(hw), float(1).div(hh))
      )
      return radial.div(gradient)
    }

    const dx = px.sub(hw)
    const dy = py.sub(hh)
    return length(max(vec2(dx, dy), vec2(0, 0))).add(
      min(max(dx, dy), float(0))
    )
  }

  private createLumaChainResources(): void {
    for (let level = 0; level < LUMA_MAX_LEVELS; level += 1) {
      const target = new THREE.WebGLRenderTarget(1, 1, LUMA_RT_OPTIONS)
      const texel = uniform(new THREE.Vector2(1, 1))
      const input = tslTexture(new THREE.Texture(), renderTargetUv())
      const material = new THREE.MeshBasicNodeMaterial()

      const tap = (dx: number, dy: number): Node => {
        const sample = input.sample(
          renderTargetUv().add(
            vec2(
              float(texel.x).mul(float(dx)),
              float(texel.y).mul(float(dy))
            )
          )
        )
        return level === 0
          ? dot(
              vec3(sample.r, sample.g, sample.b),
              vec3(LUMA_WEIGHTS[0], LUMA_WEIGHTS[1], LUMA_WEIGHTS[2])
            )
          : float(sample.r)
      }

      const average = tap(-0.5, -0.5)
        .add(tap(0.5, -0.5))
        .add(tap(-0.5, 0.5))
        .add(tap(0.5, 0.5))
        .mul(float(0.25))

      material.colorNode = vec4(average, average, average, float(1)) as Node

      const mesh = new THREE.Mesh(this.fullscreenGeometry, material)
      mesh.frustumCulled = false
      const scene = new THREE.Scene()
      scene.add(mesh)

      this.lumaTargets.push(target)
      this.lumaTexelUniforms.push(texel)
      this.lumaInputs.push(input)
      this.lumaMaterials.push(material)
      this.lumaScenes.push(scene)
    }

    this.resizeLumaChain()
  }

  private resizeLumaChain(): void {
    let sourceWidth = this.deviceWidth
    let sourceHeight = this.deviceHeight
    let levels = 0

    while (levels < LUMA_MAX_LEVELS) {
      const nextWidth = Math.max(ANALYSIS_WIDTH, Math.floor(sourceWidth / 2))
      const nextHeight = Math.max(ANALYSIS_HEIGHT, Math.floor(sourceHeight / 2))

      this.lumaTargets[levels]?.setSize(nextWidth, nextHeight)
      ;(
        this.lumaTexelUniforms[levels]?.value as THREE.Vector2 | undefined
      )?.set(1 / sourceWidth, 1 / sourceHeight)

      levels += 1
      const reachedFloor =
        nextWidth <= ANALYSIS_WIDTH && nextHeight <= ANALYSIS_HEIGHT
      sourceWidth = nextWidth
      sourceHeight = nextHeight
      if (reachedFloor) break
    }

    this.lumaLevelCount = Math.max(1, levels)
  }

  private renderLumaChain(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture
  ): THREE.Texture {
    let source = inputTexture

    for (let level = 0; level < this.lumaLevelCount; level += 1) {
      const target = this.lumaTargets[level]
      const scene = this.lumaScenes[level]
      const input = this.lumaInputs[level]
      if (!(target && scene && input && this.analysisCamera)) break
      input.value = source
      renderer.setRenderTarget(target)
      renderer.render(scene, this.analysisCamera)
      source = target.texture
    }

    return source
  }

  private strokeBandNode(distance: Node): Node {
    const edge = this.edgeSoftUniform
    return float(1).sub(
      smoothstep(
        float(0).sub(edge),
        edge,
        abs(distance).sub(this.strokeHalfUniform)
      )
    )
  }

  /**
   * Quads own their attributes: sharing `fullscreenGeometry`'s would mean
   * `disposeDecorationMeshes` tears down buffers the analysis and trail passes
   * still need. Layout matches PlaneGeometry(2, 2): uv.y = (y + 1) / 2.
   */
  private createInstancedQuad(
    attributes: Record<string, THREE.InstancedBufferAttribute>
  ): THREE.InstancedBufferGeometry {
    const geometry = new THREE.InstancedBufferGeometry()
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(
        new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]),
        3
      )
    )
    geometry.setAttribute(
      "uv",
      new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2)
    )
    geometry.setIndex(
      new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1)
    )
    for (const [name, attributeBuffer] of Object.entries(attributes)) {
      geometry.setAttribute(name, attributeBuffer)
    }
    geometry.instanceCount = 0
    return geometry
  }

  private createDecorationMaterial(): THREE.MeshBasicNodeMaterial {
    const material = new THREE.MeshBasicNodeMaterial()
    // Coverage unions with a max blend, matching the `max()` chain the previous
    // full-screen loops used, so overlapping primitives never double up.
    material.blending = THREE.CustomBlending
    material.blendEquation = THREE.MaxEquation
    material.blendSrc = THREE.OneFactor
    material.blendDst = THREE.OneFactor
    material.blendEquationAlpha = THREE.MaxEquation
    material.blendSrcAlpha = THREE.OneFactor
    material.blendDstAlpha = THREE.OneFactor
    material.transparent = true
    material.depthTest = false
    material.depthWrite = false
    // quadPositionNode inverts Y to match the screenUv convention, which
    // reverses triangle winding; without this every quad is back-facing and
    // silently culled.
    material.side = THREE.DoubleSide
    return material
  }

  /** Local quad corner -> clip space, for a quad centred in point space. */
  private quadPositionNode(center: Node, half: Node): Node {
    const screenX = float(center.x)
      .add(positionLocal.x.mul(float(half.x)))
      .div(this.aspectUniform)
    const screenY = float(center.y).add(positionLocal.y.mul(float(half.y)))
    return vec3(screenX.mul(2).sub(1), float(1).sub(screenY.mul(2)), float(0))
  }

  /** Recovers point-space position in the fragment stage. */
  private quadPointNode(center: Node, half: Node): Node {
    return vec2(
      float(center.x).add(uv().x.mul(2).sub(1).mul(float(half.x))),
      float(center.y).add(uv().y.mul(2).sub(1).mul(float(half.y)))
    )
  }

  private addDecorationMesh(
    material: THREE.MeshBasicNodeMaterial,
    attributes: Record<string, THREE.InstancedBufferAttribute>
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(this.createInstancedQuad(attributes), material)
    mesh.frustumCulled = false
    mesh.visible = false
    this.decorationScene?.add(mesh)
    this.decorationMeshes.push(mesh)
    return mesh
  }

  private createBlobAttributes(): {
    meta: THREE.InstancedBufferAttribute
    rect: THREE.InstancedBufferAttribute
  } {
    const rect = new THREE.InstancedBufferAttribute(this.blobRectData, 4)
    const meta = new THREE.InstancedBufferAttribute(this.blobMetaData, 4)
    rect.setUsage(THREE.DynamicDrawUsage)
    meta.setUsage(THREE.DynamicDrawUsage)
    this.decorationAttributes.push(rect, meta)
    return { meta, rect }
  }

  private buildShapeMesh(): void {
    const material = this.createDecorationMaterial()
    const { meta, rect } = this.createBlobAttributes()

    const iRect = attribute("iRect", "vec4")
    const presence = float(attribute("iMeta", "vec4").x)
    const halfW = float(iRect.z).mul(this.shapeScaleUniform)
    const halfH = float(iRect.w).mul(this.shapeScaleUniform)
    const center = vec2(float(iRect.x).mul(this.aspectUniform), float(iRect.y))
    const pad = this.strokeHalfUniform
      .add(this.edgeSoftUniform.mul(3))
      .add(this.markerRadiusUniform.mul(1.6))
    const half = vec2(halfW.add(pad), halfH.add(pad))

    material.positionNode = this.quadPositionNode(center, half) as Node

    const offsetX = abs(uv().x.mul(2).sub(1)).mul(float(half.x))
    const offsetY = abs(uv().y.mul(2).sub(1)).mul(float(half.y))
    const sdf = this.shapeDistance(offsetX, offsetY, halfW, halfH)
    const edge = this.edgeSoftUniform

    const fill = float(1)
      .sub(smoothstep(float(0).sub(edge), edge, sdf))
      .mul(presence)
    const outline = this.strokeBandNode(sdf).mul(presence)

    let stroke: Node = this.decorations.showOutline ? outline : float(0)
    if (this.decorations.centerShape !== "none") {
      const markerRadius = this.markerRadiusUniform
      const halfStroke = this.strokeHalfUniform
      let markerSdf: Node
      if (this.decorations.centerShape === "cross") {
        const arm = markerRadius.mul(float(1.6))
        markerSdf = min(
          max(offsetX.sub(arm), offsetY.sub(halfStroke)),
          max(offsetX.sub(halfStroke), offsetY.sub(arm))
        )
      } else {
        markerSdf = length(vec2(offsetX, offsetY)).sub(markerRadius)
      }
      stroke = max(
        stroke,
        float(1)
          .sub(smoothstep(float(0).sub(edge), edge, markerSdf))
          .mul(presence)
      )
    }

    // B carries the bare outline: it is what the trail ribbon accumulates.
    material.colorNode = vec4(fill, stroke, outline, float(1)) as Node
    this.shapeMesh = this.addDecorationMesh(material, {
      iMeta: meta,
      iRect: rect,
    })
  }

  private buildLabelMesh(): void {
    if (!(this.decorations.showLabels && this.labelAtlas)) {
      return
    }

    const material = this.createDecorationMaterial()
    const { meta, rect } = this.createBlobAttributes()

    const iRect = attribute("iRect", "vec4")
    const iMeta = attribute("iMeta", "vec4")
    const presence = float(iMeta.x)
    const row = float(iMeta.y)
    const cell = this.labelCellUniform
    const labelW = float(cell.x).mul(float(MAX_LABEL_CHARS))
    const labelH = float(cell.y)
    const halfW = float(iRect.z).mul(this.shapeScaleUniform)
    const halfH = float(iRect.w).mul(this.shapeScaleUniform)
    const originX = float(iRect.x).mul(this.aspectUniform).sub(halfW)
    const originY = float(iRect.y)
      .add(halfH)
      .add(this.strokeHalfUniform)
      .add(labelH.mul(float(0.35)))
    const center = vec2(
      originX.add(labelW.mul(float(0.5))),
      originY.add(labelH.mul(float(0.5)))
    )
    const half = vec2(labelW.mul(float(0.5)), labelH.mul(float(0.5)))

    material.positionNode = this.quadPositionNode(center, half) as Node

    const column = floor(uv().x.mul(float(MAX_LABEL_CHARS)))
    const cellUvX = fract(uv().x.mul(float(MAX_LABEL_CHARS)))
    const glyph = float(
      tslTexture(this.labelIndexTexture).load(vec2(column, row)).r
    )
    const atlasUv = vec2(
      glyph.add(cellUvX).div(float(LABEL_CHARS.length)),
      uv().y
    )
    const ink = float(tslTexture(this.labelAtlas, atlasUv).level(float(0)).r)

    material.colorNode = vec4(
      float(0),
      ink.mul(step(float(0), glyph)).mul(presence),
      float(0),
      float(1)
    ) as Node
    this.labelMesh = this.addDecorationMesh(material, {
      iMeta: meta,
      iRect: rect,
    })
  }

  private buildSegmentMesh(data: Float32Array, dashed: boolean): THREE.Mesh {
    const material = this.createDecorationMaterial()
    const segmentBuffer = new THREE.InstancedBufferAttribute(data, 4)
    segmentBuffer.setUsage(THREE.DynamicDrawUsage)
    this.decorationAttributes.push(segmentBuffer)

    const iSeg = attribute("iSeg", "vec4")
    const aspect = this.aspectUniform
    const from = vec2(float(iSeg.x).mul(aspect), float(iSeg.y))
    const to = vec2(float(iSeg.z).mul(aspect), float(iSeg.w))
    const pad = this.strokeHalfUniform.add(this.edgeSoftUniform.mul(3))
    const center = vec2(
      float(from.x).add(float(to.x)).mul(float(0.5)),
      float(from.y).add(float(to.y)).mul(float(0.5))
    )
    const half = vec2(
      abs(float(to.x).sub(float(from.x))).mul(float(0.5)).add(pad),
      abs(float(to.y).sub(float(from.y))).mul(float(0.5)).add(pad)
    )

    material.positionNode = this.quadPositionNode(center, half) as Node

    const point = this.quadPointNode(center, half)
    const span = to.sub(from)
    const lengthSq = max(dot(span, span), float(1e-8))
    const travel = clamp(dot(point.sub(from), span).div(lengthSq), 0, 1)
    const closest = from.add(span.mul(travel))
    let coverage = this.strokeBandNode(length(point.sub(closest)))

    if (dashed) {
      const along = travel.mul(sqrt(lengthSq))
      coverage = coverage.mul(
        step(fract(along.div(float(DASH_PERIOD))), float(DASH_DUTY))
      )
    }

    material.colorNode = vec4(
      float(0),
      coverage.mul(float(CONNECTOR_ALPHA)),
      float(0),
      float(1)
    ) as Node
    return this.addDecorationMesh(material, { iSeg: segmentBuffer })
  }

  private createDecorationResources(): void {
    this.decorationScene = new THREE.Scene()
    this.decorationRt = new THREE.WebGLRenderTarget(1, 1, LUMA_RT_OPTIONS)
    this.rebuildDecorationMeshes()
    this.resizeDecorationTarget()
  }

  private disposeDecorationMeshes(): void {
    for (const mesh of this.decorationMeshes) {
      this.decorationScene?.remove(mesh)
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
    }
    this.decorationMeshes.length = 0
    this.decorationAttributes.length = 0
    this.shapeMesh = null
    this.labelMesh = null
    this.connectorMesh = null
    this.arrowMesh = null
  }

  private rebuildDecorationMeshes(): void {
    if (!this.decorationScene) {
      return
    }
    this.disposeDecorationMeshes()

    this.buildShapeMesh()
    this.buildLabelMesh()
    if (this.decorations.connectLines) {
      this.connectorMesh = this.buildSegmentMesh(
        this.segmentData,
        this.decorations.connectorDashed
      )
      if (this.decorations.connectorArrows) {
        this.arrowMesh = this.buildSegmentMesh(this.arrowData, false)
      }
    }
  }

  private resizeDecorationTarget(): void {
    this.decorationRt?.setSize(this.deviceWidth, this.deviceHeight)
  }

  private renderDecorations(renderer: THREE.WebGPURenderer): void {
    if (!(this.decorationScene && this.decorationRt && this.analysisCamera)) {
      return
    }

    for (let index = 0; index < MAX_BLOBS; index += 1) {
      const entry = this.blobEntries[index]
      const offset = index * 4
      if (entry) {
        this.blobRectData[offset] = entry.x
        this.blobRectData[offset + 1] = entry.y
        this.blobRectData[offset + 2] = entry.z
        this.blobRectData[offset + 3] = entry.w
      }
      this.blobMetaData[offset] = this.blobMetaEntries[index]?.x ?? 0
      this.blobMetaData[offset + 1] = index
    }
    const copySegments = (
      source: THREE.Vector4[],
      target: Float32Array
    ): void => {
      for (let index = 0; index < source.length; index += 1) {
        const entry = source[index]
        const offset = index * 4
        if (!entry) continue
        target[offset] = entry.x
        target[offset + 1] = entry.y
        target[offset + 2] = entry.z
        target[offset + 3] = entry.w
      }
    }
    copySegments(this.segmentEntries, this.segmentData)
    copySegments(this.arrowEntries, this.arrowData)
    for (const attributeBuffer of this.decorationAttributes) {
      attributeBuffer.needsUpdate = true
    }

    const applyCount = (mesh: THREE.Mesh | null, count: number): void => {
      if (!mesh) return
      ;(mesh.geometry as THREE.InstancedBufferGeometry).instanceCount = count
      mesh.visible = count > 0
    }

    const blobCount = this.blobCountUniform.value as number
    applyCount(this.shapeMesh, blobCount)
    applyCount(this.labelMesh, blobCount)
    applyCount(this.connectorMesh, this.segmentCountUniform.value as number)
    applyCount(this.arrowMesh, this.arrowCountUniform.value as number)

    renderer.setRenderTarget(this.decorationRt)
    renderer.clear()
    renderer.render(this.decorationScene, this.analysisCamera)

    if (this.decorationSampleNode) {
      this.decorationSampleNode.value = this.decorationRt.texture
    }
    if (this.trailDecorationNode) {
      this.trailDecorationNode.value = this.decorationRt.texture
    }
  }

  /**
   * Full-detail motion mask: frame difference against the previous luminance,
   * thresholded with a smoothstep and accumulated into a decaying trail. This
   * is separate from the 64x36 analysis grid, which is sized for the CPU
   * connected-component pass rather than for display.
   */
  private createMotionMaskResources(): void {
    this.motionScene = new THREE.Scene()
    this.motionMaterial = new THREE.MeshBasicNodeMaterial()
    this.motionRtA = new THREE.WebGLRenderTarget(1, 1, LUMA_RT_OPTIONS)
    this.motionRtB = new THREE.WebGLRenderTarget(1, 1, LUMA_RT_OPTIONS)

    const motionUv = renderTargetUv()
    const lumaSample = tslTexture(new THREE.Texture(), motionUv)
    const previous = tslTexture(new THREE.Texture(), motionUv)
    this.motionLumaNode = lumaSample
    this.motionPrevNode = previous

    const luminance = float(lumaSample.r)
    const difference = abs(luminance.sub(float(previous.r)))
    const threshold = this.motionThresholdUniform
    const motionAmount = smoothstep(
      threshold,
      threshold.mul(float(MOTION_THRESHOLD_SPAN)),
      difference
    ).mul(this.hasHistoryUniform)

    const decayedTrail = max(
      float(previous.g)
        .mul(this.motionPersistenceUniform)
        .sub(float(MOTION_TRAIL_FLOOR)),
      float(0)
    ).mul(this.hasHistoryUniform)
    const motionTrail = max(decayedTrail, motionAmount)

    this.motionMaterial.colorNode = vec4(
      luminance,
      motionTrail,
      float(0),
      float(1)
    ) as Node

    const mesh = new THREE.Mesh(this.fullscreenGeometry, this.motionMaterial)
    mesh.frustumCulled = false
    this.motionScene.add(mesh)
  }

  private resizeMotionTargets(): void {
    const base = this.lumaTargets[0]
    const width = Math.max(1, base?.width ?? 1)
    const height = Math.max(1, base?.height ?? 1)
    this.motionRtA?.setSize(width, height)
    this.motionRtB?.setSize(width, height)
  }

  private renderMotionMask(renderer: THREE.WebGPURenderer): void {
    const lumaTarget = this.lumaTargets[0]
    if (
      !(
        this.motionScene &&
        this.motionRtA &&
        this.motionRtB &&
        this.motionLumaNode &&
        this.motionPrevNode &&
        this.analysisCamera &&
        lumaTarget
      )
    ) {
      return
    }

    const writeTarget = this.motionWriteToA ? this.motionRtA : this.motionRtB
    const readTarget = this.motionWriteToA ? this.motionRtB : this.motionRtA

    this.motionLumaNode.value = lumaTarget.texture
    this.motionPrevNode.value = readTarget.texture
    renderer.setRenderTarget(writeTarget)
    renderer.render(this.motionScene, this.analysisCamera)
    this.motionWriteToA = !this.motionWriteToA

    if (this.motionSampleNode) {
      this.motionSampleNode.value = writeTarget.texture
    }
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

    const luma = float(inputSample.r)
    const motion = abs(luma.sub(float(prevSample.g))).mul(
      this.hasHistoryUniform
    )
    const decayed = max(
      float(prevSample.b)
        .mul(this.motionPersistenceUniform)
        .sub(float(MOTION_ENERGY_FLOOR)),
      float(0)
    )
    const energy = max(decayed.mul(this.hasHistoryUniform), motion)

    this.analysisMaterial.colorNode = vec4(
      motion,
      luma,
      energy,
      float(1)
    ) as Node

    const mesh = new THREE.Mesh(this.fullscreenGeometry, this.analysisMaterial)
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
      .catch((error: unknown) => {
        this.pendingReadback = null
        if (!this.readbackFailureReported) {
          this.readbackFailureReported = true
          console.error(
            "[blob-tracking] analysis readback failed; detection is stalled",
            error
          )
        }
      })
  }

  private syncTrackerOutputs(): void {
    const blobs = this.tracker.getBlobs()
    this.updateBlobTable(blobs)
    this.updateConnectorGeometry(blobs)
    this.updateLabelGlyphs(blobs)
  }

  private updateBlobTable(blobs: Blob[]): void {
    const aspect = this.logicalWidth / this.logicalHeight
    const count = Math.min(blobs.length, MAX_BLOBS)

    for (let index = 0; index < count; index += 1) {
      const blob = blobs[index]
      const entry = this.blobEntries[index]
      const meta = this.blobMetaEntries[index]
      if (!(blob && entry && meta)) continue
      // Detections describe where the subject was when the readback was queued,
      // so lead the box by the estimated velocity to cancel that latency.
      entry.set(
        blob.cx + blob.vx * VELOCITY_LOOKAHEAD,
        blob.cy + blob.vy * VELOCITY_LOOKAHEAD,
        blob.halfWidth * aspect,
        blob.halfHeight
      )
      meta.set(blob.presence, blob.area, blob.vx, blob.vy)
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
    // One control drives both how long the ribbon lives and how strongly it
    // reads; the ceiling matches the alpha the old canvas trail peaked at.
    const { trailDecay } = this.decorations
    this.trailStrengthUniform.value = trailDecay * TRAIL_MAX_ALPHA
    this.trailDecayUniform.value =
      TRAIL_DECAY_MIN + trailDecay * TRAIL_DECAY_RANGE
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

  /**
   * Trails are a decayed feedback buffer rather than re-stamped history: the
   * blob outline is composited into a half-resolution target that fades every
   * frame, which is O(1) in trail length and costs no CPU raster or upload.
   */
  private createTrailResources(): void {
    this.trailScene = new THREE.Scene()
    this.trailMaterial = new THREE.MeshBasicNodeMaterial()
    this.trailRtA = new THREE.WebGLRenderTarget(1, 1, LUMA_RT_OPTIONS)
    this.trailRtB = new THREE.WebGLRenderTarget(1, 1, LUMA_RT_OPTIONS)

    const mesh = new THREE.Mesh(this.fullscreenGeometry, this.trailMaterial)
    mesh.frustumCulled = false
    this.trailScene.add(mesh)

    this.rebuildTrailNode()
    this.resizeTrailTargets()
  }

  private rebuildTrailNode(): void {
    if (!this.trailMaterial) {
      return
    }

    const trailUv = renderTargetUv()
    const previous = tslTexture(new THREE.Texture(), trailUv)
    this.trailPrevNode = previous

    const decayed = max(
      float(previous.r)
        .mul(this.trailDecayUniform)
        .sub(float(TRAIL_FLOOR)),
      float(0)
    )
    const trail = max(decayed, this.buildTrailSourceNode(trailUv))

    this.trailMaterial.colorNode = vec4(trail, trail, trail, float(1)) as Node
    this.trailMaterial.needsUpdate = true
  }

  /** The blob outline the decoration pass wrote to B is the ribbon source. */
  private buildTrailSourceNode(screenUv: Node): Node {
    const sample = tslTexture(this.decorationPlaceholder, screenUv)
    this.trailDecorationNode = sample
    return float(sample.b)
  }

  private resizeTrailTargets(): void {
    const width = Math.max(1, Math.floor(this.deviceWidth / TRAIL_DIVISOR))
    const height = Math.max(1, Math.floor(this.deviceHeight / TRAIL_DIVISOR))
    this.trailRtA?.setSize(width, height)
    this.trailRtB?.setSize(width, height)
    this.trailNeedsClear = true
  }

  private renderTrail(renderer: THREE.WebGPURenderer): void {
    if (
      !(
        this.trailScene &&
        this.trailRtA &&
        this.trailRtB &&
        this.trailPrevNode &&
        this.analysisCamera
      )
    ) {
      return
    }

    if (this.trailNeedsClear) {
      this.trailNeedsClear = false
      for (const target of [this.trailRtA, this.trailRtB]) {
        renderer.setRenderTarget(target)
        renderer.clear()
      }
    }

    if ((this.trailStrengthUniform.value as number) <= 0) {
      return
    }

    const writeTarget = this.trailWriteToA ? this.trailRtA : this.trailRtB
    const readTarget = this.trailWriteToA ? this.trailRtB : this.trailRtA

    this.trailPrevNode.value = readTarget.texture
    renderer.setRenderTarget(writeTarget)
    renderer.render(this.trailScene, this.analysisCamera)
    this.trailWriteToA = !this.trailWriteToA

    if (this.trailSampleNode) {
      this.trailSampleNode.value = writeTarget.texture
    }
  }

  private updateInnerEffect(params: LayerParameterValues): void {
    const nextType: InnerEffectType = isInnerEffectType(params.innerEffectType)
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
      this.childPass.updateParams(
        parseInnerEffectParams(this.innerEffectType, nextRaw)
      )
      this.childPass.flushColorNode()
    }
  }

  private resetTemporalState(): void {
    this.tracker.reset()
    this.latestAnalysis = null
    this.hasHistoryUniform.value = 0
    for (const entry of this.blobEntries) {
      entry.set(0, 0, 0, 0)
    }
    for (const meta of this.blobMetaEntries) {
      meta.set(0, 0, 0, 0)
    }
    this.blobCountUniform.value = 0
    this.segmentCountUniform.value = 0
    this.arrowCountUniform.value = 0
    this.trailNeedsClear = true
  }
}
