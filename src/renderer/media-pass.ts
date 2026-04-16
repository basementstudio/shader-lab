import * as THREE from "three/webgpu"
import {
  clamp,
  float,
  max,
  mix,
  select,
  texture as tslTexture,
  type TSLNode,
  uniform,
  uv,
  vec2,
  vec4,
} from "three/tsl"
import {
  createVideoTexture,
  loadImageTexture,
  type ImageTextureSource,
  type VideoHandle,
} from "@/renderer/media-texture"
import { PassNode } from "@/renderer/pass-node"
import type { LayerParameterValues } from "@/types/editor"

type MediaKind = "image" | "video"
type MediaSource = ImageTextureSource & { kind: MediaKind }
type Node = TSLNode

export class MediaPass extends PassNode {
  private readonly canvasAspectUniform: Node
  private readonly fitModeUniform: Node
  private readonly offsetXUniform: Node
  private readonly offsetYUniform: Node
  private readonly scaleUniform: Node
  private readonly textureAspectUniform: Node
  private mediaTextureNode: Node
  private readonly placeholder: THREE.Texture

  private currentTexture: THREE.Texture | null = null
  private loadedSignature: string | null = null
  private mediaLoadNonce = 0
  private videoHandle: VideoHandle | null = null
  private videoTexture: THREE.VideoTexture | null = null
  private previewFrozen = false

  constructor(layerId: string) {
    super(layerId)
    this.placeholder = new THREE.Texture()
    this.canvasAspectUniform = uniform(1)
    this.fitModeUniform = uniform(0)
    this.offsetXUniform = uniform(0)
    this.offsetYUniform = uniform(0)
    this.scaleUniform = uniform(1)
    this.textureAspectUniform = uniform(1)
    this.mediaTextureNode = tslTexture(this.placeholder, uv())
    this.rebuildEffectNode()
  }

  async setMedia(source: MediaSource): Promise<void> {
    const nextSignature = [
      source.url,
      source.kind,
      source.isSvg ? "svg" : "raster",
      source.svgRasterResolution ?? "",
    ].join("|")

    if (this.loadedSignature === nextSignature) {
      return
    }

    this.mediaLoadNonce += 1
    const loadNonce = this.mediaLoadNonce
    this.releaseCurrentMedia()
    this.loadedSignature = nextSignature

    if (source.kind === "image") {
      const texture = await loadImageTexture(source)

      if (loadNonce !== this.mediaLoadNonce) {
        texture.dispose()
        return
      }

      this.currentTexture = texture
      this.setTextureAspect(texture)
      return
    }

    const handle = await createVideoTexture(source.url)

    if (loadNonce !== this.mediaLoadNonce) {
      handle.dispose()
      return
    }

    this.currentTexture = handle.texture
    this.videoHandle = handle
    this.videoTexture = handle.texture
    void handle.setFrozen(this.previewFrozen)
    this.setTextureAspect(handle.texture)
  }

  clearMedia(): void {
    this.mediaLoadNonce += 1
    this.releaseCurrentMedia()
  }

  override updateParams(params: LayerParameterValues): void {
    this.fitModeUniform.value = params.fitMode === "contain" ? 1 : 0
    this.scaleUniform.value =
      typeof params.scale === "number" ? 1 / Math.max(params.scale, 0.01) : 1

    if (Array.isArray(params.offset) && params.offset.length === 2) {
      this.offsetXUniform.value = params.offset[0] ?? 0
      this.offsetYUniform.value = params.offset[1] ?? 0
    }

    if (
      this.videoHandle &&
      typeof params.playbackRate === "number" &&
      Number.isFinite(params.playbackRate)
    ) {
      this.videoHandle.setPlaybackRate(params.playbackRate)
    }

    if (this.videoHandle) {
      this.videoHandle.setLoop(true)
    }
  }

  setPreviewFrozen(frozen: boolean): void {
    this.previewFrozen = frozen

    if (!this.videoHandle) {
      return
    }

    void this.videoHandle.setFrozen(frozen)
  }

  override render(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number
  ): void {
    if (this.videoTexture) {
      this.videoTexture.needsUpdate = true
    }

    if (this.currentTexture && this.mediaTextureNode) {
      this.mediaTextureNode.value = this.currentTexture
    }

    super.render(renderer, inputTexture, outputTarget, time, delta)
  }

  override resize(width: number, height: number): void {
    this.canvasAspectUniform.value = width / Math.max(height, 1)
  }

  override needsContinuousRender(): boolean {
    return this.videoTexture !== null
  }

  override async prepareForExportFrame(
    time: number,
    loop: boolean
  ): Promise<void> {
    if (!this.videoHandle) {
      return
    }

    this.videoHandle.setLoop(loop)
    await this.videoHandle.prepareFrame(time)
  }

  override dispose(): void {
    this.mediaLoadNonce += 1
    this.releaseCurrentMedia()
    this.placeholder.dispose()
    super.dispose()
  }

  protected override buildEffectNode(): Node {
    if (!this.canvasAspectUniform) {
      return this.inputNode
    }

    const aspectRatio = this.textureAspectUniform.div(this.canvasAspectUniform)
    const centeredUv = uv().sub(0.5).mul(this.scaleUniform)
    const coverScaleX = max(aspectRatio, float(1))
    const coverScaleY = max(float(1).div(aspectRatio), float(1))
    const containScaleX = clamp(aspectRatio, float(0), float(1))
    const containScaleY = clamp(float(1).div(aspectRatio), float(0), float(1))
    const useContain = this.fitModeUniform
    const scaleX = mix(coverScaleX, containScaleX, useContain)
    const scaleY = mix(coverScaleY, containScaleY, useContain)
    const sampledUv = vec2(
      centeredUv.x.div(scaleX).sub(this.offsetXUniform).add(0.5),
      centeredUv.y.div(scaleY).sub(this.offsetYUniform).add(0.5)
    )
    const safeUv = clamp(sampledUv, vec2(0, 0), vec2(1, 1))
    this.mediaTextureNode = tslTexture(this.placeholder, safeUv)
    const inBounds = sampledUv.x
      .greaterThanEqual(0)
      .and(sampledUv.x.lessThanEqual(1))
      .and(sampledUv.y.greaterThanEqual(0))
      .and(sampledUv.y.lessThanEqual(1))
    const contained = select(inBounds, this.mediaTextureNode, vec4(0, 0, 0, 1))

    return mix(this.mediaTextureNode, contained, useContain)
  }

  private releaseCurrentMedia(): void {
    this.currentTexture?.dispose()
    this.currentTexture = null
    this.videoTexture = null
    this.videoHandle?.dispose()
    this.videoHandle = null
    this.loadedSignature = null
  }

  private setTextureAspect(texture: THREE.Texture): void {
    const image = texture.image as
      | HTMLImageElement
      | HTMLVideoElement
      | null
      | undefined
    const width =
      image instanceof HTMLVideoElement
        ? image.videoWidth
        : (image?.naturalWidth ?? 1)
    const height =
      image instanceof HTMLVideoElement
        ? image.videoHeight
        : (image?.naturalHeight ?? 1)

    this.textureAspectUniform.value = width / Math.max(height, 1)
  }
}
