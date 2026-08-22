import { float, type TSLNode, texture as tslTexture, uv, vec2 } from "three/tsl"
import * as THREE from "three/webgpu"
import { isSvgMediaSource } from "@/lib/editor/media-file"
import { parameterValuesSignature } from "@/lib/editor/parameter-schema"
import type { RenderableLayerPass } from "@/renderer/contracts"
import type { FluidPass } from "@/renderer/fluid-pass"
import {
  describeCameraFailure,
  describeMediaLoadFailure,
  setLayerMediaError,
} from "@/renderer/layer-media-error"
import type { LivePass } from "@/renderer/live-pass"
import type { MagnifyLensPass } from "@/renderer/magnify-lens-pass"
import type { MediaPass } from "@/renderer/media-pass"
import {
  errorFingerprint,
  type LayerType,
  nextPassFailureState,
  type PassFailureState,
  reportPassFailure,
} from "@/renderer/pass-failure"
import type { PassNode } from "@/renderer/pass-node"
import {
  getLoadedPassFactory,
  loadPassFactory,
  passKeyForLayer,
} from "@/renderer/pass-node-factory"
import type { PixelTrailPass } from "@/renderer/pixel-trail-pass"
import { ScenePostProcess } from "@/renderer/scene-post-process"
import type { EditorLayer, SceneConfig, Size } from "@/types/editor"

type LayerPassNode = PassNode

/* Structural checks instead of instanceof: the pass classes are lazily
 * loaded, so this module must not import their implementations. */
function isMediaPass(pass: LayerPassNode): pass is MediaPass {
  return typeof (pass as MediaPass).setMedia === "function"
}

function isLivePass(pass: LayerPassNode): pass is LivePass {
  return typeof (pass as LivePass).startCamera === "function"
}

function supportsFluidInteraction(
  pass: LayerPassNode
): pass is FluidPass | MagnifyLensPass | PixelTrailPass {
  return (
    typeof (pass as FluidPass).updateFluidInteractionEvents === "function"
  )
}

