import type { RenderableLayerConfig } from "./contracts"
import {
  type CompositionNode,
  flattenComposition,
  isCompositionGroup,
} from "./composition-tree"
import { GroupPass } from "./group-pass"
import { layerMaskSignature, normalizeLayerMask } from "./layer-mask"
import { float, type TSLNode, texture as tslTexture, uv, vec2 } from "three/tsl"
import * as THREE from "three/webgpu"
import type { ShaderLabCompositeMode, ShaderLabLayerConfig } from "../types"
import { DEFAULT_MASK_CONFIG } from "../types/editor"
import { AsciiPass } from "./ascii-pass"
import { BlobTrackingPass } from "./blob-tracking-pass"
import { BloomPass } from "./bloom-pass"
import { CircuitBentPass } from "./circuit-bent-pass"
import { ChromaticAberrationPass } from "./chromatic-aberration-pass"
import { CrtPass } from "./crt-pass"
import { CustomShaderPass } from "./custom-shader-pass"
import { DirectionalBlurPass } from "./directional-blur-pass"
import { DisplacementMapPass } from "./displacement-map-pass"
import { DitheringPass } from "./dithering-pass"
import { EdgeDetectPass } from "./edge-detect-pass"
import { FlutedGlassPass } from "./fluted-glass-pass"
import { FluidPass } from "./fluid-pass"
import { GradientPass } from "./gradient-pass"
import { ShapePass } from "./shape-pass"
import { HalftonePass } from "./halftone-pass"
import { InkPass } from "./ink-pass"
import { LivePass } from "./live-pass"
import { MagnifyLensPass } from "./magnify-lens-pass"
import { MediaPass } from "./media-pass"
import { ParticleGridPass } from "./particle-grid-pass"
import { createPipelinePlaceholder, type PassNode } from "./pass-node"
import { PatternPass } from "./pattern-pass"
import { PixelSortingPass } from "./pixel-sorting-pass"
import { PixelTrailPass } from "./pixel-trail-pass"
import { PixelationPass } from "./pixelation-pass"
import { PlotterPass } from "./plotter-pass"
import { PosterizePass } from "./posterize-pass"
import { PhotographicCellsPass } from "./photographic-cells-pass"
import { DisplacedRingsPass } from "./displaced-rings-pass"
import { SlicePass } from "./slice-pass"
import { SmearPass } from "./smear-pass"
import { TextPass } from "./text-pass"
import { ThresholdPass } from "./threshold-pass"
import { GradientMapPass } from "./gradient-map-pass"
import { LumenPrintPass } from "./lumen-print-pass"
import { SignalRotPass } from "./signal-rot-pass"
import { DotGridPass } from "./dot-grid-pass"
import { ErosionPass } from "./erosion-pass"
import { ReliefPass } from "./relief-pass"
import { FlaresPass } from "./flares-pass"
import { FocusBlurPass } from "./focus-blur-pass"
import { GlassPass } from "./glass-pass"
import { ConnectedDotsPass } from "./connected-dots-pass"
import { AnnotationsPass } from "./annotations-pass"
import { VoxelPass } from "./voxel-pass"

type LayerPassNode =
  | AsciiPass
  | BlobTrackingPass
  | BloomPass
  | CircuitBentPass
  | ChromaticAberrationPass
  | CrtPass
  | CustomShaderPass
  | DirectionalBlurPass
  | DisplacementMapPass
  | DitheringPass
  | EdgeDetectPass
  | FlutedGlassPass
  | FluidPass
  | GradientPass
  | ShapePass
  | HalftonePass
  | InkPass
  | LivePass
  | MagnifyLensPass
  | MediaPass
  | ParticleGridPass
  | PassNode
  | PatternPass
  | PixelationPass
  | PixelSortingPass
  | PixelTrailPass
  | PlotterPass
  | PosterizePass
  | SlicePass
  | SmearPass
  | ThresholdPass
  | GradientMapPass
  | LumenPrintPass
  | SignalRotPass
  | DotGridPass
  | ErosionPass
  | ReliefPass
  | FlaresPass
  | FocusBlurPass
  | GlassPass
  | ConnectedDotsPass
  | AnnotationsPass
  | TextPass
  | VoxelPass

