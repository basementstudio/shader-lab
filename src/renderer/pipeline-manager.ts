import { float, type TSLNode, texture as tslTexture, uv, vec2 } from "three/tsl"
import * as THREE from "three/webgpu"
import { isSvgMediaSource } from "@/lib/editor/media-file"
import { parameterValuesSignature } from "@/lib/editor/parameter-schema"
import type { RenderableLayerPass } from "@/renderer/contracts"
import { CustomShaderPass } from "@/renderer/custom-shader-pass"
import { GradientPass } from "@/renderer/gradient-pass"
import { LivePass } from "@/renderer/live-pass"
import { MediaPass } from "@/renderer/media-pass"
import type { PassNode } from "@/renderer/pass-node"
import { createPassNode } from "@/renderer/pass-node-factory"
import { ScenePostProcess } from "@/renderer/scene-post-process"
import { TextPass } from "@/renderer/text-pass"
import type { EditorLayer, SceneConfig, Size } from "@/types/editor"

type LayerPassNode = LivePass | MediaPass | PassNode

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

function parseSvgRasterResolution(value: unknown): number {
  let parsed = Number.NaN

  if (typeof value === "number") {
    parsed = value
  } else if (typeof value === "string") {
    parsed = Number.parseInt(value, 10)
  }

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 2048
  }

  return Math.round(parsed)
}

