import { float, type TSLNode, texture as tslTexture, uv, vec2 } from "three/tsl"
import * as THREE from "three/webgpu"
import { isGroupLayer } from "@/lib/editor/layer-groups"
import { isSvgMediaSource } from "@/lib/editor/media-file"
import { parameterValuesSignature } from "@/lib/editor/parameter-schema"
import type { RenderableLayerPass } from "@/renderer/contracts"
import { CustomShaderPass } from "@/renderer/custom-shader-pass"
import { GradientPass } from "@/renderer/gradient-pass"
import { GroupPass } from "@/renderer/group-pass"
import { LivePass } from "@/renderer/live-pass"
import { MediaPass } from "@/renderer/media-pass"
import type { PassNode } from "@/renderer/pass-node"
import { createPassNode } from "@/renderer/pass-node-factory"
import { ScenePostProcess } from "@/renderer/scene-post-process"
import { TextPass } from "@/renderer/text-pass"
import type { EditorLayer, SceneConfig, Size } from "@/types/editor"

type LayerPassNode = GroupPass | LivePass | MediaPass | PassNode
type LayerTreeNode = {
  children: LayerTreeNode[]
  entry: RenderableLayerPass
}
type RenderTargetPair = {
  read: THREE.WebGLRenderTarget
  write: THREE.WebGLRenderTarget
}

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

function createGroupSignature(layer: RenderableLayerPass): string {
  return [
    layer.layer.id,
    layer.layer.kind,
    layer.layer.type,
    layer.layer.visible ? "1" : "0",
    layer.layer.opacity.toFixed(4),
    layer.layer.blendMode,
    layer.layer.compositeMode,
    layer.layer.maskConfig.source,
    layer.layer.maskConfig.mode,
    layer.layer.maskConfig.invert ? "1" : "0",
  ].join("|")
}