const RENDER_TARGET_OPTIONS = {
  depthBuffer: false,
  format: THREE.RGBAFormat,
  generateMipmaps: false,
  magFilter: THREE.NearestFilter,
  minFilter: THREE.NearestFilter,
  stencilBuffer: false,
  type: THREE.HalfFloatType,
} as const

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function parameterValuesSignature(
  params: ShaderLabLayerConfig["params"]
): string {
  return JSON.stringify(
    Object.entries(params)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, value])
  )
}

function createLayerSignature(layer: ShaderLabLayerConfig): string {
  if (layer.type === "custom-shader") {
    return [
      layer.id,
      layer.kind,
      layer.type,
      layer.visible ? "1" : "0",
      layer.opacity.toFixed(4),
      layer.hue.toFixed(4),
      layer.saturation.toFixed(4),
      layer.blendMode,
      layer.compositeMode,
      layer.maskConfig?.source ?? "luminance",
      layer.maskConfig?.mode ?? "multiply",
      layer.maskConfig?.invert ? "1" : "0",
    layerMaskSignature(normalizeLayerMask(layer.mask)),
      typeof layer.params.sourceRevision === "number"
        ? String(layer.params.sourceRevision)
        : "0",
      typeof layer.params.sourceMode === "string"
        ? layer.params.sourceMode
        : "paste",
      typeof layer.params.entryExport === "string"
        ? layer.params.entryExport
        : "sketch",
      typeof layer.params.sourceFileName === "string"
        ? layer.params.sourceFileName
        : "",
      layer.params.effectMode === true ? "effect" : "source",
    ].join("|")
  }

  return [
    layer.id,
    layer.kind,
    layer.type,
    layer.asset?.kind ?? "no-asset",
    layer.asset?.src ?? "no-src",
    layer.depthAsset?.src ?? "no-depth",
    layer.visible ? "1" : "0",
    layer.opacity.toFixed(4),
    layer.hue.toFixed(4),
    layer.saturation.toFixed(4),
    layer.blendMode,
    layer.compositeMode,
    layer.maskConfig?.source ?? "luminance",
    layer.maskConfig?.mode ?? "multiply",
    layer.maskConfig?.invert ? "1" : "0",
    layerMaskSignature(normalizeLayerMask(layer.mask)),
    parameterValuesSignature(layer.params),
  ].join("|")
}

export class PipelineManager {
  private readonly renderer: THREE.WebGPURenderer
  private readonly baseScene: THREE.Scene
  private readonly baseCamera: THREE.OrthographicCamera
  private readonly blitScene: THREE.Scene
  private readonly blitCamera: THREE.OrthographicCamera
  private readonly blitInputNode: TSLNode
  private readonly blitMaterial: THREE.MeshBasicNodeMaterial
  private readonly onRuntimeError:
    | ((message: string | null) => void)
    | undefined

  private passMap = new Map<string, LayerPassNode>()
  private passes: LayerPassNode[] = []
  private layerSignatures = new Map<string, string>()
  private compilingPasses = new Set<string>()
  private compiledVersions = new Map<string, number>()
  private dirty = true
  private width: number
  private height: number
  private logicalWidth: number
  private logicalHeight: number
  private rtA: THREE.WebGLRenderTarget
  private rtB: THREE.WebGLRenderTarget
  private lastReadTarget: THREE.WebGLRenderTarget | null = null