// Editing the layer re-enables a dropped pass. See pass-failure.ts.
const MAX_PASS_FAILURES = 3

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

  return Math.min(8192, Math.round(parsed))
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

  const fluidInteractions = layer.layer.fluidInteractionEvents
  const lastFluidInteraction = fluidInteractions?.at(-1)

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
    fluidInteractions?.length ?? 0,
    lastFluidInteraction
      ? `${lastFluidInteraction.time}:${lastFluidInteraction.x}:${lastFluidInteraction.y}:${lastFluidInteraction.dx}:${lastFluidInteraction.dy}`
      : "",
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
  // Attributes compile and render failures to a layer type. See pass-failure.ts.
  private layerTypes = new Map<string, LayerType>()
  private passFailures = new Map<string, PassFailureState>()
  private readonly strictPassFailures: boolean
  private pendingMediaLoads = new Set<string>()
  // Both keyed by pass key, not layer id: layers of the same type share one
  // chunk, so they must share one in-flight load and one failure count.
  private pendingPassLoads = new Set<string>()
  private failedPassLoads = new Map<string, number>()
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

  constructor(
    renderer: THREE.WebGPURenderer,
    size: Size,
    options: { strictPassFailures?: boolean } = {}
  ) {
    this.strictPassFailures = options.strictPassFailures === true
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
      this.layerTypes.delete(layerId)
      this.clearPassFailure(layerId)
      this.markDirty()
    }

    const orderedPasses: LayerPassNode[] = []

    for (const renderableLayer of layers) {
      const layerId = renderableLayer.layer.id
      const signature = createLayerSignature(renderableLayer)
      let pass = this.passMap.get(layerId)

      this.layerTypes.set(layerId, renderableLayer.layer.type)

      if (!pass) {
        const created = this.createPass(renderableLayer.layer)

        if (!created) {
          // Module still loading; retried on a later frame — deliberately
          // before layerSignatures is set, so applyLayerState and the
          // compile schedule run intact once the factory lands.
          continue
        }

        pass = created
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
          // Recover on a material rebuild, not on any signature change: keyframed
          // and audio-driven values change the signature every frame, which would
          // reset the failure count before it could ever throttle.
          this.clearPassFailure(layerId)
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

  render(time: number, delta: number, timelineTime = time): boolean {
    if (this.activePassesDirty) {
      this.cachedActivePasses = this.passes.filter(
        (pass) =>
          pass.enabled &&
          !this.isPassDisabled(pass.layerId) &&
          (!this.compilingPasses.has(pass.layerId) ||
            this.compiledVersions.has(pass.layerId))
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
      try {
        ;(
          pass.render as (
            renderer: THREE.WebGPURenderer,
            inputTexture: THREE.Texture,
            outputTarget: THREE.WebGLRenderTarget,
            time: number,
            delta: number,
            timelineTime: number
          ) => void
        )(
          this.renderer,
          readTarget.texture,
          writeTarget,
          time,
          delta,
          timelineTime
        )
      } catch (error) {
        // Exports must fail loudly: dropping a layer would ship a frame that
        // looks fine but is wrong. Still report, so the abort is diagnosable.
        if (this.strictPassFailures) {
          reportPassFailure(
            this.layerTypes.get(pass.layerId),
            pass.layerId,
            "pass-render",
            error
          )
          throw error
        }

        this.handlePassRenderFailure(pass.layerId, error)
        // Skip the swap: the failed pass contributes nothing.
        continue
      }

      this.passFailures.delete(pass.layerId)

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
      if (isMediaPass(pass)) {
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
    const postProcessChanged = this.postProcess.update(config)
    let passChanged = false

    for (const pass of this.passMap.values()) {
      passChanged = pass.updateSceneConfig(config) || passChanged
    }

    if (postProcessChanged || passChanged) {
      this.markDirty()
    }
  }

  updateOutputCropAspectRatio(ratio: number | null): void {
    let passChanged = false

    for (const pass of this.passMap.values()) {
      passChanged = pass.updateOutputCropAspectRatio(ratio) || passChanged
    }

    if (passChanged) {
      this.markDirty()
    }
  }

  hasPendingCompilations(): boolean {
    return this.compilingPasses.size > 0
  }

  hasPendingMediaLoads(): boolean {
    return this.pendingMediaLoads.size > 0
  }

  hasPendingPassLoads(): boolean {
    return this.pendingPassLoads.size > 0
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
    if (supportsFluidInteraction(pass)) {
      pass.updateFluidInteractionEvents(
        renderableLayer.layer.fluidInteractionEvents ?? []
      )
    }
    pass.flushColorNode()

    if (isMediaPass(pass)) {
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
            setLayerMediaError(pass.layerId, null)
            this.markDirty()
          })
          .catch(() => {
            setLayerMediaError(
              pass.layerId,
              describeMediaLoadFailure(asset.fileName)
            )
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

    if (isLivePass(pass)) {
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
            setLayerMediaError(pass.layerId, null)
            this.markDirty()
          })
          .catch((cause: unknown) => {
            setLayerMediaError(pass.layerId, describeCameraFailure(cause))
            this.markDirty()
          })
      }
    }
  }

  private isPassDisabled(layerId: string): boolean {
    return (this.passFailures.get(layerId)?.total ?? 0) >= MAX_PASS_FAILURES
  }

  private handlePassRenderFailure(layerId: string, error: unknown): void {
    const state = nextPassFailureState(
      this.passFailures.get(layerId),
      errorFingerprint(error)
    )

    this.passFailures.set(layerId, state)

    if (state.count === 1) {
      reportPassFailure(
        this.layerTypes.get(layerId),
        layerId,
        "pass-render",
        error
      )
    }

    if (state.total === MAX_PASS_FAILURES) {
      this.markDirty()
    }
  }

  private clearPassFailure(layerId: string): void {
    const wasDisabled = this.isPassDisabled(layerId)
    this.passFailures.delete(layerId)

    if (wasDisabled) {
      this.markDirty()
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
      .catch((error: unknown) => {
        // Keep the delete: dropping it wedges hasPendingCompilations().
        this.compilingPasses.delete(pass.layerId)
        reportPassFailure(
          this.layerTypes.get(pass.layerId),
          pass.layerId,
          "pipeline-compile",
          error
        )
      })
  }

  // Returns null while the pass module is still loading.
  private createPass(layer: EditorLayer): LayerPassNode | null {
    const key = passKeyForLayer(layer)

    if (key === null) {
      throw new Error(`Unsupported layer type in current scope: ${layer.type}`)
    }

    const factory = getLoadedPassFactory(key)

    if (factory) {
      return factory(layer.id, this.renderer)
    }

    if (
      (this.failedPassLoads.get(key) ?? 0) < MAX_PASS_FAILURES &&
      !this.pendingPassLoads.has(key)
    ) {
      this.pendingPassLoads.add(key)

      loadPassFactory(key)
        .then(() => {
          this.failedPassLoads.delete(key)
          this.markDirty()
        })
        .catch((error: unknown) => {
          this.failedPassLoads.set(
            key,
            (this.failedPassLoads.get(key) ?? 0) + 1
          )
          reportPassFailure(
            this.layerTypes.get(layer.id),
            layer.id,
            "pass-module-load",
            error
          )
        })
        .finally(() => {
          this.pendingPassLoads.delete(key)
        })
    }

    return null
  }
}