function createLayerSignature(layer: RenderableLayerPass): string {
  if (layer.layer.type === "custom-shader") {
    return [
      layer.layer.id,
      layer.layer.kind,
      layer.layer.type,
      layer.layer.visible ? "1" : "0",
      layer.layer.opacity.toFixed(4),
      layer.layer.hue.toFixed(4),
      layer.layer.saturation.toFixed(4),
      layer.layer.blendMode,
      layer.layer.compositeMode,
      layer.layer.maskConfig.source,
      layer.layer.maskConfig.mode,
      layer.layer.maskConfig.invert ? "1" : "0",
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
    layer.layer.id,
    layer.layer.kind,
    layer.layer.type,
    layer.asset?.id ?? "no-asset",
    layer.asset?.url ?? "no-url",
    layer.layer.visible ? "1" : "0",
    layer.layer.opacity.toFixed(4),
    layer.layer.hue.toFixed(4),
    layer.layer.saturation.toFixed(4),
    layer.layer.blendMode,
    layer.layer.compositeMode,
    layer.layer.maskConfig.source,
    layer.layer.maskConfig.mode,
    layer.layer.maskConfig.invert ? "1" : "0",
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

  private passMap = new Map<string, LayerPassNode>()
  private passes: LayerPassNode[] = []
  private layerSignatures = new Map<string, string>()
  private compilingPasses = new Set<string>()
  private compiledVersions = new Map<string, number>()
  private pendingMediaLoads = new Set<string>()
  private cachedActivePasses: LayerPassNode[] = []
  private activePassesDirty = true
  private dirty = true

  private markDirty(): void {
    this.dirty = true
    this.activePassesDirty = true
  }

  private width: number
  private height: number
  private logicalWidth: number
  private logicalHeight: number
  private readonly baseMaterial: THREE.MeshBasicMaterial
  private currentBackgroundColor = "#080808"
  private readonly postProcess: ScenePostProcess
  private rtA: THREE.WebGLRenderTarget
  private rtB: THREE.WebGLRenderTarget

  constructor(renderer: THREE.WebGPURenderer, size: Size) {
    this.renderer = renderer
    this.width = Math.max(1, size.width)
    this.height = Math.max(1, size.height)
    this.logicalWidth = this.width
    this.logicalHeight = this.height

    this.baseScene = new THREE.Scene()
    this.baseCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this.baseMaterial = new THREE.MeshBasicMaterial({ color: "#080808" })
    const baseMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      this.baseMaterial
    )
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

    this.postProcess = new ScenePostProcess()

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

  syncLayers(layers: RenderableLayerPass[]): void {
    const incomingIds = new Set(layers.map((layer) => layer.layer.id))

    for (const [layerId, pass] of this.passMap) {
      if (incomingIds.has(layerId)) {
        continue
      }

      pass.dispose()
      this.passMap.delete(layerId)
      this.layerSignatures.delete(layerId)
      this.compilingPasses.delete(layerId)
      this.compiledVersions.delete(layerId)
      this.markDirty()
    }

    const orderedPasses: LayerPassNode[] = []

    for (const renderableLayer of layers) {
      const layerId = renderableLayer.layer.id
      const signature = createLayerSignature(renderableLayer)
      let pass = this.passMap.get(layerId)

      if (!pass) {
        pass = this.createPass(renderableLayer.layer)
        pass.resize(this.width, this.height)
        pass.updateLogicalSize(this.logicalWidth, this.logicalHeight)
        this.passMap.set(layerId, pass)
        this.markDirty()
      }

      if (this.layerSignatures.get(layerId) !== signature) {
        const versionBefore = pass.getMaterialVersion()
        this.layerSignatures.set(layerId, signature)
        this.applyLayerState(pass, renderableLayer)
        this.markDirty()

        if (pass.getMaterialVersion() !== versionBefore) {
          this.scheduleCompile(pass)
        }
      }

      orderedPasses.push(pass)
    }

    if (
      orderedPasses.length !== this.passes.length ||
      orderedPasses.some((pass, index) => this.passes[index] !== pass)
    ) {
      this.passes = orderedPasses
      this.markDirty()
    }
  }

  render(time: number, delta: number): boolean {
    if (this.activePassesDirty) {
      this.cachedActivePasses = this.passes.filter(
        (pass) => pass.enabled && !this.compilingPasses.has(pass.layerId)
      )
      this.activePassesDirty = false
    }

    const activePasses = this.cachedActivePasses
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

    if (this.postProcess.active) {
      this.postProcess.render(this.renderer, readTarget.texture, writeTarget)
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

  setPreviewFrozen(frozen: boolean): void {
    for (const pass of this.passMap.values()) {
      if (pass instanceof MediaPass) {
        pass.setPreviewFrozen(frozen)
      }
    }
  }

  resize(size: Size): void {
    this.width = Math.max(1, size.width)
    this.height = Math.max(1, size.height)
    this.rtA.setSize(this.width, this.height)
    this.rtB.setSize(this.width, this.height)

    for (const pass of this.passMap.values()) {
      pass.resize(this.width, this.height)
    }

    this.markDirty()
  }

  updateLogicalSize(size: Size): void {
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

    this.markDirty()
  }

  updateBackgroundColor(color: string): void {
    if (color === this.currentBackgroundColor) {
      return
    }

    this.currentBackgroundColor = color
    this.baseMaterial.color.set(color)
    this.markDirty()
  }

  updateSceneConfig(config: SceneConfig): void {
    const changed = this.postProcess.update(config)
    if (changed) {
      this.markDirty()
    }
  }

  hasPendingCompilations(): boolean {
    return this.compilingPasses.size > 0
  }

  hasPendingMediaLoads(): boolean {
    return this.pendingMediaLoads.size > 0
  }

  async prepareForExportFrame(time: number, loop: boolean): Promise<void> {
    const activePasses = this.passes.filter(
      (pass) => pass.enabled && !this.compilingPasses.has(pass.layerId)
    )

    await Promise.all(
      activePasses.map((pass) => pass.prepareForExportFrame(time, loop))
    )
  }

  dispose(): void {
    this.rtA.dispose()
    this.rtB.dispose()
    this.blitMaterial.dispose()
    this.postProcess.dispose()

    for (const pass of this.passMap.values()) {
      pass.dispose()
    }

    this.passMap.clear()
    this.passes = []
    this.layerSignatures.clear()
    this.compilingPasses.clear()
    this.compiledVersions.clear()
  }

  private applyLayerState(
    pass: LayerPassNode,
    renderableLayer: RenderableLayerPass
  ): void {
    pass.enabled = renderableLayer.layer.visible
    pass.updateOpacity(clampUnit(renderableLayer.layer.opacity))
    pass.updateBlendMode(renderableLayer.layer.blendMode)
    pass.updateCompositeMode(renderableLayer.layer.compositeMode)
    pass.updateMaskConfig(renderableLayer.layer.maskConfig)
    pass.updateLayerColorAdjustments(
      renderableLayer.layer.hue,
      renderableLayer.layer.saturation
    )
    pass.updateParams(renderableLayer.params)
    pass.flushColorNode()

    if (pass instanceof MediaPass) {
      const asset = renderableLayer.asset
      if (asset?.kind === "image" || asset?.kind === "video") {
        this.pendingMediaLoads.add(pass.layerId)
        void pass
          .setMedia({
            height: asset.height,
            isSvg: isSvgMediaSource(asset),
            kind: asset.kind,
            svgRasterResolution:
              asset.kind === "image"
                ? parseSvgRasterResolution(
                    renderableLayer.params.svgRasterResolution
                  )
                : null,
            url: asset.url,
            width: asset.width,
          })
          .then(() => {
            this.markDirty()
          })
          .catch(() => {
            this.markDirty()
          })
          .finally(() => {
            this.pendingMediaLoads.delete(pass.layerId)
          })
      } else {
        this.pendingMediaLoads.delete(pass.layerId)
        pass.clearMedia()
      }
    }

    if (pass instanceof LivePass) {
      const facingMode =
        typeof renderableLayer.params.facingMode === "string"
          ? renderableLayer.params.facingMode
          : "user"

      if (
        facingMode !== pass.getFacingMode() ||
        !pass.needsContinuousRender()
      ) {
        void pass
          .startCamera(facingMode)
          .then(() => {
            this.markDirty()
          })
          .catch(() => {
            this.markDirty()
          })
      }
    }
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
        this.compilingPasses.delete(pass.layerId)
        this.compiledVersions.set(pass.layerId, pass.getMaterialVersion())
        this.markDirty()
      })
      .catch(() => {
        this.compilingPasses.delete(pass.layerId)
      })
  }

  private createPass(layer: EditorLayer): LayerPassNode {
    if (layer.kind === "effect") {
      return createPassNode(layer.id, layer.type)
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
      return new CustomShaderPass(layer.id)
    }

    if (layer.kind === "source" && layer.type === "live") {
      return new LivePass(layer.id)
    }

    throw new Error(`Unsupported layer type in current scope: ${layer.type}`)
  }
}