  constructor(
    renderer: THREE.WebGPURenderer,
    size: { height: number; width: number },
    onRuntimeError?: (message: string | null) => void
  ) {
    this.renderer = renderer
    this.onRuntimeError = onRuntimeError
    this.width = Math.max(1, size.width)
    this.height = Math.max(1, size.height)
    this.logicalWidth = this.width
    this.logicalHeight = this.height

    this.baseScene = new THREE.Scene()
    this.baseCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const baseMaterial = new THREE.MeshBasicMaterial({ color: "#080808" })
    const baseMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), baseMaterial)
    baseMesh.frustumCulled = false
    this.baseScene.add(baseMesh)

    this.rtA = new THREE.WebGLRenderTarget(
      this.width,
      this.height,
      RENDER_TARGET_OPTIONS
    )
    this.rtB = new THREE.WebGLRenderTarget(
      this.width,
      this.height,
      RENDER_TARGET_OPTIONS
    )

    this.blitScene = new THREE.Scene()
    this.blitCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const blitUv = vec2(uv().x, float(1).sub(uv().y))
    this.blitInputNode = tslTexture(createPipelinePlaceholder(), blitUv)
    this.blitMaterial = new THREE.MeshBasicNodeMaterial()
    this.blitMaterial.blending = THREE.NoBlending
    this.blitMaterial.colorNode = this.blitInputNode
    const blitMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      this.blitMaterial
    )
    blitMesh.frustumCulled = false
    this.blitScene.add(blitMesh)
  }

  syncLayers(layers: CompositionNode<RenderableLayerConfig>[]): void {
    const getId = (node: CompositionNode<RenderableLayerConfig>) =>
      isCompositionGroup(node) ? node.id : node.id
    const flattened = flattenComposition(layers, (node) => node.id)
    const incomingIds = new Set(flattened.map(getId))

    for (const [layerId, pass] of this.passMap) {
      if (incomingIds.has(layerId)) {
        continue
      }

      pass.dispose()
      this.passMap.delete(layerId)
      this.layerSignatures.delete(layerId)
      this.compilingPasses.delete(layerId)
      this.compiledVersions.delete(layerId)
      this.dirty = true
    }

    for (const node of flattened) {
      const layerId = getId(node)
      const group = isCompositionGroup(node)
      const signature = group
        ? JSON.stringify([
            node.visible,
            node.opacity,
            node.blendMode,
            layerMaskSignature(normalizeLayerMask(node.mask)),
          ])
        : createLayerSignature(node)
      let pass = this.passMap.get(layerId)

      if (pass && pass instanceof GroupPass !== group) {
        pass.dispose()
        this.passMap.delete(layerId)
        this.layerSignatures.delete(layerId)
        this.compilingPasses.delete(layerId)
        this.compiledVersions.delete(layerId)
        pass = undefined
      }

      const created = !pass
      if (!pass) {
        pass = group
          ? new GroupPass(
              layerId,
              (child) => this.isActive(child),
              (...args) => this.renderPass(...args)
            )
          : this.createPass(node)
        pass.resize(this.width, this.height)
        pass.updateLogicalSize(this.logicalWidth, this.logicalHeight)
        pass.updateMaskLogicalSize(this.logicalWidth, this.logicalHeight)
        this.passMap.set(layerId, pass)
        this.dirty = true
      }

      if (this.layerSignatures.get(layerId) !== signature) {
        const versionBefore = pass.getMaterialVersion()
        this.layerSignatures.set(layerId, signature)
        if (group) {
          pass.enabled = node.visible
          pass.updateOpacity(clampUnit(node.opacity))
          pass.updateBlendMode(node.blendMode)
          pass.updateLayerMask(normalizeLayerMask(node.mask))
          pass.flushColorNode()
        } else {
          this.applyLayerState(pass, node)
        }
        this.dirty = true

        if ((created && group) || pass.getMaterialVersion() !== versionBefore) {
          this.scheduleCompile(pass)
        }
      }
    }

    // All passes exist before wiring children, so reparenting preserves media state.
    for (const node of flattened) {
      if (!isCompositionGroup(node)) continue
      const pass = this.passMap.get(node.id) as GroupPass
      if (
        pass.setChildren(
          node.children.map((child) => this.passMap.get(getId(child))!)
        )
      ) {
        this.dirty = true
      }
    }
    const orderedPasses = layers.map((node) => this.passMap.get(getId(node))!)

    if (
      orderedPasses.length !== this.passes.length ||
      orderedPasses.some((pass, index) => this.passes[index] !== pass)
    ) {
      this.passes = orderedPasses
      this.dirty = true
    }
  }

  render(time: number, delta: number): boolean {
    const activePasses = this.passes.filter((pass) => this.isActive(pass))
    const needsContinuousRender = activePasses.some((pass) =>
      pass.needsContinuousRender()
    )

    if (!(this.dirty || needsContinuousRender)) {
      return false
    }

    if (activePasses.length === 0) {
      this.renderer.setRenderTarget(null)
      this.renderer.render(this.baseScene, this.baseCamera)
      this.dirty = false
      return true
    }

    this.renderer.setRenderTarget(this.rtA)
    this.renderer.render(this.baseScene, this.baseCamera)

    let readTarget = this.rtA
    let writeTarget = this.rtB
    let sceneDepth: THREE.Texture | null = null

    for (const pass of activePasses) {
      pass.setSceneDepth(sceneDepth)
      this.renderPass(pass, readTarget.texture, writeTarget, time, delta)
      sceneDepth = pass.getOutputSceneDepth()
      const previousRead = readTarget
      readTarget = writeTarget
      writeTarget = previousRead
    }

    this.blitInputNode.value = readTarget.texture
    this.renderer.setRenderTarget(null)
    this.renderer.render(this.blitScene, this.blitCamera)
    this.dirty = false
    return true
  }

  renderToTexture(
    time: number,
    delta: number,
    inputTexture?: THREE.Texture
  ): THREE.Texture | null {
    const activePasses = this.passes.filter((pass) => this.isActive(pass))
    const needsContinuousRender = activePasses.some((pass) =>
      pass.needsContinuousRender()
    )

    if (inputTexture === undefined && !(this.dirty || needsContinuousRender)) {
      return this.lastReadTarget?.texture ?? null
    }

    if (inputTexture) {
      this.blitInputNode.value = inputTexture
      this.renderer.setRenderTarget(this.rtA)
      this.renderer.render(this.blitScene, this.blitCamera)
    } else {
      this.renderer.setRenderTarget(this.rtA)
      this.renderer.render(this.baseScene, this.baseCamera)
    }

    if (activePasses.length === 0) {
      this.dirty = false
      this.lastReadTarget = this.rtA
      this.renderer.setRenderTarget(null)
      return this.rtA.texture
    }

    let readTarget = this.rtA
    let writeTarget = this.rtB
    let sceneDepth: THREE.Texture | null = null

    for (const pass of activePasses) {
      pass.setSceneDepth(sceneDepth)
      this.renderPass(pass, readTarget.texture, writeTarget, time, delta)
      sceneDepth = pass.getOutputSceneDepth()
      const previousRead = readTarget
      readTarget = writeTarget
      writeTarget = previousRead
    }

    this.dirty = false
    this.lastReadTarget = readTarget
    this.renderer.setRenderTarget(null)
    return readTarget.texture
  }

  resize(size: { height: number; width: number }): void {
    const nextWidth = Math.max(1, size.width)
    const nextHeight = Math.max(1, size.height)

    if (nextWidth === this.width && nextHeight === this.height) {
      return
    }

    this.width = nextWidth
    this.height = nextHeight
    this.rtA.setSize(this.width, this.height)
    this.rtB.setSize(this.width, this.height)

    for (const pass of this.passMap.values()) {
      pass.resize(this.width, this.height)
    }

    this.dirty = true
  }

  updateLogicalSize(size: { height: number; width: number }): void {
    const nextWidth = Math.max(1, size.width)
    const nextHeight = Math.max(1, size.height)

    if (nextWidth === this.logicalWidth && nextHeight === this.logicalHeight) {
      return
    }

    this.logicalWidth = nextWidth
    this.logicalHeight = nextHeight

    for (const pass of this.passMap.values()) {
      pass.updateLogicalSize(this.logicalWidth, this.logicalHeight)
      pass.updateMaskLogicalSize(this.logicalWidth, this.logicalHeight)
    }

    this.dirty = true
  }

  dispose(): void {
    this.rtA.dispose()
    this.rtB.dispose()
    this.blitMaterial.dispose()

    for (const pass of this.passMap.values()) {
      pass.dispose()
    }

    this.passMap.clear()
    this.passes = []
    this.layerSignatures.clear()
    this.compilingPasses.clear()
    this.compiledVersions.clear()
  }

  private isActive(pass: PassNode): boolean {
    return (
      pass.enabled &&
      (!this.compilingPasses.has(pass.layerId) ||
        this.compiledVersions.has(pass.layerId))
    )
  }

  private renderPass(
    pass: PassNode,
    input: THREE.Texture,
    output: THREE.WebGLRenderTarget,
    time: number,
    delta: number,
    _timelineTime = time
  ): boolean {
    pass.render(this.renderer, input, output, time, delta)
    return true
  }

  private scheduleCompile(pass: LayerPassNode): void {
    const version = pass.getMaterialVersion()
    if (this.compiledVersions.get(pass.layerId) === version) {
      return
    }

    this.compilingPasses.add(pass.layerId)
    const { scene, camera } = pass.getCompileTarget()
    const renderer = this.renderer as unknown as {
      compileAsync(scene: THREE.Scene, camera: THREE.Camera): Promise<void>
    }
    renderer
      .compileAsync(scene, camera)
      .then(() => {
        if (this.passMap.get(pass.layerId) !== pass) return
        this.compilingPasses.delete(pass.layerId)
        this.compiledVersions.set(pass.layerId, pass.getMaterialVersion())
        this.dirty = true
      })
      .catch(() => {
        if (this.passMap.get(pass.layerId) !== pass) return
        this.compilingPasses.delete(pass.layerId)
      })
  }

  private applyLayerState(
    pass: LayerPassNode,
    layer: ShaderLabLayerConfig
  ): void {
    pass.enabled = layer.visible
    if (
      layer.type === "displaced-rings" ||
      layer.type === "photographic-cells" ||
      layer.type === "erosion" ||
      layer.type === "flares" ||
      layer.type === "focus-blur" ||
      layer.type === "glass" ||
      layer.type === "connected-dots" ||
      layer.type === "plotter"
    ) {
      pass.updateCompositionRole("transform")
    } else {
      pass.updateCompositionRole(
        layer.kind === "effect" ||
          (layer.type === "custom-shader" && layer.params.effectMode === true)
          ? "effect"
          : "source"
      )
    }
    pass.updateOpacity(clampUnit(layer.opacity))
    pass.updateBlendMode(layer.blendMode)
    const compositeMode: ShaderLabCompositeMode =
      layer.compositeMode === "mask" ? "mask" : "filter"
    pass.updateCompositeMode(compositeMode)
    pass.updateMaskConfig(layer.maskConfig ?? DEFAULT_MASK_CONFIG)
    pass.updateLayerMask(normalizeLayerMask(layer.mask))
    pass.updateLayerColorAdjustments(layer.hue, layer.saturation)
    pass.updateParams(layer.params)
    pass.flushColorNode()

    if (pass instanceof MediaPass) {
      const asset = layer.asset
      if (asset?.kind === "image" || asset?.kind === "video") {
        void pass
          .setMedia(asset.src, asset.kind)
          .then(() => {
            this.dirty = true
          })
          .catch((error) => {
            this.onRuntimeError?.(
              error instanceof Error
                ? error.message
                : "Failed to load media asset."
            )
            this.dirty = true
          })
      } else {
        pass.clearMedia()
      }

      if (layer.depthAsset?.kind === "image") {
        void pass
          .setDepthMedia(layer.depthAsset.src)
          .then(() => {
            this.dirty = true
          })
          .catch((error) => {
            this.onRuntimeError?.(
              error instanceof Error
                ? error.message
                : "Failed to load depth map."
            )
            this.dirty = true
          })
      } else {
        pass.clearDepthMedia()
      }
    }

    if (pass instanceof LivePass) {
      const facingMode =
        typeof layer.params.facingMode === "string"
          ? layer.params.facingMode
          : "user"

      if (
        facingMode !== pass.getFacingMode() ||
        !pass.needsContinuousRender()
      ) {
        void pass
          .startCamera(facingMode)
          .then(() => {
            this.dirty = true
          })
          .catch((error) => {
            this.onRuntimeError?.(
              error instanceof Error
                ? error.message
                : "Failed to start live camera input."
            )
            this.dirty = true
          })
      }
    }
  }

  private createPass(layer: ShaderLabLayerConfig): LayerPassNode {
    if (layer.kind === "effect") {
      switch (layer.type) {
        case "ascii":
          return new AsciiPass(layer.id)
        case "blob-tracking":
          return new BlobTrackingPass(layer.id)
        case "bloom":
          return new BloomPass(layer.id)
        case "circuit-bent":
          return new CircuitBentPass(layer.id)
        case "directional-blur":
          return new DirectionalBlurPass(layer.id)
        case "crt":
          return new CrtPass(layer.id)
        case "chromatic-aberration":
          return new ChromaticAberrationPass(layer.id)
        case "displacement-map":
          return new DisplacementMapPass(layer.id)
        case "dithering":
          return new DitheringPass(layer.id)
        case "edge-detect":
          return new EdgeDetectPass(layer.id)
        case "fluted-glass":
          return new FlutedGlassPass(layer.id)
        case "halftone":
          return new HalftonePass(layer.id)
        case "ink":
          return new InkPass(layer.id)
        case "particle-grid":
          return new ParticleGridPass(layer.id)
        case "pattern":
          return new PatternPass(layer.id)
        case "pixelation":
          return new PixelationPass(layer.id)
        case "plotter":
          return new PlotterPass(layer.id)
        case "posterize":
          return new PosterizePass(layer.id)
        case "threshold":
          return new ThresholdPass(layer.id)
        case "gradient-map":
          return new GradientMapPass(layer.id)
        case "lumen-print":
          return new LumenPrintPass(layer.id)
        case "signal-rot":
          return new SignalRotPass(layer.id)
        case "dot-grid":
          return new DotGridPass(layer.id)
        case "erosion":
          return new ErosionPass(layer.id)
        case "relief":
          return new ReliefPass(layer.id)
        case "flares":
          return new FlaresPass(layer.id)
        case "focus-blur":
          return new FocusBlurPass(layer.id)
        case "glass":
          return new GlassPass(layer.id)
        case "connected-dots":
          return new ConnectedDotsPass(layer.id)
        case "annotations":
          return new AnnotationsPass(layer.id)
        case "pixel-sorting":
          return new PixelSortingPass(layer.id)
        case "photographic-cells":
          return new PhotographicCellsPass(layer.id)
        case "displaced-rings":
          return new DisplacedRingsPass(layer.id)
        case "slice":
          return new SlicePass(layer.id)
        case "smear":
          return new SmearPass(layer.id)
        case "voxel":
          return new VoxelPass(layer.id)
      }
    }

    if (
      layer.kind === "source" &&
      (layer.type === "image" || layer.type === "video")
    ) {
      return new MediaPass(layer.id)
    }

    if (layer.kind === "source" && layer.type === "gradient") {
      return new GradientPass(layer.id)
    }

    if (layer.kind === "source" && layer.type === "shape") {
      return new ShapePass(layer.id)
    }

    if (layer.kind === "source" && layer.type === "fluid") {
      return new FluidPass(layer.id, this.renderer)
    }

    if (layer.kind === "source" && layer.type === "pixel-trail") {
      return new PixelTrailPass(layer.id, this.renderer)
    }

    if (layer.kind === "source" && layer.type === "magnify-lens") {
      return new MagnifyLensPass(layer.id, this.renderer)
    }

    if (layer.kind === "source" && layer.type === "text") {
      return new TextPass(layer.id)
    }

    if (layer.kind === "source" && layer.type === "custom-shader") {
      return new CustomShaderPass(layer.id, this.onRuntimeError)
    }

    if (layer.kind === "source" && layer.type === "live") {
      return new LivePass(layer.id)
    }

    throw new Error(
      `Layer "${layer.name}" of type "${layer.type}" is not supported by the package runtime yet.`
    )
  }
}
