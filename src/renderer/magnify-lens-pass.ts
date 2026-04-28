import {
  clamp,
  float,
  length,
  mix,
  smoothstep,
  type TSLNode,
  texture as tslTexture,
  uniform,
  uv,
  vec2,
  vec4,
} from "three/tsl"
import * as THREE from "three/webgpu"
import {
  getFluidInteractionRecordingLayerId,
  recordFluidInteractionEvent,
} from "@/lib/editor/fluid-interaction-recorder"
import { PassNode } from "@/renderer/pass-node"
import type {
  FluidInteractionEvent,
  LayerParameterValues,
} from "@/types/editor"

type Node = TSLNode

export class MagnifyLensPass extends PassNode {
  private radius = 0.18
  private softness = 0.4
  private zoom = 1.8
  private chromaStrength = 0.012
  private followLag = 0.2

  private targetX = 0.5
  private targetY = 0.5
  private smoothedX = 0.5
  private smoothedY = 0.5

  private readonly pointerXUniform: Node
  private readonly pointerYUniform: Node
  private readonly radiusUniform: Node
  private readonly softnessUniform: Node
  private readonly zoomUniform: Node
  private readonly chromaUniform: Node
  private readonly aspectUniform: Node

  private sourceTextureNodes: Node[] = []
  private readonly sourcePlaceholder: THREE.Texture

  private readonly canvas: HTMLCanvasElement | null
  private readonly onPointerMove: ((event: PointerEvent) => void) | null
  private lastPointerX: number | null = null
  private lastPointerY: number | null = null

  private replayEvents: FluidInteractionEvent[] = []
  private replayCursor = 0
  private lastReplayTimelineTime: number | null = null

  constructor(layerId: string, renderer: THREE.WebGPURenderer | null) {
    super(layerId)

    this.pointerXUniform = uniform(this.smoothedX)
    this.pointerYUniform = uniform(this.smoothedY)
    this.radiusUniform = uniform(this.radius)
    this.softnessUniform = uniform(this.softness)
    this.zoomUniform = uniform(this.zoom)
    this.chromaUniform = uniform(this.chromaStrength)
    this.aspectUniform = uniform(1)

    this.sourcePlaceholder = new THREE.Texture()

    const domElement =
      (renderer as unknown as { domElement?: HTMLCanvasElement } | null)
        ?.domElement ?? null
    this.canvas = domElement
    if (domElement) {
      this.onPointerMove = (event: PointerEvent) => {
        this.handlePointerMove(event, domElement)
      }
      domElement.addEventListener("pointermove", this.onPointerMove)
      domElement.addEventListener("pointerdown", this.onPointerMove)
    } else {
      this.onPointerMove = null
    }

    this.rebuildEffectNode()
  }

  override render(
    renderer: THREE.WebGPURenderer,
    inputTexture: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number,
    timelineTime = time
  ): void {
    this.replayRecordedInteractions(timelineTime)
    for (const node of this.sourceTextureNodes) {
      node.value = inputTexture
    }
    super.render(renderer, inputTexture, outputTarget, time, delta)
  }

  override updateLogicalSize(width: number, height: number): void {
    this.aspectUniform.value = Math.max(0.0001, width / Math.max(1, height))
  }

  override updateParams(params: LayerParameterValues): void {
    if (typeof params.radius === "number") {
      this.radius = clampNumber(params.radius, 0.005, 1)
      this.radiusUniform.value = this.radius
    }
    if (typeof params.softness === "number") {
      this.softness = clampNumber(params.softness, 0, 1)
      this.softnessUniform.value = this.softness
    }
    if (typeof params.zoom === "number") {
      this.zoom = clampNumber(params.zoom, 0.5, 8)
      this.zoomUniform.value = this.zoom
    }
    if (typeof params.chromaStrength === "number") {
      this.chromaStrength = clampNumber(params.chromaStrength, 0, 0.2)
      this.chromaUniform.value = this.chromaStrength
    }
    if (typeof params.followLag === "number") {
      this.followLag = clampNumber(params.followLag, 0, 0.99)
    }
  }

  updateFluidInteractionEvents(
    events: readonly FluidInteractionEvent[]
  ): void {
    this.replayEvents = [...events].sort((a, b) => a.time - b.time)
    this.replayCursor = 0
    this.lastReplayTimelineTime = null
  }

  override needsContinuousRender(): boolean {
    return true
  }

  override dispose(): void {
    if (this.canvas && this.onPointerMove) {
      this.canvas.removeEventListener("pointermove", this.onPointerMove)
      this.canvas.removeEventListener("pointerdown", this.onPointerMove)
    }
    this.sourcePlaceholder.dispose()
    super.dispose()
  }

