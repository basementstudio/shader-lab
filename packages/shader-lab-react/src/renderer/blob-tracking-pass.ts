import {
  abs,
  dot,
  float,
  length,
  max,
  mix,
  select,
  smoothstep,
  type TSLNode,
  texture as tslTexture,
  uniform,
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

// Low-res analysis grid the detector reads back to the CPU each frame.
const ANALYSIS_WIDTH = 64
const ANALYSIS_HEIGHT = 36
// Must match the tracker's blobAmount ceiling and the blob-table texture width.
const MAX_BLOBS = 32
// The decoration overlay redraw + full CanvasTexture re-upload dominates busy
// scenes (every frame changes during heavy motion), so its resolution is
// capped and redraws are rate-limited. Shapes are unaffected — the blob table
// updates every step.
const OVERLAY_MAX_WIDTH = 960
const OVERLAY_REDRAW_INTERVAL_MS = 33

const ANALYSIS_RT_OPTIONS = {
  depthBuffer: false,
  format: THREE.RGBAFormat,
  generateMipmaps: false,
  magFilter: THREE.NearestFilter,
  minFilter: THREE.NearestFilter,
  stencilBuffer: false,
  type: THREE.UnsignedByteType,
} as const

// Same options the pipeline uses for its ping-pong targets, so the inner
// effect renders at the pipeline's precision.
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

type DecorationConfig = {
  connectLines: boolean
  curvedLines: boolean
  showLabels: boolean
  showOutline: boolean
  strokeColor: string
  strokeWidth: number
  trailDecay: number
}

const DEFAULT_DECORATIONS: DecorationConfig = {
  connectLines: true,
  curvedLines: false,
  showLabels: true,
  showOutline: true,
  strokeColor: "#7cff9b",
  strokeWidth: 2,
  trailDecay: 0.35,
}

function clampNumber(value: number, min: number, maxValue: number): number {
  if (value < min) return min
  if (value > maxValue) return maxValue
  return value
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

/**
 * Mirror of the editor's `src/renderer/blob-tracking-pass.ts`. Differences:
 * the package pipeline has no separate timeline clock or export-frame hook,
 * so the tracker steps directly on the render `time` (the runtime clock),
 * and decoration rendering degrades to nothing when `document` is absent.
 */
export class BlobTrackingPass extends PassNode {
  // --- analysis (GPU) ---
  private analysisScene: THREE.Scene | null = null
  private analysisCamera: THREE.OrthographicCamera | null = null
  private analysisMaterial: THREE.MeshBasicNodeMaterial | null = null
  private analysisRtA: THREE.WebGLRenderTarget | null = null
  private analysisRtB: THREE.WebGLRenderTarget | null = null
  private analysisWriteToA = true
  private analysisInputNode: Node | null = null
  private analysisPrevNode: Node | null = null

  // --- readback (GPU → CPU) ---
  private pendingReadback: Promise<void> | null = null
  private latestAnalysis: Uint8Array | null = null

  // --- tracker (CPU) ---
  private readonly tracker = new BlobTracker()
  private trackerConfig: TrackerConfig = { ...DEFAULT_TRACKER_CONFIG }
  private lastTime: number | null = null

  // --- blob table (CPU → GPU) ---
  private readonly blobTableBuffer = new Float32Array(MAX_BLOBS * 4)
  private blobTableTexture: THREE.DataTexture | null = null

  // --- shape uniforms ---
  private readonly shapeTypeUniform: Node
  private readonly shapeScaleUniform: Node
  private readonly invertUniform: Node
  private readonly aspectUniform: Node
  private readonly edgeSoftUniform: Node
  private readonly innerActiveUniform: Node
  private maskOutput = false

  // --- decorations overlay (CPU canvas → GPU) ---
  private decorations: DecorationConfig = { ...DEFAULT_DECORATIONS }
  private overlayCanvas: HTMLCanvasElement | null = null
  private overlayContext: CanvasRenderingContext2D | null = null
  private overlayTexture: THREE.CanvasTexture | null = null
  private readonly overlayPlaceholder: THREE.Texture
  private overlaySignature = ""
  private lastOverlayRedrawAt = 0

  // --- inner effect ---
  private innerEffectType: ShaderLabBlobInnerEffect = INNER_EFFECT_NONE
  private innerEffectParamsRaw = ""
  private childPass: PassNode | null = null
  private innerRt: THREE.WebGLRenderTarget | null = null
  private readonly innerPlaceholder: THREE.Texture
  private innerNode: Node | null = null

  private deviceWidth = 1
  private deviceHeight = 1
  private logicalWidth = 1
  private logicalHeight = 1

  constructor(layerId: string) {
    super(layerId)

    this.shapeTypeUniform = uniform(0)
    this.shapeScaleUniform = uniform(1)
    this.invertUniform = uniform(0)
    this.aspectUniform = uniform(16 / 9)
    this.edgeSoftUniform = uniform(0.0015)
    this.innerActiveUniform = uniform(0)
    this.innerPlaceholder = createPipelinePlaceholder()
    this.overlayPlaceholder = new THREE.Texture()

    this.blobTableTexture = createBlobTableTexture(this.blobTableBuffer)
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
    // Rewind (looping runtime clock) resets all temporal state.
    if (this.lastTime !== null && time < this.lastTime) {
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

    if (params.shapeType === "circle") {
      this.shapeTypeUniform.value = 1
    } else if (params.shapeType === "diamond") {
      this.shapeTypeUniform.value = 2
    } else {
      this.shapeTypeUniform.value = 0
    }
    this.shapeScaleUniform.value =
      typeof params.shapeScale === "number"
        ? clampNumber(params.shapeScale, 0.25, 3)
        : 1
    this.invertUniform.value = params.invert === true ? 1 : 0

    const nextMaskOutput = params.outputMode === "mask"
    if (nextMaskOutput !== this.maskOutput) {
      this.maskOutput = nextMaskOutput
      this.rebuildEffectNode()
    }

    const nextDecorations: DecorationConfig = {
      connectLines: params.connectLines !== false,
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
    if (JSON.stringify(nextDecorations) !== JSON.stringify(this.decorations)) {
      this.decorations = nextDecorations
      this.overlaySignature = ""
      this.redrawOverlay(this.tracker.getBlobs())
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
    this.analysisScene?.clear()
    this.blobTableTexture?.dispose()
    this.overlayTexture?.dispose()
    this.overlayPlaceholder.dispose()
    this.innerPlaceholder.dispose()
    this.innerRt?.dispose()
    this.childPass?.dispose()
    this.childPass = null
    super.dispose()
  }

  protected override buildEffectNode(): Node {
    // Base constructor calls this before subclass fields exist.
    if (!(this.shapeTypeUniform && this.blobTableTexture)) {
      return this.inputNode
    }

    // NOTE(orientation): everything below shares one UV convention — the same
    // flipped UV the pipeline uses to sample render targets. If live testing
    // shows the whole effect vertically mirrored versus the content, flip
    // `screenUv.y` here (single line) — do not flip per-subsystem.
    const screenUv = vec2(uv().x, float(1).sub(uv().y))

    let shapeMask: Node = float(0)

    for (let index = 0; index < MAX_BLOBS; index += 1) {
      const texel = tslTexture(
        this.blobTableTexture,
        vec2(float((index + 0.5) / MAX_BLOBS), float(0.5))
      )
      const active = float(texel.a)
      const halfSize = float(texel.b).mul(this.shapeScaleUniform)
      const px = abs(float(screenUv.x).sub(float(texel.r))).mul(
        this.aspectUniform
      )
      const py = abs(float(screenUv.y).sub(float(texel.g)))

      const sdSquare = max(px, py).sub(halfSize)
      const sdCircle = length(vec2(px, py)).sub(halfSize)
      const sdDiamond = px.add(py).sub(halfSize)
      const sdf = select(
        this.shapeTypeUniform.lessThan(float(0.5)),
        sdSquare,
        select(this.shapeTypeUniform.lessThan(float(1.5)), sdCircle, sdDiamond)
      )

      const contribution = float(1)
        .sub(
          smoothstep(
            float(0).sub(this.edgeSoftUniform),
            this.edgeSoftUniform,
            sdf
          )
        )
        .mul(active)
      shapeMask = max(shapeMask, contribution)
    }

    const mask = mix(shapeMask, float(1).sub(shapeMask), this.invertUniform)

    if (this.maskOutput) {
      // Fills only, white on black — feeds the existing compositeMode:"mask"
      // machinery. Decorations and the inner effect are deliberately absent.
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

    const overlaySample = tslTexture(
      this.overlayTexture ?? this.overlayPlaceholder,
      screenUv
    )
    const composed = mix(
      interior,
      vec3(overlaySample.r, overlaySample.g, overlaySample.b),
      float(overlaySample.a)
    )

    return vec4(composed, float(1))
  }

  private createAnalysisResources(): void {
    this.analysisScene = new THREE.Scene()
    this.analysisCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this.analysisMaterial = new THREE.MeshBasicNodeMaterial()

    const analysisUv = vec2(uv().x, float(1).sub(uv().y))
    const inputSample = tslTexture(createPipelinePlaceholder(), analysisUv)
    const prevSample = tslTexture(new THREE.Texture(), analysisUv)
    this.analysisInputNode = inputSample
    this.analysisPrevNode = prevSample

    const lumaWeights = vec3(0.2126, 0.7152, 0.0722)
    const luma = dot(
      vec3(inputSample.r, inputSample.g, inputSample.b),
      lumaWeights
    )
    // Previous frame's luminance lives in the G channel of the analysis RT.
    const motion = abs(float(luma).sub(float(prevSample.g)))
    this.analysisMaterial.colorNode = vec4(
      motion,
      luma,
      float(0),
      float(1)
    ) as Node

    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      this.analysisMaterial
    )
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
        // Degrade to "no new data" — never throw out of the render loop.
        this.pendingReadback = null
      })
  }

  private syncTrackerOutputs(forceRedraw = false): void {
    const blobs = this.tracker.getBlobs()
    this.updateBlobTable(blobs)

    // Quantized to overlay pixels: movement below one overlay pixel is not a
    // visible overlay change and must not pay a redraw + texture upload.
    const overlayWidth = this.overlayCanvas?.width ?? 1
    const overlayHeight = this.overlayCanvas?.height ?? 1
    const signature = blobs
      .map(
        (blob) =>
          `${blob.id}:${blob.active ? 1 : 0}:${Math.round(blob.cx * overlayWidth)}:${Math.round(blob.cy * overlayHeight)}:${Math.round(blob.halfWidth * overlayWidth)}:${Math.round(blob.halfHeight * overlayHeight)}`
      )
      .join("|")
    if (signature === this.overlaySignature) {
      return
    }

    // Rate-limit live redraws: during heavy motion every frame changes, and
    // the redraw + full re-upload is the expensive part. The signature stays
    // stale on skipped frames, so the next eligible frame catches up.
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
    this.redrawOverlay(blobs)
  }

  private updateBlobTable(blobs: Blob[]): void {
    this.blobTableBuffer.fill(0)
    const aspect = this.logicalWidth / this.logicalHeight

    for (let index = 0; index < Math.min(blobs.length, MAX_BLOBS); index += 1) {
      const blob = blobs[index]
      if (!blob) continue
      const offset = index * 4
      // Store the half-extent in aspect-corrected units so a single scalar
      // drives all three SDFs.
      const halfSize = Math.max(blob.halfWidth * aspect, blob.halfHeight)
      this.blobTableBuffer[offset] = blob.cx
      this.blobTableBuffer[offset + 1] = blob.cy
      this.blobTableBuffer[offset + 2] = halfSize
      this.blobTableBuffer[offset + 3] = blob.active ? 1 : 0
    }

    if (this.blobTableTexture) {
      this.blobTableTexture.needsUpdate = true
    }
  }

  private getOverlaySize(): { height: number; width: number } {
    // The overlay renders thin strokes and monospace labels — half-ish
    // resolution upscaled by linear filtering is visually equivalent and
    // cuts the per-redraw texture upload by 4x+ at typical sizes.
    const width = Math.max(1, Math.min(this.logicalWidth, OVERLAY_MAX_WIDTH))
    const height = Math.max(
      1,
      Math.round((width * this.logicalHeight) / Math.max(1, this.logicalWidth))
    )
    return { height, width }
  }

  private createOverlayResources(): void {
    if (typeof document === "undefined") {
      // Headless environments render without decorations.
      return
    }

    const { height, width } = this.getOverlaySize()
    this.overlayCanvas = document.createElement("canvas")
    this.overlayCanvas.width = width
    this.overlayCanvas.height = height
    this.overlayContext = this.overlayCanvas.getContext("2d")

    this.overlayTexture = new THREE.CanvasTexture(this.overlayCanvas)
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
    this.overlaySignature = ""
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

    const {
      connectLines,
      curvedLines,
      showLabels,
      showOutline,
      strokeColor,
      strokeWidth,
      trailDecay,
    } = this.decorations
    const scale = this.shapeScaleUniform.value as number
    // Stroke width is authored in logical pixels; the canvas may render at a
    // capped resolution, so convert (upscaling restores the visual width).
    const strokeScale = width / Math.max(1, this.logicalWidth)
    const scaledStrokeWidth = Math.max(0.75, strokeWidth * strokeScale)

    context.strokeStyle = strokeColor
    context.fillStyle = strokeColor
    context.lineWidth = scaledStrokeWidth
    context.font = `${Math.max(9, Math.round(height / 54))}px ui-monospace, monospace`

    const activeBlobs = blobs.filter((blob) => blob.active)

    // Trails first so live outlines draw on top of them. Every other history
    // entry is enough visually and halves the stroke count in busy scenes.
    if (trailDecay > 0) {
      for (const blob of activeBlobs) {
        const history = blob.history
        for (let index = 0; index < history.length - 1; index += 2) {
          const point = history[index]
          if (!point) continue
          const age = (index + 1) / history.length
          context.globalAlpha = age * trailDecay * 0.6
          const radius =
            Math.max(blob.halfWidth * width, blob.halfHeight * height) *
            scale *
            (0.4 + age * 0.6)
          this.strokeShape(context, point.x * width, point.y * height, radius)
        }
      }
      context.globalAlpha = 1
    }

    if (connectLines && activeBlobs.length > 1) {
      // Greedy nearest-neighbor chain starting from the first blob.
      const remaining = activeBlobs.slice(1)
      const chain = [activeBlobs[0] as Blob]
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

      context.globalAlpha = 0.8
      context.beginPath()
      for (let index = 0; index < chain.length - 1; index += 1) {
        const from = chain[index]
        const to = chain[index + 1]
        if (!(from && to)) continue
        const fromX = from.cx * width
        const fromY = from.cy * height
        const toX = to.cx * width
        const toY = to.cy * height
        context.moveTo(fromX, fromY)
        if (curvedLines) {
          const midX = (fromX + toX) / 2
          const midY = (fromY + toY) / 2
          const deltaX = toX - fromX
          const deltaY = toY - fromY
          const segmentLength = Math.hypot(deltaX, deltaY) || 1
          // Control point = midpoint + perpendicular offset (15% of length).
          const controlX =
            midX - (deltaY / segmentLength) * segmentLength * 0.15
          const controlY =
            midY + (deltaX / segmentLength) * segmentLength * 0.15
          context.quadraticCurveTo(controlX, controlY, toX, toY)
        } else {
          context.lineTo(toX, toY)
        }
      }
      context.stroke()
      context.globalAlpha = 1
    }

    for (const blob of activeBlobs) {
      const centerX = blob.cx * width
      const centerY = blob.cy * height
      const halfW = blob.halfWidth * width * scale
      const halfH = blob.halfHeight * height * scale

      if (showOutline) {
        this.strokeShape(context, centerX, centerY, Math.max(halfW, halfH))
      }

      if (showLabels) {
        const label = `#${String(blob.id).padStart(2, "0")} ${blob.cx.toFixed(2)},${blob.cy.toFixed(2)}`
        context.fillText(
          label,
          centerX - Math.max(halfW, halfH),
          centerY - Math.max(halfW, halfH) - scaledStrokeWidth - 3
        )
      }
    }

    this.overlayTexture.needsUpdate = true
  }

  private strokeShape(
    context: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    radius: number
  ): void {
    const shapeType = this.shapeTypeUniform.value as number
    context.beginPath()
    if (shapeType === 1) {
      context.arc(centerX, centerY, radius, 0, Math.PI * 2)
    } else if (shapeType === 2) {
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
    const nextType: ShaderLabBlobInnerEffect = isInnerEffectType(
      params.innerEffectType
    )
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
      // A new child means new texture bindings — rebuild and flush so the
      // pipeline picks up the fresh material immediately.
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
    this.blobTableBuffer.fill(0)
    if (this.blobTableTexture) {
      this.blobTableTexture.needsUpdate = true
    }
    this.overlaySignature = ""
    this.redrawOverlay([])
  }
}

function createBlobTableTexture(buffer: Float32Array): THREE.DataTexture {
  const texture = new THREE.DataTexture(
    buffer,
    MAX_BLOBS,
    1,
    THREE.RGBAFormat,
    THREE.FloatType
  )
  texture.minFilter = THREE.NearestFilter
  texture.magFilter = THREE.NearestFilter
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.flipY = false
  texture.generateMipmaps = false
  texture.colorSpace = THREE.NoColorSpace
  texture.needsUpdate = true
  return texture
}