function createLayerSignature(layer: RenderableLayerPass): string {
  if (isGroupLayer(layer.layer)) {
    return createGroupSignature(layer)
  }

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

function buildRenderTree(layers: RenderableLayerPass[]): LayerTreeNode[] {
  const groupIds = new Set(
    layers.filter((entry) => isGroupLayer(entry.layer)).map((entry) => entry.layer.id)
  )
  const parentById = new Map(
    layers.map((entry) => {
      const parentGroupId =
        entry.layer.parentGroupId && groupIds.has(entry.layer.parentGroupId)
          ? entry.layer.parentGroupId
          : null

      return [entry.layer.id, parentGroupId]
    })
  )

  const visit = (
    entry: RenderableLayerPass,
    lineage: Set<string>
  ): LayerTreeNode | null => {
    if (lineage.has(entry.layer.id)) {
      return null
    }

    const nextLineage = new Set(lineage)
    nextLineage.add(entry.layer.id)
    const children = layers
      .filter((candidate) => (parentById.get(candidate.layer.id) ?? null) === entry.layer.id)
      .map((child) => visit(child, nextLineage))
      .filter((child): child is LayerTreeNode => child !== null)

    return { children, entry }
  }

  return layers
    .filter((entry) => (parentById.get(entry.layer.id) ?? null) === null)
    .map((entry) => visit(entry, new Set()))
    .filter((entry): entry is LayerTreeNode => entry !== null)
}

function createStructureSignature(layers: RenderableLayerPass[]): string {
  return layers
    .map(
      (entry) => `${entry.layer.id}:${entry.layer.parentGroupId ?? "root"}`
    )
    .join("|")
}

export class PipelineManager {
  private readonly renderer: THREE.WebGPURenderer
  private readonly baseScene: THREE.Scene
  private readonly baseCamera: THREE.OrthographicCamera
  private readonly clearScene: THREE.Scene
  private readonly blitScene: THREE.Scene
  private readonly blitCamera: THREE.OrthographicCamera
  private readonly blitInputNode: TSLNode
  private readonly blitMaterial: THREE.MeshBasicNodeMaterial

  private passMap = new Map<string, LayerPassNode>()
  private layerSignatures = new Map<string, string>()
  private compilingPasses = new Set<string>()
  private compiledVersions = new Map<string, number>()
  private pendingMediaLoads = new Set<string>()
  private renderTree: LayerTreeNode[] = []
  private structureSignature = ""
  private dirty = true

  private width: number
  private height: number
  private logicalWidth: number
  private logicalHeight: number
  private readonly baseMaterial: THREE.MeshBasicMaterial
  private currentBackgroundColor = "#080808"
  private readonly postProcess: ScenePostProcess
  private rtA: THREE.WebGLRenderTarget
  private rtB: THREE.WebGLRenderTarget
  private subgroupTargetPool: RenderTargetPair[] = []

  constructor(renderer: THREE.WebGPURenderer, size: Size) {
    this.renderer = renderer
    this.width = Math.max(1, size.width)
    this.height = Math.max(1, size.height)
    this.logicalWidth = this.width
    this.logicalHeight = this.height

    this.baseScene = new THREE.Scene()
    this.baseCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this.clearScene = new THREE.Scene()
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

    for (const renderableLayer of layers) {
      if (renderableLayer.layer.kind === "model") {
        continue
      }

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
    }

    const nextStructureSignature = createStructureSignature(layers)
    if (nextStructureSignature !== this.structureSignature) {
      this.structureSignature = nextStructureSignature
      this.markDirty()
    }

    this.renderTree = buildRenderTree(layers)
  }

  render(time: number, delta: number): boolean {
    const needsContinuousRender = this.hasContinuousRender(this.renderTree)

    if (!(this.dirty || needsContinuousRender)) {
      return false
    }

    if (!this.hasRenderableNodes(this.renderTree)) {
      this.renderer.setRenderTarget(null)
      this.renderer.render(this.baseScene, this.baseCamera)
      this.dirty = false
      return true
    }

    this.renderer.setRenderTarget(this.rtA)
    this.renderer.render(this.baseScene, this.baseCamera)

    const renderResult = this.renderNodes(
      this.renderTree,
      this.rtA,
      this.rtB,
      time,
      delta
    )

    let readTarget = renderResult.readTarget
    let writeTarget = renderResult.writeTarget

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

    for (const pair of this.subgroupTargetPool) {
      pair.read.setSize(this.width, this.height)
      pair.write.setSize(this.width, this.height)
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

  async prepareForExportFrame(time: number, loop: boolean): Promise<void> {
    const activeLeafPasses = this.collectActiveLeafPasses(this.renderTree)

    await Promise.all(
      activeLeafPasses.map((pass) => pass.prepareForExportFrame(time, loop))
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

    for (const pair of this.subgroupTargetPool) {
      pair.read.dispose()
      pair.write.dispose()
    }

    this.passMap.clear()
    this.layerSignatures.clear()
    this.compilingPasses.clear()
    this.compiledVersions.clear()
    this.subgroupTargetPool = []
  }

  private markDirty(): void {
    this.dirty = true
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

    if (pass instanceof GroupPass) {
      pass.flushColorNode()
      return
    }

    pass.updateLayerColorAdjustments(
      renderableLayer.layer.hue,
      renderableLayer.layer.saturation
    )
    pass.updateCommonParams(renderableLayer.params)
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
    if (isGroupLayer(layer)) {
      return new GroupPass(layer.id)
    }

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

  private hasContinuousRender(nodes: LayerTreeNode[]): boolean {
    return nodes.some((node) => {
      if (!node.entry.layer.visible) {
        return false
      }

      const pass = this.passMap.get(node.entry.layer.id)
      if (!(pass && !this.compilingPasses.has(pass.layerId))) {
        return false
      }

      if (isGroupLayer(node.entry.layer)) {
        return this.hasContinuousRender(node.children)
      }

      return pass.needsContinuousRender()
    })
  }

  private hasRenderableNodes(nodes: LayerTreeNode[]): boolean {
    return nodes.some((node) => this.isNodeRenderable(node))
  }

  private isNodeRenderable(node: LayerTreeNode): boolean {
    if (!node.entry.layer.visible) {
      return false
    }

    const pass = this.passMap.get(node.entry.layer.id)
    if (!(pass && !this.compilingPasses.has(pass.layerId))) {
      return false
    }

    if (isGroupLayer(node.entry.layer)) {
      return this.hasRenderableNodes(node.children)
    }

    return true
  }

  private collectActiveLeafPasses(nodes: LayerTreeNode[]): LayerPassNode[] {
    return nodes.flatMap((node) => {
      if (!node.entry.layer.visible) {
        return []
      }

      const pass = this.passMap.get(node.entry.layer.id)
      if (!(pass && !this.compilingPasses.has(pass.layerId))) {
        return []
      }

      if (isGroupLayer(node.entry.layer)) {
        return this.collectActiveLeafPasses(node.children)
      }

      return [pass]
    })
  }

  private renderNodes(
    nodes: LayerTreeNode[],
    readTarget: THREE.WebGLRenderTarget,
    writeTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number
  ): {
    readTarget: THREE.WebGLRenderTarget
    rendered: boolean
    writeTarget: THREE.WebGLRenderTarget
  } {
    let currentReadTarget = readTarget
    let currentWriteTarget = writeTarget
    let renderedAny = false

    for (let index = nodes.length - 1; index >= 0; index -= 1) {
      const node = nodes[index]
      if (!node?.entry.layer.visible) {
        continue
      }

      const pass = this.passMap.get(node.entry.layer.id)
      if (!(pass && !this.compilingPasses.has(pass.layerId))) {
        continue
      }

      if (isGroupLayer(node.entry.layer)) {
        const subgroupPair = this.acquireSubgroupPair()
        this.clearRenderTarget(subgroupPair.read)

        const subgroupResult = this.renderNodes(
          node.children,
          subgroupPair.read,
          subgroupPair.write,
          time,
          delta
        )

        if (!(subgroupResult.rendered && pass instanceof GroupPass)) {
          this.releaseSubgroupPair(subgroupPair)
          continue
        }

        pass.setGroupTexture(subgroupResult.readTarget.texture)
        pass.render(
          this.renderer,
          currentReadTarget.texture,
          currentWriteTarget,
          time,
          delta
        )
        renderedAny = true
        const previousRead = currentReadTarget
        currentReadTarget = currentWriteTarget
        currentWriteTarget = previousRead
        this.releaseSubgroupPair(subgroupPair)
        continue
      }

      pass.render(
        this.renderer,
        currentReadTarget.texture,
        currentWriteTarget,
        time,
        delta
      )
      renderedAny = true
      const previousRead = currentReadTarget
      currentReadTarget = currentWriteTarget
      currentWriteTarget = previousRead
    }

    return {
      readTarget: currentReadTarget,
      rendered: renderedAny,
      writeTarget: currentWriteTarget,
    }
  }

  private acquireSubgroupPair(): RenderTargetPair {
    const pair = this.subgroupTargetPool.pop()
    if (pair) {
      return pair
    }

    return {
      read: new THREE.WebGLRenderTarget(
        this.width,
        this.height,
        RENDER_TARGET_OPTIONS
      ),
      write: new THREE.WebGLRenderTarget(
        this.width,
        this.height,
        RENDER_TARGET_OPTIONS
      ),
    }
  }

  private releaseSubgroupPair(pair: RenderTargetPair): void {
    this.subgroupTargetPool.push(pair)
  }

  private clearRenderTarget(target: THREE.WebGLRenderTarget): void {
    this.renderer.setClearColor("#000000", 0)
    this.renderer.setRenderTarget(target)
    this.renderer.render(this.clearScene, this.baseCamera)
    this.renderer.setClearColor("#0a0d10", 1)
  }
}
