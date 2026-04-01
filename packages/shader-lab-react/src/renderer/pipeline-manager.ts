import { float, type TSLNode, texture as tslTexture, uv, vec2 } from "three/tsl"
import * as THREE from "three/webgpu"
import type { ShaderLabCompositeMode, ShaderLabLayerConfig } from "../types"
import { DEFAULT_MASK_CONFIG } from "../types/editor"
import { AsciiPass } from "./ascii-pass"
import { ChromaticAberrationPass } from "./chromatic-aberration-pass"
import { CrtPass } from "./crt-pass"
import { CustomShaderPass } from "./custom-shader-pass"
import { DirectionalBlurPass } from "./directional-blur-pass"
import { DisplacementMapPass } from "./displacement-map-pass"
import { DitheringPass } from "./dithering-pass"
import { EdgeDetectPass } from "./edge-detect-pass"
import { FlutedGlassPass } from "./fluted-glass-pass"
import { GradientPass } from "./gradient-pass"
import { HalftonePass } from "./halftone-pass"
import { InkPass } from "./ink-pass"
import { LivePass } from "./live-pass"
import { MediaPass } from "./media-pass"
import { ParticleGridPass } from "./particle-grid-pass"
import type { PassNode } from "./pass-node"
import { PatternPass } from "./pattern-pass"
import { PixelSortingPass } from "./pixel-sorting-pass"
import { PixelationPass } from "./pixelation-pass"
import { PlotterPass } from "./plotter-pass"
import { PosterizePass } from "./posterize-pass"
import { SlicePass } from "./slice-pass"
import { SmearPass } from "./smear-pass"
import { TextPass } from "./text-pass"
import { ThresholdPass } from "./threshold-pass"

type LayerPassNode =
  | AsciiPass
  | ChromaticAberrationPass
  | CrtPass
  | CustomShaderPass
  | DirectionalBlurPass
  | DisplacementMapPass
  | DitheringPass
  | EdgeDetectPass
  | FlutedGlassPass
  | GradientPass
  | HalftonePass
  | InkPass
  | LivePass
  | MediaPass
  | ParticleGridPass
  | PassNode
  | PatternPass
  | PixelationPass
  | PixelSortingPass
  | PlotterPass
  | PosterizePass
  | SlicePass
  | SmearPass
  | ThresholdPass
  | TextPass

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
    ].join("|")
  }

  return [
    layer.id,
    layer.kind,
    layer.type,
    layer.asset?.kind ?? "no-asset",
    layer.asset?.src ?? "no-src",
    layer.visible ? "1" : "0",
    layer.opacity.toFixed(4),
    layer.hue.toFixed(4),
    layer.saturation.toFixed(4),
    layer.blendMode,
    layer.compositeMode,
    layer.maskConfig?.source ?? "luminance",
    layer.maskConfig?.mode ?? "multiply",
    layer.maskConfig?.invert ? "1" : "0",
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
    this.blitInputNode = tslTexture(new THREE.Texture(), blitUv)
    this.blitMaterial = new THREE.MeshBasicNodeMaterial()
    this.blitMaterial.colorNode = this.blitInputNode
    const blitMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      this.blitMaterial
    )
    blitMesh.frustumCulled = false
    this.blitScene.add(blitMesh)
  }

  syncLayers(layers: ShaderLabLayerConfig[]): void {
    const incomingIds = new Set(layers.map((layer) => layer.id))

    for (const [layerId, pass] of this.passMap) {
      if (incomingIds.has(layerId)) {
        continue
      }

      pass.dispose()
      this.passMap.delete(layerId)
      this.layerSignatures.delete(layerId)
      this.dirty = true
    }

    const orderedPasses: LayerPassNode[] = []

    for (const layer of layers) {
      const signature = createLayerSignature(layer)
      let pass = this.passMap.get(layer.id)

      if (!pass) {
        pass = this.createPass(layer)
        pass.resize(this.width, this.height)
        pass.updateLogicalSize(this.logicalWidth, this.logicalHeight)
        this.passMap.set(layer.id, pass)
        this.dirty = true
      }

      if (this.layerSignatures.get(layer.id) !== signature) {
        this.layerSignatures.set(layer.id, signature)
        this.applyLayerState(pass, layer)
        this.dirty = true
      }

      orderedPasses.push(pass)
    }

    if (
      orderedPasses.length !== this.passes.length ||
      orderedPasses.some((pass, index) => this.passes[index] !== pass)
    ) {
      this.passes = orderedPasses
      this.dirty = true
    }
  }

  render(time: number, delta: number): boolean {
    const activePasses = this.passes.filter((pass) => pass.enabled)
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

    for (const pass of activePasses) {
      pass.render(this.renderer, readTarget.texture, writeTarget, time, delta)
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
    const activePasses = this.passes.filter((pass) => pass.enabled)
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

    for (const pass of activePasses) {
      pass.render(this.renderer, readTarget.texture, writeTarget, time, delta)
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
    this.width = Math.max(1, size.width)
    this.height = Math.max(1, size.height)
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
  }

  private applyLayerState(
    pass: LayerPassNode,
    layer: ShaderLabLayerConfig
  ): void {
    pass.enabled = layer.visible
    pass.updateOpacity(clampUnit(layer.opacity))
    pass.updateBlendMode(layer.blendMode)
    const compositeMode: ShaderLabCompositeMode =
      layer.compositeMode === "mask" ? "mask" : "filter"
    pass.updateCompositeMode(compositeMode)
    pass.updateMaskConfig(layer.maskConfig ?? DEFAULT_MASK_CONFIG)
    pass.updateLayerColorAdjustments(layer.hue, layer.saturation)
    pass.updateParams(layer.params)

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
        case "pixel-sorting":
          return new PixelSortingPass(layer.id)
        case "slice":
          return new SlicePass(layer.id)
        case "smear":
          return new SmearPass(layer.id)
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
