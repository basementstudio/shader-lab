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
import { loadImageTexture, createVideoTexture, type VideoHandle } from "@/renderer/media-texture"
import { PassNode } from "@/renderer/pass-node"
import type { LayerParameterValues } from "@/types/editor"

type MediaKind = "image" | "video"
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
  private loadedUrl: string | null = null
  private videoHandle: VideoHandle | null = null
  private videoTexture: THREE.VideoTexture | null = null

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

  async setMedia(url: string, kind: MediaKind): Promise<void> {
    if (this.loadedUrl === url) {
      return
    }

    this.releaseCurrentMedia()
    this.loadedUrl = url

    if (kind === "image") {
      const texture = await loadImageTexture(url)
      this.currentTexture = texture
      this.setTextureAspect(texture)
      return
    }

    const handle = await createVideoTexture(url)
    this.currentTexture = handle.texture
    this.videoHandle = handle
    this.videoTexture = handle.texture
    this.setTextureAspect(handle.texture)
  }

  clearMedia(): void {
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
      this.videoHandle.video.playbackRate = Math.max(0.1, params.playbackRate)
    }

    if (this.videoHandle) {
      this.videoHandle.video.loop = true
    }
  }

  override render(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number,
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

  override dispose(): void {
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
    const containScaleX = float(1).div(coverScaleX)
    const containScaleY = float(1).div(coverScaleY)
    const useContain = this.fitModeUniform
    const scaleX = mix(coverScaleX, containScaleX, useContain)
    const scaleY = mix(coverScaleY, containScaleY, useContain)
    const sampledUv = vec2(
      centeredUv.x.div(scaleX).add(this.offsetXUniform).add(0.5),
      centeredUv.y.div(scaleY).add(this.offsetYUniform).add(0.5),
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
    this.loadedUrl = null
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
        : image?.naturalWidth ?? 1
    const height =
      image instanceof HTMLVideoElement
        ? image.videoHeight
        : image?.naturalHeight ?? 1

    this.textureAspectUniform.value = width / Math.max(height, 1)
  }
}
