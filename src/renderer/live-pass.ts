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
import { PassNode } from "@/renderer/pass-node"
import type { LayerParameterValues } from "@/types/editor"

type Node = TSLNode

export class LivePass extends PassNode {
  private readonly canvasAspectUniform: Node
  private readonly fitModeUniform: Node
  private readonly mirrorUniform: Node
  private readonly offsetXUniform: Node
  private readonly offsetYUniform: Node
  private readonly scaleUniform: Node
  private readonly textureAspectUniform: Node
  private mediaTextureNode: Node
  private readonly placeholder: THREE.Texture

  private videoElement: HTMLVideoElement | null = null
  private videoTexture: THREE.VideoTexture | null = null
  private stream: MediaStream | null = null
  private activeFacingMode: string | null = null

  constructor(layerId: string) {
    super(layerId)
    this.placeholder = new THREE.Texture()
    this.canvasAspectUniform = uniform(1)
    this.fitModeUniform = uniform(0)
    this.mirrorUniform = uniform(1)
    this.offsetXUniform = uniform(0)
    this.offsetYUniform = uniform(0)
    this.scaleUniform = uniform(1)
    this.textureAspectUniform = uniform(1)
    this.mediaTextureNode = tslTexture(this.placeholder, uv())
    this.rebuildEffectNode()
  }

  async startCamera(facingMode: string): Promise<void> {
    if (this.activeFacingMode === facingMode && this.videoTexture) {
      return
    }

    this.stopCamera()
    this.activeFacingMode = facingMode

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode,
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    })

    this.stream = stream
    const video = document.createElement("video")
    video.srcObject = stream
    video.muted = true
    video.playsInline = true

    await new Promise<void>((resolve, reject) => {
      video.addEventListener(
        "playing",
        () => resolve(),
        { once: true },
      )
      video.addEventListener(
        "error",
        () => reject(new Error("Failed to start camera")),
        { once: true },
      )
      video.play().catch(reject)
    })

    this.videoElement = video
    const texture = new THREE.VideoTexture(video)
    texture.colorSpace = THREE.SRGBColorSpace
    this.videoTexture = texture

    const width = video.videoWidth || 1
    const height = video.videoHeight || 1
    this.textureAspectUniform.value = width / Math.max(height, 1)
  }

  getFacingMode(): string {
    return this.activeFacingMode ?? "user"
  }

  private stopCamera(): void {
    this.videoTexture?.dispose()
    this.videoTexture = null

    if (this.videoElement) {
      this.videoElement.pause()
      this.videoElement.srcObject = null
      this.videoElement = null
    }

    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop()
      }
      this.stream = null
    }

    this.activeFacingMode = null
  }

  override updateParams(params: LayerParameterValues): void {
    this.fitModeUniform.value = params.fitMode === "contain" ? 1 : 0
    this.mirrorUniform.value = params.mirror === false ? 0 : 1
    this.scaleUniform.value =
      typeof params.scale === "number" ? 1 / Math.max(params.scale, 0.01) : 1

    if (Array.isArray(params.offset) && params.offset.length === 2) {
      this.offsetXUniform.value = params.offset[0] ?? 0
      this.offsetYUniform.value = params.offset[1] ?? 0
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
      this.mediaTextureNode.value = this.videoTexture
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
    this.stopCamera()
    this.placeholder.dispose()
    super.dispose()
  }

  protected override buildEffectNode(): Node {
    if (!this.canvasAspectUniform) {
      return this.inputNode
    }

    const aspectRatio = this.textureAspectUniform.div(this.canvasAspectUniform)
    const rawUv = uv().sub(0.5).mul(this.scaleUniform)
    const mirroredX = mix(rawUv.x, rawUv.x.negate(), this.mirrorUniform)
    const centeredUv = vec2(mirroredX, rawUv.y)

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
}
