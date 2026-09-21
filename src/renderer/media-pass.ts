import * as THREE from "three/webgpu"
import {
  clamp,
  dFdx,
  dFdy,
  float,
  Fn,
  If,
  int,
  Loop,
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
type ParallaxMotion = "off" | "orbit" | "sway" | "nod" | "dolly"
type Node = TSLNode

const PARALLAX_MOTIONS: readonly ParallaxMotion[] = [
  "off",
  "orbit",
  "sway",
  "nod",
  "dolly",
]
const DEPTH_STEPS: Record<string, number> = { high: 64, low: 16, medium: 32 }
const DEPTH_REFINE_STEPS = 5
const PARALLAX_SHIFT_SCALE = 0.15
const PARALLAX_OFFSET_SCALE = 0.25
const PARALLAX_DOLLY_SCALE = 0.3
const PARALLAX_CYCLE_SECONDS = 4

export function resolveParallaxMotion(value: unknown): ParallaxMotion {
  return PARALLAX_MOTIONS.includes(value as ParallaxMotion)
    ? (value as ParallaxMotion)
    : "off"
}

export function resolveDepthSteps(value: unknown): number {
  return typeof value === "string" && value in DEPTH_STEPS
    ? DEPTH_STEPS[value]!
    : DEPTH_STEPS.medium!
}

export function parallaxCameraAt(
  motion: ParallaxMotion,
  amount: number,
  speed: number,
  offset: readonly [number, number],
  time: number
): { dolly: number; shiftX: number; shiftY: number } {
  const phase = (time * speed * Math.PI * 2) / PARALLAX_CYCLE_SECONDS
  const lateral = amount * PARALLAX_SHIFT_SCALE
  let shiftX = offset[0] * PARALLAX_OFFSET_SCALE
  let shiftY = offset[1] * PARALLAX_OFFSET_SCALE
  let dolly = 0

  if (motion === "orbit") {
    shiftX += Math.cos(phase) * lateral
    shiftY += Math.sin(phase) * lateral
  } else if (motion === "sway") {
    shiftX += Math.sin(phase) * lateral
  } else if (motion === "nod") {
    shiftY += Math.sin(phase) * lateral
  } else if (motion === "dolly") {
    dolly = Math.sin(phase) * amount * PARALLAX_DOLLY_SCALE
  }

  return { dolly, shiftX, shiftY }
}

export class MediaPass extends PassNode {
  private readonly canvasAspectUniform: Node
  private readonly fitModeUniform: Node
  private readonly boundsAlphaUniform: Node
  private readonly offsetXUniform: Node
  private readonly offsetYUniform: Node
  private readonly scaleUniform: Node
  private readonly textureAspectUniform: Node
  private mediaTextureNode: Node
  private readonly placeholder: THREE.Texture
  private readonly depthPlaceholder: THREE.Texture
  private readonly depthShiftXUniform: Node
  private readonly depthShiftYUniform: Node
  private readonly depthDollyUniform: Node
  private readonly depthRangeUniform: Node
  private readonly depthFocusUniform: Node
  private readonly depthInvertUniform: Node
  private readonly depthEdgesAlphaUniform: Node
  private readonly depthViewUniform: Node
  private depthTextureNodes: Node[] = []
  private depthTexture: THREE.Texture | null = null
  private depthLoadedSignature: string | null = null
  private depthLoadNonce = 0
  private depthSteps = 32
  private depthActive = false
  private parallaxMotion: ParallaxMotion = "orbit"
  private parallaxAmount = 0.3
  private parallaxSpeed = 0.5
  private parallaxOffset: [number, number] = [0, 0]

  private currentTexture: THREE.Texture | null = null
  private loadedSignature: string | null = null
  private mediaLoadNonce = 0
  private videoHandle: VideoHandle | null = null
  private videoTexture: THREE.VideoTexture | null = null
  private previewFrozen = false

  constructor(layerId: string) {
    super(layerId)
    this.placeholder = new THREE.Texture()
    this.depthPlaceholder = new THREE.Texture()
    this.canvasAspectUniform = uniform(1)
    this.fitModeUniform = uniform(0)
    this.boundsAlphaUniform = uniform(1)
    this.offsetXUniform = uniform(0)
    this.offsetYUniform = uniform(0)
    this.scaleUniform = uniform(1)
    this.textureAspectUniform = uniform(1)
    this.depthShiftXUniform = uniform(0)
    this.depthShiftYUniform = uniform(0)
    this.depthDollyUniform = uniform(0)
    this.depthRangeUniform = uniform(0.3)
    this.depthFocusUniform = uniform(0.5)
    this.depthInvertUniform = uniform(0)
    this.depthEdgesAlphaUniform = uniform(1)
    this.depthViewUniform = uniform(0)
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

    try {
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
    } catch (cause) {
      if (loadNonce === this.mediaLoadNonce) {
        this.loadedSignature = null
      }

      throw cause
    }
  }

  clearMedia(): void {
    this.mediaLoadNonce += 1
    this.releaseCurrentMedia()
  }

  async setDepthMedia(source: ImageTextureSource): Promise<void> {
    const nextSignature = [
      source.url,
      source.isSvg ? "svg" : "raster",
      source.svgRasterResolution ?? "",
    ].join("|")

    if (this.depthLoadedSignature === nextSignature) {
      return
    }

    this.depthLoadNonce += 1
    const loadNonce = this.depthLoadNonce
    this.releaseDepthMedia()
    this.depthLoadedSignature = nextSignature

    try {
      const texture = await loadImageTexture(source)

      if (loadNonce !== this.depthLoadNonce) {
        texture.dispose()
        return
      }

      texture.colorSpace = THREE.NoColorSpace
      texture.needsUpdate = true
      this.depthTexture = texture
      this.syncDepthActive()
    } catch (cause) {
      if (loadNonce === this.depthLoadNonce) {
        this.depthLoadedSignature = null
      }

      throw cause
    }
  }

  clearDepthMedia(): void {
    this.depthLoadNonce += 1
    this.releaseDepthMedia()
    this.syncDepthActive()
  }

  protected override beforeRender(time: number): void {
    const camera = parallaxCameraAt(
      this.parallaxMotion,
      this.parallaxAmount,
      this.parallaxSpeed,
      this.parallaxOffset,
      time
    )
    this.depthShiftXUniform.value = camera.shiftX
    this.depthShiftYUniform.value = camera.shiftY
    this.depthDollyUniform.value = camera.dolly
  }

  private syncDepthActive(): void {
    const active = this.depthTexture !== null
    if (active !== this.depthActive) {
      this.depthActive = active
      this.rebuildEffectNode()
    }
  }

  private releaseDepthMedia(): void {
    this.depthTexture?.dispose()
    this.depthTexture = null
    this.depthLoadedSignature = null
  }

  private depthAt(mediaUv: Node, gradX: Node, gradY: Node): Node {
    const node = tslTexture(
      this.depthTexture ?? this.depthPlaceholder,
      clamp(mediaUv, vec2(0, 0), vec2(1, 1))
    ).grad(gradX, gradY)
    this.depthTextureNodes.push(node)
    return mix(float(node.r), float(1).sub(node.r), this.depthInvertUniform)
  }

  private resolveParallaxUv(mediaUv: Node): Node {
    const steps = this.depthSteps
    const march = Fn(([sourceUv]: [Node]) => {
      const gradX = dFdx(sourceUv).toVar()
      const gradY = dFdy(sourceUv).toVar()
      const shift = vec2(this.depthShiftXUniform, this.depthShiftYUniform)
      const centered = sourceUv.sub(0.5)
      const camera = shift.add(centered.mul(this.depthDollyUniform))
      const displacementAt = (depth: Node) =>
        camera
          .mul(this.depthRangeUniform)
          .mul(depth.sub(this.depthFocusUniform))
      const hit = float(0).toVar()
      const inside = float(0).toVar()
      const outside = float(1).toVar()
      Loop({ start: 0, end: int(steps), type: "int" }, ({ i }) => {
        const layer = float(1).sub(float(i).add(1).div(steps))
        const sampled = this.depthAt(
          sourceUv.add(displacementAt(layer)),
          gradX,
          gradY
        )
        If(hit.lessThan(0.5).and(sampled.greaterThanEqual(layer)), () => {
          hit.assign(1)
          inside.assign(layer)
          outside.assign(layer.add(float(1).div(steps)))
        })
      })
      Loop(
        { start: 0, end: int(DEPTH_REFINE_STEPS), type: "int", name: "r" },
        () => {
          const middle = inside.add(outside).mul(0.5)
          const sampled = this.depthAt(
            sourceUv.add(displacementAt(middle)),
            gradX,
            gradY
          )
          If(sampled.greaterThanEqual(middle), () => {
            inside.assign(middle)
          }).Else(() => {
            outside.assign(middle)
          })
        }
      )
      return sourceUv.add(displacementAt(inside))
    })
    return march(mediaUv)
  }

  override updateParams(params: LayerParameterValues): void {
    this.fitModeUniform.value = params.fitMode === "contain" ? 1 : 0
    this.boundsAlphaUniform.value = params.transparentBounds === true ? 0 : 1
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

    this.depthInvertUniform.value = params.depthInvert === true ? 1 : 0
    this.depthRangeUniform.value =
      typeof params.depthRange === "number"
        ? Math.min(1, Math.max(0, params.depthRange))
        : 0.3
    this.depthFocusUniform.value =
      typeof params.depthFocus === "number"
        ? Math.min(1, Math.max(0, params.depthFocus))
        : 0.5
    this.depthEdgesAlphaUniform.value =
      params.depthEdges === "transparent" ? 0 : 1
    this.depthViewUniform.value = params.depthView === true ? 1 : 0
    this.parallaxMotion = resolveParallaxMotion(params.parallaxMotion)
    this.parallaxAmount =
      typeof params.parallaxAmount === "number"
        ? Math.min(1, Math.max(0, params.parallaxAmount))
        : 0.3
    this.parallaxSpeed =
      typeof params.parallaxSpeed === "number"
        ? Math.max(0, params.parallaxSpeed)
        : 0.5
    this.parallaxOffset =
      Array.isArray(params.parallaxOffset) &&
      params.parallaxOffset.length === 2 &&
      typeof params.parallaxOffset[0] === "number" &&
      typeof params.parallaxOffset[1] === "number"
        ? [params.parallaxOffset[0], params.parallaxOffset[1]]
        : [0, 0]

    const nextSteps = resolveDepthSteps(params.depthQuality)
    if (nextSteps !== this.depthSteps) {
      this.depthSteps = nextSteps
      if (this.depthActive) {
        this.rebuildEffectNode()
      }
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

    if (this.depthTexture) {
      for (const node of this.depthTextureNodes) {
        node.value = this.depthTexture
      }
    }

    super.render(renderer, inputTexture, outputTarget, time, delta)
  }

  override resize(width: number, height: number): void {
    this.canvasAspectUniform.value = width / Math.max(height, 1)
  }

  override needsContinuousRender(): boolean {
    return (
      this.videoTexture !== null ||
      (this.depthActive && this.parallaxMotion !== "off")
    )
  }

  override async prepareForExportFrame(time: number): Promise<void> {
    if (!this.videoHandle) {
      return
    }

    this.videoHandle.setLoop(true)
    await this.videoHandle.prepareFrame(time)
  }

  override dispose(): void {
    this.mediaLoadNonce += 1
    this.depthLoadNonce += 1
    this.releaseCurrentMedia()
    this.releaseDepthMedia()
    this.placeholder.dispose()
    this.depthPlaceholder.dispose()
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
    this.depthTextureNodes = []
    const finalUv = this.depthActive
      ? this.resolveParallaxUv(sampledUv)
      : sampledUv
    const safeUv = clamp(finalUv, vec2(0, 0), vec2(1, 1))
    this.mediaTextureNode = this.depthActive
      ? tslTexture(this.placeholder, safeUv).grad(
          dFdx(sampledUv),
          dFdy(sampledUv)
        )
      : tslTexture(this.placeholder, safeUv)
    const inBounds = finalUv.x
      .greaterThanEqual(0)
      .and(finalUv.x.lessThanEqual(1))
      .and(finalUv.y.greaterThanEqual(0))
      .and(finalUv.y.lessThanEqual(1))
    const contained = select(
      inBounds,
      this.mediaTextureNode,
      vec4(0, 0, 0, this.boundsAlphaUniform)
    )
    const framed = mix(this.mediaTextureNode, contained, useContain)

    if (!this.depthActive) {
      return framed
    }

    const edgeAlpha = select(inBounds, float(1), this.depthEdgesAlphaUniform)
    const shaded = vec4(framed.rgb, framed.a.mul(edgeAlpha))
    const depth = this.depthAt(finalUv, dFdx(sampledUv), dFdy(sampledUv))
    return mix(shaded, vec4(depth, depth, depth, shaded.a), this.depthViewUniform)
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