  protected override beforeRender(_time: number, delta: number): void {
    const tau = Math.max(0.0001, this.followLag * 0.5)
    const t = this.followLag <= 0 ? 1 : 1 - Math.exp(-delta / tau)
    this.smoothedX += (this.targetX - this.smoothedX) * t
    this.smoothedY += (this.targetY - this.smoothedY) * t
    this.pointerXUniform.value = this.smoothedX
    this.pointerYUniform.value = this.smoothedY
  }

  protected override buildEffectNode(): Node {
    if (!this.radiusUniform) {
      return this.inputNode
    }

    this.sourceTextureNodes = []

    const renderTargetUv = vec2(uv().x, float(1).sub(uv().y))
    const center = vec2(this.pointerXUniform, this.pointerYUniform)
    const toPixel = vec2(
      renderTargetUv.x.sub(center.x).mul(this.aspectUniform),
      renderTargetUv.y.sub(center.y)
    )
    const dist = length(toPixel)

    // Mask: 1 inside lens, 0 outside, soft edge.
    const innerEdge = this.radiusUniform.mul(
      float(1).sub(this.softnessUniform)
    )
    const mask = float(1).sub(smoothstep(innerEdge, this.radiusUniform, dist))

    // Radial zoom inside lens.
    const lensUv = vec2(
      center.x.add(renderTargetUv.x.sub(center.x).div(mix(float(1), this.zoomUniform, mask))),
      center.y.add(renderTargetUv.y.sub(center.y).div(mix(float(1), this.zoomUniform, mask)))
    )

    const trackedUv = (n: Node): Node => {
      const node = tslTexture(this.sourcePlaceholder, n)
      this.sourceTextureNodes.push(node)
      return node
    }

    // Rim mask: peaks at lens edge.
    const rim = clamp(mask.mul(float(1).sub(mask)).mul(float(4)), float(0), float(1))

    const radialDirX = renderTargetUv.x.sub(center.x).div(dist.add(float(0.0001)))
    const radialDirY = renderTargetUv.y.sub(center.y).div(dist.add(float(0.0001)))
    const chromaOffset = this.chromaUniform.mul(rim)

    const lensUvR = clamp(
      vec2(
        lensUv.x.add(radialDirX.mul(chromaOffset)),
        lensUv.y.add(radialDirY.mul(chromaOffset))
      ),
      vec2(float(0), float(0)),
      vec2(float(1), float(1))
    )
    const lensUvG = lensUv
    const lensUvB = clamp(
      vec2(
        lensUv.x.sub(radialDirX.mul(chromaOffset)),
        lensUv.y.sub(radialDirY.mul(chromaOffset))
      ),
      vec2(float(0), float(0)),
      vec2(float(1), float(1))
    )

    const baseSample = trackedUv(renderTargetUv)
    const lensR = trackedUv(lensUvR)
    const lensG = trackedUv(lensUvG)
    const lensB = trackedUv(lensUvB)

    const lensColor = vec4(lensR.r, lensG.g, lensB.b, float(1))
    const r = mix(baseSample.r, lensColor.r, mask)
    const g = mix(baseSample.g, lensColor.g, mask)
    const b = mix(baseSample.b, lensColor.b, mask)
    return vec4(r, g, b, float(1))
  }

  private handlePointerMove(
    event: PointerEvent,
    canvas: HTMLCanvasElement
  ): void {
    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) {
      return
    }
    const localX = event.clientX - rect.left
    const localY = event.clientY - rect.top
    // Top-down UV: matches `1 - uv().y` shader convention.
    const ux = localX / rect.width
    const uy = localY / rect.height

    let dx = 0
    let dy = 0
    if (this.lastPointerX !== null && this.lastPointerY !== null) {
      dx = (localX - this.lastPointerX) / rect.width
      dy = (localY - this.lastPointerY) / rect.height
    }

    this.targetX = ux
    this.targetY = uy
    recordFluidInteractionEvent(this.layerId, { dx, dy, x: ux, y: uy })

    this.lastPointerX = localX
    this.lastPointerY = localY
  }

  private replayRecordedInteractions(timelineTime: number): void {
    if (
      this.replayEvents.length === 0 ||
      getFluidInteractionRecordingLayerId() === this.layerId
    ) {
      return
    }

    if (
      this.lastReplayTimelineTime === null ||
      timelineTime < this.lastReplayTimelineTime
    ) {
      this.replayCursor = 0
    }

    this.lastReplayTimelineTime = timelineTime

    while (
      this.replayCursor < this.replayEvents.length &&
      (this.replayEvents[this.replayCursor]?.time ?? Number.POSITIVE_INFINITY) <=
        timelineTime
    ) {
      const event = this.replayEvents[this.replayCursor]
      if (event) {
        this.targetX = event.x
        this.targetY = event.y
      }
      this.replayCursor += 1
    }
  }
}

function clampNumber(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}
